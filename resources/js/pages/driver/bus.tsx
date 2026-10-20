import { Head, usePage } from '@inertiajs/react';
import { Link } from '@inertiajs/react';
import {
    ArrowRight,
    BadgeCheck,
    BusFront,
    Clock3,
    Route as RouteIcon,
    UserRound,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import DriverSidebarLayout from '@/layouts/app/driver-sidebar-layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
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

type Props = {
    assignedBus: Bus | null;
    assignedRoute: Route | null;
    currentTrip: CurrentTrip | null;
    driverStatus: Status | null;
};

const TRIP_STATUS_LABELS: Record<string, string> = {
    scheduled: 'Scheduled',
    in_transit: 'In Transit',
    completed: 'Completed',
    cancelled: 'Cancelled',
};

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

export default function DriverBusPage({
    assignedBus,
    assignedRoute,
    currentTrip,
    driverStatus,
}: Props) {
    const { auth } = usePage().props;
    const driverName = auth?.user?.name ?? 'Driver';

    return (
        <DriverSidebarLayout
            breadcrumbs={[
                {
                    title: 'My Bus',
                    href: '/driver/bus',
                },
            ]}
        >
            <Head title="My Bus" />

            <div className="flex flex-1 flex-col gap-6 px-6 md:px-4">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight">
                        My Bus
                    </h1>
                    <p className="text-muted-foreground mt-1 text-sm">
                        The vehicle currently assigned to you by the terminal.
                    </p>
                </div>

                {!assignedBus ? (
                    <Card data-test="bus-empty-card">
                        <CardContent>
                            <EmptyState
                                icon={BusFront}
                                title="No bus assigned"
                                description="You currently do not have a bus assigned. Bus assignments are handled by your system administrator, so contact them to be given a vehicle."
                            />
                            <div className="mt-4 flex justify-center">
                                <Button asChild variant="outline" size="sm">
                                    <Link
                                        href="/driver/dashboard"
                                        data-test="bus-empty-dashboard-link"
                                    >
                                        Back to Dashboard
                                        <ArrowRight className="size-4" />
                                    </Link>
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                ) : (
                    <>
                        <Card data-test="bus-overview-card">
                            <CardContent className="px-6 pt-6">
                                <div className="flex flex-wrap items-center gap-4">
                                    <div className="bg-primary/10 text-primary-strong flex size-14 shrink-0 items-center justify-center rounded-xl">
                                        <BusFront className="size-7" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p
                                            className="truncate text-2xl font-semibold"
                                            title={assignedBus.bus_number}
                                            data-test="bus-number-hero"
                                        >
                                            {assignedBus.bus_number}
                                        </p>
                                        <p
                                            className="text-muted-foreground truncate text-sm"
                                            title={assignedBus.plate_number}
                                            data-test="bus-plate-hero"
                                        >
                                            {assignedBus.plate_number}
                                        </p>
                                    </div>
                                    <div
                                        className="flex items-center gap-2"
                                        data-test="bus-status-badge"
                                    >
                                        <span className="text-muted-foreground text-sm">
                                            Vehicle Status
                                        </span>
                                        <StatusBadge
                                            status={assignedBus.status}
                                        />
                                    </div>
                                </div>

                                <dl className="-mx-6 mt-4 divide-y">
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
                                            assignedBus.model ?? 'Not specified'
                                        }
                                    />
                                    <InfoRow
                                        label="Passenger Capacity"
                                        value={
                                            assignedBus.capacity != null
                                                ? `${assignedBus.capacity} seats`
                                                : 'Not specified'
                                        }
                                    />
                                </dl>
                            </CardContent>
                        </Card>

                        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                            <Card data-test="route-card">
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2 text-base">
                                        <RouteIcon className="text-primary size-4 shrink-0" />
                                        Assigned Route
                                    </CardTitle>
                                    <CardDescription>
                                        The route attached to your assigned bus.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    {!assignedRoute ? (
                                        <EmptyState
                                            icon={RouteIcon}
                                            title="No route assigned"
                                            description="Your assigned bus has no route yet. Contact your administrator."
                                        />
                                    ) : (
                                        <>
                                            <div className="bg-primary/10 text-primary-strong flex items-center gap-3 rounded-lg px-4 py-3">
                                                <BadgeCheck className="size-5 shrink-0" />
                                                <div className="min-w-0 flex-1">
                                                    <p
                                                        className="truncate text-sm font-medium"
                                                        title={
                                                            assignedRoute.name
                                                        }
                                                    >
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
                                            <dl className="-mx-6 mt-2 divide-y">
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
                                                        Route Status
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

                            <Card data-test="trip-card">
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2 text-base">
                                        <Clock3 className="text-primary size-4 shrink-0" />
                                        Current Trip
                                    </CardTitle>
                                    <CardDescription>
                                        The trip your bus is operating right
                                        now. Vehicle status and trip status are
                                        tracked separately.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    {!currentTrip ? (
                                        <EmptyState
                                            icon={Clock3}
                                            title="No active trip"
                                            description="Start a trip from your Dashboard when you are ready to depart."
                                        />
                                    ) : (
                                        <div className="bg-success/10 flex items-center gap-3 rounded-lg px-4 py-3">
                                            <span className="bg-success flex size-2.5 shrink-0 rounded-full" />
                                            <div className="min-w-0 flex-1">
                                                <p className="text-sm font-medium">
                                                    Trip #{currentTrip.id}
                                                </p>
                                                <p className="text-muted-foreground text-xs">
                                                    Started{' '}
                                                    {formatTimestamp(
                                                        currentTrip.started_at,
                                                    )}
                                                </p>
                                            </div>
                                            <Badge
                                                className="bg-success text-success-foreground border-transparent"
                                                data-test="trip-status-badge"
                                            >
                                                {
                                                    TRIP_STATUS_LABELS[
                                                        currentTrip.status
                                                    ]
                                                }
                                            </Badge>
                                        </div>
                                    )}
                                    <div className="mt-4">
                                        <Button
                                            asChild
                                            variant="outline"
                                            size="sm"
                                        >
                                            <Link
                                                href="/driver/dashboard"
                                                data-test="trip-card-link"
                                            >
                                                Open Dashboard
                                                <ArrowRight className="size-4" />
                                            </Link>
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>

                        <Card data-test="assignment-card">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2 text-base">
                                    <UserRound className="text-primary size-4 shrink-0" />
                                    Assignment Information
                                </CardTitle>
                                <CardDescription>
                                    Assignments are managed by your
                                    administrator — this page is read-only.
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <dl className="-mx-6 divide-y">
                                    <InfoRow
                                        label="Assigned Driver"
                                        value={driverName}
                                    />
                                    <div className="flex flex-col gap-1 px-6 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                                        <dt className="text-muted-foreground text-sm">
                                            Driver Status
                                        </dt>
                                        <dd className="sm:text-right">
                                            {driverStatus ? (
                                                <span data-test="driver-status-badge">
                                                    <StatusBadge
                                                        status={driverStatus}
                                                    />
                                                </span>
                                            ) : (
                                                <span className="text-sm">
                                                    Unknown
                                                </span>
                                            )}
                                        </dd>
                                    </div>
                                </dl>
                            </CardContent>
                        </Card>
                    </>
                )}
            </div>
        </DriverSidebarLayout>
    );
}
