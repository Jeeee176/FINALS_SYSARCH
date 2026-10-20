import { Head, Link, usePage } from '@inertiajs/react';
import {
    ArrowRight,
    BellRing,
    BusFront,
    ClipboardList,
    MapPin,
    Navigation,
    TriangleAlert,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import OperatorSidebarLayout from '@/layouts/app/operator-sidebar-layout';
import { useActiveAlerts, type FleetAlert } from '@/components/active-alerts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

type CountPair = {
    total: number;
    active: number;
};

type QueueEntryStatus =
    | 'queued'
    | 'next'
    | 'notified'
    | 'acknowledged'
    | 'loading';

type QueuePreviewEntry = {
    id: number;
    queue_position: number;
    status: QueueEntryStatus;
    bus_number: string | null;
    bus: {
        id: number | null;
        bus_number: string | null;
        plate_number: string | null;
    };
    driver: {
        id: number | null;
        name: string | null;
    };
    route: {
        id: number | null;
        name: string | null;
        destination: string | null;
    };
};

type DashboardStats = {
    buses: CountPair;
    drivers: CountPair;
    routes: CountPair;
    trips: {
        in_transit: number;
    };
    queue: {
        waiting: number;
    };
    alerts: {
        active: number;
    };
};

type Props = {
    stats: DashboardStats;
    queuePreview: QueuePreviewEntry[];
    alerts: FleetAlert[];
};

const ALERT_PREVIEW_LIMIT = 4;

const QUEUE_STATUS_LABELS: Record<QueueEntryStatus, string> = {
    queued: 'Queued',
    next: 'Next',
    notified: 'Notified',
    acknowledged: 'Acknowledged',
    loading: 'Loading',
};

const ALERT_SEVERITY_STYLES: Record<string, string> = {
    critical: 'bg-destructive text-destructive-foreground',
    warning: 'bg-warning text-warning-foreground',
    info: 'bg-primary/10 text-primary-strong',
};

const ALERT_SEVERITY_LABELS: Record<string, string> = {
    critical: 'Critical',
    warning: 'Warning',
    info: 'Info',
};

function formatAlertTime(value: string): string {
    if (!value) {
        return '—';
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

function alertContext(alert: FleetAlert): string {
    const parts: string[] = [];

    const bus = alert.alertable?.bus;
    if (bus?.bus_number) {
        parts.push(
            `Bus ${bus.bus_number}${bus.plate_number ? ` · ${bus.plate_number}` : ''}`,
        );
    }

    const driverName = alert.alertable?.driver?.user?.name;
    if (driverName) {
        parts.push(driverName);
    }

    const reason = alert.alertable?.reason;
    if (reason) {
        parts.push(`Reason: ${reason}`);
    }

    return parts.join(' · ');
}

function StatCard({
    label,
    value,
    sublabel,
    icon: Icon,
    dataTest,
}: {
    label: string;
    value: number | string;
    sublabel: string;
    icon: LucideIcon;
    dataTest: string;
}) {
    return (
        <Card className="py-5" data-test={dataTest}>
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

function EmptyState({
    icon: Icon,
    title,
    description,
    action,
    dataTest,
}: {
    icon: LucideIcon;
    title: string;
    description?: string;
    action?: React.ReactNode;
    dataTest?: string;
}) {
    return (
        <div
            className="flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-10 text-center"
            data-test={dataTest}
        >
            <div className="bg-muted text-muted-foreground flex size-10 items-center justify-center rounded-full">
                <Icon className="size-5" />
            </div>
            <p className="mt-3 text-sm font-medium">{title}</p>
            {description && (
                <p className="text-muted-foreground mt-1 max-w-sm text-sm">
                    {description}
                </p>
            )}
            {action}
        </div>
    );
}

function PositionBadge({ position }: { position: number }) {
    if (position < 1) {
        return <span className="text-muted-foreground">—</span>;
    }

    return (
        <span className="bg-muted text-muted-foreground inline-flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-medium tabular-nums">
            {position}
        </span>
    );
}

function QueueStatusBadge({ status }: { status: QueueEntryStatus }) {
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
            {QUEUE_STATUS_LABELS[status]}
        </Badge>
    );
}

function QueuePreviewRow({
    entry,
    isNext,
}: {
    entry: QueuePreviewEntry;
    isNext: boolean;
}) {
    return (
        <div
            className={cn(
                'flex items-center gap-4 px-6 py-3',
                isNext && 'bg-primary/5',
            )}
            data-test="queue-preview-row"
            data-entry-id={entry.id}
        >
            <PositionBadge position={entry.queue_position} />
            <div className="bg-primary/10 text-primary-strong flex size-9 shrink-0 items-center justify-center rounded-lg">
                <BusFront className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                    {entry.bus_number ?? '—'}
                </p>
                <p className="text-muted-foreground truncate text-xs">
                    {entry.bus.plate_number ?? ''}
                </p>
            </div>
            <div className="hidden min-w-0 flex-1 sm:block">
                <p className="text-muted-foreground text-xs">Driver</p>
                <p
                    className="truncate text-sm"
                    title={entry.driver.name ?? undefined}
                >
                    {entry.driver.name ?? 'No driver assigned'}
                </p>
            </div>
            <div className="hidden min-w-0 flex-1 md:block">
                <p className="text-muted-foreground text-xs">Route</p>
                <p
                    className="truncate text-sm"
                    title={entry.route.name ?? undefined}
                >
                    {entry.route.name ?? 'No route assigned'}
                    {entry.route.destination
                        ? ` \u2192 ${entry.route.destination}`
                        : ''}
                </p>
            </div>
            <QueueStatusBadge status={entry.status} />
        </div>
    );
}

function AlertPreviewRow({ alert }: { alert: FleetAlert }) {
    const context = alertContext(alert);

    return (
        <div
            className="hover:bg-muted/30 flex flex-wrap items-start gap-3 rounded-lg border px-4 py-3 transition-colors"
            data-test="active-alert-row"
            data-alert-id={alert.id}
        >
            <Badge
                className={cn(
                    'mt-0.5 shrink-0 border-transparent',
                    ALERT_SEVERITY_STYLES[alert.severity] ??
                        'bg-muted text-muted-foreground',
                )}
            >
                {ALERT_SEVERITY_LABELS[alert.severity] ?? 'Info'}
            </Badge>
            <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                    <h3 className="shrink truncate text-sm font-medium">
                        {alert.title}
                    </h3>
                    <span className="text-muted-foreground shrink-0 text-xs whitespace-nowrap">
                        {formatAlertTime(alert.created_at)}
                    </span>
                </div>
                <p className="text-muted-foreground mt-0.5 line-clamp-1 text-xs">
                    {alert.message}
                </p>
                {context !== '' && (
                    <p className="text-muted-foreground mt-0.5 line-clamp-1 text-xs">
                        {context}
                    </p>
                )}
            </div>
            <Badge variant="secondary" className="mt-0.5 shrink-0 text-xs">
                {alert.status === 'new' ? 'New' : 'Acknowledged'}
            </Badge>
        </div>
    );
}

export default function OperatorDashboardPage({
    stats,
    queuePreview,
    alerts,
}: Props) {
    const { auth } = usePage().props;
    const displayName = auth?.user?.name ?? 'Operator';

    const {
        alerts: alertList,
        alertsTotal,
        alertsLoading,
        alertsError,
    } = useActiveAlerts(alerts);

    const activeAlertTotal =
        alertsTotal ?? stats.alerts?.active ?? alertList.length;
    const newAlertCount = alertList.filter(
        (alert) => alert.status === 'new',
    ).length;
    const acknowledgedAlertCount = alertList.length - newAlertCount;

    const alertSublabel =
        activeAlertTotal === 0
            ? 'No unresolved alerts'
            : activeAlertTotal > alertList.length
              ? `Latest ${Math.min(alertList.length, ALERT_PREVIEW_LIMIT)} listed below`
              : `${newAlertCount} new · ${acknowledgedAlertCount} acknowledged`;

    const waitingInQueue = stats.queue?.waiting ?? 0;
    const inTransitTrips = stats.trips?.in_transit ?? 0;

    return (
        <OperatorSidebarLayout
            breadcrumbs={[
                {
                    title: 'Dashboard',
                    href: '/operator/dashboard',
                },
            ]}
        >
            <Head title="Dashboard" />

            <div className="flex flex-1 flex-col gap-6 px-6 md:px-4">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight">
                        Terminal Operations
                    </h1>
                    <p className="text-muted-foreground mt-1 text-sm">
                        Good day, {displayName}! Monitor terminal activity,
                        coordinate bus departures, and respond to operational
                        alerts.
                    </p>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <StatCard
                        label="Total Buses"
                        value={stats.buses.total}
                        sublabel={`${stats.buses.active} active`}
                        icon={BusFront}
                        dataTest="summary-total-buses"
                    />
                    <StatCard
                        label="In Transit"
                        value={inTransitTrips}
                        sublabel="Trips currently underway"
                        icon={Navigation}
                        dataTest="summary-in-transit"
                    />
                    <StatCard
                        label="Waiting in Queue"
                        value={waitingInQueue}
                        sublabel={
                            waitingInQueue === 0
                                ? 'Queue is clear'
                                : 'Buses in the dispatch queue'
                        }
                        icon={ClipboardList}
                        dataTest="summary-waiting-queue"
                    />
                    <StatCard
                        label="Active Alerts"
                        value={activeAlertTotal}
                        sublabel={alertSublabel}
                        icon={BellRing}
                        dataTest="summary-active-alerts"
                    />
                </div>

                <section className="flex flex-col gap-3">
                    <h2 className="text-base font-semibold">Quick Actions</h2>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <QuickAction
                            href="/operator/departure-queue"
                            title="Departure Queue"
                            description="Manage queue order and dispatch the next departures."
                            icon={ClipboardList}
                            dataTest="quick-action-departure-queue"
                        />
                        <QuickAction
                            href="/operator/tracking"
                            title="Live Tracking"
                            description="Follow buses on active trips on the live map."
                            icon={MapPin}
                            dataTest="quick-action-live-tracking"
                        />
                        <QuickAction
                            href="/operator/buses"
                            title="Trip Monitoring"
                            description="Review fleet status, drivers, and trip readiness."
                            icon={BusFront}
                            dataTest="quick-action-trip-monitoring"
                        />
                        <QuickAction
                            href="/operator/alerts"
                            title="Incident Reports"
                            description="Review delay reports and active fleet alerts."
                            icon={TriangleAlert}
                            dataTest="quick-action-incident-reports"
                        />
                    </div>
                </section>

                <Card data-test="queue-preview">
                    <CardHeader>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                                <CardTitle className="flex items-center gap-2 text-base">
                                    <ClipboardList className="text-primary size-4 shrink-0" />
                                    Departure Queue Preview
                                </CardTitle>
                                <CardDescription>
                                    Next buses in line for dispatch.
                                </CardDescription>
                            </div>
                            <Button asChild variant="outline" size="sm">
                                <Link
                                    href="/operator/departure-queue"
                                    data-test="view-queue"
                                >
                                    View Queue
                                    <ArrowRight className="size-4" />
                                </Link>
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent>
                        {queuePreview.length === 0 ? (
                            <EmptyState
                                icon={ClipboardList}
                                title="No buses currently waiting in the queue"
                                description="Queue a bus from Dispatch Queue and it will appear here."
                                dataTest="queue-preview-empty"
                                action={
                                    <Button
                                        asChild
                                        variant="outline"
                                        size="sm"
                                        className="mt-3"
                                    >
                                        <Link
                                            href="/operator/departure-queue"
                                            data-test="queue-preview-empty-link"
                                        >
                                            View Queue
                                            <ArrowRight className="size-4" />
                                        </Link>
                                    </Button>
                                }
                            />
                        ) : (
                            <div className="-mx-6 divide-y">
                                {queuePreview.map((entry, index) => (
                                    <QueuePreviewRow
                                        key={entry.id}
                                        entry={entry}
                                        isNext={index === 0}
                                    />
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card data-test="active-alerts-card">
                    <CardHeader>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                                <CardTitle className="flex items-center gap-2 text-base">
                                    <BellRing className="text-primary size-4 shrink-0" />
                                    Active Alerts
                                    <Badge
                                        className={cn(
                                            'border-transparent',
                                            activeAlertTotal > 0
                                                ? 'bg-warning text-warning-foreground'
                                                : 'bg-muted text-muted-foreground',
                                        )}
                                        data-test="active-alerts-count"
                                    >
                                        {activeAlertTotal}
                                    </Badge>
                                </CardTitle>
                                <CardDescription>
                                    Latest unresolved alerts from active trips
                                    and reported delays.
                                </CardDescription>
                            </div>
                            <Button asChild variant="outline" size="sm">
                                <Link
                                    href="/operator/alerts"
                                    data-test="view-all-alerts"
                                >
                                    View All Alerts
                                    <ArrowRight className="size-4" />
                                </Link>
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {alertsError && (
                            <div className="border-destructive/50 bg-destructive/10 text-destructive-strong rounded-lg border p-3 text-sm">
                                {alertsError}
                            </div>
                        )}
                        {alertList.length === 0 ? (
                            alertsLoading ? (
                                <p className="text-muted-foreground flex items-center gap-1.5 text-sm">
                                    <Spinner className="text-primary size-4 shrink-0" />
                                    Loading alerts...
                                </p>
                            ) : (
                                <EmptyState
                                    icon={BellRing}
                                    title="No active alerts"
                                    description="New alerts will appear here when they are issued."
                                    dataTest="active-alerts-empty"
                                />
                            )
                        ) : (
                            <>
                                <div className="space-y-2">
                                    {alertList
                                        .slice(0, ALERT_PREVIEW_LIMIT)
                                        .map((alert) => (
                                            <AlertPreviewRow
                                                key={alert.id}
                                                alert={alert}
                                            />
                                        ))}
                                </div>
                                {activeAlertTotal > ALERT_PREVIEW_LIMIT && (
                                    <p
                                        className="text-muted-foreground text-xs"
                                        data-test="alerts-preview-note"
                                    >
                                        Showing the {ALERT_PREVIEW_LIMIT} most
                                        recent of {activeAlertTotal} active
                                        alerts — use View All Alerts to see the
                                        full list.
                                    </p>
                                )}
                            </>
                        )}
                    </CardContent>
                </Card>
            </div>
        </OperatorSidebarLayout>
    );
}
