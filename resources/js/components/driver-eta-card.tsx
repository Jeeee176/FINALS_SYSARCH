import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import {
    Clock3,
    Flag,
    Gauge,
    MapPin,
    Navigation,
    Route as RouteIcon,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { cn } from '@/lib/utils';

type EtaStatus =
    | 'ok'
    | 'stale_position'
    | 'no_destination_coordinates'
    | 'no_gps_location'
    | 'no_assigned_route';

type CurrentPosition = {
    latitude: number;
    longitude: number;
    recorded_at: string;
    age_minutes: number;
};

type Destination = {
    latitude: number;
    longitude: number;
};

type EtaData = {
    bus: {
        id: number;
        bus_number: string;
    };
    route: {
        id: number | null;
        name: string | null;
        destination: string | null;
        status: string | null;
    };
    status: EtaStatus;
    average_speed_kmh: number;
    current_position?: CurrentPosition;
    destination?: Destination;
    distance_km?: number;
    estimated_duration_minutes?: number;
    estimated_arrival_at?: string;
    warning?: string;
};

const POLLING_INTERVAL_MS = 30_000;

function InfoRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex flex-col gap-1 px-6 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
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

function ErrorCallout({
    tone = 'destructive',
    className,
    children,
}: {
    tone?: 'destructive' | 'warning';
    className?: string;
    children: ReactNode;
}) {
    return (
        <div
            className={cn(
                'flex items-start gap-2 rounded-lg border px-4 py-3 text-sm',
                tone === 'warning'
                    ? 'border-warning/50 bg-warning/10 text-foreground'
                    : 'border-destructive/50 bg-destructive/10 text-destructive-strong',
                className,
            )}
        >
            <span className="mt-0.5 shrink-0" aria-hidden="true">
                !
            </span>
            <div className="min-w-0 break-words">{children}</div>
        </div>
    );
}

function formatDateTime(iso: string): string {
    const date = new Date(iso);

    if (Number.isNaN(date.getTime())) {
        return 'Unknown time';
    }

    return date.toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
    });
}

function formatDuration(totalMinutes: number): string {
    const rounded = Math.max(0, Math.round(totalMinutes));

    if (rounded < 60) {
        return `${rounded} min`;
    }

    const hours = Math.floor(rounded / 60);
    const minutes = rounded % 60;

    return minutes === 0 ? `${hours} hr` : `${hours} hr ${minutes} min`;
}

function formatAge(minutes: number): string {
    const rounded = Math.max(0, Math.round(minutes));

    if (rounded < 1) {
        return 'Just now';
    }

    if (rounded < 60) {
        return `${rounded} min ago`;
    }

    const hours = Math.floor(rounded / 60);
    const rem = rounded % 60;

    return rem === 0 ? `${hours} hr ago` : `${hours} hr ${rem} min ago`;
}

function formatCoords(latitude: number, longitude: number): string {
    return `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
}

export function DriverEtaCard() {
    const [eta, setEta] = useState<EtaData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let active = true;

        async function load() {
            try {
                const response = await fetch('/driver/eta');

                if (!response.ok) {
                    let message = 'Unable to load ETA right now.';
                    try {
                        const data: { error?: string } = await response.json();
                        if (data.error) {
                            message = data.error;
                        }
                    } catch {
                        // fall back to the generic message
                    }

                    if (active) {
                        setError(message);
                        setEta(null);
                    }
                    return;
                }

                const data: { success: boolean; eta: EtaData } =
                    await response.json();

                if (active) {
                    setEta(data.eta);
                    setError(null);
                }
            } catch {
                if (active) {
                    setError(
                        'Could not reach the server. Please check your connection and try again.',
                    );
                    setEta(null);
                }
            } finally {
                if (active) {
                    setLoading(false);
                }
            }
        }

        void load();

        const intervalId = setInterval(() => {
            void load();
        }, POLLING_INTERVAL_MS);

        return () => {
            active = false;
            clearInterval(intervalId);
        };
    }, []);

    if (loading && !eta) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                        <Clock3 className="text-primary size-4 shrink-0" />
                        Estimated Time of Arrival
                    </CardTitle>
                    <CardDescription>
                        Calculated from your current GPS position and the
                        destination of your assigned route.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <p className="text-muted-foreground py-6 text-center text-sm">
                        Calculating ETA...
                    </p>
                </CardContent>
            </Card>
        );
    }

    if (error) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                        <Clock3 className="text-primary size-4 shrink-0" />
                        Estimated Time of Arrival
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <ErrorCallout>{error}</ErrorCallout>
                </CardContent>
            </Card>
        );
    }

    if (!eta) {
        return null;
    }

    const isStale = eta.status === 'stale_position';
    const showEtaDetails =
        eta.status === 'ok' || eta.status === 'stale_position';

    const statusBadge = isStale ? (
        <Badge className="bg-warning text-warning-foreground ml-auto border-transparent">
            Stale Position
        </Badge>
    ) : eta.status === 'ok' ? (
        <Badge className="bg-success text-success-foreground ml-auto border-transparent">
            On Track
        </Badge>
    ) : null;

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                    <Clock3 className="text-primary size-4 shrink-0" />
                    Estimated Time of Arrival
                    {statusBadge}
                </CardTitle>
                <CardDescription>
                    Calculated from your current GPS position and the
                    destination of your assigned route.
                </CardDescription>
            </CardHeader>
            <CardContent>
                {eta.status === 'no_assigned_route' && (
                    <EmptyState
                        icon={RouteIcon}
                        title="No assigned route"
                        description="Your bus does not have a route assigned yet. Contact your administrator to set one up."
                    />
                )}

                {eta.status === 'no_gps_location' && (
                    <EmptyState
                        icon={MapPin}
                        title="No GPS location yet"
                        description="We need your current position to estimate an arrival time. Open Live Tracking to start sharing your location."
                    />
                )}

                {eta.status === 'no_destination_coordinates' && (
                    <div className="space-y-4">
                        <ErrorCallout>
                            The destination of your assigned route does not have
                            coordinates configured, so an ETA cannot be
                            calculated. Contact your administrator.
                        </ErrorCallout>
                        {eta.current_position && (
                            <dl className="-mx-6 divide-y">
                                <InfoRow
                                    label="Current Position"
                                    value={formatCoords(
                                        eta.current_position.latitude,
                                        eta.current_position.longitude,
                                    )}
                                />
                            </dl>
                        )}
                    </div>
                )}

                {showEtaDetails && (
                    <>
                        {isStale && eta.warning && (
                            <ErrorCallout tone="warning" className="mb-4">
                                {eta.warning}
                            </ErrorCallout>
                        )}

                        {eta.route.destination && (
                            <div className="bg-muted flex items-center gap-3 rounded-lg px-4 py-3">
                                <Flag className="text-primary size-5 shrink-0" />
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-medium">
                                        {eta.route.destination}
                                    </p>
                                    <p className="text-muted-foreground truncate text-xs">
                                        {eta.bus.bus_number}
                                    </p>
                                </div>
                            </div>
                        )}

                        <dl className="-mx-6 mt-4 divide-y">
                            <InfoRow
                                label="Destination"
                                value={
                                    eta.destination
                                        ? formatCoords(
                                              eta.destination.latitude,
                                              eta.destination.longitude,
                                          )
                                        : 'Not available'
                                }
                            />
                            <InfoRow
                                label="Distance Remaining"
                                value={
                                    eta.distance_km != null
                                        ? `${eta.distance_km} km`
                                        : 'Not available'
                                }
                            />
                            <InfoRow
                                label="Estimated Travel Duration"
                                value={
                                    eta.estimated_duration_minutes != null
                                        ? formatDuration(
                                              eta.estimated_duration_minutes,
                                          )
                                        : 'Not available'
                                }
                            />
                            <InfoRow
                                label="Estimated Arrival"
                                value={
                                    eta.estimated_arrival_at
                                        ? formatDateTime(
                                              eta.estimated_arrival_at,
                                          )
                                        : 'Not available'
                                }
                            />
                        </dl>

                        {eta.current_position && (
                            <div className="mt-4">
                                <div className="mb-2 flex items-center gap-2">
                                    <Navigation className="text-muted-foreground size-4 shrink-0" />
                                    <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                                        Current GPS Position
                                    </p>
                                </div>
                                <dl className="-mx-6 divide-y">
                                    <InfoRow
                                        label="GPS Position"
                                        value={formatCoords(
                                            eta.current_position.latitude,
                                            eta.current_position.longitude,
                                        )}
                                    />
                                    <InfoRow
                                        label="Recorded At"
                                        value={formatDateTime(
                                            eta.current_position.recorded_at,
                                        )}
                                    />
                                    <InfoRow
                                        label="GPS Age"
                                        value={formatAge(
                                            eta.current_position.age_minutes,
                                        )}
                                    />
                                </dl>
                            </div>
                        )}

                        <p className="text-muted-foreground mt-4 flex items-center gap-1.5 text-xs">
                            <Gauge className="size-3.5 shrink-0" />
                            Estimated using an average speed of{' '}
                            {eta.average_speed_kmh.toFixed(0)} km/h with
                            {isStale ? ' a' : ''} straight-line distance.
                        </p>
                    </>
                )}
            </CardContent>
        </Card>
    );
}
