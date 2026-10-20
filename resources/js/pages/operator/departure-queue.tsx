import { Head, router } from '@inertiajs/react';
import {
    ArrowRight,
    BusFront,
    CheckCircle2,
    ChevronDown,
    ChevronUp,
    ClipboardList,
    Flag,
    LayoutGrid,
    ListOrdered,
    Megaphone,
    PackageOpen,
    Plus,
    Route as RouteIcon,
    Search,
    SkipForward,
    Table2,
    X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import InputError from '@/components/input-error';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import OperatorSidebarLayout from '@/layouts/app/operator-sidebar-layout';
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

type Stats = {
    waiting: number;
    ready: number;
    departed_today: number;
    next_bus: {
        bus_number: string | null;
        status: EntryStatus;
    } | null;
};

type AvailableBus = {
    id: number;
    bus_number: string | null;
    plate_number: string | null;
    driver_name: string | null;
    route_name: string | null;
};

type Props = {
    active: Entry[];
    historical: Entry[];
    availableBuses: AvailableBus[];
    stats: Stats;
};

type ConfirmState = {
    type: 'skip' | 'depart';
    entry: Entry;
} | null;

type QueueFilter = 'all' | 'queued' | 'next' | 'ready';
type QueueView = 'table' | 'cards';

const STATUS_LABELS: Record<EntryStatus, string> = {
    queued: 'Queued',
    next: 'Next',
    notified: 'Notified',
    acknowledged: 'Acknowledged',
    loading: 'Loading',
    departed: 'Departed',
    skipped: 'Skipped',
};

const WORKFLOW: EntryStatus[] = [
    'queued',
    'next',
    'notified',
    'acknowledged',
    'loading',
    'departed',
];

const READY_STATUSES: EntryStatus[] = ['notified', 'acknowledged', 'loading'];

const FILTERS: { key: QueueFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'queued', label: 'Queued' },
    { key: 'next', label: 'Next' },
    { key: 'ready', label: 'Ready to Dispatch' },
];

function isReady(status: EntryStatus): boolean {
    return READY_STATUSES.includes(status);
}

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
    value: number | string;
    dataTest: string;
}) {
    return (
        <div className="bg-card rounded-lg border p-4" data-test={dataTest}>
            <div className="flex items-center justify-between gap-2">
                <p className="text-muted-foreground text-xs">{label}</p>
                <Icon className="text-muted-foreground size-4 shrink-0" />
            </div>
            <p className="mt-1 truncate text-2xl font-semibold tabular-nums">
                {value}
            </p>
            <p className="text-muted-foreground mt-0.5 text-xs">{sublabel}</p>
        </div>
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

export default function OperatorDepartureQueuePage({
    active,
    historical,
    availableBuses,
    stats,
}: Props) {
    const [query, setQuery] = useState('');
    const [filter, setFilter] = useState<QueueFilter>('all');
    const [view, setView] = useState<QueueView>('table');
    const [addOpen, setAddOpen] = useState(false);
    const [selectedBusId, setSelectedBusId] = useState('');
    const [position, setPosition] = useState('');
    const [formErrors, setFormErrors] = useState<Record<string, string>>({});
    const [submitting, setSubmitting] = useState(false);
    const [processingId, setProcessingId] = useState<number | null>(null);
    const [confirm, setConfirm] = useState<ConfirmState>(null);

    const filtersActive = query.trim() !== '' || filter !== 'all';

    const postAction = (
        entryId: number,
        action: string,
        data?: Parameters<typeof router.post>[1],
    ) => {
        router.post(`/operator/departure-queue/${entryId}/${action}`, data, {
            preserveScroll: true,
            onStart: () => setProcessingId(entryId),
            onFinish: () => setProcessingId(null),
        });
    };

    const handleAddBus = () => {
        if (!selectedBusId) {
            return;
        }

        setSubmitting(true);

        router.post(
            '/operator/departure-queue',
            {
                bus_id: selectedBusId,
                position: position !== '' ? Number(position) : undefined,
            },
            {
                preserveScroll: true,
                onError: (errors) => setFormErrors(errors),
                onSuccess: () => {
                    setSelectedBusId('');
                    setPosition('');
                    setFormErrors({});
                    setAddOpen(false);
                },
                onFinish: () => setSubmitting(false),
            },
        );
    };

    const handlePrimary = (entry: Entry) => {
        if (entry.status === 'queued') {
            postAction(entry.id, 'promote');
        } else if (entry.status === 'next') {
            postAction(entry.id, 'notify');
        } else if (
            entry.status === 'notified' ||
            entry.status === 'acknowledged'
        ) {
            postAction(entry.id, 'loading');
        } else if (entry.status === 'loading') {
            setConfirm({ type: 'depart', entry });
        }
    };

    const handleMove = (entry: Entry, direction: 1 | -1) => {
        if (filtersActive) {
            return;
        }

        const target = entry.queue_position + direction;

        if (target < 1 || target > active.length) {
            return;
        }

        postAction(entry.id, 'reorder', { position: target });
    };

    const runConfirmed = () => {
        if (!confirm) {
            return;
        }

        const { type, entry } = confirm;
        setConfirm(null);
        postAction(entry.id, type === 'depart' ? 'depart' : 'skip');
    };

    const primaryLabel = (entry: Entry): string => {
        switch (entry.status) {
            case 'queued':
                return 'Promote';
            case 'next':
                return 'Notify';
            case 'notified':
            case 'acknowledged':
                return 'Start Loading';
            case 'loading':
                return 'Dispatch Bus';
            default:
                return '';
        }
    };

    const primaryIcon = (entry: Entry) => {
        if (entry.status === 'queued') {
            return <ChevronUp className="size-3.5" />;
        }

        if (entry.status === 'next') {
            return <Megaphone className="size-3.5" />;
        }

        if (entry.status === 'notified' || entry.status === 'acknowledged') {
            return <PackageOpen className="size-3.5" />;
        }

        if (entry.status === 'loading') {
            return <Flag className="size-3.5" />;
        }

        return null;
    };

    const normalizedQuery = query.trim().toLowerCase();

    const visibleEntries = useMemo(() => {
        const base = active.filter((entry) => {
            if (filter === 'queued') {
                return entry.status === 'queued';
            }

            if (filter === 'next') {
                return entry.status === 'next';
            }

            if (filter === 'ready') {
                return isReady(entry.status);
            }

            return true;
        });

        if (!normalizedQuery) {
            return base;
        }

        return base.filter((entry) => matchesQuery(entry, normalizedQuery));
    }, [active, filter, normalizedQuery]);

    const filterCounts: Record<QueueFilter, number> = useMemo(
        () => ({
            all: active.length,
            queued: active.filter((entry) => entry.status === 'queued').length,
            next: active.filter((entry) => entry.status === 'next').length,
            ready: active.filter((entry) => isReady(entry.status)).length,
        }),
        [active],
    );

    const firstReadyId = useMemo(() => {
        const firstReady = active.find((entry) => isReady(entry.status));
        return firstReady?.id ?? null;
    }, [active]);

    const nextBusSublabel = stats.next_bus
        ? `Position order #1 · ${STATUS_LABELS[stats.next_bus.status]}`
        : 'No buses currently queued';

    const emptyState = (() => {
        if (normalizedQuery !== '') {
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

        if (filter === 'queued') {
            return {
                title: 'No buses are waiting in the queue',
                description:
                    'Entries appear here once a bus is added and has not been promoted yet.',
                action: null,
            };
        }

        if (filter === 'next') {
            return {
                title: 'No bus is promoted as NEXT',
                description:
                    'Promote a queued bus to make it the next candidate for dispatch.',
                action: null,
            };
        }

        if (filter === 'ready') {
            return {
                title: 'No entries are ready to dispatch',
                description:
                    'Entries marked Notified, Acknowledged, or Loading can be dispatched.',
                action: null,
            };
        }

        return {
            title: 'No active queue',
            description:
                'Add a bus to start dispatching. The next bus promoted will be notified to its driver.',
            action: null,
        };
    })();

    const confirmBusLabel = confirm
        ? (confirm.entry.bus_number ?? 'this bus')
        : 'this bus';

    const confirmRouteLabel = confirm
        ? (confirm.entry.route.name ?? 'no route')
        : '';

    return (
        <OperatorSidebarLayout
            breadcrumbs={[
                {
                    title: 'Dashboard',
                    href: '/operator/dashboard',
                },
                {
                    title: 'Dispatch Queue',
                    href: '/operator/departure-queue',
                },
            ]}
        >
            <Head title="Dispatch Queue" />

            <div className="flex flex-col gap-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <div className="bg-primary/10 text-primary-strong flex size-11 shrink-0 items-center justify-center rounded-xl">
                            <ClipboardList className="size-6" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-semibold">
                                Dispatch Queue
                            </h1>
                            <p className="text-muted-foreground">
                                Manage buses queued for departure.
                            </p>
                        </div>
                    </div>
                    <Button
                        className="gap-2"
                        onClick={() => setAddOpen(true)}
                        data-test="queue-add-open"
                    >
                        <Plus className="size-4" />
                        Add Bus to Queue
                    </Button>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <SummaryCard
                        icon={ListOrdered}
                        label="Waiting in Queue"
                        sublabel="Buses currently in the active queue"
                        value={stats.waiting}
                        dataTest="summary-waiting-queue"
                    />
                    <SummaryCard
                        icon={ArrowRight}
                        label="Next Bus"
                        sublabel={nextBusSublabel}
                        value={stats.next_bus?.bus_number ?? '—'}
                        dataTest="summary-next-bus"
                    />
                    <SummaryCard
                        icon={Flag}
                        label="Ready to Dispatch"
                        sublabel="Notified, Acknowledged, or Loading"
                        value={stats.ready}
                        dataTest="summary-ready-dispatch"
                    />
                    <SummaryCard
                        icon={CheckCircle2}
                        label="Departed Today"
                        sublabel="Marked departed today"
                        value={stats.departed_today}
                        dataTest="summary-departed-today"
                    />
                </div>

                <p className="text-muted-foreground -mt-3 text-xs">
                    Waiting counts active queue entries and Departed Today
                    counts every departure recorded today. Search and filters
                    only affect the Queue Overview below.
                </p>

                <div className="bg-muted/50 flex flex-wrap items-center gap-x-1 gap-y-2 rounded-lg border px-4 py-3">
                    <span className="text-muted-foreground mr-1 text-xs font-medium">
                        Workflow:
                    </span>
                    {WORKFLOW.map((status, index) => (
                        <span key={status} className="flex items-center gap-1">
                            <span className="flex items-center gap-1">
                                <StatusBadge status={status} />
                                {status === 'acknowledged' && (
                                    <span className="text-muted-foreground text-xs">
                                        *
                                    </span>
                                )}
                            </span>
                            {index < WORKFLOW.length - 1 && (
                                <span className="text-muted-foreground mx-0.5">
                                    →
                                </span>
                            )}
                        </span>
                    ))}
                    <span className="text-muted-foreground ml-2 text-xs">
                        Entries may also be skipped at any point.
                    </span>
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
                                {active.length}{' '}
                                {active.length === 1 ? 'entry' : 'entries'}
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

                    {filtersActive && (
                        <div className="bg-warning/10 border-b px-4 py-2">
                            <p className="text-warning-strong text-xs">
                                Reordering is disabled while a search or filter
                                is active. Clear them to restore the full queue
                                order.
                            </p>
                        </div>
                    )}

                    {active.length === 0 ? (
                        <div className="p-4">
                            <EmptyState
                                title="No active queue"
                                description="Add a bus to start dispatching. The next bus promoted will be notified to its driver."
                            />
                        </div>
                    ) : visibleEntries.length === 0 ? (
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
                                    <TableHead>Position</TableHead>
                                    <TableHead>Bus</TableHead>
                                    <TableHead>Route</TableHead>
                                    <TableHead>Driver</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Notified</TableHead>
                                    <TableHead>Ack'd</TableHead>
                                    <TableHead>Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {visibleEntries.map((entry) => {
                                    const busy = processingId === entry.id;
                                    const isFirstReady =
                                        firstReadyId !== null &&
                                        entry.id === firstReadyId;

                                    return (
                                        <TableRow
                                            key={entry.id}
                                            className={cn(
                                                isFirstReady && 'bg-primary/5',
                                            )}
                                            data-test="queue-row"
                                            data-entry-id={entry.id}
                                        >
                                            <TableCell>
                                                <div className="flex items-center gap-1">
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="icon"
                                                        className="size-7"
                                                        disabled={
                                                            busy ||
                                                            filtersActive ||
                                                            entry.queue_position <=
                                                                1
                                                        }
                                                        onClick={() =>
                                                            handleMove(
                                                                entry,
                                                                -1,
                                                            )
                                                        }
                                                        aria-label="Move up"
                                                        title={
                                                            filtersActive
                                                                ? 'Clear filters to reorder'
                                                                : 'Move up'
                                                        }
                                                        data-test="queue-row-move-up"
                                                    >
                                                        <ChevronUp className="size-4" />
                                                    </Button>
                                                    <span className="bg-muted text-muted-foreground inline-flex size-7 items-center justify-center rounded-full text-xs font-medium tabular-nums">
                                                        {entry.queue_position}
                                                    </span>
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="icon"
                                                        className="size-7"
                                                        disabled={
                                                            busy ||
                                                            filtersActive ||
                                                            entry.queue_position >=
                                                                active.length
                                                        }
                                                        onClick={() =>
                                                            handleMove(entry, 1)
                                                        }
                                                        aria-label="Move down"
                                                        title={
                                                            filtersActive
                                                                ? 'Clear filters to reorder'
                                                                : 'Move down'
                                                        }
                                                        data-test="queue-row-move-down"
                                                    >
                                                        <ChevronDown className="size-4" />
                                                    </Button>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-3">
                                                    <div className="bg-primary/10 text-primary-strong flex size-9 shrink-0 items-center justify-center rounded-lg">
                                                        <BusFront className="size-4" />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="truncate font-medium">
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
                                            <TableCell>
                                                {entry.route.name ? (
                                                    <div className="flex items-center gap-2">
                                                        <RouteIcon className="text-muted-foreground size-3.5 shrink-0" />
                                                        <div className="min-w-0">
                                                            <p className="truncate">
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
                                                {entry.driver.name ?? (
                                                    <span className="text-muted-foreground">
                                                        —
                                                    </span>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    <StatusBadge
                                                        status={entry.status}
                                                    />
                                                    {isFirstReady && (
                                                        <span className="text-primary-strong bg-primary/10 hidden rounded-full px-2 py-0.5 text-[11px] font-medium xl:inline">
                                                            Next to dispatch
                                                        </span>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell className="whitespace-nowrap">
                                                {formatTimestamp(
                                                    entry.notified_at,
                                                )}
                                            </TableCell>
                                            <TableCell className="whitespace-nowrap">
                                                {formatTimestamp(
                                                    entry.driver_acknowledged_at,
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    {entry.status !==
                                                        'departed' &&
                                                        entry.status !==
                                                            'skipped' && (
                                                            <Button
                                                                className="gap-1.5"
                                                                size="sm"
                                                                variant={
                                                                    entry.status ===
                                                                    'loading'
                                                                        ? 'destructive'
                                                                        : 'default'
                                                                }
                                                                disabled={busy}
                                                                onClick={() =>
                                                                    handlePrimary(
                                                                        entry,
                                                                    )
                                                                }
                                                                data-test="queue-row-primary"
                                                                aria-label={`${primaryLabel(entry)} ${(entry.bus_number ?? 'bus').toString()}`}
                                                            >
                                                                {busy ? (
                                                                    <Spinner className="size-3.5" />
                                                                ) : (
                                                                    primaryIcon(
                                                                        entry,
                                                                    )
                                                                )}
                                                                {primaryLabel(
                                                                    entry,
                                                                )}
                                                            </Button>
                                                        )}
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        disabled={busy}
                                                        className="text-destructive-strong hover:text-destructive-strong gap-1.5"
                                                        onClick={() =>
                                                            setConfirm({
                                                                type: 'skip',
                                                                entry,
                                                            })
                                                        }
                                                        data-test="queue-row-skip"
                                                        aria-label={`Skip ${entry.bus_number ?? 'bus'}`}
                                                    >
                                                        <SkipForward className="size-3.5" />
                                                        Skip
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    ) : (
                        <div
                            className="grid gap-3 p-3 sm:grid-cols-2 xl:grid-cols-3"
                            data-test="queue-cards"
                        >
                            {visibleEntries.map((entry) => {
                                const busy = processingId === entry.id;
                                const isFirstReady =
                                    firstReadyId !== null &&
                                    entry.id === firstReadyId;

                                return (
                                    <div
                                        key={entry.id}
                                        className={cn(
                                            'bg-card rounded-lg border p-3',
                                            isFirstReady &&
                                                'bg-primary/5 ring-primary/30 ring-1 ring-inset',
                                        )}
                                        data-test="queue-card"
                                        data-entry-id={entry.id}
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="flex items-center gap-1">
                                                <button
                                                    type="button"
                                                    className="text-muted-foreground hover:text-foreground disabled:opacity-40"
                                                    disabled={
                                                        busy ||
                                                        filtersActive ||
                                                        entry.queue_position <=
                                                            1
                                                    }
                                                    onClick={() =>
                                                        handleMove(entry, -1)
                                                    }
                                                    aria-label="Move up"
                                                    title={
                                                        filtersActive
                                                            ? 'Clear filters to reorder'
                                                            : 'Move up'
                                                    }
                                                    data-test="queue-card-move-up"
                                                >
                                                    <ChevronUp className="size-3.5" />
                                                </button>
                                                <span className="bg-muted text-muted-foreground inline-flex size-6 items-center justify-center rounded-full text-xs font-medium tabular-nums">
                                                    {entry.queue_position}
                                                </span>
                                                <button
                                                    type="button"
                                                    className="text-muted-foreground hover:text-foreground disabled:opacity-40"
                                                    disabled={
                                                        busy ||
                                                        filtersActive ||
                                                        entry.queue_position >=
                                                            active.length
                                                    }
                                                    onClick={() =>
                                                        handleMove(entry, 1)
                                                    }
                                                    aria-label="Move down"
                                                    title={
                                                        filtersActive
                                                            ? 'Clear filters to reorder'
                                                            : 'Move down'
                                                    }
                                                    data-test="queue-card-move-down"
                                                >
                                                    <ChevronDown className="size-3.5" />
                                                </button>
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                                {isFirstReady && (
                                                    <span className="text-primary-strong bg-primary/10 rounded-full px-2 py-0.5 text-[11px] font-medium">
                                                        Next to dispatch
                                                    </span>
                                                )}
                                                <StatusBadge
                                                    status={entry.status}
                                                />
                                            </div>
                                        </div>

                                        <div className="mt-2 flex items-center gap-2">
                                            <div className="bg-primary/10 text-primary-strong flex size-8 shrink-0 items-center justify-center rounded-lg">
                                                <BusFront className="size-4" />
                                            </div>
                                            <div className="min-w-0">
                                                <p className="truncate text-sm font-semibold">
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
                                                label="Route"
                                                value={
                                                    entry.route.name ??
                                                    'No route assigned'
                                                }
                                            />
                                            <DetailRow
                                                label="Driver"
                                                value={
                                                    entry.driver.name ??
                                                    'No driver assigned'
                                                }
                                            />
                                            <DetailRow
                                                label="Notified"
                                                value={formatTimestamp(
                                                    entry.notified_at,
                                                )}
                                            />
                                            <DetailRow
                                                label="Ack'd"
                                                value={formatTimestamp(
                                                    entry.driver_acknowledged_at,
                                                )}
                                            />
                                        </div>

                                        <div className="mt-2 flex items-center gap-2 border-t pt-2">
                                            {entry.status !== 'departed' &&
                                                entry.status !== 'skipped' && (
                                                    <Button
                                                        className="flex-1 gap-1.5"
                                                        size="sm"
                                                        variant={
                                                            entry.status ===
                                                            'loading'
                                                                ? 'destructive'
                                                                : 'default'
                                                        }
                                                        disabled={busy}
                                                        onClick={() =>
                                                            handlePrimary(entry)
                                                        }
                                                        data-test="queue-card-primary"
                                                        aria-label={`${primaryLabel(entry)} ${(entry.bus_number ?? 'bus').toString()}`}
                                                    >
                                                        {busy ? (
                                                            <Spinner className="size-3.5" />
                                                        ) : (
                                                            primaryIcon(entry)
                                                        )}
                                                        {primaryLabel(entry)}
                                                    </Button>
                                                )}
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                disabled={busy}
                                                className="text-destructive-strong hover:text-destructive-strong gap-1.5"
                                                onClick={() =>
                                                    setConfirm({
                                                        type: 'skip',
                                                        entry,
                                                    })
                                                }
                                                data-test="queue-card-skip"
                                                aria-label={`Skip ${entry.bus_number ?? 'bus'}`}
                                            >
                                                <SkipForward className="size-3.5" />
                                                Skip
                                            </Button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                <div className="overflow-hidden rounded-lg border">
                    <div className="bg-muted/50 border-b px-4 py-2">
                        <h2 className="text-sm font-medium">
                            Departed &amp; Skipped ({historical.length}, latest
                            20)
                        </h2>
                    </div>
                    {historical.length === 0 ? (
                        <div className="p-4">
                            <EmptyState
                                title="No departures yet"
                                description="Completed and skipped dispatches will appear here."
                            />
                        </div>
                    ) : (
                        <Table data-test="queue-history-table">
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Bus</TableHead>
                                    <TableHead>Route</TableHead>
                                    <TableHead>Driver</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Departed</TableHead>
                                    <TableHead>Created</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {historical.map((entry) => (
                                    <TableRow
                                        key={entry.id}
                                        data-test="queue-history-row"
                                        data-entry-id={entry.id}
                                    >
                                        <TableCell>
                                            <div className="flex items-center gap-3">
                                                <div className="bg-primary/10 text-primary-strong flex size-9 shrink-0 items-center justify-center rounded-lg">
                                                    <BusFront className="size-4" />
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="truncate font-medium">
                                                        {entry.bus_number ??
                                                            '—'}
                                                    </p>
                                                    <p className="text-muted-foreground truncate text-xs">
                                                        {entry.bus
                                                            .plate_number ?? ''}
                                                    </p>
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            {entry.route.name ? (
                                                <div className="flex items-center gap-2">
                                                    <RouteIcon className="text-muted-foreground size-3.5 shrink-0" />
                                                    <span>
                                                        {entry.route.name}
                                                    </span>
                                                </div>
                                            ) : (
                                                <span className="text-muted-foreground">
                                                    —
                                                </span>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            {entry.driver.name ?? (
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
                                            {formatTimestamp(entry.departed_at)}
                                        </TableCell>
                                        <TableCell className="whitespace-nowrap">
                                            {formatTimestamp(entry.created_at)}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </div>
            </div>

            <Dialog open={addOpen} onOpenChange={setAddOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Add Bus to Queue</DialogTitle>
                        <DialogDescription>
                            Select a bus that is ready to be dispatched. Only
                            active buses with a driver and route assigned are
                            listed.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="add-bus">Bus</Label>
                            <Select
                                value={selectedBusId}
                                onValueChange={(value) => {
                                    setSelectedBusId(value);
                                    setFormErrors((prev) => ({
                                        ...prev,
                                        bus_id: '',
                                    }));
                                }}
                            >
                                <SelectTrigger id="add-bus" className="w-full">
                                    <SelectValue placeholder="Select a bus to add" />
                                </SelectTrigger>
                                <SelectContent>
                                    {availableBuses.map((bus) => (
                                        <SelectItem
                                            key={bus.id}
                                            value={String(bus.id)}
                                        >
                                            {bus.bus_number} · {bus.route_name}{' '}
                                            · {bus.driver_name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {availableBuses.length === 0 && (
                                <p className="text-muted-foreground text-xs">
                                    No buses are currently available to add.
                                </p>
                            )}
                            {formErrors.bus_id && (
                                <InputError message={formErrors.bus_id} />
                            )}
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="add-position">
                                Position (optional)
                            </Label>
                            <Input
                                id="add-position"
                                type="number"
                                min={1}
                                value={position}
                                onChange={(event) => {
                                    const value = event.target.value.replace(
                                        /[^0-9]/g,
                                        '',
                                    );
                                    setPosition(value);
                                    setFormErrors((prev) => ({
                                        ...prev,
                                        position: '',
                                    }));
                                }}
                                placeholder="Append to end of queue"
                            />
                            {formErrors.position && (
                                <InputError message={formErrors.position} />
                            )}
                        </div>
                    </div>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setAddOpen(false)}
                            disabled={submitting}
                            data-test="queue-add-cancel"
                        >
                            Cancel
                        </Button>
                        <Button
                            className="gap-2"
                            onClick={handleAddBus}
                            disabled={submitting || selectedBusId === ''}
                            data-test="queue-add-submit"
                        >
                            {submitting ? (
                                <Spinner className="size-4" />
                            ) : (
                                <Plus className="size-4" />
                            )}
                            Add Bus
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog
                open={confirm !== null}
                onOpenChange={(open) => !open && setConfirm(null)}
            >
                <DialogContent
                    data-test="queue-confirm-dialog"
                    data-confirm-type={confirm?.type ?? undefined}
                >
                    <DialogHeader>
                        <DialogTitle>
                            {confirm?.type === 'depart' ? (
                                <>Dispatch Bus {confirmBusLabel}?</>
                            ) : (
                                <>Skip {confirmBusLabel}?</>
                            )}
                        </DialogTitle>
                        <DialogDescription>
                            {confirm?.type === 'depart' ? (
                                <>
                                    Bus {confirmBusLabel} on route{' '}
                                    {confirmRouteLabel} will be marked as
                                    departed and the next queued bus will be
                                    promoted.
                                </>
                            ) : (
                                <>
                                    Bus {confirmBusLabel} on route{' '}
                                    {confirmRouteLabel} will be marked as
                                    skipped and the next queued bus will be
                                    promoted.
                                </>
                            )}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setConfirm(null)}
                            disabled={processingId !== null}
                            data-test="queue-confirm-cancel"
                        >
                            Cancel
                        </Button>
                        <Button
                            variant={
                                confirm?.type === 'depart'
                                    ? 'destructive'
                                    : 'outline'
                            }
                            className={
                                confirm?.type === 'skip'
                                    ? 'border-destructive text-destructive-strong hover:bg-destructive hover:text-destructive-foreground'
                                    : undefined
                            }
                            disabled={processingId !== null}
                            onClick={runConfirmed}
                            data-test={
                                confirm?.type === 'depart'
                                    ? 'queue-confirm-dispatch'
                                    : 'queue-confirm-skip'
                            }
                        >
                            {processingId !== null ? (
                                <Spinner className="size-4" />
                            ) : null}
                            {confirm?.type === 'depart'
                                ? 'Dispatch Bus'
                                : 'Skip Bus'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </OperatorSidebarLayout>
    );
}
