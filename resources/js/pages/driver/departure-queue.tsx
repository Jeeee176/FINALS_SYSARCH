import { Head, router } from '@inertiajs/react';
import {
    BadgeCheck,
    Ban,
    BusFront,
    Check,
    ClipboardList,
    Clock,
    Flag,
    Megaphone,
    Route as RouteIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
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
import DriverSidebarLayout from '@/layouts/app/driver-sidebar-layout';
import { cn } from '@/lib/utils';

type DispatchStatus =
    | 'queued'
    | 'next'
    | 'notified'
    | 'acknowledged'
    | 'loading'
    | 'departed'
    | 'skipped';

type Dispatch = {
    id: number;
    queue_position: number;
    status: DispatchStatus;
    notified_at: string | null;
    driver_acknowledged_at: string | null;
    loading_started_at: string | null;
    departed_at: string | null;
    bus: {
        id: number;
        bus_number: string | null;
        plate_number: string | null;
    };
    route: {
        id: number;
        name: string | null;
        destination: string | null;
    };
};

type Props = {
    dispatch: Dispatch | null;
    message: string | null;
};

const STATUS_LABELS: Record<DispatchStatus, string> = {
    queued: 'Queued',
    next: 'Next',
    notified: 'Notified',
    acknowledged: 'Acknowledged',
    loading: 'Loading',
    departed: 'Departed',
    skipped: 'Skipped',
};

export const DISPATCH_POLL_INTERVAL_MS = 5000;

function StatusBadge({ status }: { status: DispatchStatus }) {
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
                status === 'departed' && 'bg-success text-success-foreground',
                status === 'skipped' && 'bg-muted text-muted-foreground',
            )}
        >
            {STATUS_LABELS[status]}
        </Badge>
    );
}

function formatTimestamp(value: string | null): string {
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

function InfoRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <dt className="text-muted-foreground text-sm">{label}</dt>
            <dd className="text-sm font-medium break-words sm:text-right">
                {value}
            </dd>
        </div>
    );
}

export default function DriverDepartureQueuePage({ dispatch, message }: Props) {
    const [acknowledging, setAcknowledging] = useState(false);

    useEffect(() => {
        let cancelled = false;
        let inFlight = false;

        const poll = () => {
            if (cancelled || inFlight) {
                return;
            }

            inFlight = true;

            router.reload({
                only: ['dispatch', 'message'],
                onFinish: () => {
                    inFlight = false;
                },
                onCancel: () => {
                    inFlight = false;
                },
            });
        };

        const timer = window.setInterval(
            () => poll(),
            DISPATCH_POLL_INTERVAL_MS,
        );

        return () => {
            cancelled = true;
            window.clearInterval(timer);
        };
    }, []);

    const handleAcknowledge = () => {
        if (!dispatch) {
            return;
        }

        setAcknowledging(true);

        router.post(
            `/driver/departure-queue/${dispatch.id}/acknowledge`,
            {},
            {
                preserveScroll: true,
                onFinish: () => setAcknowledging(false),
            },
        );
    };

    const acknowledged = (dispatch?.driver_acknowledged_at ?? null) !== null;

    return (
        <DriverSidebarLayout
            breadcrumbs={[
                {
                    title: 'Dashboard',
                    href: '/driver/dashboard',
                },
                {
                    title: 'Dispatch',
                    href: '/driver/departure-queue',
                },
            ]}
        >
            <Head title="Dispatch Notice" />

            <div className="flex flex-col gap-6">
                <div className="flex items-center gap-4">
                    <div className="bg-primary/10 text-primary-strong flex size-11 shrink-0 items-center justify-center rounded-xl">
                        <ClipboardList className="size-6" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-semibold">
                            Dispatch Notice
                        </h1>
                        <p className="text-muted-foreground">
                            Your departure notification from the terminal
                            operator.
                        </p>
                    </div>
                </div>

                {!dispatch ? (
                    <Card>
                        <CardContent className="p-6">
                            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-10 text-center">
                                <div className="bg-muted text-muted-foreground flex size-10 items-center justify-center rounded-full">
                                    <Ban className="size-5" />
                                </div>
                                <p className="mt-3 text-sm font-medium">
                                    No dispatch notification
                                </p>
                                <p className="text-muted-foreground mt-1 max-w-sm text-sm">
                                    {message ??
                                        'You have no pending or active departure queue entry. Dispatch notices will appear here.'}
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                ) : (
                    <>
                        <div className="bg-warning/15 border-warning/40 flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3">
                            <Megaphone className="text-warning-strong size-5 shrink-0" />
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium">
                                    Your bus is queued for departure. Please
                                    follow the terminal operator's instructions.
                                </p>
                                <p className="text-muted-foreground text-xs">
                                    Acknowledging confirms that you received
                                    this dispatch notice.
                                </p>
                            </div>
                            <StatusBadge status={dispatch.status} />
                        </div>

                        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                            <Card>
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2 text-base">
                                        <BusFront className="text-primary size-4 shrink-0" />
                                        Dispatch Details
                                    </CardTitle>
                                    <CardDescription>
                                        Bus assigned to this dispatch.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <dl className="-mx-1 divide-y">
                                        <InfoRow
                                            label="Bus Number"
                                            value={
                                                dispatch.bus.bus_number ?? '—'
                                            }
                                        />
                                        <InfoRow
                                            label="Plate Number"
                                            value={
                                                dispatch.bus.plate_number ?? '—'
                                            }
                                        />
                                        <InfoRow
                                            label="Queue Position"
                                            value={String(
                                                dispatch.queue_position,
                                            )}
                                        />
                                        <InfoRow
                                            label="Notified"
                                            value={formatTimestamp(
                                                dispatch.notified_at,
                                            )}
                                        />
                                        <InfoRow
                                            label="Acknowledged"
                                            value={formatTimestamp(
                                                dispatch.driver_acknowledged_at,
                                            )}
                                        />
                                        <InfoRow
                                            label="Loading Started"
                                            value={formatTimestamp(
                                                dispatch.loading_started_at,
                                            )}
                                        />
                                    </dl>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2 text-base">
                                        <RouteIcon className="text-primary size-4 shrink-0" />
                                        Route
                                    </CardTitle>
                                    <CardDescription>
                                        Route associated with this dispatch.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    {dispatch.route.name ? (
                                        <>
                                            <div className="bg-primary/10 text-primary-strong flex items-center gap-3 rounded-lg px-4 py-3">
                                                <RouteIcon className="size-5 shrink-0" />
                                                <div className="min-w-0 flex-1">
                                                    <p className="truncate text-sm font-medium">
                                                        {dispatch.route.name}
                                                    </p>
                                                    {dispatch.route
                                                        .destination && (
                                                        <p className="text-muted-foreground truncate text-xs">
                                                            →{' '}
                                                            {
                                                                dispatch.route
                                                                    .destination
                                                            }
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                            <dl className="-mx-1 mt-4 divide-y">
                                                <InfoRow
                                                    label="Status"
                                                    value={
                                                        STATUS_LABELS[
                                                            dispatch.status
                                                        ]
                                                    }
                                                />
                                                <InfoRow
                                                    label="Departed"
                                                    value={formatTimestamp(
                                                        dispatch.departed_at,
                                                    )}
                                                />
                                            </dl>
                                        </>
                                    ) : (
                                        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-10 text-center">
                                            <RouteIcon className="text-muted-foreground size-6" />
                                            <p className="text-muted-foreground mt-3 text-sm">
                                                No route assigned to this
                                                dispatch.
                                            </p>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </div>

                        <Card>
                            <CardContent className="p-6">
                                {acknowledged ? (
                                    <div className="bg-success/10 border-success/50 flex items-center gap-3 rounded-lg border px-4 py-3">
                                        <BadgeCheck className="text-success size-5 shrink-0" />
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-medium">
                                                Dispatch acknowledged
                                            </p>
                                            <p className="text-muted-foreground text-xs">
                                                Acknowledged at{' '}
                                                {formatTimestamp(
                                                    dispatch.driver_acknowledged_at,
                                                )}
                                                . Proceed to{' '}
                                                {dispatch.bus.bus_number} and
                                                await further instructions.
                                            </p>
                                        </div>
                                    </div>
                                ) : dispatch.status === 'notified' ? (
                                    <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-medium">
                                                Ready to confirm receipt
                                            </p>
                                            <p className="text-muted-foreground text-xs">
                                                Tap the button below to
                                                acknowledge this dispatch
                                                notification.
                                            </p>
                                        </div>
                                        <Button
                                            className="gap-2"
                                            disabled={acknowledging}
                                            onClick={handleAcknowledge}
                                        >
                                            {acknowledging ? (
                                                <Spinner className="size-4" />
                                            ) : (
                                                <Check className="size-4" />
                                            )}
                                            Acknowledge Dispatch
                                        </Button>
                                    </div>
                                ) : (
                                    <div
                                        className={cn(
                                            'flex items-center gap-2 rounded-lg px-4 py-3 text-sm',
                                            dispatch.status === 'loading' &&
                                                'bg-primary/10 text-primary-strong',
                                            dispatch.status === 'departed' &&
                                                'bg-success/10 text-foreground',
                                            (dispatch.status === 'queued' ||
                                                dispatch.status === 'next') &&
                                                'bg-muted text-muted-foreground',
                                        )}
                                    >
                                        {dispatch.status === 'loading' && (
                                            <>
                                                <Flag className="size-4 shrink-0" />
                                                Loading is in progress. Prepare
                                                for departure.
                                            </>
                                        )}
                                        {dispatch.status === 'departed' && (
                                            <>
                                                <Flag className="size-4 shrink-0" />
                                                This dispatch is complete. Have
                                                a safe trip.
                                            </>
                                        )}
                                        {dispatch.status === 'queued' && (
                                            <>
                                                <Clock className="size-4 shrink-0" />
                                                You are in the departure queue.
                                                Await the dispatch notification.
                                            </>
                                        )}
                                        {dispatch.status === 'next' && (
                                            <>
                                                <Megaphone className="size-4 shrink-0" />
                                                Your bus is next in line. Await
                                                the dispatch notification.
                                            </>
                                        )}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </>
                )}
            </div>
        </DriverSidebarLayout>
    );
}
