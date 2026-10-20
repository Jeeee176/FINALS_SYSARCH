import { Head, Link, usePage } from '@inertiajs/react';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import {
    ArrowRight,
    BadgeCheck,
    Ban,
    BellRing,
    BusFront,
    Flag,
    Gauge,
    IdCard,
    MapPin,
    Navigation,
    Phone,
    Play,
    Route as RouteIcon,
    Square,
    TriangleAlert,
    UserRound,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import DriverSidebarLayout from '@/layouts/app/driver-sidebar-layout';
import InputError from '@/components/input-error';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

type Status = 'active' | 'inactive';

type Driver = {
    id: number;
    license_number: string | null;
    license_expiry: string | null;
    phone: string | null;
    address: string | null;
    status: Status;
    user: {
        id: number;
        name: string;
        email: string;
    } | null;
};

type Bus = {
    id: number;
    bus_number: string;
    plate_number: string;
    model: string | null;
    capacity: number | null;
    status: Status;
};

type Route = {
    id: number;
    name: string;
    origin: string;
    destination: string;
    status: Status;
};

type CurrentTrip = {
    id: number;
    status: string;
    started_at: string | null;
};

type QueueEntryStatus =
    | 'queued'
    | 'next'
    | 'notified'
    | 'acknowledged'
    | 'loading';

type Dispatch = {
    id: number;
    status: QueueEntryStatus;
    queue_position: number;
    notified_at: string | null;
    driver_acknowledged_at: string | null;
    bus: {
        id: number | null;
        bus_number: string | null;
        plate_number: string | null;
    };
    route: {
        id: number | null;
        name: string | null;
        destination: string | null;
    };
};

type Props = {
    driver: Driver | null;
    assignedBus: Bus | null;
    assignedRoute: Route | null;
    currentTrip: CurrentTrip | null;
    dispatch: Dispatch | null;
};

const DELAY_REASONS = [
    'Flat Tire',
    'Traffic',
    'Engine/Mechanical Problem',
    'Accident',
    'Weather',
    'Passenger-related Delay',
    'Road Closure',
    'Fuel/Refueling',
    'Police/Checkpoint',
    'Other',
] as const;

const INCIDENT_REASONS: ReadonlySet<string> = new Set([
    'Accident',
    'Flat Tire',
    'Engine/Mechanical Problem',
    'Police/Checkpoint',
]);

type TripAction = 'idle' | 'starting' | 'ending';

type Feedback = { type: 'success' | 'error'; message: string } | null;

const DISPATCH_STATUS_LABELS: Record<QueueEntryStatus, string> = {
    queued: 'Queued',
    next: 'Next',
    notified: 'Notified',
    acknowledged: 'Acknowledged',
    loading: 'Loading',
};

const TRIP_STATUS_LABELS: Record<string, string> = {
    scheduled: 'Scheduled',
    in_transit: 'In Transit',
    completed: 'Completed',
    cancelled: 'Cancelled',
};

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
    distance_km?: number;
    estimated_duration_minutes?: number;
    estimated_arrival_at?: string;
    warning?: string;
};

const ETA_POLL_INTERVAL_MS = 30_000;

const GPS_STALE_MINUTES = 15;

type EtaHookState = {
    eta: EtaData | null;
    loading: boolean;
    error: string | null;
};

/**
 * Dashboard-local loader for /driver/eta — the same endpoint and freshness
 * rules the ETA card uses. Re-checks on an interval so the tracking status
 * stays accurate without a page reload.
 */
function useDriverEta(): EtaHookState {
    const [eta, setEta] = useState<EtaData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let active = true;

        async function load() {
            try {
                const response = await fetch('/driver/eta');

                if (!response.ok) {
                    let message = 'Unable to load tracking status right now.';
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
        }, ETA_POLL_INTERVAL_MS);

        return () => {
            active = false;
            clearInterval(intervalId);
        };
    }, []);

    return { eta, loading, error };
}

function StatCard({
    label,
    value,
    sublabel,
    icon: Icon,
    dataTest,
}: {
    label: string;
    value: string;
    sublabel: string;
    icon: LucideIcon;
    dataTest: string;
}) {
    return (
        <Card className="py-5" data-test={dataTest}>
            <CardContent className="flex items-start justify-between gap-3 px-5">
                <div className="min-w-0">
                    <p className="text-muted-foreground text-sm">{label}</p>
                    <p className="mt-1.5 truncate text-2xl font-semibold">
                        {value}
                    </p>
                    <p className="text-muted-foreground mt-1 text-xs">
                        {sublabel}
                    </p>
                </div>
                <div className="bg-primary/10 text-primary-strong flex size-10 shrink-0 items-center justify-center rounded-lg">
                    <Icon className="size-5" />
                </div>
            </CardContent>
        </Card>
    );
}

function QuickAction({
    href,
    title,
    description,
    icon: Icon,
    dataTest,
}: {
    href: string;
    title: string;
    description: string;
    icon: LucideIcon;
    dataTest: string;
}) {
    return (
        <Link
            href={href}
            data-test={dataTest}
            className="bg-card hover:border-primary/40 hover:bg-primary/5 focus-visible:ring-ring/50 group flex items-center gap-3 rounded-lg border p-4 transition-colors focus-visible:ring-[3px] focus-visible:outline-none"
        >
            <div className="bg-primary/10 text-primary-strong flex size-10 shrink-0 items-center justify-center rounded-lg">
                <Icon className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{title}</p>
                <p className="text-muted-foreground mt-0.5 text-xs">
                    {description}
                </p>
            </div>
            <ArrowRight className="text-muted-foreground group-hover:text-primary-strong size-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
        </Link>
    );
}

function StatusBadge({ status }: { status: Status }) {
    const isActive = status === 'active';

    return (
        <Badge
            className={cn(
                'border-transparent',
                isActive
                    ? 'bg-success text-success-foreground'
                    : 'bg-muted text-muted-foreground',
            )}
        >
            {isActive ? 'Active' : 'Inactive'}
        </Badge>
    );
}

function InfoRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex flex-col gap-1 px-6 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <dt className="text-muted-foreground text-sm">{label}</dt>
            <dd className="text-sm font-medium break-words sm:text-right">
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

function Callout({
    type,
    children,
}: {
    type: 'success' | 'error';
    children: ReactNode;
}) {
    return (
        <div
            className={cn(
                'flex items-start gap-2 rounded-lg border px-4 py-3 text-sm',
                type === 'success'
                    ? 'bg-success/10 text-foreground border-success/50'
                    : 'bg-destructive/10 text-destructive-strong border-destructive/50',
            )}
        >
            <span className="mt-0.5 shrink-0" aria-hidden="true">
                {type === 'success' ? '✓' : '!'}
            </span>
            <div className="min-w-0 break-words">{children}</div>
        </div>
    );
}

function formatDate(value: string | null): string {
    if (!value) {
        return 'Not specified';
    }

    const date = new Date(`${value}T00:00:00`);

    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return date.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    });
}

function formatTimestamp(value: string | null): string {
    if (!value) {
        return 'Unknown';
    }

    const match = value.match(
        /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?/,
    );

    if (match) {
        const [, year, month, day, hour, minute, second = '00'] = match;
        const date = new Date(
            Number(year),
            Number(month) - 1,
            Number(day),
            Number(hour),
            Number(minute),
            Number(second),
        );
        if (!Number.isNaN(date.getTime())) {
            return date.toLocaleString(undefined, {
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
            });
        }
    }

    const iso = new Date(value);
    if (!Number.isNaN(iso.getTime())) {
        return iso.toLocaleString(undefined, {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
        });
    }

    return value;
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

function formatDuration(totalMinutes: number): string {
    const rounded = Math.max(0, Math.round(totalMinutes));

    if (rounded < 60) {
        return `${rounded} min`;
    }

    const hours = Math.floor(rounded / 60);
    const minutes = rounded % 60;

    return minutes === 0 ? `${hours} hr` : `${hours} hr ${minutes} min`;
}

function formatCoords(latitude: number, longitude: number): string {
    return `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
}

type TripResponse = {
    success?: boolean;
    error?: string;
    trip?: {
        id: number;
        status: string | { value?: string };
        started_at?: string | null;
    };
};

async function postTripJson<T>(url: string, body?: object): Promise<T> {
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body ?? {}),
    });

    return (await response.json()) as T;
}

function TripStatusBadge({ status }: { status: string }) {
    if (status === 'in_transit') {
        return (
            <Badge
                className="bg-success text-success-foreground border-transparent"
                data-test="trip-status-badge"
            >
                In Transit
            </Badge>
        );
    }

    return (
        <Badge
            className="bg-muted text-muted-foreground border-transparent"
            data-test="trip-status-badge"
        >
            {TRIP_STATUS_LABELS[status] ?? status.replace('_', ' ')}
        </Badge>
    );
}

function DispatchStatusBadge({ status }: { status: QueueEntryStatus }) {
    return (
        <Badge
            variant="default"
            className={cn(
                'border-transparent',
                status === 'queued' && 'bg-muted text-muted-foreground',
                status === 'next' && 'bg-primary text-primary-foreground',
                status === 'notified' &&
                    'bg-warning/15 border-warning/40 text-foreground',
                status === 'acknowledged' &&
                    'bg-success/15 border-success/30 text-success-strong',
                status === 'loading' &&
                    'bg-primary/10 text-primary-strong border-transparent',
            )}
        >
            {DISPATCH_STATUS_LABELS[status]}
        </Badge>
    );
}

function TrackingState({
    eta,
    loading,
    error,
    assignedRoute,
}: {
    eta: EtaData | null;
    loading: boolean;
    error: string | null;
    assignedRoute: Route | null;
}) {
    if (loading && !eta) {
        return (
            <p className="text-muted-foreground flex items-center gap-1.5 py-4 text-sm">
                <Spinner className="text-primary size-4 shrink-0" />
                <span data-test="gps-status-loading">
                    Checking the latest GPS position...
                </span>
            </p>
        );
    }

    if (error) {
        return (
            <div className="border-destructive/50 bg-destructive/10 text-destructive-strong space-y-3 rounded-lg border p-3 text-sm">
                <p>{error}</p>
                <Button asChild variant="outline" size="sm">
                    <Link href="/driver/gps" data-test="gps-open-tracking">
                        Open Live Tracking
                        <ArrowRight className="size-4" />
                    </Link>
                </Button>
            </div>
        );
    }

    if (!eta) {
        return null;
    }

    const position = eta.current_position ?? null;
    const isStale = eta.status === 'stale_position';
    const positionIsOld =
        position !== null && position.age_minutes > GPS_STALE_MINUTES;

    const statusBadge =
        eta.status === 'no_assigned_route' ? (
            <Badge
                className="bg-muted text-muted-foreground ml-auto border-transparent"
                data-test="gps-status-badge"
            >
                No Route
            </Badge>
        ) : eta.status === 'no_gps_location' ? (
            <Badge
                className="bg-muted text-muted-foreground ml-auto border-transparent"
                data-test="gps-status-badge"
            >
                No GPS Data
            </Badge>
        ) : eta.status === 'no_destination_coordinates' ? (
            <Badge
                className={cn(
                    'ml-auto border-transparent',
                    positionIsOld
                        ? 'bg-warning text-warning-foreground'
                        : 'bg-success text-success-foreground',
                )}
                data-test="gps-status-badge"
            >
                {positionIsOld ? 'Position Stale' : 'Position Recorded'}
            </Badge>
        ) : eta.status === 'stale_position' ? (
            <Badge
                className="bg-warning text-warning-foreground ml-auto border-transparent"
                data-test="gps-status-badge"
            >
                Stale Position
            </Badge>
        ) : (
            <Badge
                className="bg-success text-success-foreground ml-auto border-transparent"
                data-test="gps-status-badge"
            >
                Position Fresh
            </Badge>
        );

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-start gap-4">
                {statusBadge}
            </div>

            {eta.status === 'no_assigned_route' && (
                <EmptyState
                    icon={RouteIcon}
                    title="No route assigned"
                    description="Your bus does not have a route assigned yet, so tracking has no destination. Contact your administrator."
                />
            )}

            {eta.status === 'no_gps_location' && (
                <div className="space-y-3">
                    <EmptyState
                        icon={MapPin}
                        title="No GPS position recorded yet"
                        description="Open Live Tracking to start sharing your location so the terminal can follow your bus."
                    />
                    <Button asChild variant="outline" size="sm">
                        <Link href="/driver/gps" data-test="gps-open-tracking">
                            Open Live Tracking
                            <ArrowRight className="size-4" />
                        </Link>
                    </Button>
                </div>
            )}

            {position && (
                <dl className="-mx-6 divide-y">
                    <InfoRow
                        label="Latest Position"
                        value={formatCoords(
                            position.latitude,
                            position.longitude,
                        )}
                    />
                    <InfoRow
                        label="Recorded"
                        value={formatTimestamp(position.recorded_at)}
                    />
                    <InfoRow
                        label="Position Age"
                        value={formatAge(position.age_minutes)}
                    />
                </dl>
            )}

            {isStale && eta.warning && (
                <div className="border-warning/50 bg-warning/10 text-foreground space-y-3 rounded-lg border p-3 text-sm">
                    <p>{eta.warning}</p>
                    <Button asChild variant="outline" size="sm">
                        <Link href="/driver/gps" data-test="gps-open-tracking">
                            Open Live Tracking
                            <ArrowRight className="size-4" />
                        </Link>
                    </Button>
                </div>
            )}

            {eta.status === 'no_destination_coordinates' && (
                <div className="border-warning/50 bg-warning/10 text-foreground space-y-3 rounded-lg border p-3 text-sm">
                    <p>
                        Your assigned route has no destination coordinates, so
                        an ETA cannot be calculated. Open Live Tracking to keep
                        sharing your position.
                    </p>
                    <Button asChild variant="outline" size="sm">
                        <Link href="/driver/gps" data-test="gps-open-tracking">
                            Open Live Tracking
                            <ArrowRight className="size-4" />
                        </Link>
                    </Button>
                </div>
            )}

            {(eta.status === 'ok' || isStale) && (
                <>
                    {eta.route.destination && (
                        <div className="bg-muted flex items-center gap-3 rounded-lg px-4 py-3">
                            <Flag className="text-primary size-5 shrink-0" />
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium">
                                    {eta.route.destination}
                                </p>
                                <p className="text-muted-foreground truncate text-xs">
                                    {assignedRoute
                                        ? assignedRoute.origin
                                        : (eta.route.name ?? '')}
                                </p>
                            </div>
                        </div>
                    )}

                    <dl className="-mx-6 divide-y">
                        <InfoRow
                            label="Destination"
                            value={eta.route.destination ?? 'Not available'}
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
                                    ? formatTimestamp(eta.estimated_arrival_at)
                                    : 'Not available'
                            }
                        />
                    </dl>

                    <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
                        <Gauge className="size-3.5 shrink-0" />
                        Estimated using an average speed of{' '}
                        {eta.average_speed_kmh.toFixed(0)} km/h with
                        {isStale ? ' a' : ''} straight-line distance.
                    </p>

                    <Button asChild variant="outline" size="sm">
                        <Link href="/driver/gps" data-test="gps-open-tracking">
                            Open Live Tracking
                            <ArrowRight className="size-4" />
                        </Link>
                    </Button>
                </>
            )}
        </div>
    );
}

export default function DriverDashboardPage({
    driver,
    assignedBus,
    assignedRoute,
    currentTrip,
    dispatch,
}: Props) {
    const { auth } = usePage().props;
    const userName = driver?.user?.name ?? auth?.user?.name ?? 'Driver';

    const { eta, loading: etaLoading, error: etaError } = useDriverEta();

    const [activeTrip, setActiveTrip] = useState<CurrentTrip | null>(
        currentTrip ?? null,
    );
    const [tripAction, setTripAction] = useState<TripAction>('idle');
    const [tripFeedback, setTripFeedback] = useState<Feedback>(null);

    const [incidentReason, setIncidentReason] = useState<string>('');
    const [incidentDetails, setIncidentDetails] = useState<string>('');
    const [reasonError, setReasonError] = useState<string | null>(null);
    const [detailsError, setDetailsError] = useState<string | null>(null);
    const [submittingIncident, setSubmittingIncident] = useState(false);
    const [incidentFeedback, setIncidentFeedback] = useState<Feedback>(null);

    const tripBusy = tripAction !== 'idle';

    const handleStartTrip = async () => {
        setTripFeedback(null);

        if (!assignedBus) {
            setTripFeedback({
                type: 'error',
                message: 'You cannot start a trip without an assigned bus.',
            });
            return;
        }

        if (!assignedRoute) {
            setTripFeedback({
                type: 'error',
                message:
                    'Your assigned bus has no route yet. Contact your administrator.',
            });
            return;
        }

        setTripAction('starting');

        try {
            const data = await postTripJson<TripResponse>(
                '/api/driver/trips/start',
            );

            if (data.success === true && data.trip) {
                const status =
                    typeof data.trip.status === 'string'
                        ? data.trip.status
                        : (data.trip.status?.value ?? 'in_transit');

                setActiveTrip({
                    id: data.trip.id,
                    status,
                    started_at: data.trip.started_at ?? null,
                });
                setTripFeedback({
                    type: 'success',
                    message: 'Trip started successfully.',
                });
            } else {
                setTripFeedback({
                    type: 'error',
                    message: data.error ?? 'Could not start the trip.',
                });
            }
        } catch {
            setTripFeedback({
                type: 'error',
                message: 'Network error. Please try again.',
            });
        } finally {
            setTripAction('idle');
        }
    };

    const handleEndTrip = async () => {
        if (!activeTrip) {
            return;
        }

        setTripFeedback(null);
        setTripAction('ending');

        try {
            const data = await postTripJson<TripResponse>(
                `/api/driver/trips/${activeTrip.id}/end`,
            );

            if (data.success === true) {
                setActiveTrip(null);
                setTripFeedback({
                    type: 'success',
                    message: 'Trip ended successfully.',
                });
            } else {
                setTripFeedback({
                    type: 'error',
                    message: data.error ?? 'Could not end the trip.',
                });
            }
        } catch {
            setTripFeedback({
                type: 'error',
                message: 'Network error. Please try again.',
            });
        } finally {
            setTripAction('idle');
        }
    };

    const handleSubmitIncident = async () => {
        setReasonError(null);
        setDetailsError(null);
        setIncidentFeedback(null);

        if (!incidentReason) {
            setReasonError('Please select a reason.');
            return;
        }

        if (incidentReason === 'Other' && incidentDetails.trim() === '') {
            setDetailsError('Details are required when the reason is "Other".');
            return;
        }

        setSubmittingIncident(true);

        try {
            const body: {
                reason: string;
                details?: string;
                trip_id?: number;
            } = {
                reason: incidentReason,
            };

            if (incidentDetails.trim() !== '') {
                body.details = incidentDetails.trim();
            }

            if (activeTrip) {
                body.trip_id = activeTrip.id;
            }

            const data = await postTripJson<{
                success?: boolean;
                error?: string;
            }>('/api/driver/delay-incidents', body);

            if (data.success === true) {
                setIncidentReason('');
                setIncidentDetails('');
                setIncidentFeedback({
                    type: 'success',
                    message: 'Delay/incident reported successfully.',
                });
            } else {
                setIncidentFeedback({
                    type: 'error',
                    message: data.error ?? 'Could not submit the report.',
                });
            }
        } catch {
            setIncidentFeedback({
                type: 'error',
                message: 'Network error. Please try again.',
            });
        } finally {
            setSubmittingIncident(false);
        }
    };

    return (
        <DriverSidebarLayout
            breadcrumbs={[
                {
                    title: 'Dashboard',
                    href: '/driver/dashboard',
                },
            ]}
        >
            <Head title="Dashboard" />

            <div className="flex flex-1 flex-col gap-6 px-6 md:px-4">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight">
                        Driver Dashboard
                    </h1>
                    <p className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-2 text-sm">
                        <span data-test="dashboard-greeting">
                            Good day, {userName}! Here is your bus, route, and
                            trip at a glance.
                        </span>
                        {driver && (
                            <Badge
                                className={cn(
                                    'border-transparent',
                                    driver.status === 'active'
                                        ? 'bg-success text-success-foreground'
                                        : 'bg-muted text-muted-foreground',
                                )}
                                data-test="driver-status-badge"
                            >
                                {driver.status === 'active'
                                    ? 'Active Driver'
                                    : 'Inactive Driver'}
                            </Badge>
                        )}
                    </p>
                </div>

                {!driver ? (
                    <Card>
                        <CardContent>
                            <EmptyState
                                icon={Ban}
                                title="Driver record not found"
                                description="Your account does not have an associated driver profile yet. Contact your system administrator."
                            />
                        </CardContent>
                    </Card>
                ) : (
                    <>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                            <StatCard
                                label="My Bus"
                                value={assignedBus?.bus_number ?? 'None'}
                                sublabel={
                                    assignedBus
                                        ? `${assignedBus.plate_number} · ${
                                              assignedBus.status === 'active'
                                                  ? 'Active'
                                                  : 'Inactive'
                                          }`
                                        : 'No bus assigned yet'
                                }
                                icon={BusFront}
                                dataTest="stat-my-bus"
                            />
                            <StatCard
                                label="My Route"
                                value={assignedRoute?.name ?? 'None'}
                                sublabel={
                                    assignedRoute
                                        ? `${assignedRoute.origin} → ${assignedRoute.destination}`
                                        : assignedBus
                                          ? 'No route on your bus'
                                          : 'Route comes with a bus'
                                }
                                icon={RouteIcon}
                                dataTest="stat-my-route"
                            />
                            <StatCard
                                label="Current Trip"
                                value={
                                    activeTrip?.status === 'in_transit'
                                        ? 'In Transit'
                                        : 'No Active Trip'
                                }
                                sublabel={
                                    activeTrip?.status === 'in_transit'
                                        ? `Started ${formatTimestamp(
                                              activeTrip.started_at,
                                          )}`
                                        : 'Start one when ready to depart'
                                }
                                icon={Navigation}
                                dataTest="stat-current-trip"
                            />
                            <StatCard
                                label="GPS Tracking"
                                value={etaPositionValue(
                                    eta,
                                    etaLoading,
                                    etaError,
                                )}
                                sublabel={etaPositionSublabel(
                                    eta,
                                    etaLoading,
                                    etaError,
                                )}
                                icon={MapPin}
                                dataTest="stat-gps-tracking"
                            />
                        </div>

                        <section className="flex flex-col gap-3">
                            <h2 className="text-base font-semibold">
                                Quick Actions
                            </h2>
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                                <QuickAction
                                    href="/driver/route"
                                    title="My Route"
                                    description="View origin, destination, and your route details."
                                    icon={RouteIcon}
                                    dataTest="quick-action-my-route"
                                />
                                <QuickAction
                                    href="/driver/bus"
                                    title="My Bus"
                                    description="Check the bus assigned to you and its status."
                                    icon={BusFront}
                                    dataTest="quick-action-my-bus"
                                />
                                <QuickAction
                                    href="/driver/gps"
                                    title="Live Tracking"
                                    description="Share your GPS position with the terminal."
                                    icon={MapPin}
                                    dataTest="quick-action-live-tracking"
                                />
                                <QuickAction
                                    href="/driver/departure-queue"
                                    title="Dispatch"
                                    description="Review and acknowledge dispatch notifications."
                                    icon={BellRing}
                                    dataTest="quick-action-dispatch"
                                />
                            </div>
                        </section>

                        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                            <Card data-test="bus-card">
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2 text-base">
                                        <BusFront className="text-primary size-4 shrink-0" />
                                        Assigned Bus
                                    </CardTitle>
                                    <CardDescription>
                                        The bus currently assigned to you.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    {!assignedBus ? (
                                        <EmptyState
                                            icon={BusFront}
                                            title="No bus assigned"
                                            description="You don't have a bus assigned yet. Contact your administrator."
                                        />
                                    ) : (
                                        <dl className="-mx-6 divide-y">
                                            <InfoRow
                                                label="Bus Number"
                                                value={assignedBus.bus_number}
                                            />
                                            <InfoRow
                                                label="Plate Number"
                                                value={assignedBus.plate_number}
                                            />
                                            <InfoRow
                                                label="Model"
                                                value={
                                                    assignedBus.model ??
                                                    'Not specified'
                                                }
                                            />
                                            <InfoRow
                                                label="Capacity"
                                                value={
                                                    assignedBus.capacity != null
                                                        ? `${assignedBus.capacity} seats`
                                                        : 'Not specified'
                                                }
                                            />
                                            <div className="flex flex-col gap-1 px-6 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                                                <dt className="text-muted-foreground text-sm">
                                                    Status
                                                </dt>
                                                <dd className="sm:text-right">
                                                    <StatusBadge
                                                        status={
                                                            assignedBus.status
                                                        }
                                                    />
                                                </dd>
                                            </div>
                                        </dl>
                                    )}
                                    <div className="mt-4">
                                        <Button
                                            asChild
                                            variant="outline"
                                            size="sm"
                                        >
                                            <Link
                                                href="/driver/bus"
                                                data-test="bus-card-link"
                                            >
                                                Open My Bus
                                                <ArrowRight className="size-4" />
                                            </Link>
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card data-test="route-card">
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2 text-base">
                                        <RouteIcon className="text-primary size-4 shrink-0" />
                                        My Route
                                    </CardTitle>
                                    <CardDescription>
                                        The route associated with your assigned
                                        bus.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    {!assignedRoute ? (
                                        <EmptyState
                                            icon={RouteIcon}
                                            title={
                                                assignedBus
                                                    ? 'No route assigned'
                                                    : 'No bus assigned'
                                            }
                                            description={
                                                assignedBus
                                                    ? 'Your assigned bus has no route yet. Contact your administrator.'
                                                    : 'A route will appear here once a bus is assigned to you.'
                                            }
                                        />
                                    ) : (
                                        <>
                                            <div className="bg-primary/10 text-primary-strong flex items-center gap-3 rounded-lg px-4 py-3">
                                                <BadgeCheck className="size-5 shrink-0" />
                                                <div className="min-w-0 flex-1">
                                                    <p className="truncate text-sm font-medium">
                                                        {assignedRoute.name}
                                                    </p>
                                                    <p className="text-muted-foreground truncate text-xs">
                                                        {assignedRoute.origin} →{' '}
                                                        {
                                                            assignedRoute.destination
                                                        }
                                                    </p>
                                                </div>
                                            </div>
                                            <dl className="-mx-6 mt-4 divide-y">
                                                <InfoRow
                                                    label="Origin"
                                                    value={assignedRoute.origin}
                                                />
                                                <InfoRow
                                                    label="Destination"
                                                    value={
                                                        assignedRoute.destination
                                                    }
                                                />
                                                <div className="flex flex-col gap-1 px-6 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                                                    <dt className="text-muted-foreground text-sm">
                                                        Status
                                                    </dt>
                                                    <dd className="sm:text-right">
                                                        <StatusBadge
                                                            status={
                                                                assignedRoute.status
                                                            }
                                                        />
                                                    </dd>
                                                </div>
                                            </dl>
                                        </>
                                    )}
                                    <div className="mt-4">
                                        <Button
                                            asChild
                                            variant="outline"
                                            size="sm"
                                        >
                                            <Link
                                                href="/driver/route"
                                                data-test="route-card-link"
                                            >
                                                Open My Route
                                                <ArrowRight className="size-4" />
                                            </Link>
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>

                        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                            <Card data-test="trip-card">
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2 text-base">
                                        <Navigation className="text-primary size-4 shrink-0" />
                                        Current Trip
                                    </CardTitle>
                                    <CardDescription>
                                        {activeTrip
                                            ? 'Your trip that is currently in progress.'
                                            : assignedBus
                                              ? 'Start a trip when you are ready to depart, and end it when you complete the route.'
                                              : 'Trips require an assigned bus from your administrator.'}
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    {activeTrip ? (
                                        <div className="bg-success/10 flex items-center gap-3 rounded-lg px-4 py-3">
                                            <span className="bg-success flex size-2.5 shrink-0 rounded-full" />
                                            <div className="min-w-0 flex-1">
                                                <p className="text-sm font-medium">
                                                    Trip #{activeTrip.id}
                                                </p>
                                                <p className="text-muted-foreground text-xs">
                                                    Started{' '}
                                                    {formatTimestamp(
                                                        activeTrip.started_at,
                                                    )}
                                                </p>
                                            </div>
                                            <TripStatusBadge
                                                status={activeTrip.status}
                                            />
                                        </div>
                                    ) : (
                                        <EmptyState
                                            icon={Play}
                                            title="No active trip"
                                            description={
                                                assignedBus
                                                    ? 'Start a trip when you are ready to depart.'
                                                    : 'You need an assigned bus before you can start a trip.'
                                            }
                                        />
                                    )}

                                    {assignedBus && (
                                        <Button
                                            className="w-full gap-2"
                                            variant={
                                                activeTrip
                                                    ? 'destructive'
                                                    : 'default'
                                            }
                                            disabled={tripBusy}
                                            onClick={
                                                activeTrip
                                                    ? handleEndTrip
                                                    : handleStartTrip
                                            }
                                            data-test={
                                                activeTrip
                                                    ? 'trip-end'
                                                    : 'trip-start'
                                            }
                                        >
                                            {tripBusy ? (
                                                <Spinner className="size-4" />
                                            ) : activeTrip ? (
                                                <Square className="size-4" />
                                            ) : (
                                                <Play className="size-4" />
                                            )}
                                            {activeTrip
                                                ? 'End Trip'
                                                : tripBusy
                                                  ? 'Working...'
                                                  : 'Start Trip'}
                                        </Button>
                                    )}

                                    {tripFeedback && (
                                        <Callout type={tripFeedback.type}>
                                            {tripFeedback.message}
                                        </Callout>
                                    )}

                                    <Button asChild variant="outline" size="sm">
                                        <Link
                                            href="/driver/gps"
                                            data-test="trip-card-link"
                                        >
                                            Open Live Tracking
                                            <ArrowRight className="size-4" />
                                        </Link>
                                    </Button>
                                </CardContent>
                            </Card>

                            <Card data-test="gps-card">
                                <CardHeader>
                                    <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                                        <MapPin className="text-primary size-4 shrink-0" />
                                        GPS Tracking Status
                                    </CardTitle>
                                    <CardDescription>
                                        The latest GPS position recorded for
                                        your bus and the ETA to your route
                                        destination.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <TrackingState
                                        eta={eta}
                                        loading={etaLoading}
                                        error={etaError}
                                        assignedRoute={assignedRoute}
                                    />
                                </CardContent>
                            </Card>
                        </div>

                        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                            <Card data-test="dispatch-card">
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2 text-base">
                                        <BellRing className="text-primary size-4 shrink-0" />
                                        Dispatch Notification
                                    </CardTitle>
                                    <CardDescription>
                                        Grouped with your position in the
                                        departure queue.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    {dispatch ? (
                                        <>
                                            <div className="bg-primary/5 flex items-center gap-3 rounded-lg px-4 py-3">
                                                <div className="min-w-0 flex-1">
                                                    <p className="truncate text-sm font-medium">
                                                        {dispatch.bus
                                                            .bus_number ?? '—'}
                                                    </p>
                                                    <p className="text-muted-foreground truncate text-xs">
                                                        {(dispatch.route.name ??
                                                            'No route') +
                                                            (dispatch.route
                                                                .destination
                                                                ? ` → ${dispatch.route.destination}`
                                                                : '')}
                                                    </p>
                                                </div>
                                                <DispatchStatusBadge
                                                    status={dispatch.status}
                                                />
                                            </div>
                                            <dl className="-mx-6 mt-2 divide-y">
                                                <InfoRow
                                                    label="Queue Position"
                                                    value={`#${dispatch.queue_position}`}
                                                />
                                                <InfoRow
                                                    label="Notified At"
                                                    value={formatTimestamp(
                                                        dispatch.notified_at,
                                                    )}
                                                />
                                            </dl>
                                            <p className="text-muted-foreground mt-3 text-xs">
                                                {dispatch.driver_acknowledged_at
                                                    ? 'You acknowledged this dispatch notification.'
                                                    : 'Open Dispatch to acknowledge this notification when you see it.'}
                                            </p>
                                        </>
                                    ) : (
                                        <EmptyState
                                            icon={BellRing}
                                            title="No dispatch notification"
                                            description="When your bus is listed for departure, the dispatch notice will appear here."
                                        />
                                    )}
                                    <div className="mt-4">
                                        <Button
                                            asChild
                                            variant="outline"
                                            size="sm"
                                        >
                                            <Link
                                                href="/driver/departure-queue"
                                                data-test="dispatch-card-link"
                                            >
                                                Open Dispatch
                                                <ArrowRight className="size-4" />
                                            </Link>
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2 text-base">
                                        <TriangleAlert className="text-primary size-4 shrink-0" />
                                        Report Delay / Incident
                                    </CardTitle>
                                    <CardDescription>
                                        Report conditions encountered on the
                                        road to the terminal.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="delay-reason">
                                            Reason
                                        </Label>
                                        <Select
                                            value={incidentReason}
                                            onValueChange={(value) => {
                                                setIncidentReason(value);
                                                setReasonError(null);
                                            }}
                                        >
                                            <SelectTrigger
                                                id="delay-reason"
                                                className="w-full"
                                            >
                                                <SelectValue placeholder="Select a reason" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {DELAY_REASONS.map((reason) => (
                                                    <SelectItem
                                                        key={reason}
                                                        value={reason}
                                                    >
                                                        {reason}
                                                        {INCIDENT_REASONS.has(
                                                            reason,
                                                        )
                                                            ? ' (Incident)'
                                                            : ''}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        {reasonError && (
                                            <InputError message={reasonError} />
                                        )}
                                    </div>

                                    <div className="space-y-2">
                                        <Label htmlFor="delay-details">
                                            Details
                                            {incidentReason === 'Other' && (
                                                <span className="text-destructive-strong">
                                                    {' '}
                                                    *
                                                </span>
                                            )}
                                        </Label>
                                        <textarea
                                            id="delay-details"
                                            rows={4}
                                            value={incidentDetails}
                                            onChange={(event) => {
                                                setIncidentDetails(
                                                    event.target.value,
                                                );
                                                setDetailsError(null);
                                            }}
                                            placeholder={
                                                incidentReason === 'Other'
                                                    ? 'Required when the reason is "Other".'
                                                    : 'Optional additional information.'
                                            }
                                            className="border-input-border placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring flex w-full min-w-0 rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
                                        />
                                        {detailsError && (
                                            <InputError
                                                message={detailsError}
                                            />
                                        )}
                                    </div>

                                    <Button
                                        className="w-full gap-2"
                                        disabled={submittingIncident}
                                        onClick={handleSubmitIncident}
                                    >
                                        {submittingIncident ? (
                                            <Spinner className="size-4" />
                                        ) : (
                                            <TriangleAlert className="size-4" />
                                        )}
                                        {submittingIncident
                                            ? 'Submitting...'
                                            : 'Submit Report'}
                                    </Button>

                                    {incidentFeedback && (
                                        <Callout type={incidentFeedback.type}>
                                            {incidentFeedback.message}
                                        </Callout>
                                    )}

                                    <p className="text-muted-foreground text-xs">
                                        Accident, Flat Tire, Engine/Mechanical
                                        Problem, and Police/Checkpoint are
                                        treated as incidents and raise critical
                                        alerts.
                                    </p>
                                </CardContent>
                            </Card>
                        </div>

                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                            <Card data-test="driver-info-card">
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2 text-base">
                                        <UserRound className="text-primary size-4 shrink-0" />
                                        Driver Information
                                    </CardTitle>
                                    <CardDescription>
                                        Account details tied to your profile.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <dl className="-mx-6 divide-y">
                                        <InfoRow
                                            label="Name"
                                            value={
                                                driver.user?.name ??
                                                'Not provided'
                                            }
                                        />
                                        <InfoRow
                                            label="Email"
                                            value={
                                                driver.user?.email ??
                                                'Not provided'
                                            }
                                        />
                                        <div className="flex flex-col gap-1 px-6 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                                            <dt className="text-muted-foreground text-sm">
                                                Status
                                            </dt>
                                            <dd className="sm:text-right">
                                                <StatusBadge
                                                    status={driver.status}
                                                />
                                            </dd>
                                        </div>
                                    </dl>
                                </CardContent>
                            </Card>

                            <Card data-test="license-info-card">
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2 text-base">
                                        <IdCard className="text-primary size-4 shrink-0" />
                                        License Information
                                    </CardTitle>
                                    <CardDescription>
                                        Driving license registered to you.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <dl className="-mx-6 divide-y">
                                        <InfoRow
                                            label="License Number"
                                            value={
                                                driver.license_number ??
                                                'Not specified'
                                            }
                                        />
                                        <InfoRow
                                            label="License Expiry"
                                            value={formatDate(
                                                driver.license_expiry,
                                            )}
                                        />
                                    </dl>
                                </CardContent>
                            </Card>

                            <Card data-test="contact-info-card">
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2 text-base">
                                        <Phone className="text-primary size-4 shrink-0" />
                                        Contact Information
                                    </CardTitle>
                                    <CardDescription>
                                        How we can reach you.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <dl className="-mx-6 divide-y">
                                        <InfoRow
                                            label="Phone"
                                            value={
                                                driver.phone ?? 'Not provided'
                                            }
                                        />
                                        <div className="flex items-start gap-2 px-6 py-3">
                                            <MapPin className="text-muted-foreground mt-0.5 size-4 shrink-0" />
                                            <div className="min-w-0 flex-1">
                                                <dt className="text-muted-foreground text-sm">
                                                    Address
                                                </dt>
                                                <dd className="text-muted-foreground mt-1 text-sm">
                                                    {driver.address ??
                                                        'Not provided'}
                                                </dd>
                                            </div>
                                        </div>
                                    </dl>
                                </CardContent>
                            </Card>
                        </div>
                    </>
                )}
            </div>
        </DriverSidebarLayout>
    );
}

function etaPositionValue(
    eta: EtaData | null,
    loading: boolean,
    error: string | null,
): string {
    if (loading && !eta) {
        return '—';
    }

    if (error || !eta) {
        return '—';
    }

    if (eta.status === 'no_assigned_route') {
        return '—';
    }

    if (eta.status === 'no_gps_location') {
        return 'No Data';
    }

    const position = eta.current_position;
    if (!position) {
        return '—';
    }

    return position.age_minutes > GPS_STALE_MINUTES ? 'Stale' : 'Fresh';
}

function etaPositionSublabel(
    eta: EtaData | null,
    loading: boolean,
    error: string | null,
): string {
    if (loading && !eta) {
        return 'Checking latest position…';
    }

    if (error || !eta) {
        return 'Tracking status unavailable';
    }

    if (eta.status === 'no_assigned_route') {
        return 'No route assigned on your bus';
    }

    if (eta.status === 'no_gps_location') {
        return 'No position recorded yet';
    }

    const position = eta.current_position;
    if (!position) {
        return 'Tracking status unavailable';
    }

    return position.age_minutes > GPS_STALE_MINUTES
        ? `Latest position ${formatAge(position.age_minutes)}`
        : 'Latest position on your route';
}
