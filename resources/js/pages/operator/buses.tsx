import { Head } from '@inertiajs/react';
import {
    BusFront,
    CircleCheck,
    ClipboardList,
    FilterX,
    LayoutGrid,
    List,
    Navigation,
    Search,
    X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import OperatorSidebarLayout from '@/layouts/app/operator-sidebar-layout';
import { cn } from '@/lib/utils';

type BusRoute = {
    id: number;
    name: string;
    origin: string;
    destination: string;
};

type BusDriver = {
    id: number;
    name: string;
};

type Bus = {
    id: number;
    bus_number: string;
    plate_number: string;
    model: string | null;
    capacity: number | null;
    status: string;
    route: BusRoute | null;
    driver: BusDriver | null;
    has_in_transit_trip: boolean;
};

type Stats = {
    total: number;
    in_transit: number;
    waiting_queue: number;
    available: number;
};

type Props = {
    buses: Bus[];
    stats: Stats;
};

type StatusFilter = 'all' | 'active' | 'in_transit' | 'inactive';

type ViewMode = 'table' | 'cards';

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

function TripBadge() {
    return (
        <Badge variant="warning" className="gap-1">
            <Navigation className="h-3 w-3" />
            In Transit
        </Badge>
    );
}

function SummaryCard({
    label,
    value,
    sublabel,
    icon: Icon,
    dataTest,
}: {
    label: string;
    value: number;
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
                        {value.toLocaleString()}
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

function DriverCell({ driver }: { driver: BusDriver | null }) {
    if (driver === null) {
        return (
            <span className="text-muted-foreground text-sm">Not assigned</span>
        );
    }
    return (
        <span className="block max-w-[180px] truncate text-sm font-medium">
            {driver.name}
        </span>
    );
}

function RouteCell({ route }: { route: BusRoute | null }) {
    if (route === null) {
        return (
            <span className="text-muted-foreground text-sm">Not assigned</span>
        );
    }
    return (
        <div className="max-w-[200px] min-w-0">
            <p className="truncate text-sm font-medium">{route.name}</p>
            <p className="text-muted-foreground truncate text-xs">
                {route.origin} → {route.destination}
            </p>
        </div>
    );
}

function FleetEmptyState() {
    return (
        <div
            data-test="fleet-empty"
            className="flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-16 text-center"
        >
            <div className="bg-muted text-muted-foreground flex size-12 items-center justify-center rounded-full">
                <BusFront className="size-6" />
            </div>
            <p className="mt-3 text-sm font-medium">No buses in the fleet</p>
            <p className="text-muted-foreground mt-1 max-w-sm text-sm">
                Bus records will appear here once an administrator adds them.
            </p>
        </div>
    );
}

export default function OperatorBusesPage({ buses, stats }: Props) {
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
    const [view, setView] = useState<ViewMode>('table');

    const activeBusCount = useMemo(
        () => buses.filter((bus) => bus.status === 'active').length,
        [buses],
    );

    const filteredBuses = useMemo(() => {
        const query = search.trim().toLowerCase();

        return buses.filter((bus) => {
            if (query) {
                const matchesQuery = [
                    bus.bus_number,
                    bus.plate_number,
                    bus.model ?? '',
                    bus.driver?.name ?? '',
                    bus.route?.name ?? '',
                ].some((field) => field.toLowerCase().includes(query));

                if (!matchesQuery) {
                    return false;
                }
            }

            if (statusFilter === 'active') {
                return bus.status === 'active';
            }

            if (statusFilter === 'inactive') {
                return bus.status === 'inactive';
            }

            if (statusFilter === 'in_transit') {
                return bus.has_in_transit_trip;
            }

            return true;
        });
    }, [buses, search, statusFilter]);

    const hasActiveFilters = search.trim() !== '' || statusFilter !== 'all';

    const clearFilters = () => {
        setSearch('');
        setStatusFilter('all');
    };

    return (
        <OperatorSidebarLayout
            breadcrumbs={[
                {
                    title: 'Dashboard',
                    href: '/operator/dashboard',
                },
                {
                    title: 'Bus Operations',
                    href: '/operator/buses',
                },
            ]}
        >
            <Head title="Bus Operations" />

            <div className="flex flex-col gap-6">
                <div className="flex items-center gap-4">
                    <div className="bg-primary/10 text-primary-strong flex size-11 shrink-0 items-center justify-center rounded-xl">
                        <BusFront className="size-6" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-semibold">
                            Bus Operations
                        </h1>
                        <p className="text-muted-foreground">
                            Monitor fleet availability, assigned drivers,
                            routes, and operational status.
                        </p>
                    </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <SummaryCard
                        label="Total Buses"
                        value={stats.total}
                        sublabel={`${activeBusCount} active`}
                        icon={BusFront}
                        dataTest="summary-total-buses"
                    />
                    <SummaryCard
                        label="In Transit"
                        value={stats.in_transit}
                        sublabel="Buses on an active trip"
                        icon={Navigation}
                        dataTest="summary-in-transit"
                    />
                    <SummaryCard
                        label="Waiting in Queue"
                        value={stats.waiting_queue}
                        sublabel={
                            stats.waiting_queue === 0
                                ? 'Queue is clear'
                                : 'Buses in the dispatch queue'
                        }
                        icon={ClipboardList}
                        dataTest="summary-waiting-queue"
                    />
                    <SummaryCard
                        label="Available Buses"
                        value={stats.available}
                        sublabel="Ready for dispatch"
                        icon={CircleCheck}
                        dataTest="summary-available-buses"
                    />
                </div>

                <section className="flex flex-col gap-4">
                    <div>
                        <h2 className="text-lg font-semibold">
                            Fleet Overview
                        </h2>
                        <p className="text-muted-foreground text-sm">
                            Every bus in the fleet with its assignments and
                            current operational status.
                        </p>
                    </div>

                    {buses.length === 0 ? (
                        <FleetEmptyState />
                    ) : (
                        <>
                            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                                <div className="relative w-full lg:max-w-xs">
                                    <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                                    <Input
                                        type="search"
                                        placeholder="Search by bus, plate, driver, or route..."
                                        value={search}
                                        onChange={(e) =>
                                            setSearch(e.target.value)
                                        }
                                        className="pr-9 pl-9"
                                        aria-label="Search buses"
                                        data-test="bus-search"
                                    />
                                    {search && (
                                        <button
                                            type="button"
                                            onClick={() => setSearch('')}
                                            aria-label="Clear search"
                                            className="text-muted-foreground hover:text-foreground absolute top-1/2 right-3 -translate-y-1/2"
                                        >
                                            <X className="h-4 w-4" />
                                        </button>
                                    )}
                                </div>

                                <div className="flex flex-wrap items-center gap-3">
                                    <Select
                                        value={statusFilter}
                                        onValueChange={(value) =>
                                            setStatusFilter(
                                                value as StatusFilter,
                                            )
                                        }
                                    >
                                        <SelectTrigger
                                            aria-label="Filter by status"
                                            className="w-[170px]"
                                            data-test="status-filter"
                                        >
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">
                                                All statuses
                                            </SelectItem>
                                            <SelectItem value="active">
                                                Active
                                            </SelectItem>
                                            <SelectItem value="in_transit">
                                                In Transit
                                            </SelectItem>
                                            <SelectItem value="inactive">
                                                Inactive
                                            </SelectItem>
                                        </SelectContent>
                                    </Select>

                                    {hasActiveFilters && (
                                        <Button
                                            variant="ghost"
                                            onClick={clearFilters}
                                            data-test="clear-filters"
                                        >
                                            <FilterX className="h-4 w-4" />
                                            Clear Filters
                                        </Button>
                                    )}

                                    <ToggleGroup
                                        type="single"
                                        variant="outline"
                                        value={view}
                                        onValueChange={(value) => {
                                            if (value) {
                                                setView(value as ViewMode);
                                            }
                                        }}
                                        aria-label="View mode"
                                    >
                                        <ToggleGroupItem
                                            value="table"
                                            aria-label="Table view"
                                            title="Table view"
                                            data-test="view-toggle-table"
                                        >
                                            <List className="h-4 w-4" />
                                            Table
                                        </ToggleGroupItem>
                                        <ToggleGroupItem
                                            value="cards"
                                            aria-label="Card view"
                                            title="Card view"
                                            data-test="view-toggle-cards"
                                        >
                                            <LayoutGrid className="h-4 w-4" />
                                            Cards
                                        </ToggleGroupItem>
                                    </ToggleGroup>
                                </div>
                            </div>

                            {statusFilter === 'in_transit' && (
                                <p
                                    className="text-muted-foreground text-xs"
                                    data-test="filter-hint"
                                >
                                    In Transit reflects the current trip — a bus
                                    can be Active and In Transit at the same
                                    time.
                                </p>
                            )}

                            <p className="text-muted-foreground text-sm">
                                Showing {filteredBuses.length} of {stats.total}{' '}
                                buses
                            </p>

                            {filteredBuses.length === 0 ? (
                                <div
                                    className="flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-12 text-center"
                                    data-test="no-match"
                                >
                                    <p className="text-muted-foreground text-sm">
                                        No buses match your search or filters.
                                    </p>
                                    <Button
                                        variant="ghost"
                                        className="mt-2"
                                        onClick={clearFilters}
                                    >
                                        Clear Filters
                                    </Button>
                                </div>
                            ) : view === 'table' ? (
                                <div data-test="bus-table-view">
                                    <Table containerClassName="rounded-lg border">
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Bus</TableHead>
                                                <TableHead>
                                                    Plate Number
                                                </TableHead>
                                                <TableHead>
                                                    Assigned Driver
                                                </TableHead>
                                                <TableHead>
                                                    Assigned Route
                                                </TableHead>
                                                <TableHead>
                                                    Bus Status
                                                </TableHead>
                                                <TableHead>
                                                    Trip Status
                                                </TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {filteredBuses.map((bus) => (
                                                <TableRow
                                                    key={bus.id}
                                                    data-test="bus-row"
                                                    data-bus-id={bus.id}
                                                >
                                                    <TableCell className="whitespace-nowrap">
                                                        <div className="flex items-center gap-3">
                                                            <div className="bg-primary/10 text-primary-strong flex size-9 shrink-0 items-center justify-center rounded-lg">
                                                                <BusFront className="size-4" />
                                                            </div>
                                                            <div className="min-w-0">
                                                                <p className="font-medium">
                                                                    {
                                                                        bus.bus_number
                                                                    }
                                                                </p>
                                                                <p className="text-muted-foreground text-xs">
                                                                    {[
                                                                        bus.model,
                                                                        bus.capacity !==
                                                                        null
                                                                            ? `${bus.capacity} seats`
                                                                            : null,
                                                                    ]
                                                                        .filter(
                                                                            Boolean,
                                                                        )
                                                                        .join(
                                                                            ' · ',
                                                                        ) ||
                                                                        '—'}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="whitespace-nowrap">
                                                        {bus.plate_number}
                                                    </TableCell>
                                                    <TableCell>
                                                        <DriverCell
                                                            driver={bus.driver}
                                                        />
                                                    </TableCell>
                                                    <TableCell>
                                                        <RouteCell
                                                            route={bus.route}
                                                        />
                                                    </TableCell>
                                                    <TableCell className="whitespace-nowrap">
                                                        <StatusBadge
                                                            status={bus.status}
                                                        />
                                                    </TableCell>
                                                    <TableCell className="whitespace-nowrap">
                                                        {bus.has_in_transit_trip ? (
                                                            <TripBadge />
                                                        ) : (
                                                            <span className="text-muted-foreground text-sm">
                                                                —
                                                            </span>
                                                        )}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            ) : (
                                <div
                                    data-test="bus-cards-view"
                                    className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
                                >
                                    {filteredBuses.map((bus) => (
                                        <Card
                                            key={bus.id}
                                            className="flex flex-col py-5"
                                            data-test="bus-card"
                                            data-bus-id={bus.id}
                                        >
                                            <CardContent className="flex flex-1 flex-col gap-4 px-5">
                                                <div className="flex items-center gap-3">
                                                    <div className="bg-primary/10 text-primary-strong flex size-12 shrink-0 items-center justify-center rounded-xl">
                                                        <BusFront className="size-5" />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="truncate font-medium">
                                                            {bus.bus_number}
                                                        </p>
                                                        <p className="text-muted-foreground truncate text-xs">
                                                            {bus.plate_number}
                                                            {bus.model
                                                                ? ` · ${bus.model}`
                                                                : ''}
                                                        </p>
                                                    </div>
                                                </div>

                                                <div className="flex flex-wrap gap-1.5">
                                                    <StatusBadge
                                                        status={bus.status}
                                                    />
                                                    {bus.has_in_transit_trip && (
                                                        <TripBadge />
                                                    )}
                                                </div>

                                                <dl className="grid grid-cols-1 gap-x-4 gap-y-3 text-sm">
                                                    <div className="min-w-0">
                                                        <dt className="text-muted-foreground text-xs">
                                                            Assigned Driver
                                                        </dt>
                                                        <dd>
                                                            <DriverCell
                                                                driver={
                                                                    bus.driver
                                                                }
                                                            />
                                                        </dd>
                                                    </div>
                                                    <div className="min-w-0">
                                                        <dt className="text-muted-foreground text-xs">
                                                            Assigned Route
                                                        </dt>
                                                        <dd>
                                                            <RouteCell
                                                                route={
                                                                    bus.route
                                                                }
                                                            />
                                                        </dd>
                                                    </div>
                                                </dl>

                                                <div className="mt-auto border-t pt-4">
                                                    <p className="text-muted-foreground text-xs">
                                                        Trip Status
                                                    </p>
                                                    <p className="mt-1 text-sm">
                                                        {bus.has_in_transit_trip ? (
                                                            <span className="font-medium">
                                                                In Transit on an
                                                                active trip
                                                            </span>
                                                        ) : (
                                                            <span className="text-muted-foreground">
                                                                No active trip
                                                            </span>
                                                        )}
                                                    </p>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                </section>
            </div>
        </OperatorSidebarLayout>
    );
}
