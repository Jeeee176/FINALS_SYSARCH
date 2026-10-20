import { Head, router } from '@inertiajs/react';
import {
    Activity,
    Bus,
    BusFront,
    CalendarRange,
    ChevronLeft,
    ChevronRight,
    CircleAlert,
    CircleCheck,
    Clock,
    FileDown,
    FileText,
    Gauge,
    LoaderCircle,
    MapPin,
    Navigation,
    Printer,
    Route,
    TriangleAlert,
    UserCog,
    Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import AppSidebarLayout from '@/layouts/app/app-sidebar-layout';
import {
    LocationHistorySection,
} from '@/components/location-history-section';
import type {
    HistoryBus,
    LocationHistoryPrintSnapshot,
} from '@/components/location-history-section';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';

// ── Types ──────────────────────────────────────────────────────────────

type FleetSummary = {
    total_buses: number;
    active_buses: number;
    inactive_buses: number;
    assigned_buses: number;
    unassigned_buses: number;
};

type DriverSummary = {
    total_drivers: number;
    active_drivers: number;
    inactive_drivers: number;
    assigned_drivers: number;
    unassigned_drivers: number;
};

type OperatorSummary = {
    total_operators: number;
    active_operators: number;
    inactive_operators: number;
};

type BusesByRouteItem = {
    name: string;
    buses_count: number;
    origin: string;
    destination: string;
    status: string;
};

type RouteSummary = {
    total_routes: number;
    active_routes: number;
    inactive_routes: number;
    buses_by_route: BusesByRouteItem[] | Record<string, BusesByRouteItem>;
};

type LocationsByBusItem = {
    bus_id: number;
    bus_number: string;
    plate_number: string;
    records: number;
    latest: string | null;
};

type GpsSummary = {
    total_location_records: number;
    tracked_buses_count: number;
    untracked_buses_count: number;
    latest_recorded_at: string | null;
    locations_by_bus: LocationsByBusItem[];
};

type DriverInfo = {
    id: number;
    name: string;
    email: string;
    license_number: string | null;
    phone: string | null;
    status: string;
} | null;

type RouteInfo = {
    id: number;
    name: string;
    origin: string;
    destination: string;
    status: string;
} | null;

type BusAssignment = {
    id: number;
    bus_number: string;
    plate_number: string;
    model: string | null;
    capacity: number | null;
    status: string;
    assigned_driver: DriverInfo;
    assigned_route: RouteInfo;
    has_driver: boolean;
    has_route: boolean;
};

export type ReportFilters = {
    period: 'weekly' | 'monthly' | 'yearly' | 'custom';
    category: 'overview' | 'trips' | 'gps' | 'delays';
    from: string | null;
    to: string | null;
};

type Analytics = {
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

type ChartPoint = {
    key: string;
    label: string;
    value: number;
};

type DelayChartPoint = {
    key: string;
    label: string;
    delays: number;
    incidents: number;
};

type StatusChartPoint = {
    status: string;
    label: string;
    value: number;
};

type Charts = {
    granularity: 'day' | 'week' | 'month';
    trips: ChartPoint[];
    delays: DelayChartPoint[];
    statuses: StatusChartPoint[];
};

type TripDelay = {
    reason: string;
    is_incident: boolean;
    count: number;
};

type TripRow = {
    id: number;
    bus_number: string | null;
    plate_number: string | null;
    driver_name: string | null;
    route_name: string | null;
    route_origin: string | null;
    route_destination: string | null;
    status: string;
    status_label: string;
    started_at: string | null;
    ended_at: string | null;
    delays: TripDelay[];
};

type DelayRow = {
    id: number;
    reported_at: string | null;
    reason: string;
    is_incident: boolean;
    type_label: string;
    status: string;
    status_label: string;
    details: string | null;
    bus_number: string | null;
    plate_number: string | null;
    driver_name: string | null;
    trip_id: number | null;
};

type Paginated<T> = {
    data: T[];
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
    from: number | null;
    to: number | null;
};

type Props = {
    fleetSummary: FleetSummary;
    driverSummary: DriverSummary;
    operatorSummary: OperatorSummary;
    routeSummary: RouteSummary;
    gpsSummary: GpsSummary;
    busAssignmentReport: BusAssignment[];
    buses: HistoryBus[];
    filters: ReportFilters;
    analytics: Analytics;
    charts: Charts;
    trips: Paginated<TripRow> | null;
    delayIncidents: Paginated<DelayRow> | null;
    filterError: string | null;
};

// ── Constants and helpers ──────────────────────────────────────────────

const PERIOD_OPTIONS: Array<{ value: ReportFilters['period']; label: string }> =
    [
        { value: 'weekly', label: 'Weekly' },
        { value: 'monthly', label: 'Monthly' },
        { value: 'yearly', label: 'Yearly' },
        { value: 'custom', label: 'Custom Range' },
    ];

const CATEGORY_OPTIONS: Array<{
    value: ReportFilters['category'];
    label: string;
}> = [
    { value: 'overview', label: 'Operations Overview' },
    { value: 'trips', label: 'Trip Performance' },
    { value: 'gps', label: 'GPS Location History' },
    { value: 'delays', label: 'Delays & Incidents' },
];

const CATEGORY_LABELS: Record<ReportFilters['category'], string> = {
    overview: 'Operations Overview',
    trips: 'Trip Performance',
    gps: 'GPS Location History',
    delays: 'Delays & Incidents',
};

const PERIOD_LABELS: Record<ReportFilters['period'], string> = {
    weekly: 'Weekly',
    monthly: 'Monthly',
    yearly: 'Yearly',
    custom: 'Custom Range',
};

const PRINT_CSS = `
@page { margin: 12mm; }
@media print {
  body.report-print-open > *:not(#report-print-root) { display: none !important; }
  body.report-print-open #report-print-root {
    position: static !important;
    inset: auto !important;
    overflow: visible !important;
    background: #ffffff !important;
    color: #171717 !important;
  }
  .print-hide { display: none !important; }
  .print-avoid-break { break-inside: avoid; }
  .print-color { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
`;

type PdfSaveFileHandle = {
    createWritable: () => Promise<{
        write: (data: Blob) => Promise<void>;
        close: () => Promise<void>;
    }>;
};

type SaveFilePickerWindow = Window & {
    showSaveFilePicker?: (options: {
        suggestedName: string;
        types: {
            description: string;
            accept: Record<string, string[]>;
        }[];
    }) => Promise<PdfSaveFileHandle>;
};

function isAbortError(error: unknown): boolean {
    return error instanceof DOMException && error.name === 'AbortError';
}

function formatDateTime(value: string | null): string {
    if (!value) {
        return '-';
    }

    const iso = new Date(value);

    if (Number.isNaN(iso.getTime())) {
        return value;
    }

    return iso.toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });
}

function tzOffsetMinutes(): string {
    return String(-new Date().getTimezoneOffset());
}

function presetRange(
    period: 'weekly' | 'monthly' | 'yearly',
): { from: string; to: string } {
    const now = new Date();
    const start = new Date(now);

    if (period === 'weekly') {
        const dayOfWeek = (now.getDay() + 6) % 7;
        start.setDate(now.getDate() - dayOfWeek);
    } else if (period === 'monthly') {
        start.setDate(1);
    } else {
        start.setMonth(0, 1);
    }

    start.setHours(0, 0, 0, 0);

    const end = new Date(now);
    end.setHours(23, 59, 59, 999);

    return { from: start.toISOString(), to: end.toISOString() };
}

function parseLocalDateInput(value: string): Date | null {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);

    if (!match) {
        return null;
    }

    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function toLocalDateInputValue(value: string | null): string {
    if (!value) {
        return '';
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return '';
    }

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
}

function formatRangeLabel(from: string | null, to: string | null): string {
    if (!from || !to) {
        return 'No range applied';
    }

    const start = new Date(from);
    const end = new Date(to);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        return 'No range applied';
    }

    const dateFormat: Intl.DateTimeFormatOptions = {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    };

    const startLabel = start.toLocaleDateString(undefined, dateFormat);
    const endLabel = end.toLocaleDateString(undefined, dateFormat);

    return `${startLabel} 12:00 AM – ${endLabel} 11:59 PM`;
}

function tripStatusBadgeClass(status: string): string {
    switch (status) {
        case 'completed':
            return 'bg-success text-success-foreground';
        case 'in_transit':
            return 'bg-primary text-primary-foreground';
        default:
            return 'bg-muted text-muted-foreground';
    }
}

function tripStatusHex(status: string): string {
    switch (status) {
        case 'completed':
            return '#16A34A';
        case 'in_transit':
            return '#D63635';
        case 'cancelled':
            return '#71717A';
        default:
            return '#A1A1AA';
    }
}

function statusChartHex(status: string): string {
    switch (status) {
        case 'completed':
            return '#16A34A';
        case 'in_transit':
            return '#D63635';
        case 'cancelled':
            return '#71717A';
        default:
            return '#A1A1AA';
    }
}

// ── Small shared components ────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
    const isActive = status === 'active';
    return (
        <Badge
            variant="default"
            className={cn(
                isActive
                    ? 'bg-success text-success-foreground'
                    : 'bg-muted text-muted-foreground',
            )}
        >
            {isActive ? 'Active' : 'Inactive'}
        </Badge>
    );
}

function TripStatusBadge({ status, label }: { status: string; label: string }) {
    return (
        <Badge variant="default" className={tripStatusBadgeClass(status)}>
            {label}
        </Badge>
    );
}

function MetricRow({
    label,
    value,
    accent = false,
}: {
    label: string;
    value: string | number;
    accent?: boolean;
}) {
    return (
        <div className="flex items-center justify-between gap-3 py-2.5 text-sm">
            <span className="text-muted-foreground">{label}</span>
            <span
                className={cn(
                    'font-medium tabular-nums',
                    accent && 'text-primary-strong',
                )}
            >
                {value}
            </span>
        </div>
    );
}

function SummaryCard({
    icon: Icon,
    title,
    description,
    rows,
}: {
    icon: LucideIcon;
    title: string;
    description?: string;
    rows: Array<{ label: string; value: string | number; accent?: boolean }>;
}) {
    return (
        <Card className="min-w-0">
            <CardHeader>
                <div className="flex items-center gap-3">
                    <div className="bg-primary/10 text-primary-strong flex size-9 shrink-0 items-center justify-center rounded-lg">
                        <Icon className="size-5" />
                    </div>
                    <div className="min-w-0">
                        <CardTitle>{title}</CardTitle>
                        {description && (
                            <CardDescription className="truncate">
                                {description}
                            </CardDescription>
                        )}
                    </div>
                </div>
            </CardHeader>
            <CardContent className="pt-0">
                <div className="divide-y">
                    {rows.map((row) => (
                        <MetricRow key={row.label} {...row} />
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}

function StatCard({
    icon: Icon,
    label,
    value,
    hint,
}: {
    icon: LucideIcon;
    label: string;
    value: number;
    hint?: string;
}) {
    return (
        <Card className="min-w-0 print-avoid-break">
            <CardContent className="flex items-center gap-3 pt-6">
                <div className="bg-primary/10 text-primary-strong flex size-10 shrink-0 items-center justify-center rounded-lg">
                    <Icon className="size-5" />
                </div>
                <div className="min-w-0">
                    <p className="text-muted-foreground truncate text-xs font-medium tracking-wide uppercase">
                        {label}
                    </p>
                    <p className="text-2xl font-semibold tabular-nums">
                        {value.toLocaleString()}
                    </p>
                    {hint && (
                        <p className="text-muted-foreground truncate text-xs">
                            {hint}
                        </p>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}

function ReportTableEmptyState({
    icon: Icon,
    title,
    description,
}: {
    icon: LucideIcon;
    title: string;
    description?: string;
}) {
    return (
        <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
            <div className="bg-muted text-muted-foreground flex size-10 items-center justify-center rounded-full">
                <Icon className="size-5" />
            </div>
            <p className="text-muted-foreground mt-3 text-sm">{title}</p>
            {description && (
                <p className="text-muted-foreground mt-1 max-w-sm text-sm">
                    {description}
                </p>
            )}
        </div>
    );
}

function PaginationBar({
    page,
    lastPage,
    total,
    from,
    to,
    onPage,
}: {
    page: number;
    lastPage: number;
    total: number;
    from: number | null;
    to: number | null;
    onPage: (page: number) => void;
}) {
    if (lastPage <= 1) {
        return (
            <div className="text-muted-foreground border-t px-4 py-3 text-sm print-hide">
                {total.toLocaleString()} record{total === 1 ? '' : 's'}
            </div>
        );
    }

    return (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 print-hide">
            <p className="text-muted-foreground text-sm">
                Showing {from ?? 0}–{to ?? 0} of {total.toLocaleString()}{' '}
                records · Page {page} of {lastPage}
            </p>
            <div className="flex gap-2">
                <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => onPage(page - 1)}
                >
                    <ChevronLeft className="size-4" />
                    Previous
                </Button>
                <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= lastPage}
                    onClick={() => onPage(page + 1)}
                >
                    Next
                    <ChevronRight className="size-4" />
                </Button>
            </div>
        </div>
    );
}

// ── Chart bodies (explicit colors so they print and render consistently) ──

function BarChartBody({
    points,
    barClass = 'bg-[#D63635]',
    textClass = 'text-muted-foreground',
    height = 120,
}: {
    points: ChartPoint[];
    barClass?: string;
    textClass?: string;
    height?: number;
}) {
    const max = Math.max(1, ...points.map((point) => point.value));
    const every = Math.max(1, Math.ceil(points.length / 14));

    if (points.length === 0) {
        return (
            <p className={cn('text-sm', textClass)}>
                No data for this period.
            </p>
        );
    }

    return (
        <div className="print-color flex items-end gap-1" style={{ minHeight: height + 44 }}>
            {points.map((point, index) => (
                <div
                    key={point.key}
                    className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1"
                    title={`${point.label}: ${point.value}`}
                >
                    <span
                        className={cn(
                            'text-[10px] leading-none tabular-nums',
                            textClass,
                        )}
                    >
                        {point.value > 0 ? point.value : ''}
                    </span>
                    <div
                        className={cn('w-full rounded-t-sm', barClass)}
                        style={{
                            height:
                                point.value === 0
                                    ? 2
                                    : Math.max(
                                          6,
                                          Math.round(
                                              (point.value / max) * height,
                                          ),
                                      ),
                        }}
                    />
                    <span
                        className={cn(
                            'h-8 w-full overflow-hidden text-center text-[10px] leading-tight',
                            textClass,
                        )}
                    >
                        {index % every === 0 ? point.label : ''}
                    </span>
                </div>
            ))}
        </div>
    );
}

function StackedDelayChartBody({
    points,
    textClass = 'text-muted-foreground',
    height = 120,
}: {
    points: DelayChartPoint[];
    textClass?: string;
    height?: number;
}) {
    const max = Math.max(
        1,
        ...points.map((point) => point.delays + point.incidents),
    );
    const every = Math.max(1, Math.ceil(points.length / 14));

    if (points.length === 0) {
        return (
            <p className={cn('text-sm', textClass)}>
                No data for this period.
            </p>
        );
    }

    return (
        <div className="print-color flex items-end gap-1" style={{ minHeight: height + 44 }}>
            {points.map((point, index) => {
                const total = point.delays + point.incidents;
                const totalHeight =
                    total === 0
                        ? 2
                        : Math.max(6, Math.round((total / max) * height));
                const incidentHeight =
                    total === 0
                        ? 0
                        : Math.round(
                              (point.incidents / total) * totalHeight,
                          );

                return (
                    <div
                        key={point.key}
                        className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1"
                        title={`${point.label}: ${point.delays} delay, ${point.incidents} incident`}
                    >
                        <span
                            className={cn(
                                'text-[10px] leading-none tabular-nums',
                                textClass,
                            )}
                        >
                            {total > 0 ? total : ''}
                        </span>
                        <div
                            className="flex w-full flex-col overflow-hidden rounded-t-sm"
                            style={{ height: totalHeight }}
                        >
                            <div
                                className="w-full bg-[#D63635]"
                                style={{ height: incidentHeight }}
                            />
                            <div className="bg-[#D63635]/40 w-full flex-1" />
                        </div>
                        <span
                            className={cn(
                                'h-8 w-full overflow-hidden text-center text-[10px] leading-tight',
                                textClass,
                            )}
                        >
                            {index % every === 0 ? point.label : ''}
                        </span>
                    </div>
                );
            })}
        </div>
    );
}

function StatusBarsBody({
    statuses,
    textClass = 'text-muted-foreground',
}: {
    statuses: StatusChartPoint[];
    textClass?: string;
}) {
    const max = Math.max(1, ...statuses.map((item) => item.value));

    if (statuses.length === 0) {
        return (
            <p className={cn('text-sm', textClass)}>
                No data for this period.
            </p>
        );
    }

    return (
        <div className="print-color flex flex-col gap-3">
            {statuses.map((item) => (
                <div key={item.status} className="flex flex-col gap-1">
                    <div className="flex items-center justify-between gap-3">
                        <span className="flex items-center gap-2 text-sm">
                            <span
                                className="size-2.5 rounded-full"
                                style={{
                                    backgroundColor: statusChartHex(item.status),
                                }}
                            />
                            {item.label}
                        </span>
                        <span
                            className={cn('text-sm tabular-nums', textClass)}
                        >
                            {item.value.toLocaleString()}
                        </span>
                    </div>
                    <div className="bg-muted h-2 w-full overflow-hidden rounded-full">
                        <div
                            className="h-full rounded-full"
                            style={{
                                width: `${Math.round((item.value / max) * 100)}%`,
                                backgroundColor: statusChartHex(item.status),
                            }}
                        />
                    </div>
                </div>
            ))}
        </div>
    );
}

function DelayLegend() {
    return (
        <div className="flex flex-wrap items-center gap-4 text-xs">
            <span className="flex items-center gap-1.5">
                <span className="bg-[#D63635] size-2.5 rounded-sm" />
                Incidents
            </span>
            <span className="flex items-center gap-1.5">
                <span className="bg-[#D63635]/40 size-2.5 rounded-sm" />
                Delays
            </span>
        </div>
    );
}

// ── Print preview ──────────────────────────────────────────────────────

type ReportPreviewProps = {
    category: ReportFilters['category'];
    periodLabel: string;
    rangeLabel: string;
    generatedAt: string;
    analytics: Analytics;
    charts: Charts;
    trips: Paginated<TripRow> | null;
    delayIncidents: Paginated<DelayRow> | null;
    gpsSnapshot: LocationHistoryPrintSnapshot | null;
    fleetSummary: FleetSummary;
    driverSummary: DriverSummary;
    operatorSummary: OperatorSummary;
};

function PreviewStat({
    label,
    value,
    hint,
}: {
    label: string;
    value: number;
    hint?: string;
}) {
    return (
        <div className="print-avoid-break rounded-lg border border-neutral-300 p-3">
            <p className="text-[10px] font-semibold tracking-wide text-neutral-500 uppercase">
                {label}
            </p>
            <p className="text-xl font-semibold text-neutral-900 tabular-nums">
                {value.toLocaleString()}
            </p>
            {hint && <p className="text-xs text-neutral-500">{hint}</p>}
        </div>
    );
}

function ReportPreview({
    category,
    periodLabel,
    rangeLabel,
    generatedAt,
    analytics,
    charts,
    trips,
    delayIncidents,
    gpsSnapshot,
    fleetSummary,
    driverSummary,
    operatorSummary,
}: ReportPreviewProps) {
    const heads = 'border-b border-neutral-300 px-2 py-1.5 text-left text-[10px] font-semibold tracking-wide text-neutral-500 uppercase';
    const cells = 'border-b border-neutral-200 px-2 py-1.5 align-top';

    return (
        <div
            id="report-pdf-content"
            className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-8 text-neutral-900"
        >
            <header className="print-avoid-break border-b-2 border-[#D63635] pb-4">
                <p className="text-xs font-semibold tracking-wide text-neutral-500 uppercase">
                    Bus Tracking and Fleet Management System
                </p>
                <h1 className="mt-1 text-2xl font-bold">Reports &amp; Analytics</h1>
                <div className="mt-2 grid gap-1 text-sm text-neutral-600 sm:grid-cols-2">
                    <p>
                        <span className="font-semibold text-neutral-800">
                            Category:
                        </span>{' '}
                        {CATEGORY_LABELS[category]}
                    </p>
                    <p>
                        <span className="font-semibold text-neutral-800">
                            Period:
                        </span>{' '}
                        {periodLabel}
                    </p>
                    <p className="sm:col-span-2">
                        <span className="font-semibold text-neutral-800">
                            Date range:
                        </span>{' '}
                        {rangeLabel} (local time)
                    </p>
                    <p className="sm:col-span-2">
                        <span className="font-semibold text-neutral-800">
                            Generated:
                        </span>{' '}
                        {generatedAt}
                    </p>
                </div>
            </header>

            <section className="print-avoid-break">
                <h2 className="mb-2 text-sm font-bold tracking-wide text-neutral-700 uppercase">
                    Summary statistics
                </h2>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <PreviewStat label="Total Trips" value={analytics.total_trips} />
                    <PreviewStat
                        label="Completed Trips"
                        value={analytics.completed_trips}
                    />
                    <PreviewStat
                        label="In Transit"
                        value={analytics.in_transit_trips}
                    />
                    <PreviewStat
                        label="Cancelled Trips"
                        value={analytics.cancelled_trips}
                    />
                    <PreviewStat
                        label="Delayed Trips"
                        value={analytics.delayed_trips}
                        hint={`${analytics.delay_reports.toLocaleString()} delay reports`}
                    />
                    <PreviewStat
                        label="Incidents"
                        value={analytics.incidents}
                    />
                    <PreviewStat
                        label="GPS Records"
                        value={analytics.gps_records}
                    />
                    <PreviewStat
                        label="Buses w/ GPS Activity"
                        value={analytics.gps_active_buses}
                    />
                </div>
            </section>

            <section className="print-avoid-break flex flex-col gap-4">
                <h2 className="text-sm font-bold tracking-wide text-neutral-700 uppercase">
                    Charts
                </h2>
                <div>
                    <p className="mb-1 text-xs font-semibold text-neutral-600">
                        Trips over time ({charts.granularity}ly buckets)
                    </p>
                    <BarChartBody
                        points={charts.trips}
                        textClass="text-neutral-500"
                        height={90}
                    />
                </div>
                <div className="grid gap-6 sm:grid-cols-2">
                    <div>
                        <p className="mb-1 text-xs font-semibold text-neutral-600">
                            Trip status distribution
                        </p>
                        <StatusBarsBody
                            statuses={charts.statuses}
                            textClass="text-neutral-500"
                        />
                    </div>
                    <div>
                        <p className="mb-1 text-xs font-semibold text-neutral-600">
                            Delays &amp; incidents over time
                        </p>
                        <StackedDelayChartBody
                            points={charts.delays}
                            textClass="text-neutral-500"
                            height={90}
                        />
                        <div className="mt-2">
                            <DelayLegend />
                        </div>
                    </div>
                </div>
            </section>

            {category === 'trips' && (
                <section>
                    <h2 className="mb-2 text-sm font-bold tracking-wide text-neutral-700 uppercase">
                        Trip performance records
                    </h2>
                    {trips && trips.data.length > 0 ? (
                        <>
                            <table className="w-full border-collapse text-xs">
                                <thead>
                                    <tr>
                                        <th className={heads}>Trip</th>
                                        <th className={heads}>Bus</th>
                                        <th className={heads}>Driver</th>
                                        <th className={heads}>Route</th>
                                        <th className={heads}>Started</th>
                                        <th className={heads}>Ended</th>
                                        <th className={heads}>Status</th>
                                        <th className={heads}>Delays</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {trips.data.map((trip) => (
                                        <tr
                                            key={trip.id}
                                            className="print-avoid-break"
                                        >
                                            <td className={cells}>
                                                #{trip.id}
                                            </td>
                                            <td className={cells}>
                                                {trip.bus_number ?? '-'}
                                            </td>
                                            <td className={cells}>
                                                {trip.driver_name ?? '-'}
                                            </td>
                                            <td className={cells}>
                                                {trip.route_name ?? '-'}
                                            </td>
                                            <td className={cells}>
                                                {formatDateTime(
                                                    trip.started_at,
                                                )}
                                            </td>
                                            <td className={cells}>
                                                {formatDateTime(trip.ended_at)}
                                            </td>
                                            <td className={cells}>
                                                {trip.status_label}
                                            </td>
                                            <td className={cells}>
                                                {trip.delays.length === 0
                                                    ? '-'
                                                    : trip.delays
                                                          .map(
                                                              (delay) =>
                                                                  `${delay.reason} ×${delay.count}`,
                                                          )
                                                          .join(', ')}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            <p className="mt-2 text-xs text-neutral-500">
                                Showing records {trips.from ?? 0}–{trips.to ?? 0}{' '}
                                of {trips.total.toLocaleString()} for the
                                selected period (page {trips.current_page} of{' '}
                                {trips.last_page}).
                            </p>
                        </>
                    ) : (
                        <p className="text-sm text-neutral-500">
                            No trip records found for the selected period.
                        </p>
                    )}
                </section>
            )}

            {category === 'delays' && (
                <section>
                    <h2 className="mb-2 text-sm font-bold tracking-wide text-neutral-700 uppercase">
                        Delay &amp; incident records
                    </h2>
                    {delayIncidents && delayIncidents.data.length > 0 ? (
                        <>
                            <table className="w-full border-collapse text-xs">
                                <thead>
                                    <tr>
                                        <th className={heads}>Reported</th>
                                        <th className={heads}>Type</th>
                                        <th className={heads}>Reason</th>
                                        <th className={heads}>Bus</th>
                                        <th className={heads}>Driver</th>
                                        <th className={heads}>Trip</th>
                                        <th className={heads}>Status</th>
                                        <th className={heads}>Details</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {delayIncidents.data.map((incident) => (
                                        <tr
                                            key={incident.id}
                                            className="print-avoid-break"
                                        >
                                            <td className={cells}>
                                                {formatDateTime(
                                                    incident.reported_at,
                                                )}
                                            </td>
                                            <td className={cells}>
                                                {incident.type_label}
                                            </td>
                                            <td className={cells}>
                                                {incident.reason}
                                            </td>
                                            <td className={cells}>
                                                {incident.bus_number ?? '-'}
                                            </td>
                                            <td className={cells}>
                                                {incident.driver_name ?? '-'}
                                            </td>
                                            <td className={cells}>
                                                {incident.trip_id
                                                    ? `#${incident.trip_id}`
                                                    : '-'}
                                            </td>
                                            <td className={cells}>
                                                {incident.status_label}
                                            </td>
                                            <td className={cells}>
                                                {incident.details ?? '-'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            <p className="mt-2 text-xs text-neutral-500">
                                Showing records{' '}
                                {delayIncidents.from ?? 0}–
                                {delayIncidents.to ?? 0} of{' '}
                                {delayIncidents.total.toLocaleString()} for the
                                selected period (page{' '}
                                {delayIncidents.current_page} of{' '}
                                {delayIncidents.last_page}).
                            </p>
                        </>
                    ) : (
                        <p className="text-sm text-neutral-500">
                            No delay or incident records found for the selected
                            period.
                        </p>
                    )}
                </section>
            )}

            {category === 'gps' && (
                <section>
                    <h2 className="mb-2 text-sm font-bold tracking-wide text-neutral-700 uppercase">
                        GPS location records
                    </h2>
                    {gpsSnapshot ? (
                        <>
                            <p className="mb-2 text-xs text-neutral-600">
                                Bus {gpsSnapshot.bus.bus_number} (
                                {gpsSnapshot.bus.plate_number}) ·{' '}
                                {gpsSnapshot.startDate || 'start'} to{' '}
                                {gpsSnapshot.endDate || 'end'}
                            </p>
                            <table className="w-full border-collapse text-xs">
                                <thead>
                                    <tr>
                                        <th className={heads}>#</th>
                                        <th className={heads}>Date / Time</th>
                                        <th className={heads}>Latitude</th>
                                        <th className={heads}>Longitude</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {gpsSnapshot.locations.map(
                                        (location, index) => (
                                            <tr
                                                key={location.id}
                                                className="print-avoid-break"
                                            >
                                                <td className={cells}>
                                                    {index + 1}
                                                </td>
                                                <td className={cells}>
                                                    {formatDateTime(
                                                        location.recorded_at,
                                                    )}
                                                </td>
                                                <td className={cells}>
                                                    {location.latitude}
                                                </td>
                                                <td className={cells}>
                                                    {location.longitude}
                                                </td>
                                            </tr>
                                        ),
                                    )}
                                </tbody>
                            </table>
                            <p className="mt-2 text-xs text-neutral-500">
                                Showing {gpsSnapshot.locations.length} of{' '}
                                {gpsSnapshot.total.toLocaleString()} GPS records
                                loaded for this bus
                                {gpsSnapshot.hasMore
                                    ? ' — additional records are available via "Load more" on screen before printing.'
                                    : '.'}{' '}
                                The interactive map is available on screen.
                            </p>
                        </>
                    ) : (
                        <p className="text-sm text-neutral-500">
                            Select a bus and load its history on screen, then
                            choose "Print this bus history" to include the GPS
                            records in the exported report.
                        </p>
                    )}
                </section>
            )}

            {category === 'overview' && (
                <section className="print-avoid-break">
                    <h2 className="mb-2 text-sm font-bold tracking-wide text-neutral-700 uppercase">
                        Fleet &amp; assignment overview (current, all-time)
                    </h2>
                    <table className="w-full border-collapse text-xs">
                        <tbody>
                            <tr>
                                <td className={cells}>Total buses</td>
                                <td className={cells}>
                                    {fleetSummary.total_buses}
                                </td>
                                <td className={cells}>Active / Inactive</td>
                                <td className={cells}>
                                    {fleetSummary.active_buses} /{' '}
                                    {fleetSummary.inactive_buses}
                                </td>
                            </tr>
                            <tr>
                                <td className={cells}>Total drivers</td>
                                <td className={cells}>
                                    {driverSummary.total_drivers}
                                </td>
                                <td className={cells}>
                                    Assigned / Unassigned drivers
                                </td>
                                <td className={cells}>
                                    {driverSummary.assigned_drivers} /{' '}
                                    {driverSummary.unassigned_drivers}
                                </td>
                            </tr>
                            <tr>
                                <td className={cells}>Total operators</td>
                                <td className={cells}>
                                    {operatorSummary.total_operators}
                                </td>
                                <td className={cells}>
                                    Active operators
                                </td>
                                <td className={cells}>
                                    {operatorSummary.active_operators}
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </section>
            )}

            <footer className="border-t border-neutral-300 pt-3 text-xs text-neutral-500">
                Generated from live database records by the Reports &amp;
                Analytics module. All times shown in your local timezone.
            </footer>
        </div>
    );
}

// ── Main page ──────────────────────────────────────────────────────────

export default function AdminReportsPage({
    fleetSummary,
    driverSummary,
    operatorSummary,
    routeSummary,
    gpsSummary,
    busAssignmentReport,
    buses,
    filters,
    analytics,
    charts,
    trips,
    delayIncidents,
    filterError,
}: Props) {
    const [periodUI, setPeriodUI] = useState<ReportFilters['period']>(
        filters.period,
    );
    const [customFrom, setCustomFrom] = useState(() =>
        toLocalDateInputValue(filters.period === 'custom' ? filters.from : null),
    );
    const [customTo, setCustomTo] = useState(() =>
        toLocalDateInputValue(filters.period === 'custom' ? filters.to : null),
    );
    const [customError, setCustomError] = useState<string | null>(null);
    const [previewOpen, setPreviewOpen] = useState(false);
    const [gpsPrintSnapshot, setGpsPrintSnapshot] =
        useState<LocationHistoryPrintSnapshot | null>(null);
    const [pdfBusy, setPdfBusy] = useState(false);

    useEffect(() => {
        if (filters.from && filters.to) {
            return;
        }

        const effective =
            filters.period === 'custom' ? 'monthly' : filters.period;
        const range = presetRange(effective);

        router.get(
            '/admin/reports',
            {
                period: effective,
                category: filters.category,
                from: range.from,
                to: range.to,
                tz: tzOffsetMinutes(),
            },
            { preserveScroll: true, replace: true },
        );
        // Runs once on mount to normalize a missing/incomplete range.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        document.body.classList.toggle('report-print-open', previewOpen);

        return () => document.body.classList.remove('report-print-open');
    }, [previewOpen]);

    const go = (
        extra: Record<string, string | number> = {},
        options: { replace?: boolean } = {},
    ) => {
        const params: Record<string, string | number> = {
            period: filters.period,
            category: filters.category,
            tz: tzOffsetMinutes(),
        };

        if (filters.from) {
            params.from = filters.from;
        }

        if (filters.to) {
            params.to = filters.to;
        }

        router.get('/admin/reports', { ...params, ...extra }, {
            preserveScroll: true,
            replace: options.replace,
        });
    };

    const applyCategory = (category: string) => {
        go({ category });
    };

    const handlePeriodClick = (value: string) => {
        if (value !== 'weekly' && value !== 'monthly' && value !== 'yearly' && value !== 'custom') {
            return;
        }

        setPeriodUI(value);
        setCustomError(null);

        if (value === 'custom') {
            return;
        }

        const range = presetRange(value);
        go({ period: value, from: range.from, to: range.to });
    };

    const applyCustomRange = () => {
        if (!customFrom || !customTo) {
            setCustomError('Select both a start and end date.');
            return;
        }

        const from = parseLocalDateInput(customFrom);
        const to = parseLocalDateInput(customTo);

        if (!from || !to) {
            setCustomError('The selected dates are invalid.');
            return;
        }

        if (from.getTime() > to.getTime()) {
            setCustomError('The start date must be before the end date.');
            return;
        }

        from.setHours(0, 0, 0, 0);
        to.setHours(23, 59, 59, 999);
        setCustomError(null);

        go({
            period: 'custom',
            from: from.toISOString(),
            to: to.toISOString(),
        });
    };

    const applyPage = (page: number) => {
        go({ page });
    };

    const reportFileName = [
        'Reports-and-Analytics',
        filters.category,
        filters.from ? filters.from.slice(0, 10) : null,
        filters.to ? filters.to.slice(0, 10) : null,
    ]
        .filter(Boolean)
        .join('_');

    const invokePrint = () => {
        window.print();
    };

    const saveAsPdf = async () => {
        if (pdfBusy) {
            return;
        }

        const pdfFileName = `${reportFileName}.pdf`;
        const showSaveFilePicker = (window as SaveFilePickerWindow)
            .showSaveFilePicker;
        const pickerAvailable = typeof showSaveFilePicker === 'function';

        setPdfBusy(true);

        try {
            let fileHandle: PdfSaveFileHandle | null = null;

            if (showSaveFilePicker) {
                try {
                    fileHandle = await showSaveFilePicker.call(window, {
                        suggestedName: pdfFileName,
                        types: [
                            {
                                description: 'PDF document',
                                accept: { 'application/pdf': ['.pdf'] },
                            },
                        ],
                    });
                } catch (error) {
                    if (isAbortError(error)) {
                        return;
                    }

                    fileHandle = null;
                }
            }

            const element = document.getElementById('report-pdf-content');

            if (!element) {
                throw new Error('Report content is not available.');
            }

            const { default: html2pdf } = await import('html2pdf.js');

            const pdfOptions = {
                margin: [8, 8, 8, 8] as [number, number, number, number],
                filename: pdfFileName,
                image: { type: 'jpeg' as const, quality: 0.96 },
                html2canvas: {
                    scale: 2,
                    useCORS: true,
                    backgroundColor: '#ffffff',
                    logging: false,
                    windowWidth: 760,
                    ignoreElements: (target: Element) =>
                        target.classList.contains('print-hide'),
                    onclone: (clonedDocument: Document) => {
                        const clone = clonedDocument.getElementById(
                            'report-pdf-content',
                        );

                        if (clone) {
                            clone.style.width = '720px';
                            clone.style.maxWidth = 'none';
                            clone.style.margin = '0';
                        }
                    },
                },
                jsPDF: {
                    unit: 'mm',
                    format: 'a4',
                    orientation: 'portrait' as const,
                    compress: true,
                },
                pagebreak: {
                    mode: ['css', 'legacy'],
                    avoid: '.print-avoid-break',
                },
            };

            const blob = (await html2pdf()
                .set(pdfOptions)
                .from(element)
                .outputPdf('blob')) as Blob;

            if (!(blob instanceof Blob) || blob.size === 0) {
                throw new Error('The generated PDF is empty.');
            }

            if (fileHandle) {
                const writable = await fileHandle.createWritable();
                await writable.write(blob);
                await writable.close();
                toast.success(`Report saved as ${pdfFileName}.`);

                return;
            }

            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = pdfFileName;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.setTimeout(() => URL.revokeObjectURL(url), 1000);

            toast.info(
                pickerAvailable
                    ? `The save dialog could not be used, so the PDF was downloaded as ${pdfFileName} instead.`
                    : `This browser has no save dialog, so the PDF was downloaded as ${pdfFileName} instead.`,
            );
        } catch (error) {
            if (isAbortError(error)) {
                return;
            }

            console.error('Report PDF generation failed', error);
            toast.error(
                'The PDF report could not be created. Please try again.',
            );
        } finally {
            setPdfBusy(false);
        }
    };

    const busesByRoute: BusesByRouteItem[] = Array.isArray(
        routeSummary.buses_by_route,
    )
        ? routeSummary.buses_by_route
        : Object.values(routeSummary.buses_by_route);

    const rangeLabel = formatRangeLabel(filters.from, filters.to);
    const periodLabel = PERIOD_LABELS[filters.period];
    const categoryLabel = CATEGORY_LABELS[filters.category];
    const generatedAt = new Date().toLocaleString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });

    return (
        <AppSidebarLayout
            breadcrumbs={[
                {
                    title: 'Dashboard',
                    href: '/admin/dashboard',
                },
                {
                    title: 'Reports & Analytics',
                    href: '/admin/reports',
                },
            ]}
        >
            <Head title="Reports & Analytics" />
            <style>{PRINT_CSS}</style>

            <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-4">
                        <div className="bg-primary/10 text-primary-strong flex size-11 shrink-0 items-center justify-center rounded-xl">
                            <FileText className="size-6" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-semibold">
                                Reports &amp; Analytics
                            </h1>
                            <p className="text-muted-foreground">
                                Analytics, trip performance, GPS history and
                                delay/incident reports.
                            </p>
                        </div>
                    </div>
                    <Button
                        variant="outline"
                        onClick={() => setPreviewOpen(true)}
                    >
                        <Printer className="size-4" />
                        Open Print Preview
                    </Button>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-base">
                            <CalendarRange className="text-primary size-4 shrink-0" />
                            Report Filters
                        </CardTitle>
                        <CardDescription>
                            {categoryLabel} · {periodLabel} · {rangeLabel}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-4">
                        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-end">
                            <div className="flex flex-col gap-2">
                                <Label>Reporting Period</Label>
                                <ToggleGroup
                                    type="single"
                                    variant="outline"
                                    value={periodUI}
                                    onValueChange={handlePeriodClick}
                                    className="w-full"
                                >
                                    {PERIOD_OPTIONS.map((option) => (
                                        <ToggleGroupItem
                                            key={option.value}
                                            value={option.value}
                                            className="flex-1 text-xs sm:text-sm"
                                        >
                                            {option.label}
                                        </ToggleGroupItem>
                                    ))}
                                </ToggleGroup>
                            </div>

                            <div className="flex flex-col gap-2">
                                <Label htmlFor="report-category">
                                    Report Category
                                </Label>
                                <Select
                                    value={filters.category}
                                    onValueChange={applyCategory}
                                >
                                    <SelectTrigger
                                        id="report-category"
                                        className="w-full"
                                    >
                                        <SelectValue placeholder="Select a category..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {CATEGORY_OPTIONS.map((option) => (
                                            <SelectItem
                                                key={option.value}
                                                value={option.value}
                                            >
                                                {option.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        {periodUI === 'custom' && (
                            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
                                <div className="flex flex-col gap-2">
                                    <Label htmlFor="report-from">
                                        Start Date
                                    </Label>
                                    <Input
                                        id="report-from"
                                        type="date"
                                        value={customFrom}
                                        onChange={(e) =>
                                            setCustomFrom(e.target.value)
                                        }
                                    />
                                </div>
                                <div className="flex flex-col gap-2">
                                    <Label htmlFor="report-to">End Date</Label>
                                    <Input
                                        id="report-to"
                                        type="date"
                                        value={customTo}
                                        onChange={(e) =>
                                            setCustomTo(e.target.value)
                                        }
                                    />
                                </div>
                                <Button onClick={applyCustomRange}>
                                    Apply Range
                                </Button>
                            </div>
                        )}

                        {(customError || filterError) && (
                            <div className="border-destructive/50 bg-destructive/10 text-destructive-strong rounded-lg border p-3 text-sm">
                                {customError ?? filterError}
                            </div>
                        )}
                    </CardContent>
                </Card>

                {filters.category === 'overview' && (
                    <>
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                            <StatCard
                                icon={Route}
                                label="Total Trips"
                                value={analytics.total_trips}
                            />
                            <StatCard
                                icon={CircleCheck}
                                label="Completed Trips"
                                value={analytics.completed_trips}
                            />
                            <StatCard
                                icon={Navigation}
                                label="In Transit"
                                value={analytics.in_transit_trips}
                            />
                            <StatCard
                                icon={Clock}
                                label="Cancelled Trips"
                                value={analytics.cancelled_trips}
                            />
                            <StatCard
                                icon={TriangleAlert}
                                label="Delayed Trips"
                                value={analytics.delayed_trips}
                                hint={`${analytics.delay_reports.toLocaleString()} delay reports`}
                            />
                            <StatCard
                                icon={CircleAlert}
                                label="Incidents"
                                value={analytics.incidents}
                            />
                            <StatCard
                                icon={MapPin}
                                label="GPS Records"
                                value={analytics.gps_records}
                            />
                            <StatCard
                                icon={Gauge}
                                label="Buses w/ GPS Activity"
                                value={analytics.gps_active_buses}
                            />
                        </div>

                        <Card className="print-avoid-break">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2 text-base">
                                    <Activity className="text-primary size-4 shrink-0" />
                                    Trips Over Time
                                    <span className="text-muted-foreground ml-auto text-xs font-normal">
                                        {charts.granularity === 'day'
                                            ? 'Daily buckets'
                                            : charts.granularity === 'week'
                                              ? 'Weekly buckets'
                                              : 'Monthly buckets'}
                                    </span>
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <BarChartBody points={charts.trips} />
                            </CardContent>
                        </Card>

                        <div className="grid gap-4 lg:grid-cols-2">
                            <Card className="print-avoid-break">
                                <CardHeader>
                                    <CardTitle className="text-base">
                                        Trip Status Distribution
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <StatusBarsBody
                                        statuses={charts.statuses}
                                    />
                                </CardContent>
                            </Card>

                            <Card className="print-avoid-break">
                                <CardHeader>
                                    <CardTitle className="text-base">
                                        Delays &amp; Incidents Over Time
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="flex flex-col gap-3">
                                    <StackedDelayChartBody
                                        points={charts.delays}
                                    />
                                    <DelayLegend />
                                </CardContent>
                            </Card>
                        </div>

                        <div className="grid gap-6 lg:grid-cols-3">
                            <SummaryCard
                                icon={Bus}
                                title="Fleet Summary"
                                description="Fleet size and assignment overview."
                                rows={[
                                    {
                                        label: 'Total Buses',
                                        value: fleetSummary.total_buses,
                                    },
                                    {
                                        label: 'Active Buses',
                                        value: fleetSummary.active_buses,
                                    },
                                    {
                                        label: 'Inactive Buses',
                                        value: fleetSummary.inactive_buses,
                                    },
                                    {
                                        label: 'Assigned Buses',
                                        value: fleetSummary.assigned_buses,
                                    },
                                    {
                                        label: 'Unassigned Buses',
                                        value: fleetSummary.unassigned_buses,
                                    },
                                ]}
                            />

                            <SummaryCard
                                icon={Users}
                                title="Driver Summary"
                                description="Driver workforce overview."
                                rows={[
                                    {
                                        label: 'Total Drivers',
                                        value: driverSummary.total_drivers,
                                    },
                                    {
                                        label: 'Active Drivers',
                                        value: driverSummary.active_drivers,
                                    },
                                    {
                                        label: 'Inactive Drivers',
                                        value: driverSummary.inactive_drivers,
                                    },
                                    {
                                        label: 'Assigned Drivers',
                                        value: driverSummary.assigned_drivers,
                                    },
                                    {
                                        label: 'Unassigned Drivers',
                                        value: driverSummary
                                            .unassigned_drivers,
                                    },
                                ]}
                            />

                            <SummaryCard
                                icon={UserCog}
                                title="Operator Summary"
                                description="Operator account overview."
                                rows={[
                                    {
                                        label: 'Total Operators',
                                        value: operatorSummary.total_operators,
                                    },
                                    {
                                        label: 'Active Operators',
                                        value: operatorSummary
                                            .active_operators,
                                    },
                                    {
                                        label: 'Inactive Operators',
                                        value: operatorSummary
                                            .inactive_operators,
                                    },
                                ]}
                            />
                        </div>

                        <Card>
                            <CardHeader className="sm:flex-row sm:items-center sm:justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="bg-primary/10 text-primary-strong flex size-9 shrink-0 items-center justify-center rounded-lg">
                                        <Route className="size-5" />
                                    </div>
                                    <div>
                                        <CardTitle>Route Summary</CardTitle>
                                        <CardDescription>
                                            Route overview and buses assigned
                                            per route.
                                        </CardDescription>
                                    </div>
                                </div>
                                <div className="mt-4 flex flex-wrap gap-4 sm:mt-0">
                                    <MetricRow
                                        label="Total"
                                        value={routeSummary.total_routes}
                                    />
                                    <MetricRow
                                        label="Active"
                                        value={routeSummary.active_routes}
                                        accent
                                    />
                                    <MetricRow
                                        label="Inactive"
                                        value={routeSummary.inactive_routes}
                                    />
                                </div>
                            </CardHeader>
                            <CardContent className="px-0 pb-0">
                                {busesByRoute.length === 0 ? (
                                    <ReportTableEmptyState
                                        icon={Route}
                                        title="No route data"
                                        description="Routes will appear here once they are created."
                                    />
                                ) : (
                                    <Table containerClassName="rounded-lg border">
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Route</TableHead>
                                                <TableHead>Origin</TableHead>
                                                <TableHead>
                                                    Destination
                                                </TableHead>
                                                <TableHead>Status</TableHead>
                                                <TableHead className="text-right">
                                                    Buses
                                                </TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {busesByRoute.map(
                                                (item, index) => (
                                                    <TableRow key={index}>
                                                        <TableCell className="max-w-[260px] font-medium">
                                                            <span className="block truncate">
                                                                {item.name}
                                                            </span>
                                                        </TableCell>
                                                        <TableCell className="max-w-[180px]">
                                                            <span className="block truncate">
                                                                {item.origin}
                                                            </span>
                                                        </TableCell>
                                                        <TableCell className="max-w-[180px]">
                                                            <span className="block truncate">
                                                                {
                                                                    item.destination
                                                                }
                                                            </span>
                                                        </TableCell>
                                                        <TableCell className="whitespace-nowrap">
                                                            <StatusBadge
                                                                status={
                                                                    item.status
                                                                }
                                                            />
                                                        </TableCell>
                                                        <TableCell className="text-right tabular-nums">
                                                            {item.buses_count}
                                                        </TableCell>
                                                    </TableRow>
                                                ),
                                            )}
                                        </TableBody>
                                    </Table>
                                )}
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader className="sm:flex-row sm:items-center sm:justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="bg-primary/10 text-primary-strong flex size-9 shrink-0 items-center justify-center rounded-lg">
                                        <MapPin className="size-5" />
                                    </div>
                                    <div>
                                        <CardTitle>
                                            GPS / Tracking Summary
                                        </CardTitle>
                                        <CardDescription>
                                            All-time location records stored
                                            per bus.
                                        </CardDescription>
                                    </div>
                                </div>
                                <div className="mt-4 flex flex-wrap gap-4 sm:mt-0">
                                    <MetricRow
                                        label="Total Records"
                                        value={
                                            gpsSummary.total_location_records
                                        }
                                    />
                                    <MetricRow
                                        label="Tracked Buses"
                                        value={gpsSummary.tracked_buses_count}
                                        accent
                                    />
                                    <MetricRow
                                        label="Untracked Buses"
                                        value={
                                            gpsSummary.untracked_buses_count
                                        }
                                    />
                                    <MetricRow
                                        label="Latest Record"
                                        value={formatDateTime(
                                            gpsSummary.latest_recorded_at,
                                        )}
                                    />
                                </div>
                            </CardHeader>
                            <CardContent className="px-0 pb-0">
                                {gpsSummary.locations_by_bus.length === 0 ? (
                                    <ReportTableEmptyState
                                        icon={Activity}
                                        title="No GPS records"
                                        description="Location records will appear here once buses start reporting."
                                    />
                                ) : (
                                    <Table containerClassName="rounded-lg border">
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Bus</TableHead>
                                                <TableHead>
                                                    Plate Number
                                                </TableHead>
                                                <TableHead className="text-right">
                                                    Records
                                                </TableHead>
                                                <TableHead>
                                                    Latest Record
                                                </TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {gpsSummary.locations_by_bus.map(
                                                (item) => (
                                                    <TableRow key={item.bus_id}>
                                                        <TableCell className="max-w-[200px] font-medium">
                                                            <span className="block truncate">
                                                                {
                                                                    item.bus_number
                                                                }
                                                            </span>
                                                        </TableCell>
                                                        <TableCell className="whitespace-nowrap">
                                                            {
                                                                item.plate_number
                                                            }
                                                        </TableCell>
                                                        <TableCell className="text-right tabular-nums">
                                                            {item.records}
                                                        </TableCell>
                                                        <TableCell className="whitespace-nowrap">
                                                            {formatDateTime(
                                                                item.latest,
                                                            )}
                                                        </TableCell>
                                                    </TableRow>
                                                ),
                                            )}
                                        </TableBody>
                                    </Table>
                                )}
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <div className="flex items-center gap-3">
                                    <div className="bg-primary/10 text-primary-strong flex size-9 shrink-0 items-center justify-center rounded-lg">
                                        <BusFront className="size-5" />
                                    </div>
                                    <div>
                                        <CardTitle>
                                            Bus Assignment Report
                                        </CardTitle>
                                        <CardDescription>
                                            Current driver and route assignment
                                            for every bus.
                                        </CardDescription>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent className="px-0 pb-0">
                                {busAssignmentReport.length === 0 ? (
                                    <ReportTableEmptyState
                                        icon={BusFront}
                                        title="No buses in the fleet"
                                        description="Buses will appear here once they are added to the fleet."
                                    />
                                ) : (
                                    <Table containerClassName="rounded-lg border">
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Bus</TableHead>
                                                <TableHead>Model</TableHead>
                                                <TableHead>Capacity</TableHead>
                                                <TableHead>
                                                    Assigned Driver
                                                </TableHead>
                                                <TableHead>
                                                    Assigned Route
                                                </TableHead>
                                                <TableHead>Status</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {busAssignmentReport.map((bus) => (
                                                <TableRow key={bus.id}>
                                                    <TableCell>
                                                        <p className="text-sm font-medium">
                                                            {bus.bus_number}
                                                        </p>
                                                        <p className="text-muted-foreground text-xs">
                                                            {bus.plate_number}
                                                        </p>
                                                    </TableCell>
                                                    <TableCell className="max-w-[180px]">
                                                        <span className="block truncate">
                                                            {bus.model ?? '-'}
                                                        </span>
                                                    </TableCell>
                                                    <TableCell className="tabular-nums">
                                                        {bus.capacity ?? '-'}
                                                    </TableCell>
                                                    <TableCell className="max-w-[220px]">
                                                        {bus.assigned_driver ? (
                                                            <>
                                                                <p className="truncate text-sm font-medium">
                                                                    {
                                                                        bus
                                                                            .assigned_driver
                                                                            .name
                                                                    }
                                                                </p>
                                                                <p className="text-muted-foreground truncate text-xs">
                                                                    {
                                                                        bus
                                                                            .assigned_driver
                                                                            .email
                                                                    }
                                                                </p>
                                                            </>
                                                        ) : (
                                                            <p className="text-muted-foreground text-sm">
                                                                -
                                                            </p>
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="max-w-[220px]">
                                                        {bus.assigned_route ? (
                                                            <>
                                                                <p className="truncate text-sm font-medium">
                                                                    {
                                                                        bus
                                                                            .assigned_route
                                                                            .name
                                                                    }
                                                                </p>
                                                                <p className="text-muted-foreground truncate text-xs">
                                                                    {
                                                                        bus
                                                                            .assigned_route
                                                                            .origin
                                                                    }{' '}
                                                                    →{' '}
                                                                    {
                                                                        bus
                                                                            .assigned_route
                                                                            .destination
                                                                    }
                                                                </p>
                                                            </>
                                                        ) : (
                                                            <p className="text-muted-foreground text-sm">
                                                                -
                                                            </p>
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="whitespace-nowrap">
                                                        <StatusBadge
                                                            status={bus.status}
                                                        />
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                )}
                            </CardContent>
                        </Card>
                    </>
                )}

                {filters.category === 'trips' && (
                    <>
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                            <StatCard
                                icon={Route}
                                label="Total Trips"
                                value={analytics.total_trips}
                            />
                            <StatCard
                                icon={CircleCheck}
                                label="Completed"
                                value={analytics.completed_trips}
                            />
                            <StatCard
                                icon={Navigation}
                                label="In Transit"
                                value={analytics.in_transit_trips}
                            />
                            <StatCard
                                icon={Clock}
                                label="Cancelled"
                                value={analytics.cancelled_trips}
                            />
                        </div>

                        <Card className="print-avoid-break">
                            <CardHeader>
                                <CardTitle className="text-base">
                                    Trips Over Time
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <BarChartBody points={charts.trips} />
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base">
                                    Trip Performance Records
                                </CardTitle>
                                <CardDescription>
                                    Trips with a recorded departure in the
                                    selected period.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="px-0 pb-0">
                                {!trips || trips.data.length === 0 ? (
                                    <ReportTableEmptyState
                                        icon={Route}
                                        title="No trip records"
                                        description="No trips depart within the selected period."
                                    />
                                ) : (
                                    <>
                                        <Table containerClassName="rounded-lg border">
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead>Trip</TableHead>
                                                    <TableHead>Bus</TableHead>
                                                    <TableHead>
                                                        Driver
                                                    </TableHead>
                                                    <TableHead>Route</TableHead>
                                                    <TableHead>
                                                        Started
                                                    </TableHead>
                                                    <TableHead>Ended</TableHead>
                                                    <TableHead>
                                                        Status
                                                    </TableHead>
                                                    <TableHead>
                                                        Delays
                                                    </TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {trips.data.map((trip) => (
                                                    <TableRow key={trip.id}>
                                                        <TableCell className="whitespace-nowrap tabular-nums">
                                                            #{trip.id}
                                                        </TableCell>
                                                        <TableCell className="max-w-[160px]">
                                                            <p className="truncate text-sm font-medium">
                                                                {trip.bus_number ??
                                                                    '-'}
                                                            </p>
                                                            <p className="text-muted-foreground truncate text-xs">
                                                                {trip.plate_number ??
                                                                    ''}
                                                            </p>
                                                        </TableCell>
                                                        <TableCell className="max-w-[160px]">
                                                            <span className="block truncate">
                                                                {trip.driver_name ??
                                                                    '-'}
                                                            </span>
                                                        </TableCell>
                                                        <TableCell className="max-w-[200px]">
                                                            <p className="truncate text-sm">
                                                                {trip.route_name ??
                                                                    '-'}
                                                            </p>
                                                            {trip.route_origin &&
                                                                trip.route_destination && (
                                                                    <p className="text-muted-foreground truncate text-xs">
                                                                        {
                                                                            trip.route_origin
                                                                        }{' '}
                                                                        →{' '}
                                                                        {
                                                                            trip.route_destination
                                                                        }
                                                                    </p>
                                                                )}
                                                        </TableCell>
                                                        <TableCell className="whitespace-nowrap">
                                                            {formatDateTime(
                                                                trip.started_at,
                                                            )}
                                                        </TableCell>
                                                        <TableCell className="whitespace-nowrap">
                                                            {formatDateTime(
                                                                trip.ended_at,
                                                            )}
                                                        </TableCell>
                                                        <TableCell className="whitespace-nowrap">
                                                            <TripStatusBadge
                                                                status={
                                                                    trip.status
                                                                }
                                                                label={
                                                                    trip.status_label
                                                                }
                                                            />
                                                        </TableCell>
                                                        <TableCell className="max-w-[220px]">
                                                            {trip.delays
                                                                .length ===
                                                            0 ? (
                                                                <span className="text-muted-foreground text-sm">
                                                                    -
                                                                </span>
                                                            ) : (
                                                                <div className="flex flex-wrap gap-1">
                                                                    {trip.delays.map(
                                                                        (
                                                                            delay,
                                                                        ) => (
                                                                            <Badge
                                                                                key={`${trip.id}-${delay.reason}`}
                                                                                variant="outline"
                                                                                className={cn(
                                                                                    'border-transparent',
                                                                                    delay.is_incident
                                                                                        ? 'bg-destructive/10 text-destructive-strong'
                                                                                        : 'bg-muted text-muted-foreground',
                                                                                )}
                                                                            >
                                                                                {
                                                                                    delay.reason
                                                                                }{' '}
                                                                                ×
                                                                                {
                                                                                    delay.count
                                                                                }
                                                                            </Badge>
                                                                        ),
                                                                    )}
                                                                </div>
                                                            )}
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                        <PaginationBar
                                            page={trips.current_page}
                                            lastPage={trips.last_page}
                                            total={trips.total}
                                            from={trips.from}
                                            to={trips.to}
                                            onPage={applyPage}
                                        />
                                    </>
                                )}
                            </CardContent>
                        </Card>
                    </>
                )}

                {filters.category === 'gps' && (
                    <>
                        <Card>
                            <CardHeader className="sm:flex-row sm:items-center sm:justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="bg-primary/10 text-primary-strong flex size-9 shrink-0 items-center justify-center rounded-lg">
                                        <MapPin className="size-5" />
                                    </div>
                                    <div>
                                        <CardTitle>
                                            GPS Coverage by Bus
                                        </CardTitle>
                                        <CardDescription>
                                            All-time location records stored
                                            per bus.
                                        </CardDescription>
                                    </div>
                                </div>
                                <div className="mt-4 flex flex-wrap gap-4 sm:mt-0">
                                    <MetricRow
                                        label="Total Records"
                                        value={
                                            gpsSummary.total_location_records
                                        }
                                    />
                                    <MetricRow
                                        label="Tracked Buses"
                                        value={gpsSummary.tracked_buses_count}
                                        accent
                                    />
                                    <MetricRow
                                        label="Untracked Buses"
                                        value={
                                            gpsSummary.untracked_buses_count
                                        }
                                    />
                                    <MetricRow
                                        label="Latest Record"
                                        value={formatDateTime(
                                            gpsSummary.latest_recorded_at,
                                        )}
                                    />
                                </div>
                            </CardHeader>
                            <CardContent className="px-0 pb-0">
                                {gpsSummary.locations_by_bus.length === 0 ? (
                                    <ReportTableEmptyState
                                        icon={Activity}
                                        title="No GPS records"
                                        description="Location records will appear here once buses start reporting."
                                    />
                                ) : (
                                    <Table containerClassName="rounded-lg border">
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Bus</TableHead>
                                                <TableHead>
                                                    Plate Number
                                                </TableHead>
                                                <TableHead className="text-right">
                                                    Records
                                                </TableHead>
                                                <TableHead>
                                                    Latest Record
                                                </TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {gpsSummary.locations_by_bus.map(
                                                (item) => (
                                                    <TableRow key={item.bus_id}>
                                                        <TableCell className="max-w-[200px] font-medium">
                                                            <span className="block truncate">
                                                                {
                                                                    item.bus_number
                                                                }
                                                            </span>
                                                        </TableCell>
                                                        <TableCell className="whitespace-nowrap">
                                                            {
                                                                item.plate_number
                                                            }
                                                        </TableCell>
                                                        <TableCell className="text-right tabular-nums">
                                                            {item.records}
                                                        </TableCell>
                                                        <TableCell className="whitespace-nowrap">
                                                            {formatDateTime(
                                                                item.latest,
                                                            )}
                                                        </TableCell>
                                                    </TableRow>
                                                ),
                                            )}
                                        </TableBody>
                                    </Table>
                                )}
                            </CardContent>
                        </Card>

                        <LocationHistorySection
                            buses={buses}
                            onPrintRequest={(snapshot) => {
                                setGpsPrintSnapshot(snapshot);
                                setPreviewOpen(true);
                            }}
                        />
                    </>
                )}

                {filters.category === 'delays' && (
                    <>
                        <div className="grid gap-4 sm:grid-cols-3">
                            <StatCard
                                icon={TriangleAlert}
                                label="Delayed Trips"
                                value={analytics.delayed_trips}
                            />
                            <StatCard
                                icon={Clock}
                                label="Delay Reports"
                                value={analytics.delay_reports}
                            />
                            <StatCard
                                icon={CircleAlert}
                                label="Incidents"
                                value={analytics.incidents}
                            />
                        </div>

                        <Card className="print-avoid-break">
                            <CardHeader>
                                <CardTitle className="text-base">
                                    Delays &amp; Incidents Over Time
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="flex flex-col gap-3">
                                <StackedDelayChartBody points={charts.delays} />
                                <DelayLegend />
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base">
                                    Delay &amp; Incident Records
                                </CardTitle>
                                <CardDescription>
                                    Records reported within the selected
                                    period.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="px-0 pb-0">
                                {!delayIncidents ||
                                delayIncidents.data.length === 0 ? (
                                    <ReportTableEmptyState
                                        icon={TriangleAlert}
                                        title="No delay or incident records"
                                        description="No delays or incidents were reported in the selected period."
                                    />
                                ) : (
                                    <>
                                        <Table containerClassName="rounded-lg border">
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead>
                                                        Reported
                                                    </TableHead>
                                                    <TableHead>Type</TableHead>
                                                    <TableHead>
                                                        Reason
                                                    </TableHead>
                                                    <TableHead>Bus</TableHead>
                                                    <TableHead>
                                                        Driver
                                                    </TableHead>
                                                    <TableHead>Trip</TableHead>
                                                    <TableHead>
                                                        Status
                                                    </TableHead>
                                                    <TableHead>
                                                        Details
                                                    </TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {delayIncidents.data.map(
                                                    (incident) => (
                                                        <TableRow
                                                            key={incident.id}
                                                        >
                                                            <TableCell className="whitespace-nowrap">
                                                                {formatDateTime(
                                                                    incident.reported_at,
                                                                )}
                                                            </TableCell>
                                                            <TableCell className="whitespace-nowrap">
                                                                <Badge
                                                                    variant="outline"
                                                                    className={cn(
                                                                        'border-transparent',
                                                                        incident.is_incident
                                                                            ? 'bg-destructive/10 text-destructive-strong'
                                                                            : 'bg-muted text-muted-foreground',
                                                                    )}
                                                                >
                                                                    {
                                                                        incident.type_label
                                                                    }
                                                                </Badge>
                                                            </TableCell>
                                                            <TableCell className="max-w-[200px]">
                                                                <span className="block truncate">
                                                                    {
                                                                        incident.reason
                                                                    }
                                                                </span>
                                                            </TableCell>
                                                            <TableCell className="whitespace-nowrap">
                                                                {incident.bus_number ??
                                                                    '-'}
                                                            </TableCell>
                                                            <TableCell className="max-w-[160px]">
                                                                <span className="block truncate">
                                                                    {incident.driver_name ??
                                                                        '-'}
                                                                </span>
                                                            </TableCell>
                                                            <TableCell className="whitespace-nowrap tabular-nums">
                                                                {incident.trip_id
                                                                    ? `#${incident.trip_id}`
                                                                    : '-'}
                                                            </TableCell>
                                                            <TableCell className="whitespace-nowrap">
                                                                {
                                                                    incident.status_label
                                                                }
                                                            </TableCell>
                                                            <TableCell className="max-w-[240px]">
                                                                <span className="block truncate">
                                                                    {incident.details ??
                                                                        '-'}
                                                                </span>
                                                            </TableCell>
                                                        </TableRow>
                                                    ),
                                                )}
                                            </TableBody>
                                        </Table>
                                        <PaginationBar
                                            page={
                                                delayIncidents.current_page
                                            }
                                            lastPage={
                                                delayIncidents.last_page
                                            }
                                            total={delayIncidents.total}
                                            from={delayIncidents.from}
                                            to={delayIncidents.to}
                                            onPage={applyPage}
                                        />
                                    </>
                                )}
                            </CardContent>
                        </Card>
                    </>
                )}
            </div>

            {previewOpen &&
                createPortal(
                    <div
                        id="report-print-root"
                        className="fixed inset-0 z-[70] overflow-y-auto bg-white"
                    >
                        <div className="print-hide sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b bg-white px-6 py-3">
                            <div>
                                <p className="text-sm font-semibold">
                                    Report Preview
                                </p>
                                <p className="text-xs text-neutral-500">
                                    Print Report opens the browser print
                                    dialog. Save as PDF creates a PDF of this
                                    report and uses your browser's save dialog
                                    when available, or downloads the file
                                    otherwise.
                                </p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <Button onClick={() => invokePrint()}>
                                    <Printer className="size-4" />
                                    Print Report
                                </Button>
                                <Button
                                    variant="outline"
                                    className="border-primary/50 text-primary-strong hover:bg-primary/10"
                                    onClick={() => void saveAsPdf()}
                                    disabled={pdfBusy}
                                    aria-busy={pdfBusy}
                                >
                                    {pdfBusy ? (
                                        <LoaderCircle className="size-4 animate-spin" />
                                    ) : (
                                        <FileDown className="size-4" />
                                    )}
                                    {pdfBusy
                                        ? 'Preparing PDF…'
                                        : 'Save as PDF'}
                                </Button>
                                <Button
                                    variant="outline"
                                    onClick={() => setPreviewOpen(false)}
                                >
                                    Close
                                </Button>
                            </div>
                        </div>

                        <ReportPreview
                            category={filters.category}
                            periodLabel={periodLabel}
                            rangeLabel={rangeLabel}
                            generatedAt={generatedAt}
                            analytics={analytics}
                            charts={charts}
                            trips={trips}
                            delayIncidents={delayIncidents}
                            gpsSnapshot={gpsPrintSnapshot}
                            fleetSummary={fleetSummary}
                            driverSummary={driverSummary}
                            operatorSummary={operatorSummary}
                        />
                    </div>,
                    document.body,
                )}
        </AppSidebarLayout>
    );
}
