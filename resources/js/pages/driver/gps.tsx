import { Head } from '@inertiajs/react';
import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { BusFront, MapPin, Navigation } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import DriverSidebarLayout from '@/layouts/app/driver-sidebar-layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type Status = 'active' | 'inactive';

type Bus = {
    id: number;
    bus_number: string;
    plate_number: string;
    model: string | null;
    capacity: number | null;
    status: Status;
};

type Props = {
    assignedBus: Bus | null;
    activeTrip: {
        id: number;
        status: string;
        started_at: string | null;
    } | null;
};

type Position = {
    latitude: number;
    longitude: number;
    accuracy: number | null;
    recordedAt: string;
    isStale: boolean;
};

type SendState = 'idle' | 'sending' | 'sent' | 'failed';

const geolocationOptions: PositionOptions = {
    enableHighAccuracy: true,
    timeout: 30_000,
    maximumAge: 0,
};

function formatTime(iso: string): string {
    const date = new Date(iso);

    if (Number.isNaN(date.getTime())) {
        return 'Unknown time';
    }

    return date.toLocaleTimeString(undefined, {
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
    });
}

async function sendLocation(position: Position): Promise<boolean> {
    try {
        const payload = {
            latitude: position.latitude,
            longitude: position.longitude,
            accuracy: position.accuracy,
            recorded_at: position.recordedAt,
        };

        // === DIAGNOSTIC: Request payload ===
        console.log('[GPS_TRACE] POST payload:', payload);

        const response = await fetch('/api/driver/location', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        // === DIAGNOSTIC: API response status ===
        console.log('[GPS_TRACE] API response:', { status: response.status, ok: response.ok });

        return response.ok;
    } catch (error) {
        // === DIAGNOSTIC: Fetch error ===
        console.error('[GPS_TRACE] Fetch error:', error);
        return false;
    }
}

function ErrorCallout({
    className,
    children,
}: {
    className?: string;
    children: ReactNode;
}) {
    return (
        <div
            className={cn(
                'bg-destructive/10 text-destructive-strong flex items-start gap-2 rounded-lg border border-transparent px-4 py-3 text-sm',
                className,
            )}
        >
            <span className="mt-0.5 shrink-0">!</span>
            <div className="min-w-0 break-words">{children}</div>
        </div>
    );
}

function InfoRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <dt className="text-muted-foreground text-sm">{label}</dt>
            <dd className="text-sm font-medium break-words tabular-nums sm:text-right">
                {value}
            </dd>
        </div>
    );
}

function EmptyState({
    icon: Icon,
    title,
    description,
}: {
    icon: LucideIcon;
    title: string;
    description?: string;
}) {
    return (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-10 text-center">
            <div className="bg-muted text-muted-foreground flex size-10 items-center justify-center rounded-full">
                <Icon className="size-5" />
            </div>
            <p className="mt-3 text-sm font-medium">{title}</p>
            {description && (
                <p className="text-muted-foreground mt-1 max-w-sm text-sm">
                    {description}
                </p>
            )}
        </div>
    );
}

export default function DriverGpsPage({ assignedBus, activeTrip }: Props) {
    // === DIAGNOSTIC: Component mounted ===
    console.log('[GPS_TRACE] DRIVER GPS PAGE MOUNTED', { assignedBus, activeTrip });

    const watchIdRef = useRef<number | null>(null);
    const [isTracking, setIsTracking] = useState(false);
    const [requesting, setRequesting] = useState(false);
    const [position, setPosition] = useState<Position | null>(null);
    const [lastKnown, setLastKnown] = useState<Position | null>(null);
    const [sendState, setSendState] = useState<SendState>('idle');
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const stopTracking = () => {
        // === DIAGNOSTIC: Stop tracking requested ===
        console.log('[GPS_TRACE] Stop tracking requested, current watcher:', watchIdRef.current);

        if (watchIdRef.current !== null) {
            navigator.geolocation.clearWatch(watchIdRef.current);
            watchIdRef.current = null;
        }
        setIsTracking(false);
        setRequesting(false);
        setSendState('idle');
    };

    useEffect(() => {
        let cancelled = false;

        fetch('/api/driver/location/latest')
            .then(async (response) => {
                if (!response.ok) {
                    return;
                }

                const data: {
                    location?: {
                        latitude: string | number;
                        longitude: string | number;
                        accuracy: number | null;
                        recorded_at: string;
                    };
                } = await response.json();

                const loc = data.location;

                if (cancelled || !loc) {
                    return;
                }

                setLastKnown({
                    latitude:
                        typeof loc.latitude === 'number'
                            ? loc.latitude
                            : parseFloat(loc.latitude),
                    longitude:
                        typeof loc.longitude === 'number'
                            ? loc.longitude
                            : parseFloat(loc.longitude),
                    accuracy: loc.accuracy ?? null,
                    recordedAt: loc.recorded_at,
                    isStale: false,
                });
            })
            .catch(() => {});

        return () => {
            cancelled = true;
            if (watchIdRef.current !== null) {
                console.log('[GPS_TRACE] Cleanup: clearing watcher', watchIdRef.current);
                navigator.geolocation.clearWatch(watchIdRef.current);
                watchIdRef.current = null;
            }
        };
    }, []);

    // Auto-start tracking when there's an active trip and not already tracking
    useEffect(() => {
        if (activeTrip && activeTrip.status === 'in_transit' && !isTracking && !requesting) {
            console.log('[GPS_TRACE] AUTO-START: Active trip detected, starting GPS tracking automatically');
            handleStartTracking();
        }
    }, [activeTrip, isTracking, requesting]);

    const handleStartTracking = () => {
        // === DIAGNOSTIC: Start Tracking clicked ===
        console.log('[GPS_TRACE] START TRACKING CLICKED');

        setErrorMessage(null);
        setSendState('idle');
        setRequesting(true);

        // === DIAGNOSTIC: Tracker starting ===
        console.log('[GPS_TRACE] Starting GPS watcher with options:', geolocationOptions);

        const onSuccess = async (position: GeolocationPosition) => {
            const now = Date.now();
            const positionAge = now - position.timestamp;
            const isStale = positionAge > 30_000;

            // === DIAGNOSTIC: Browser geolocation raw values ===
            console.log('[GPS_TRACE] Browser raw coords:', {
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
                accuracy: position.coords.accuracy,
                altitude: position.coords.altitude,
                altitudeAccuracy: position.coords.altitudeAccuracy,
                heading: position.coords.heading,
                speed: position.coords.speed,
                timestamp: position.timestamp,
                positionAgeMs: positionAge,
                isStale,
            });

            const current = {
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
                accuracy: position.coords.accuracy,
                recordedAt: new Date(position.timestamp).toISOString(),
                isStale,
            };

            // === DIAGNOSTIC: Value sent to API ===
            console.log('[GPS_TRACE] Sending to API:', {
                latitude: current.latitude,
                longitude: current.longitude,
                accuracy: current.accuracy,
                recorded_at: current.recordedAt,
            });

            setPosition(current);
            setRequesting(false);
            setErrorMessage(null);

            setSendState('sending');
            const ok = await sendLocation(current);
            setSendState(ok ? 'sent' : 'failed');

            // === DIAGNOSTIC: API send result ===
            console.log('[GPS_TRACE] API send result:', { ok });
        };

        const onError = (error: GeolocationPositionError) => {
            // === DIAGNOSTIC: GPS error ===
            console.error('[GPS_TRACE] GPS Error:', {
                code: error.code,
                message: error.message,
                PERMISSION_DENIED: error.PERMISSION_DENIED,
                POSITION_UNAVAILABLE: error.POSITION_UNAVAILABLE,
                TIMEOUT: error.TIMEOUT,
            });

            switch (error.code) {
                case error.PERMISSION_DENIED:
                    setRequesting(false);
                    setIsTracking(false);
                    if (watchIdRef.current !== null) {
                        navigator.geolocation.clearWatch(watchIdRef.current);
                        watchIdRef.current = null;
                    }
                    setErrorMessage(
                        'Location permission was denied. Please allow location access in your browser settings.',
                    );
                    break;
                case error.POSITION_UNAVAILABLE:
                    setRequesting(false);
                    setIsTracking(false);
                    if (watchIdRef.current !== null) {
                        navigator.geolocation.clearWatch(watchIdRef.current);
                        watchIdRef.current = null;
                    }
                    setErrorMessage(
                        'Your location is currently unavailable. Please check your device GPS/location settings.',
                    );
                    break;
                case error.TIMEOUT:
                default:
                    setErrorMessage(
                        'GPS location request timed out. Trying again...',
                    );
                    break;
            }
        };

        if (!('geolocation' in navigator)) {
            setRequesting(false);
            setErrorMessage(
                'GPS is not supported by this browser. Please use a compatible browser.',
            );
            return;
        }

        // Clear any existing watcher first
        if (watchIdRef.current !== null) {
            console.log('[GPS_TRACE] Clearing existing watcher:', watchIdRef.current);
            navigator.geolocation.clearWatch(watchIdRef.current);
        }

        // === DIAGNOSTIC: CALLING watchPosition ===
        console.log('[GPS_TRACE] CALLING watchPosition with options:', geolocationOptions);

        watchIdRef.current = navigator.geolocation.watchPosition(
            onSuccess,
            onError,
            geolocationOptions,
        );

        // === DIAGNOSTIC: Watcher created ===
        console.log('[GPS_TRACE] GPS watcher created:', watchIdRef.current);
        setIsTracking(true);
    };

    const statusLabel = errorMessage
        ? 'GPS Error'
        : requesting
          ? 'Requesting GPS Permission...'
          : isTracking
            ? 'Tracking Active'
            : 'Not Tracking';

    const statusDotClass = errorMessage
        ? 'bg-destructive'
        : isTracking
          ? 'bg-success'
          : 'bg-muted';

    return (
        <DriverSidebarLayout
            breadcrumbs={[
                {
                    title: 'Live Tracking',
                    href: '/driver/gps',
                },
            ]}
        >
            <Head title="Live Tracking" />

            <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight">
                        Live Tracking
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        Share your current location with the terminal.
                    </p>
                </div>

                {!assignedBus ? (
                    <Card>
                        <CardContent className="p-6">
                            <EmptyState
                                icon={BusFront}
                                title="No bus assigned"
                                description="You cannot start tracking without an assigned bus. Contact your system administrator."
                            />
                        </CardContent>
                    </Card>
                ) : (
                    <>
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2 text-base">
                                    <BusFront className="text-primary size-4 shrink-0" />
                                    Assigned Bus
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="bg-primary/10 text-primary-strong flex items-center gap-3 rounded-lg px-4 py-3">
                                    <BusFront className="size-5 shrink-0" />
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-medium">
                                            Bus {assignedBus.bus_number}
                                        </p>
                                        <p className="text-muted-foreground truncate text-xs">
                                            {assignedBus.plate_number}
                                        </p>
                                    </div>
                                    {assignedBus.model && (
                                        <p className="text-muted-foreground hidden shrink-0 text-xs sm:block">
                                            {assignedBus.model}
                                        </p>
                                    )}
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2 text-base">
                                    <Navigation className="text-primary size-4 shrink-0" />
                                    GPS Status
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="bg-muted flex items-center gap-2 rounded-lg px-4 py-3">
                                    <span
                                        className={cn(
                                            'size-2.5 shrink-0 rounded-full',
                                            statusDotClass,
                                        )}
                                    />
                                    <span className="text-sm font-medium">
                                        {statusLabel}
                                    </span>
                                    {sendState === 'sent' && (
                                        <Badge className="bg-success text-success-foreground ml-auto border-transparent">
                                            Location Sent
                                        </Badge>
                                    )}
                                    {sendState === 'failed' && (
                                        <Badge className="bg-destructive text-destructive-foreground ml-auto border-transparent">
                                            Unable to Send
                                        </Badge>
                                    )}
                                </div>

                                {errorMessage && (
                                    <ErrorCallout>{errorMessage}</ErrorCallout>
                                )}

                                {position ? (
                                    <dl className="-mx-1 divide-y">
                                        <InfoRow
                                            label="Latitude"
                                            value={position.latitude.toFixed(7)}
                                        />
                                        <InfoRow
                                            label="Longitude"
                                            value={position.longitude.toFixed(
                                                7,
                                            )}
                                        />
                                        <InfoRow
                                            label="Accuracy"
                                            value={
                                                position.accuracy !== null
                                                    ? `${position.accuracy.toFixed(
                                                          1,
                                                      )} m`
                                                    : 'Unknown'
                                            }
                                        />
                                        <InfoRow
                                            label="Position Time"
                                            value={formatTime(
                                                position.recordedAt,
                                            )}
                                        />
                                        <InfoRow
                                            label="Age"
                                            value={
                                                position.isStale
                                                    ? 'Stale (>30s)'
                                                    : 'Fresh'
                                            }
                                        />
                                        {position.isStale && (
                                            <div className="bg-warning/10 text-warning-strong px-3 py-2 rounded-md text-xs">
                                                This position may be stale. Consider waiting for a fresh GPS fix.
                                            </div>
                                        )}
                                    </dl>
                                ) : (
                                    <p className="text-muted-foreground py-4 text-center text-sm">
                                        {isTracking
                                            ? 'Waiting for GPS location...'
                                            : 'No location captured yet. Start tracking to share your location.'}
                                    </p>
                                )}
                            </CardContent>
                        </Card>

                        {lastKnown && (
                            <Card>
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2 text-base">
                                        <MapPin className="text-primary size-4 shrink-0" />
                                        Last Known Location
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <dl className="-mx-1 divide-y">
                                        <InfoRow
                                            label="Latitude"
                                            value={lastKnown.latitude.toFixed(
                                                7,
                                            )}
                                        />
                                        <InfoRow
                                            label="Longitude"
                                            value={lastKnown.longitude.toFixed(
                                                7,
                                            )}
                                        />
                                        <InfoRow
                                            label="Recorded"
                                            value={formatTime(
                                                lastKnown.recordedAt,
                                            )}
                                        />
                                    </dl>
                                </CardContent>
                            </Card>
                        )}

                        <div className="sticky bottom-4 z-10">
                            {isTracking || requesting ? (
                                <Button
                                    className="w-full gap-2"
                                    variant="destructive"
                                    onClick={stopTracking}
                                >
                                    <MapPin className="size-4" />
                                    Stop Tracking
                                </Button>
                            ) : (
                                <Button
                                    className="w-full gap-2"
                                    onClick={handleStartTracking}
                                >
                                    <Navigation className="size-4" />
                                    Start Tracking
                                </Button>
                            )}
                        </div>
                    </>
                )}
            </div>
        </DriverSidebarLayout>
    );
}
