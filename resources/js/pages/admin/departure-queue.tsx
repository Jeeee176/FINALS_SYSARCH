import { Head, router } from '@inertiajs/react';
import {
    ArrowRight,
    BusFront,
    CheckCircle2,
    ClipboardList,
    Flag,
    LayoutGrid,
    ListOrdered,
    Route as RouteIcon,
    Search,
    Table2,
    X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import AppSidebarLayout from '@/layouts/app/app-sidebar-layout';
import { cn } from '@/lib/utils';

type EntryStatus =
    | 'queued'
    | 'next'
    | 'notified'
    | 'acknowledged'
    | 'loading'
    | 'departed'
    | 'skipped';

type Entry = {
    id: number;
    queue_position: number;
    status: EntryStatus;
    bus_number: string | null;
    notified_at: string | null;
    driver_acknowledged_at: string | null;
    loading_started_at: string | null;
    departed_at: string | null;
    created_at: string | null;
    bus: {
        id: number;
        bus_number: string | null;
        plate_number: string | null;
    };
    driver: {
        id: number;
        name: string | null;
    };
    route: {
        id: number;
        name: string | null;
        destination: string | null;
    };
};

type Props = {
    active: Entry[];
    historical: Entry[];
};

type QueueFilter = 'all' | 'waiting' | 'departed';
type QueueView = 'table' | 'cards';

export const DEPARTURE_QUEUE_POLL_INTERVAL_MS = 5000;

const STATUS_LABELS: Record<EntryStatus, string> = {
    queued: 'Queued',
    next: 'Next',
    notified: 'Notified',
    acknowledged: 'Acknowledged',
    loading: 'Loading',
    departed: 'Departed',
    skipped: 'Skipped',
};

function StatusBadge({ status }: { status: EntryStatus }) {
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

function matchesQuery(entry: Entry, normalizedQuery: string): boolean {
    const haystack = [
        entry.bus_number ?? '',
        entry.bus.bus_number ?? '',
        entry.bus.plate_number ?? '',
        entry.driver.name ?? '',
        entry.route.name ?? '',
    ]
        .join(' ')
        .toLowerCase();

    return haystack.includes(normalizedQuery);
}

function SummaryCard({
    icon: Icon,
    label,
    sublabel,
    value,
    dataTest,
}: {
    icon: LucideIcon;
    label: string;
    sublabel: string;
    value: number;
    dataTest: string;
}) {
    return (
        <div className="bg-card rounded-lg border p-4" data-test={dataTest}>
            <div className="flex items-center justify-between gap-2">
                <p className="text-muted-foreground text-xs">{label}</p>
                <Icon className="text-muted-foreground size-4 shrink-0" />
            </div>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
            <p className="text-muted-foreground mt-0.5 text-xs">{sublabel}</p>
        </div>
    );
}

function PositionBadge({ position }: { position: number | null }) {
    if (position === null || position < 1) {
        return <span className="text-muted-foreground">—</span>;
    }

    return (
        <span className="bg-muted text-muted-foreground inline-flex size-7 items-center justify-center rounded-full text-xs font-medium tabular-nums">
            {position}
        </span>
    );
}

function DetailRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-baseline justify-between gap-3 py-0.5">
            <span className="text-muted-foreground shrink-0 text-xs">
                {label}
            </span>
            <span
                className="text-foreground min-w-0 truncate text-right text-xs font-medium"
                title={value}
            >
                {value}
            </span>
        </div>
    );
}

function EmptyState({
    title,
    description,
    action,
    dataTest = 'queue-empty',
}: {
    title: string;
    description: string;
    action?: React.ReactNode;
    dataTest?: string;
}) {
    return (
        <div
            className="flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-12 text-center"
            data-test={dataTest}
        >
            <div className="bg-muted text-muted-foreground flex size-10 items-center justify-center rounded-full">
                <ClipboardList className="size-5" />
            </div>
            <p className="mt-3 text-sm font-medium">{title}</p>
            <p className="text-muted-foreground mt-1 max-w-sm text-sm">
                {description}
            </p>
            {action}
        </div>
    );
}

const FILTERS: { key: QueueFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'waiting', label: 'Waiting' },
    { key: 'departed', label: 'Departed' },
];

export default function AdminDepartureQueuePage({ active, historical }: Props) {
    const [query, setQuery] = useState('');
    const [filter, setFilter] = useState<QueueFilter>('all');
    const [view, setView] = useState<QueueView>('table');

    useEffect(() => {
        let cancelled = false;
        let inFlight = false;

        const poll = () => {
            if (cancelled || inFlight) {
                return;
            }

            inFlight = true;

            router.reload({
                only: ['active', 'historical'],
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
            DEPARTURE_QUEUE_POLL_INTERVAL_MS,
        );

        return () => {
            cancelled = true;
            window.clearInterval(timer);
        };
    }, []);

    const departedEntries = useMemo(
        () => historical.filter((entry) => entry.status === 'departed'),
        [historical],
    );

    const allEntries = useMemo(
        () => [...active, ...historical],
        [active, historical],
    );

    const nextEntry = useMemo(
        () =>
            active.find((entry) => entry.status === 'next') ??
            active.find((entry) => entry.status === 'queued') ??
            active[0] ??
            null,
        [active],
    );

    const filterCounts: Record<QueueFilter, number> = {
        all: allEntries.length,
        waiting: active.length,
        departed: departedEntries.length,
    };

    const baseEntries = useMemo(() => {
        if (filter === 'waiting') {
            return active;
        }

        if (filter === 'departed') {
            return departedEntries;
        }

        return allEntries;
    }, [filter, active, departedEntries, allEntries]);

    const visibleEntries = useMemo(() => {
        const normalized = query.trim().toLowerCase();

        if (!normalized) {
            return baseEntries;
        }

        return baseEntries.filter((entry) => matchesQuery(entry, normalized));
    }, [baseEntries, query]);

    const summary = {
        waiting: active.length,
        departed: departedEntries.length,
        next: active.filter((entry) => entry.status === 'next').length,
        completed: historical.length,
    };

    const emptyState = (() => {
        if (query.trim() !== '') {
            return {
                title: 'No queue entries match your search',
                description:
                    'Try a different bus number, driver, or route, or clear the search to see the full list.',
                action: (
                    <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="mt-3"
                        onClick={() => setQuery('')}
                        data-test="queue-empty-clear"
                    >
                        Clear search
                    </Button>
                ),
            };
        }

        if (filter === 'waiting') {
            return {
                title: 'No buses currently waiting in the queue',
                description:
                    'Queued and in-progress entries will appear here once an operator adds a bus.',
                action: null,
            };
        }

        if (filter === 'departed') {
            return {
                title: 'No departed entries yet',
                description:
                    'Buses that complete their departure will appear here.',
                action: null,
            };
        }

        return {
            title: 'No queue entries',
            description:
                'The departure queue is empty right now. Operators manage the queue.',
            action: null,
        };
    })();

    return (
        <AppSidebarLayout
            breadcrumbs={[
                {
                    title: 'Dashboard',
                    href: '/admin/dashboard',
                },
                {
                    title: 'Departure Queue',
                    href: '/admin/departure-queue',
                },
            ]}
        >
            <Head title="Departure Queue" />

            <div className="flex flex-col gap-6">
                <div className="flex items-center gap-4">
                    <div className="bg-primary/10 text-primary-strong flex size-11 shrink-0 items-center justify-center rounded-xl">
                        <ClipboardList className="size-6" />
                    </div>
                    <div>
                        <div className="flex flex-wrap items-center gap-2">
                            <h1 className="text-2xl font-semibold">
                                Departure Queue
                            </h1>
                            <Badge variant="secondary">Read-only</Badge>
                        </div>
                        <p className="text-muted-foreground">
                            Monitor bus queue order and departure progress
                            across the terminal.
                        </p>
                    </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <SummaryCard
                        icon={ListOrdered}
                        label="Waiting in Queue"
                        sublabel="Still in the active queue"
                        value={summary.waiting}
                        dataTest="summary-waiting"
                    />
                    <SummaryCard
                        icon={CheckCircle2}
                        label="Departed"
                        sublabel="Marked departed (latest 20)"
                        value={summary.departed}
                        dataTest="summary-departed"
                    />
                    <SummaryCard
                        icon={ArrowRight}
                        label="Next to Depart"
                        sublabel="Promoted and ready"
                        value={summary.next}
                        dataTest="summary-next"
                    />
                    <SummaryCard
                        icon={Flag}
                        label="Completed Departures"
                        sublabel="Departed or skipped (latest 20)"
                        value={summary.completed}
                        dataTest="summary-completed"
                    />
                </div>

                <p className="text-muted-foreground -mt-3 text-xs">
                    Summary cards cover the active queue and the latest 20
                    completed queue entries. Search and filters only affect the
                    list below.
                </p>

                <div
                    className="border-warning/40 bg-warning/10 rounded-lg border p-4 sm:p-5"
                    data-test="next-bus-panel"
                >
                    <div className="flex flex-wrap items-center gap-2">
                        <ArrowRight className="text-warning-strong size-4 shrink-0" />
                        <h2 className="text-sm font-semibold">
                            Next Bus to Depart
                        </h2>
                        {nextEntry && (
                            <span
                                className="bg-warning/20 text-foreground ml-auto inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium tabular-nums"
                                data-test="next-bus-position"
                            >
                                Queue position #{nextEntry.queue_position}
                            </span>
                        )}
                    </div>

                    {nextEntry === null ? (
                        <p
                            className="text-muted-foreground mt-3 text-sm"
                            data-test="next-bus-empty"
                        >
                            No buses currently waiting in the queue.
                        </p>
                    ) : (
                        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                            <div className="flex items-center gap-3">
                                <div className="bg-primary/10 text-primary-strong flex size-9 shrink-0 items-center justify-center rounded-lg">
                                    <BusFront className="size-4" />
                                </div>
                                <div className="min-w-0">
                                    <p
                                        className="truncate font-medium"
                                        title={
                                            nextEntry.bus_number ?? undefined
                                        }
                                    >
                                        {nextEntry.bus_number ?? '—'}
                                    </p>
                                    <p className="text-muted-foreground truncate text-xs">
                                        {nextEntry.bus.plate_number ?? ''}
                                    </p>
                                </div>
                            </div>
                            <div className="min-w-0">
                                <p className="text-muted-foreground text-xs">
                                    Driver
                                </p>
                                <p
                                    className="truncate text-sm font-medium"
                                    title={nextEntry.driver.name ?? undefined}
                                >
                                    {nextEntry.driver.name ??
                                        'No driver assigned'}
                                </p>
                            </div>
                            <div className="min-w-0">
                                <p className="text-muted-foreground text-xs">
                                    Route
                                </p>
                                <p
                                    className="truncate text-sm font-medium"
                                    title={nextEntry.route.name ?? undefined}
                                >
                                    {nextEntry.route.name ??
                                        'No route assigned'}
                                </p>
                                {nextEntry.route.destination && (
                                    <p className="text-muted-foreground truncate text-xs">
                                        To {nextEntry.route.destination}
                                    </p>
                                )}
                            </div>
                            <div className="flex flex-col items-start gap-1.5">
                                <p className="text-muted-foreground text-xs">
                                    Status
                                </p>
                                <span data-test="next-bus-status">
                                    <StatusBadge status={nextEntry.status} />
                                </span>
                            </div>
                        </div>
                    )}
                </div>

                <div className="bg-card overflow-hidden rounded-lg border">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
                        <div>
                            <h2 className="text-sm font-semibold">
                                Queue Overview
                            </h2>
                            <p
                                className="text-muted-foreground text-xs"
                                data-test="queue-showing"
                            >
                                Showing {visibleEntries.length} of{' '}
                                {filterCounts[filter]}{' '}
                                {filterCounts[filter] === 1
                                    ? 'entry'
                                    : 'entries'}
                            </p>
                        </div>

                        <div
                            className="bg-muted/50 flex items-center gap-1 rounded-lg p-1"
                            role="group"
                            aria-label="View"
                        >
                            <button
                                type="button"
                                onClick={() => setView('table')}
                                aria-pressed={view === 'table'}
                                data-test="queue-view-table"
                                className={cn(
                                    'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
                                    view === 'table'
                                        ? 'bg-primary text-primary-foreground'
                                        : 'text-muted-foreground hover:text-foreground',
                                )}
                            >
                                <Table2 className="size-3.5" />
                                Table
                            </button>
                            <button
                                type="button"
                                onClick={() => setView('cards')}
                                aria-pressed={view === 'cards'}
                                data-test="queue-view-cards"
                                className={cn(
                                    'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
                                    view === 'cards'
                                        ? 'bg-primary text-primary-foreground'
                                        : 'text-muted-foreground hover:text-foreground',
                                )}
                            >
                                <LayoutGrid className="size-3.5" />
                                Cards
                            </button>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
                        <div
                            className="flex flex-wrap items-center gap-1"
                            role="group"
                            aria-label="Status filter"
                        >
                            {FILTERS.map(({ key, label }) => (
                                <button
                                    key={key}
                                    type="button"
                                    onClick={() => setFilter(key)}
                                    aria-pressed={filter === key}
                                    data-test={`queue-filter-${key}`}
                                    className={cn(
                                        'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                                        filter === key
                                            ? 'bg-primary text-primary-foreground'
                                            : 'bg-muted/50 text-muted-foreground hover:text-foreground',
                                    )}
                                >
                                    {label}
                                    <span className="tabular-nums opacity-80">
                                        ({filterCounts[key]})
                                    </span>
                                </button>
                            ))}
                        </div>

                        <div className="relative min-w-[220px] flex-1">
                            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
                            <Input
                                value={query}
                                onChange={(event) =>
                                    setQuery(event.target.value)
                                }
                                placeholder="Search bus, driver, or route..."
                                className="pl-8"
                                data-test="queue-search"
                            />
                            {query !== '' && (
                                <button
                                    type="button"
                                    aria-label="Clear search"
                                    className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2"
                                    onClick={() => setQuery('')}
                                    data-test="queue-clear-search"
                                >
                                    <X className="size-4" />
                                </button>
                            )}
                        </div>
                    </div>

                    {visibleEntries.length === 0 ? (
                        <div className="p-4">
                            <EmptyState
                                title={emptyState.title}
                                description={emptyState.description}
                                action={emptyState.action}
                            />
                        </div>
                    ) : view === 'table' ? (
                        <Table data-test="queue-table">
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-14">#</TableHead>
                                    <TableHead>Bus</TableHead>
                                    <TableHead>Driver</TableHead>
                                    <TableHead>Route</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Added</TableHead>
                                    <TableHead>Departed</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {visibleEntries.map((entry) => {
                                    const isNext =
                                        nextEntry !== null &&
                                        entry.id === nextEntry.id;

                                    return (
                                        <TableRow
                                            key={entry.id}
                                            className={cn(
                                                isNext && 'bg-primary/5',
                                            )}
                                            data-test="queue-row"
                                            data-entry-id={entry.id}
                                        >
                                            <TableCell>
                                                <PositionBadge
                                                    position={
                                                        entry.status ===
                                                            'departed' ||
                                                        entry.status ===
                                                            'skipped'
                                                            ? null
                                                            : entry.queue_position
                                                    }
                                                />
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-3">
                                                    <div className="bg-primary/10 text-primary-strong flex size-9 shrink-0 items-center justify-center rounded-lg">
                                                        <BusFront className="size-4" />
                                                    </div>
                                                    <div className="max-w-40 min-w-0">
                                                        <p
                                                            className="truncate font-medium"
                                                            title={
                                                                entry.bus_number ??
                                                                undefined
                                                            }
                                                        >
                                                            {entry.bus_number ??
                                                                '—'}
                                                        </p>
                                                        <p className="text-muted-foreground truncate text-xs">
                                                            {entry.bus
                                                                .plate_number ??
                                                                ''}
                                                        </p>
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell className="max-w-44">
                                                {entry.driver.name ? (
                                                    <p
                                                        className="truncate"
                                                        title={
                                                            entry.driver.name
                                                        }
                                                    >
                                                        {entry.driver.name}
                                                    </p>
                                                ) : (
                                                    <span className="text-muted-foreground">
                                                        —
                                                    </span>
                                                )}
                                            </TableCell>
                                            <TableCell className="max-w-44">
                                                {entry.route.name ? (
                                                    <div className="flex items-center gap-2">
                                                        <RouteIcon className="text-muted-foreground size-3.5 shrink-0" />
                                                        <div className="min-w-0">
                                                            <p
                                                                className="truncate"
                                                                title={
                                                                    entry.route
                                                                        .name
                                                                }
                                                            >
                                                                {
                                                                    entry.route
                                                                        .name
                                                                }
                                                            </p>
                                                            {entry.route
                                                                .destination && (
                                                                <p className="text-muted-foreground truncate text-xs">
                                                                    To{' '}
                                                                    {
                                                                        entry
                                                                            .route
                                                                            .destination
                                                                    }
                                                                </p>
                                                            )}
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <span className="text-muted-foreground">
                                                        —
                                                    </span>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <StatusBadge
                                                    status={entry.status}
                                                />
                                            </TableCell>
                                            <TableCell className="whitespace-nowrap">
                                                {formatTimestamp(
                                                    entry.created_at,
                                                )}
                                            </TableCell>
                                            <TableCell className="whitespace-nowrap">
                                                {formatTimestamp(
                                                    entry.departed_at,
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    ) : (
                        <div className="grid gap-3 p-3 sm:grid-cols-2 xl:grid-cols-3">
                            {visibleEntries.map((entry) => {
                                const isNext =
                                    nextEntry !== null &&
                                    entry.id === nextEntry.id;

                                return (
                                    <div
                                        key={entry.id}
                                        className={cn(
                                            'bg-card rounded-lg border p-3',
                                            isNext &&
                                                'bg-primary/5 ring-primary/30 ring-1 ring-inset',
                                        )}
                                        data-test="queue-card"
                                        data-entry-id={entry.id}
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <PositionBadge
                                                position={
                                                    entry.status ===
                                                        'departed' ||
                                                    entry.status === 'skipped'
                                                        ? null
                                                        : entry.queue_position
                                                }
                                            />
                                            <StatusBadge
                                                status={entry.status}
                                            />
                                        </div>

                                        <div className="mt-2 flex items-center gap-2">
                                            <div className="bg-primary/10 text-primary-strong flex size-8 shrink-0 items-center justify-center rounded-lg">
                                                <BusFront className="size-4" />
                                            </div>
                                            <div className="min-w-0">
                                                <p
                                                    className="truncate text-sm font-semibold"
                                                    title={
                                                        entry.bus_number ??
                                                        undefined
                                                    }
                                                >
                                                    {entry.bus_number ?? '—'}
                                                </p>
                                                <p className="text-muted-foreground truncate text-xs">
                                                    {entry.bus.plate_number ??
                                                        ''}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="mt-2 space-y-0.5 border-t pt-2">
                                            <DetailRow
                                                label="Driver"
                                                value={
                                                    entry.driver.name ??
                                                    'No driver assigned'
                                                }
                                            />
                                            <DetailRow
                                                label="Route"
                                                value={
                                                    entry.route.name ??
                                                    'No route assigned'
                                                }
                                            />
                                            <DetailRow
                                                label="Added"
                                                value={formatTimestamp(
                                                    entry.created_at,
                                                )}
                                            />
                                            <DetailRow
                                                label="Departed"
                                                value={formatTimestamp(
                                                    entry.departed_at,
                                                )}
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </AppSidebarLayout>
    );
}
