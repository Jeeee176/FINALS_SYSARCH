import { Head, Link, usePage } from '@inertiajs/react';
import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
    Activity,
    ArrowRight,
    BellRing,
    Bus,
    Gauge,
    MapPin,
    Navigation,
    Route,
    Search,
    UserCheck,
    UserCog,
    Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import AppSidebarLayout from '@/layouts/app/app-sidebar-layout';
import {
    ActiveAlertsList,
    useActiveAlerts,
    type FleetAlert,
} from '@/components/active-alerts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

type Status = 'active' | 'inactive';

type Bus = {
    id: number;
    bus_number: string;
    plate_number: string;
    model: string | null;
    capacity: number | null;
    status: Status;
    route_id: number | null;
    driver_id: number | null;
    created_at: string;
    updated_at: string;
};

type LocationRecord = {
    id: number;
    bus_id: number;
    latitude: string;
    longitude: string;
    recorded_at: string;
    created_at: string;
    updated_at: string;
    bus: Bus | null;
};

type CountPair = {
    total: number;
    active: number;
};

type DashboardStats = {
    buses: CountPair;
    drivers: CountPair;
    operators: CountPair;
    routes: CountPair;
};

type Alert = FleetAlert;

type AssignedBusDriver = {
    id: number;
    user: { id: number; name: string } | null;
};

type AssignedBusRoute = {
    id: number;
    name: string;
};

type AssignedBus = {
    id: number;
    bus_number: string;
    plate_number: string;
    status: Status;
    driver: AssignedBusDriver | null;
    route: AssignedBusRoute | null;
};

type TripAnalytics = {
    total_trips: number;
    completed_trips: number;
    in_transit_trips: number;
    cancelled_trips: number;
    delayed_trips: number;
    delay_reports: number;
    incidents: number;
    gps_records: number;
    gps_active_buses: number;
};

type StatusPoint = {
    status: string;
    label: string;
    value: number;
};

type ReportsFilters = {
    period?: string;
    from?: string | null;
    to?: string | null;
};

type ReportsEnvelope = {
    props?: {
        analytics?: TripAnalytics;
        charts?: { statuses?: StatusPoint[] };
        filters?: ReportsFilters;
    };
};

type TrackingBus = {
    id: number;
    bus_number: string;
    plate_number: string;
    model: string | null;
    status: Status;
    location: {
        latitude: string;
        longitude: string;
        accuracy: number | null;
        recorded_at: string;
    } | null;
    is_tracking_active: boolean;
    current_trip: {
        id: number;
        status: string;
        started_at: string | null;
    } | null;
};

type Props = {
    stats: DashboardStats;
    latestLocations: LocationRecord[];
    recentActivity: LocationRecord[];
    assignedBuses: AssignedBus[];
    assignedBusesTotal: number;
    alerts: Alert[];
};

const PREVIEW_LIMIT = 5;

// Mirrors config('eta.gps_stale_minutes') — the backend marks ETA positions
// stale when the latest GPS record is older than this many minutes.
const GPS_STALE_MINUTES = 15;

const PERIOD_LABELS: Record<string, string> = {
    weekly: 'Weekly',
    monthly: 'Monthly',
    yearly: 'Yearly',
    custom: 'Custom range',
};

const TRIP_STATUS_HEX: Record<string, string> = {
    completed: '#16A34A',
    in_transit: '#D63635',
    cancelled: '#71717A',
};

const SEVERITY_STYLES: Record<string, string> = {
    critical: 'bg-destructive text-destructive-foreground',
    warning: 'bg-warning text-warning-foreground',
    info: 'bg-primary/10 text-primary-strong',
};

const SEVERITY_LABELS: Record<string, string> = {
    critical: 'Critical',
    warning: 'Warning',
    info: 'Info',
};

const STATUS_LABELS: Record<string, string> = {
    new: 'New',
    acknowledged: 'Acknowledged',
    resolved: 'Resolved',
};

function formatRelativeTime(iso: string): string {
    const date = new Date(iso);

    if (Number.isNaN(date.getTime())) {
        return 'Unknown time';
    }

    const minutes = Math.floor((Date.now() - date.getTime()) / 60_000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;

    return `${Math.floor(hours / 24)}d ago`;
}

function formatAbsoluteTime(iso: string): string {
    const date = new Date(iso);

    if (Number.isNaN(date.getTime())) {
        return iso;
    }

    return date.toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });
}

function formatCoordinates(latitude: string, longitude: string): string {
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);

    if (Number.isNaN(lat) || Number.isNaN(lng)) {
        return 'Location unavailable';
    }

    return `lat ${lat.toFixed(5)}, lng ${lng.toFixed(5)}`;
}

function formatAlertTime(value: string): string {
    if (!value) return '—';

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
                year: 'numeric',
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
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
        });
    }
    return value;
}

function formatRangeLabel(
    from?: string | null,
    to?: string | null,
): string | null {
    if (!from || !to) {
        return null;
    }

    const start = new Date(from);
    const end = new Date(to);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        return null;
    }

    const dayMonth: Intl.DateTimeFormatOptions = {
        month: 'short',
        day: 'numeric',
    };

    return `${start.toLocaleDateString(undefined, dayMonth)} – ${end.toLocaleDateString(undefined, dayMonth)}, ${end.toLocaleDateString(undefined, { year: 'numeric' })}`;
}

function tripStatusColor(status: string): string {
    return TRIP_STATUS_HEX[status] ?? '#A1A1AA';
}

function StatusBadge({ status }: { status?: Status }) {
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

function isGpsStale(recordedAt: string): boolean {
    const date = new Date(recordedAt);

    if (Number.isNaN(date.getTime())) {
        return true;
    }

    return Date.now() - date.getTime() > GPS_STALE_MINUTES * 60_000;
}

function FreshnessBadge({ recordedAt }: { recordedAt: string }) {
    const stale = isGpsStale(recordedAt);

    return (
        <Badge variant={stale ? 'warning' : 'success'}>
            {stale ? 'Stale' : 'Fresh'}
        </Badge>
    );
}

function StatCard({
    label,
    value,
    sublabel,
    icon: Icon,
}: {
    label: string;
    value: ReactNode;
    sublabel: string;
    icon: LucideIcon;
}) {
    return (
        <Card className="py-5">
            <CardContent className="flex items-start justify-between gap-3 px-5">
                <div className="min-w-0">
                    <p className="text-muted-foreground text-sm">{label}</p>
                    <p className="mt-1.5 text-3xl font-semibold tabular-nums">
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

function MiniStat({ label, value }: { label: string; value: number }) {
    return (
        <div className="rounded-lg border p-3">
            <p className="text-muted-foreground text-[10px] font-semibold tracking-wide uppercase">
                {label}
            </p>
            <p className="mt-1 text-xl font-semibold tabular-nums">
                {value.toLocaleString()}
            </p>
        </div>
    );
}

function EmptyState({
    icon: Icon,
    title,
    description,
    action,
}: {
    icon: LucideIcon;
    title: string;
    description?: string;
    action?: ReactNode;
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
            {action && <div className="mt-4">{action}</div>}
        </div>
    );
}

function SectionError({
    message,
    onRetry,
}: {
    message: string;
    onRetry: () => void;
}) {
    return (
        <div className="border-destructive/40 bg-destructive/5 flex flex-col items-start gap-3 rounded-lg border p-4">
            <p className="text-destructive-strong text-sm">{message}</p>
            <Button type="button" variant="outline" size="sm" onClick={onRetry}>
                Retry
            </Button>
        </div>
    );
}

function LocationRow({
    record,
    detail,
}: {
    record: LocationRecord;
    detail: string;
}) {
    const bus = record.bus;
    const label = bus?.bus_number ?? `Bus #${record.bus_id}`;

    return (
        <div className="flex min-h-0 items-center gap-4 overflow-hidden px-6 py-3">
            <div className="bg-primary/10 text-primary-strong flex size-9 shrink-0 items-center justify-center rounded-full">
                <MapPin className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{label}</p>
                <p className="text-muted-foreground truncate text-xs">
                    {detail}
                </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
                <div className="flex items-center gap-1.5">
                    <StatusBadge status={bus?.status} />
                    <FreshnessBadge recordedAt={record.recorded_at} />
                </div>
                <p
                    className="text-muted-foreground text-xs"
                    title={formatAbsoluteTime(record.recorded_at)}
                >
                    {formatRelativeTime(record.recorded_at)}
                </p>
            </div>
        </div>
    );
}

function AlertPreviewRow({ alert }: { alert: FleetAlert }) {
    const bus = alert.alertable?.bus;
    const context = bus?.bus_number
        ? `Bus ${bus.bus_number}${bus.plate_number ? ` · ${bus.plate_number}` : ''}`
        : (alert.alertable?.driver?.user?.name ?? null);

    return (
        <div className="flex min-h-0 items-start gap-3 overflow-hidden px-6 py-3">
            <Badge
                className={cn(
                    'mt-0.5 shrink-0 border-transparent',
                    SEVERITY_STYLES[alert.severity] ??
                        'bg-muted text-muted-foreground',
                )}
            >
                {SEVERITY_LABELS[alert.severity] ?? 'Info'}
            </Badge>
            <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                    <p className="truncate text-sm font-medium">
                        {alert.title}
                    </p>
                    <span className="text-muted-foreground shrink-0 text-xs whitespace-nowrap">
                        {formatAlertTime(alert.created_at)}
                    </span>
                </div>
                <p className="text-muted-foreground mt-0.5 truncate text-xs">
                    {alert.message}
                </p>
                {context && (
                    <p className="text-muted-foreground mt-0.5 truncate text-xs">
                        {context}
                    </p>
                )}
            </div>
            <Badge variant="secondary" className="mt-0.5 shrink-0 text-xs">
                {STATUS_LABELS[alert.status] ?? alert.status}
            </Badge>
        </div>
    );
}

function FleetQuickLinks() {
    const links = [
        { title: 'Buses', href: '/admin/buses', icon: Bus },
        { title: 'Drivers', href: '/admin/drivers', icon: Users },
        { title: 'Operators', href: '/admin/operators', icon: UserCog },
        { title: 'Routes', href: '/admin/routes', icon: Route },
    ];

    return (
        <div className="flex flex-wrap items-center gap-2">
            {links.map((link) => (
                <Button asChild key={link.title} variant="outline" size="sm">
                    <Link href={link.href}>
                        <link.icon className="size-4" />
                        {link.title}
                    </Link>
                </Button>
            ))}
        </div>
    );
}

function TripAnalyticsCard({
    analytics,
    statuses,
    filters,
    loading,
    error,
    onRetry,
}: {
    analytics: TripAnalytics | null;
    statuses: StatusPoint[];
    filters: ReportsFilters | null;
    loading: boolean;
    error: string | null;
    onRetry: () => void;
}) {
    const total = analytics?.total_trips ?? 0;
    const rangeLabel = formatRangeLabel(filters?.from, filters?.to);
    const periodLabel = filters?.period
        ? (PERIOD_LABELS[filters.period] ?? null)
        : null;
    const scope = [periodLabel, rangeLabel].filter(Boolean).join(' · ');
    const hasData = analytics !== null && total > 0;

    return (
        <Card className="flex flex-col">
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                    <Gauge className="text-primary size-4 shrink-0" />
                    Trip Analytics
                </CardTitle>
                <CardDescription>
                    {scope
                        ? `Trip status breakdown for the current reporting period (${scope}).`
                        : 'Trip status breakdown for the current reporting period.'}
                </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col gap-4">
                {error ? (
                    <SectionError message={error} onRetry={onRetry} />
                ) : loading ? (
                    <div className="flex flex-col gap-4">
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                            {Array.from({ length: 4 }).map((_, index) => (
                                <Skeleton key={index} className="h-16" />
                            ))}
                        </div>
                        <Skeleton className="h-28 w-full" />
                    </div>
                ) : !hasData ? (
                    <EmptyState
                        icon={Gauge}
                        title="No trips in this period"
                        description="Trip analytics will appear once drivers start trips."
                    />
                ) : (
                    <>
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                            <MiniStat
                                label="Completed"
                                value={analytics.completed_trips}
                            />
                            <MiniStat
                                label="In Transit"
                                value={analytics.in_transit_trips}
                            />
                            <MiniStat
                                label="Delayed"
                                value={analytics.delayed_trips}
                            />
                            <MiniStat
                                label="Cancelled"
                                value={analytics.cancelled_trips}
                            />
                        </div>
                        <div className="flex flex-col gap-2.5">
                            {statuses.length === 0 ? (
                                <p className="text-muted-foreground text-sm">
                                    Status breakdown unavailable.
                                </p>
                            ) : (
                                statuses.map((point) => {
                                    const pct =
                                        total > 0
                                            ? Math.round(
                                                  (point.value / total) * 100,
                                              )
                                            : 0;
                                    const width =
                                        point.value > 0
                                            ? Math.max(pct, 2)
                                            : 0;

                                    return (
                                        <div
                                            key={point.status}
                                            className="flex items-center gap-3"
                                            title={`${point.label}: ${point.value.toLocaleString()} (${pct}%)`}
                                        >
                                            <span className="text-muted-foreground w-24 shrink-0 truncate text-xs">
                                                {point.label}
                                            </span>
                                            <div className="bg-muted h-2.5 flex-1 overflow-hidden rounded-full">
                                                <div
                                                    className="h-full rounded-full"
                                                    style={{
                                                        width: `${width}%`,
                                                        backgroundColor:
                                                            tripStatusColor(
                                                                point.status,
                                                            ),
                                                    }}
                                                />
                                            </div>
                                            <span className="w-16 shrink-0 text-right text-xs tabular-nums">
                                                {point.value} · {pct}%
                                            </span>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                        <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t pt-3">
                            <p className="text-muted-foreground text-xs">
                                {analytics.delay_reports} delay reports ·{' '}
                                {analytics.incidents} incidents
                            </p>
                            <Button asChild variant="outline" size="sm">
                                <Link href="/admin/reports">
                                    Open Reports
                                    <ArrowRight className="size-4" />
                                </Link>
                            </Button>
                        </div>
                    </>
                )}
            </CardContent>
        </Card>
    );
}

function FleetTrackingCard({
    buses,
    fleetTotal,
    loading,
    error,
    onRetry,
}: {
    buses: TrackingBus[] | null;
    fleetTotal: number;
    loading: boolean;
    error: string | null;
    onRetry: () => void;
}) {
    const list = buses ?? [];
    const withGps = list.filter((bus) => bus.location !== null);
    const fresh = withGps.filter(
        (bus) => bus.location !== null && !isGpsStale(bus.location.recorded_at),
    ).length;
    const stale = withGps.length - fresh;
    const awaiting = list.filter(
        (bus) => bus.location === null && bus.is_tracking_active,
    ).length;
    const inTransit = list.filter((bus) => bus.is_tracking_active).length;
    const total = Math.max(list.length, 1);
    const notReporting = Math.max(fleetTotal - list.length, 0);
    const hasData = buses !== null && list.length > 0;

    const segments = [
        {
            key: 'fresh',
            label: 'Fresh GPS',
            hint: 'Location fix within the last 15 minutes',
            count: fresh,
            className: 'bg-success',
        },
        {
            key: 'stale',
            label: 'Stale GPS',
            hint: 'Last location fix is older than 15 minutes',
            count: stale,
            className: 'bg-warning',
        },
        {
            key: 'awaiting',
            label: 'Awaiting GPS',
            hint: 'Tracking active but no GPS fix recorded yet',
            count: awaiting,
            className: 'bg-muted-foreground/40',
        },
    ];

    return (
        <Card className="flex flex-col">
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                    <MapPin className="text-primary size-4 shrink-0" />
                    Fleet Tracking Summary
                </CardTitle>
                <CardDescription>
                    Live GPS fixes and in-transit status across the fleet.
                </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col gap-4">
                {error ? (
                    <SectionError message={error} onRetry={onRetry} />
                ) : loading ? (
                    <div className="flex flex-col gap-4">
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                            {Array.from({ length: 4 }).map((_, index) => (
                                <Skeleton key={index} className="h-16" />
                            ))}
                        </div>
                        <Skeleton className="h-24 w-full" />
                    </div>
                ) : !hasData ? (
                    <EmptyState
                        icon={MapPin}
                        title="No buses are being tracked"
                        description="Buses appear here once they record a GPS fix or start a trip."
                        action={
                            <Button asChild variant="outline" size="sm">
                                <Link href="/admin/tracking">
                                    Open Live Tracking
                                </Link>
                            </Button>
                        }
                    />
                ) : (
                    <>
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                            <MiniStat
                                label="Tracked"
                                value={list.length}
                            />
                            <MiniStat label="In Transit" value={inTransit} />
                            <MiniStat
                                label="Sending GPS"
                                value={withGps.length}
                            />
                            <MiniStat label="Awaiting GPS" value={awaiting} />
                        </div>
                        <div className="flex flex-col gap-3">
                            <div className="bg-muted flex h-2.5 overflow-hidden rounded-full">
                                {segments.map((segment) =>
                                    segment.count > 0 ? (
                                        <div
                                            key={segment.key}
                                            className={segment.className}
                                            style={{
                                                width: `${(segment.count / total) * 100}%`,
                                            }}
                                            title={`${segment.label}: ${segment.count}`}
                                        />
                                    ) : null,
                                )}
                            </div>
                            <ul className="flex flex-col gap-1.5">
                                {segments.map((segment) => (
                                    <li
                                        key={segment.key}
                                        className="flex items-center gap-2 text-xs"
                                        title={segment.hint}
                                    >
                                        <span
                                            className={cn(
                                                'size-2 shrink-0 rounded-full',
                                                segment.className,
                                            )}
                                        />
                                        <span className="text-muted-foreground flex-1 truncate">
                                            {segment.label}
                                        </span>
                                        <span className="font-medium tabular-nums">
                                            {segment.count}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                        <div className="mt-auto flex flex-col gap-3 border-t pt-3">
                            {notReporting > 0 && (
                                <p className="text-muted-foreground text-xs">
                                    {notReporting} of {fleetTotal} fleet buses
                                    are not currently reporting.
                                </p>
                            )}
                            <div className="flex justify-end">
                                <Button asChild variant="outline" size="sm">
                                    <Link href="/admin/tracking">
                                        Open Live Tracking
                                        <ArrowRight className="size-4" />
                                    </Link>
                                </Button>
                            </div>
                        </div>
                    </>
                )}
            </CardContent>
        </Card>
    );
}

function ActivityPreviewCard({
    records,
    onViewAll,
}: {
    records: LocationRecord[];
    onViewAll: () => void;
}) {
    const preview = records.slice(0, PREVIEW_LIMIT);

    return (
        <Card className="flex flex-col">
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                    <Activity className="text-primary size-4 shrink-0" />
                    Recent Bus Activity
                    <Badge className="bg-primary/10 text-primary-strong ml-auto">
                        {records.length}
                    </Badge>
                </CardTitle>
                <CardDescription>
                    Latest location reports from buses in the fleet.
                </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col">
                {records.length === 0 ? (
                    <EmptyState
                        icon={Activity}
                        title="No recent activity"
                        description="Location reports from buses will appear here once tracking data is available."
                    />
                ) : (
                    <>
                        <div className="-mx-6 grid h-[26rem] grid-rows-5 divide-y">
                            {Array.from({ length: PREVIEW_LIMIT }).map(
                                (_, index) => {
                                    const record = preview[index];

                                    return record ? (
                                        <LocationRow
                                            key={record.id}
                                            record={record}
                                            detail={formatCoordinates(
                                                record.latitude,
                                                record.longitude,
                                            )}
                                        />
                                    ) : (
                                        <div
                                            key={`slot-${index}`}
                                            aria-hidden="true"
                                        />
                                    );
                                },
                            )}
                        </div>
                        <div className="mt-4">
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="w-full"
                                onClick={onViewAll}
                            >
                                View All ({records.length})
                                <ArrowRight className="size-4" />
                            </Button>
                        </div>
                    </>
                )}
            </CardContent>
        </Card>
    );
}

function AlertsPreviewCard({
    alerts,
    loading,
    error,
    onViewAll,
}: {
    alerts: FleetAlert[];
    loading: boolean;
    error: string | null;
    onViewAll: () => void;
}) {
    const preview = alerts.slice(0, PREVIEW_LIMIT);

    return (
        <Card className="flex flex-col">
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                    <BellRing className="text-primary size-4 shrink-0" />
                    Active Alerts
                    <Badge
                        className={cn(
                            'ml-auto border-transparent',
                            alerts.length > 0
                                ? 'bg-warning text-warning-foreground'
                                : 'bg-muted text-muted-foreground',
                        )}
                    >
                        {alerts.length}
                    </Badge>
                </CardTitle>
                <CardDescription>
                    New and acknowledged alerts that require attention.
                </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col">
                {error && (
                    <div className="border-destructive/50 bg-destructive/10 text-destructive-strong mb-3 rounded-lg border p-3 text-sm">
                        {error}
                    </div>
                )}
                {alerts.length === 0 && loading ? (
                    <div className="flex flex-col gap-2">
                        {Array.from({ length: 3 }).map((_, index) => (
                            <Skeleton key={index} className="h-16 w-full" />
                        ))}
                    </div>
                ) : alerts.length === 0 ? (
                    <EmptyState
                        icon={BellRing}
                        title="No active alerts"
                        description="You're all caught up. New alerts will appear here when they are issued."
                    />
                ) : (
                    <>
                        <div className="-mx-6 grid h-[26rem] grid-rows-5 divide-y">
                            {Array.from({ length: PREVIEW_LIMIT }).map(
                                (_, index) => {
                                    const alert = preview[index];

                                    return alert ? (
                                        <AlertPreviewRow
                                            key={alert.id}
                                            alert={alert}
                                        />
                                    ) : (
                                        <div
                                            key={`slot-${index}`}
                                            aria-hidden="true"
                                        />
                                    );
                                },
                            )}
                        </div>
                        <div className="mt-4">
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="w-full"
                                onClick={onViewAll}
                            >
                                View All ({alerts.length})
                                <ArrowRight className="size-4" />
                            </Button>
                        </div>
                    </>
                )}
            </CardContent>
        </Card>
    );
}

function ActivityModal({
    open,
    onOpenChange,
    records,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    records: LocationRecord[];
}) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="flex max-h-[85vh] w-full flex-col gap-0 p-0 sm:max-w-2xl">
                <DialogHeader className="border-b px-6 py-4 text-left">
                    <DialogTitle className="flex items-center gap-2">
                        <Activity className="text-primary size-4 shrink-0" />
                        Recent Bus Activity
                    </DialogTitle>
                    <DialogDescription>
                        {records.length === 0
                            ? 'No location reports available yet.'
                            : `Showing the ${records.length} most recent location reports.`}
                    </DialogDescription>
                </DialogHeader>
                <div className="min-h-0 flex-1 divide-y overflow-y-auto">
                    {records.length === 0 ? (
                        <div className="p-6">
                            <EmptyState
                                icon={Activity}
                                title="No recent activity"
                                description="Location reports from buses will appear here once tracking data is available."
                            />
                        </div>
                    ) : (
                        records.map((record) => (
                            <LocationRow
                                key={record.id}
                                record={record}
                                detail={formatCoordinates(
                                    record.latitude,
                                    record.longitude,
                                )}
                            />
                        ))
                    )}
                </div>
                <div className="flex justify-end border-t px-6 py-4">
                    <DialogClose asChild>
                        <Button type="button" variant="outline">
                            Close
                        </Button>
                    </DialogClose>
                </div>
            </DialogContent>
        </Dialog>
    );
}

function AlertsModal({
    open,
    onOpenChange,
    alerts,
    loading,
    error,
    busyId,
    onAcknowledge,
    onResolve,
    onRetry,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    alerts: FleetAlert[];
    loading: boolean;
    error: string | null;
    busyId: number | null;
    onAcknowledge: (alertId: number) => void;
    onResolve: (alertId: number) => void;
    onRetry: () => void;
}) {
    const [search, setSearch] = useState('');
    const [severity, setSeverity] = useState('all');
    const [status, setStatus] = useState('all');

    const filtered = useMemo(() => {
        const query = search.trim().toLowerCase();

        return alerts.filter((alert) => {
            if (severity !== 'all' && alert.severity !== severity) {
                return false;
            }

            if (status !== 'all' && alert.status !== status) {
                return false;
            }

            if (query === '') {
                return true;
            }

            const haystack = [
                alert.title,
                alert.message,
                alert.alertable?.bus?.bus_number,
                alert.alertable?.bus?.plate_number,
                alert.alertable?.driver?.user?.name,
                alert.alertable?.reason,
                alert.alertable?.details,
            ]
                .filter(
                    (part): part is string =>
                        typeof part === 'string' && part !== '',
                )
                .join(' ')
                .toLowerCase();

            return haystack.includes(query);
        });
    }, [alerts, search, severity, status]);

    const filtersActive =
        search.trim() !== '' || severity !== 'all' || status !== 'all';

    const clearFilters = () => {
        setSearch('');
        setSeverity('all');
        setStatus('all');
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="flex max-h-[88vh] w-full flex-col gap-0 p-0 sm:max-w-4xl">
                <DialogHeader className="border-b px-6 py-4 text-left">
                    <DialogTitle className="flex items-center gap-2">
                        <BellRing className="text-primary size-4 shrink-0" />
                        All Active Alerts
                    </DialogTitle>
                    <DialogDescription>
                        New and acknowledged alerts across the fleet. Resolved
                        alerts are not shown.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex flex-col gap-2 border-b px-6 py-3 sm:flex-row sm:items-center">
                    <div className="relative flex-1">
                        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
                        <Input
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder="Search by title, message, bus, or driver…"
                            className="pl-8"
                            aria-label="Search alerts"
                        />
                    </div>
                    <Select value={severity} onValueChange={setSeverity}>
                        <SelectTrigger
                            className="w-full sm:w-[150px]"
                            aria-label="Filter by severity"
                        >
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All severities</SelectItem>
                            <SelectItem value="critical">Critical</SelectItem>
                            <SelectItem value="warning">Warning</SelectItem>
                            <SelectItem value="info">Info</SelectItem>
                        </SelectContent>
                    </Select>
                    <Select value={status} onValueChange={setStatus}>
                        <SelectTrigger
                            className="w-full sm:w-[160px]"
                            aria-label="Filter by status"
                        >
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All statuses</SelectItem>
                            <SelectItem value="new">New</SelectItem>
                            <SelectItem value="acknowledged">
                                Acknowledged
                            </SelectItem>
                        </SelectContent>
                    </Select>
                    {filtersActive && (
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={clearFilters}
                        >
                            Clear
                        </Button>
                    )}
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
                    {error && (
                        <div className="border-destructive/50 bg-destructive/10 text-destructive-strong mb-3 rounded-lg border p-3 text-sm">
                            {error}
                        </div>
                    )}
                    {loading && alerts.length === 0 ? (
                        <div className="flex flex-col gap-2">
                            {Array.from({ length: 4 }).map((_, index) => (
                                <Skeleton key={index} className="h-20 w-full" />
                            ))}
                        </div>
                    ) : alerts.length === 0 ? (
                        <EmptyState
                            icon={BellRing}
                            title="No active alerts"
                            description="You're all caught up. New alerts will appear here when they are issued."
                            action={
                                error ? (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={onRetry}
                                    >
                                        Retry
                                    </Button>
                                ) : undefined
                            }
                        />
                    ) : filtered.length === 0 ? (
                        <EmptyState
                            icon={Search}
                            title="No alerts match your filters"
                            description="Try a different search term or clear the active filters."
                            action={
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={clearFilters}
                                >
                                    Clear filters
                                </Button>
                            }
                        />
                    ) : (
                        <ActiveAlertsList
                            alerts={filtered}
                            onAcknowledge={onAcknowledge}
                            onResolve={onResolve}
                            busyId={busyId}
                        />
                    )}
                </div>

                <div className="flex items-center justify-between gap-3 border-t px-6 py-4">
                    <p className="text-muted-foreground text-xs">
                        {loading && alerts.length === 0
                            ? 'Loading alerts…'
                            : `Showing ${filtered.length} of ${alerts.length} alerts`}
                    </p>
                    <DialogClose asChild>
                        <Button type="button" variant="outline">
                            Close
                        </Button>
                    </DialogClose>
                </div>
            </DialogContent>
        </Dialog>
    );
}

export default function AdminDashboardPage({
    stats,
    recentActivity,
    assignedBusesTotal,
    alerts,
}: Props) {
    const { version } = usePage();

    const {
        alerts: alertList,
        alertsLoading,
        alertsError,
        busyAlertId,
        handleAcknowledge,
        handleResolve,
        refresh: refreshAlerts,
    } = useActiveAlerts(alerts);

    const [tripAnalytics, setTripAnalytics] = useState<TripAnalytics | null>(
        null,
    );
    const [tripStatuses, setTripStatuses] = useState<StatusPoint[]>([]);
    const [tripFilters, setTripFilters] = useState<ReportsFilters | null>(null);
    const [tripLoading, setTripLoading] = useState(true);
    const [tripError, setTripError] = useState<string | null>(null);

    const [trackingBuses, setTrackingBuses] = useState<TrackingBus[] | null>(
        null,
    );
    const [trackingLoading, setTrackingLoading] = useState(true);
    const [trackingError, setTrackingError] = useState<string | null>(null);

    const [analyticsReloadKey, setAnalyticsReloadKey] = useState(0);

    const [activityOpen, setActivityOpen] = useState(false);
    const [alertsOpen, setAlertsOpen] = useState(false);

    useEffect(() => {
        const controller = new AbortController();

        const loadTripAnalytics = async () => {
            setTripLoading(true);
            setTripError(null);

            try {
                if (!version) {
                    throw new Error(
                        'Unable to load trip analytics: asset version unavailable. Please reload the page.',
                    );
                }

                const response = await fetch('/admin/reports', {
                    headers: {
                        'X-Inertia': 'true',
                        'X-Inertia-Version': String(version),
                    },
                    signal: controller.signal,
                });

                if (response.status === 409) {
                    throw new Error(
                        'Asset version mismatch. Reload the page and try again.',
                    );
                }

                if (!response.ok) {
                    throw new Error(
                        `Unable to load trip analytics (HTTP ${response.status}).`,
                    );
                }

                const envelope = (await response.json()) as ReportsEnvelope;

                if (controller.signal.aborted) {
                    return;
                }

                setTripAnalytics(envelope.props?.analytics ?? null);
                setTripStatuses(
                    Array.isArray(envelope.props?.charts?.statuses)
                        ? envelope.props.charts.statuses
                        : [],
                );
                setTripFilters(envelope.props?.filters ?? null);
            } catch (err) {
                if (err instanceof Error && err.name === 'AbortError') {
                    return;
                }

                if (controller.signal.aborted) {
                    return;
                }

                setTripError(
                    err instanceof Error
                        ? err.message
                        : 'Unable to load trip analytics.',
                );
            } finally {
                if (!controller.signal.aborted) {
                    setTripLoading(false);
                }
            }
        };

        const loadTracking = async () => {
            setTrackingLoading(true);
            setTrackingError(null);

            try {
                const response = await fetch('/api/buses/locations/latest', {
                    signal: controller.signal,
                });

                if (!response.ok) {
                    throw new Error(
                        `Unable to load tracking data (HTTP ${response.status}).`,
                    );
                }

                const body = (await response.json()) as {
                    success?: boolean;
                    buses?: TrackingBus[];
                };

                if (controller.signal.aborted) {
                    return;
                }

                setTrackingBuses(
                    Array.isArray(body.buses) ? body.buses : [],
                );
            } catch (err) {
                if (err instanceof Error && err.name === 'AbortError') {
                    return;
                }

                if (controller.signal.aborted) {
                    return;
                }

                setTrackingError(
                    err instanceof Error
                        ? err.message
                        : 'Unable to load tracking data.',
                );
            } finally {
                if (!controller.signal.aborted) {
                    setTrackingLoading(false);
                }
            }
        };

        void loadTripAnalytics();
        void loadTracking();

        return () => controller.abort();
    }, [version, analyticsReloadKey]);

    const retryAnalytics = () => setAnalyticsReloadKey((key) => key + 1);

    const sortedActivity = useMemo(
        () =>
            [...recentActivity].sort(
                (a, b) =>
                    new Date(b.recorded_at).getTime() -
                    new Date(a.recorded_at).getTime(),
            ),
        [recentActivity],
    );

    const newAlertCount = alertList.filter(
        (alert) => alert.status === 'new',
    ).length;
    const acknowledgedAlertCount = alertList.length - newAlertCount;
    const gpsFixCount = (trackingBuses ?? []).filter(
        (bus) => bus.location !== null,
    ).length;

    const activeTripsValue = tripLoading
        ? '—'
        : (tripAnalytics?.in_transit_trips ?? '—');
    const activeTripsSublabel = tripLoading
        ? 'Loading trip data…'
        : tripError
          ? 'Trip data unavailable'
          : `${tripAnalytics?.delayed_trips ?? 0} delayed this period`;

    const trackingValue = trackingLoading
        ? '—'
        : (trackingBuses?.length ?? 0);
    const trackingSublabel = trackingLoading
        ? 'Loading tracking data…'
        : trackingError
          ? 'Tracking data unavailable'
          : `${gpsFixCount} sending GPS`;

    return (
        <AppSidebarLayout
            breadcrumbs={[
                {
                    title: 'Dashboard',
                    href: '/admin/dashboard',
                },
            ]}
        >
            <Head title="Dashboard" />

            <div className="flex flex-1 flex-col gap-6 px-6 md:px-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-semibold tracking-tight">
                            Admin Dashboard
                        </h1>
                        <p className="text-muted-foreground mt-1 text-sm">
                            Fleet operations, live tracking, and system
                            monitoring at a glance.
                        </p>
                    </div>
                    <FleetQuickLinks />
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                    <StatCard
                        label="Total Buses"
                        value={stats.buses.total}
                        sublabel={`${stats.buses.active} active`}
                        icon={Bus}
                    />
                    <StatCard
                        label="Active Trips"
                        value={activeTripsValue}
                        sublabel={activeTripsSublabel}
                        icon={Navigation}
                    />
                    <StatCard
                        label="Tracking Buses"
                        value={trackingValue}
                        sublabel={trackingSublabel}
                        icon={MapPin}
                    />
                    <StatCard
                        label="Assigned Buses"
                        value={assignedBusesTotal}
                        sublabel={`of ${stats.buses.total} fleet buses`}
                        icon={UserCheck}
                    />
                    <StatCard
                        label="Active Alerts"
                        value={alertList.length}
                        sublabel={`${newAlertCount} new · ${acknowledgedAlertCount} acknowledged`}
                        icon={BellRing}
                    />
                </div>

                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    <TripAnalyticsCard
                        analytics={tripAnalytics}
                        statuses={tripStatuses}
                        filters={tripFilters}
                        loading={tripLoading}
                        error={tripError}
                        onRetry={retryAnalytics}
                    />
                    <FleetTrackingCard
                        buses={trackingBuses}
                        fleetTotal={stats.buses.total}
                        loading={trackingLoading}
                        error={trackingError}
                        onRetry={retryAnalytics}
                    />
                </div>

                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                    <ActivityPreviewCard
                        records={sortedActivity}
                        onViewAll={() => setActivityOpen(true)}
                    />
                    <AlertsPreviewCard
                        alerts={alertList}
                        loading={alertsLoading}
                        error={alertsError}
                        onViewAll={() => setAlertsOpen(true)}
                    />
                </div>
            </div>

            <ActivityModal
                open={activityOpen}
                onOpenChange={setActivityOpen}
                records={sortedActivity}
            />
            <AlertsModal
                open={alertsOpen}
                onOpenChange={setAlertsOpen}
                alerts={alertList}
                loading={alertsLoading}
                error={alertsError}
                busyId={busyAlertId}
                onAcknowledge={(alertId) => {
                    void handleAcknowledge(alertId);
                }}
                onResolve={(alertId) => {
                    void handleResolve(alertId);
                }}
                onRetry={() => {
                    void refreshAlerts();
                }}
            />
        </AppSidebarLayout>
    );
}
