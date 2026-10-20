import { Head, Link, router } from '@inertiajs/react';
import type { LucideIcon } from 'lucide-react';
import {
    ArrowRight,
    BusFront,
    Edit2,
    FilterX,
    LayoutGrid,
    List,
    Map,
    MapPin,
    MapPinOff,
    Navigation,
    Plus,
    Route as RouteIcon,
    Search,
    Trash2,
    X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import {
    RouteCoordinatePreview,
    formatCoordinatePair,
} from '@/components/route-map-preview';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
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
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import AppSidebarLayout from '@/layouts/app/app-sidebar-layout';
import { cn } from '@/lib/utils';

type RouteBus = {
    id: number;
    bus_number: string;
    plate_number: string;
    status: string;
};

type Route = {
    id: number;
    name: string;
    origin: string;
    destination: string;
    destination_lat: string | null;
    destination_lng: string | null;
    status: string;
    has_valid_coordinates: boolean;
    has_in_transit_trip: boolean;
    has_open_trips: boolean;
    buses: RouteBus[];
};

type Summary = {
    total: number;
    with_buses: number;
    valid_coordinates: number;
    missing_or_invalid_coordinates: number;
};

type StatusFilter = 'all' | 'active' | 'inactive';

type AssignmentFilter = 'all' | 'assigned' | 'unassigned';

type CoordinatesFilter = 'all' | 'valid' | 'invalid';

type ViewMode = 'cards' | 'table';

type Props = {
    routes: Route[];
    summary: Summary;
};

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

function CoordinatesBadge({ valid }: { valid: boolean }) {
    return (
        <Badge
            variant="outline"
            className={cn(
                'gap-1',
                valid
                    ? 'border-success/30 bg-success/10 text-foreground'
                    : 'text-muted-foreground',
            )}
        >
            {valid ? (
                <MapPin className="h-3 w-3" />
            ) : (
                <MapPinOff className="h-3 w-3" />
            )}
            {valid ? 'Coordinates set' : 'No coordinates'}
        </Badge>
    );
}

function TripBadge() {
    return (
        <Badge variant="warning" className="gap-1">
            <Navigation className="h-3 w-3" />
            Trip in progress
        </Badge>
    );
}

function SummaryCard({
    label,
    value,
    sublabel,
    icon: Icon,
}: {
    label: string;
    value: number;
    sublabel: string;
    icon: LucideIcon;
}) {
    return (
        <Card className="py-5">
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

function isDeleteBlocked(route: Route): boolean {
    return route.buses.length > 0 || route.has_open_trips;
}

function deleteBlockedTitle(route: Route): string | undefined {
    if (route.buses.length > 0) {
        return 'Reassign or unassign all buses before deleting this route';
    }
    if (route.has_open_trips) {
        return 'This route has scheduled or in-progress trips';
    }
    return undefined;
}

export default function AdminRoutesIndexPage({ routes, summary }: Props) {
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
    const [assignmentFilter, setAssignmentFilter] =
        useState<AssignmentFilter>('all');
    const [coordinatesFilter, setCoordinatesFilter] =
        useState<CoordinatesFilter>('all');
    const [view, setView] = useState<ViewMode>('cards');
    const [routeToDelete, setRouteToDelete] = useState<Route | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [mapRoute, setMapRoute] = useState<Route | null>(null);

    const filteredRoutes = useMemo(() => {
        const query = search.trim().toLowerCase();

        return routes.filter((route) => {
            if (query) {
                const matchesQuery = [
                    route.name,
                    route.origin,
                    route.destination,
                ].some((field) => field.toLowerCase().includes(query));

                if (!matchesQuery) {
                    return false;
                }
            }

            if (statusFilter !== 'all' && route.status !== statusFilter) {
                return false;
            }

            if (assignmentFilter === 'assigned' && route.buses.length === 0) {
                return false;
            }

            if (assignmentFilter === 'unassigned' && route.buses.length > 0) {
                return false;
            }

            if (coordinatesFilter === 'valid' && !route.has_valid_coordinates) {
                return false;
            }

            if (
                coordinatesFilter === 'invalid' &&
                route.has_valid_coordinates
            ) {
                return false;
            }

            return true;
        });
    }, [routes, search, statusFilter, assignmentFilter, coordinatesFilter]);

    const hasActiveFilters =
        search.trim() !== '' ||
        statusFilter !== 'all' ||
        assignmentFilter !== 'all' ||
        coordinatesFilter !== 'all';

    const clearFilters = () => {
        setSearch('');
        setStatusFilter('all');
        setAssignmentFilter('all');
        setCoordinatesFilter('all');
    };

    const confirmDelete = () => {
        if (!routeToDelete || deleting) {
            return;
        }

        setDeleting(true);

        router.delete(`/admin/routes/${routeToDelete.id}`, {
            preserveScroll: true,
            onFinish: () => {
                setDeleting(false);
                setRouteToDelete(null);
            },
        });
    };

    return (
        <AppSidebarLayout
            breadcrumbs={[
                {
                    title: 'Dashboard',
                    href: '/admin/dashboard',
                },
                {
                    title: 'Route Management',
                    href: '/admin/routes',
                },
            ]}
        >
            <Head title="Route Management" />

            <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h1 className="text-2xl font-semibold">
                            Route Management
                        </h1>
                        <p className="text-muted-foreground">
                            Manage bus routes, bus assignments and destination
                            coordinates.
                        </p>
                    </div>
                    <Button asChild className="sm:shrink-0">
                        <Link href="/admin/routes/create">
                            <Plus className="h-4 w-4" />
                            Add Route
                        </Link>
                    </Button>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <SummaryCard
                        label="Total Routes"
                        value={summary.total}
                        sublabel="Registered routes"
                        icon={RouteIcon}
                    />
                    <SummaryCard
                        label="With Assigned Buses"
                        value={summary.with_buses}
                        sublabel="Routes with at least one bus"
                        icon={BusFront}
                    />
                    <SummaryCard
                        label="Valid Destination Coordinates"
                        value={summary.valid_coordinates}
                        sublabel="Usable latitude & longitude"
                        icon={MapPin}
                    />
                    <SummaryCard
                        label="Missing or Invalid Coordinates"
                        value={summary.missing_or_invalid_coordinates}
                        sublabel="Needs destination coordinates"
                        icon={MapPinOff}
                    />
                </div>

                <p className="text-muted-foreground text-xs">
                    Summary totals cover all routes; search and filters apply to
                    the list below.
                </p>

                {routes.length === 0 ? (
                    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-16 text-center">
                        <div className="bg-muted mb-4 flex h-12 w-12 items-center justify-center rounded-full">
                            <RouteIcon className="text-muted-foreground h-6 w-6" />
                        </div>
                        <h2 className="text-base font-semibold">
                            No routes yet
                        </h2>
                        <p className="text-muted-foreground mt-1 max-w-sm text-sm">
                            Add your first route to start planning your fleet.
                        </p>
                        <Button className="mt-4" asChild>
                            <Link href="/admin/routes/create">
                                <Plus className="h-4 w-4" />
                                Add your first route
                            </Link>
                        </Button>
                    </div>
                ) : (
                    <>
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                            <div className="relative w-full lg:max-w-xs">
                                <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                                <Input
                                    type="search"
                                    placeholder="Search by name, origin, destination..."
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    className="pr-9 pl-9"
                                    aria-label="Search routes"
                                    data-test="route-search"
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
                                        setStatusFilter(value as StatusFilter)
                                    }
                                >
                                    <SelectTrigger
                                        aria-label="Filter by status"
                                        className="w-[150px]"
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
                                        <SelectItem value="inactive">
                                            Inactive
                                        </SelectItem>
                                    </SelectContent>
                                </Select>

                                <Select
                                    value={assignmentFilter}
                                    onValueChange={(value) =>
                                        setAssignmentFilter(
                                            value as AssignmentFilter,
                                        )
                                    }
                                >
                                    <SelectTrigger
                                        aria-label="Filter by bus assignment"
                                        className="w-[180px]"
                                    >
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">
                                            All routes
                                        </SelectItem>
                                        <SelectItem value="assigned">
                                            With Assigned Bus
                                        </SelectItem>
                                        <SelectItem value="unassigned">
                                            Without Assigned Bus
                                        </SelectItem>
                                    </SelectContent>
                                </Select>

                                <Select
                                    value={coordinatesFilter}
                                    onValueChange={(value) =>
                                        setCoordinatesFilter(
                                            value as CoordinatesFilter,
                                        )
                                    }
                                >
                                    <SelectTrigger
                                        aria-label="Filter by destination coordinates"
                                        className="w-[210px]"
                                    >
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">
                                            All routes
                                        </SelectItem>
                                        <SelectItem value="valid">
                                            Valid Coordinates
                                        </SelectItem>
                                        <SelectItem value="invalid">
                                            Missing or Invalid Coordinates
                                        </SelectItem>
                                    </SelectContent>
                                </Select>

                                {hasActiveFilters && (
                                    <Button
                                        variant="ghost"
                                        onClick={clearFilters}
                                        data-test="route-clear-filters"
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
                                        value="cards"
                                        aria-label="Card view"
                                        title="Card view"
                                    >
                                        <LayoutGrid className="h-4 w-4" />
                                    </ToggleGroupItem>
                                    <ToggleGroupItem
                                        value="table"
                                        aria-label="Table view"
                                        title="Table view"
                                    >
                                        <List className="h-4 w-4" />
                                    </ToggleGroupItem>
                                </ToggleGroup>
                            </div>
                        </div>

                        <p className="text-muted-foreground text-sm">
                            Showing {filteredRoutes.length} of {summary.total}{' '}
                            routes
                        </p>

                        {filteredRoutes.length === 0 ? (
                            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-12 text-center">
                                <p className="text-muted-foreground text-sm">
                                    No routes match your search or filters.
                                </p>
                                <Button
                                    variant="ghost"
                                    className="mt-2"
                                    onClick={clearFilters}
                                    data-test="route-empty-clear"
                                >
                                    Clear Filters
                                </Button>
                            </div>
                        ) : view === 'cards' ? (
                            <div
                                data-test="route-cards-view"
                                className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
                            >
                                {filteredRoutes.map((route) => {
                                    const busNumbers = route.buses
                                        .map((bus) => bus.bus_number)
                                        .join(', ');
                                    const coordinateText = formatCoordinatePair(
                                        route.destination_lat,
                                        route.destination_lng,
                                    );

                                    return (
                                        <Card
                                            key={route.id}
                                            className="flex flex-col py-5"
                                        >
                                            <CardContent className="flex flex-1 flex-col gap-4 px-5">
                                                <div className="flex items-start gap-3">
                                                    <div className="bg-primary/10 text-primary-strong flex size-10 shrink-0 items-center justify-center rounded-lg">
                                                        <RouteIcon className="size-5" />
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <p className="truncate font-medium">
                                                            {route.name}
                                                        </p>
                                                        <p className="text-muted-foreground flex items-center gap-1 text-xs">
                                                            <span className="truncate">
                                                                {route.origin}
                                                            </span>
                                                            <ArrowRight className="h-3 w-3 shrink-0" />
                                                            <span className="truncate">
                                                                {
                                                                    route.destination
                                                                }
                                                            </span>
                                                        </p>
                                                    </div>
                                                </div>

                                                <div className="flex flex-wrap gap-1.5">
                                                    <StatusBadge
                                                        status={route.status}
                                                    />
                                                    <CoordinatesBadge
                                                        valid={
                                                            route.has_valid_coordinates
                                                        }
                                                    />
                                                    {route.has_in_transit_trip && (
                                                        <TripBadge />
                                                    )}
                                                </div>

                                                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                                                    <div className="min-w-0">
                                                        <dt className="text-muted-foreground text-xs">
                                                            Assigned Buses
                                                        </dt>
                                                        <dd
                                                            className="truncate"
                                                            title={
                                                                busNumbers ||
                                                                undefined
                                                            }
                                                        >
                                                            {route.buses
                                                                .length > 0 ? (
                                                                <span className="font-medium">
                                                                    {busNumbers}
                                                                </span>
                                                            ) : (
                                                                <span className="text-muted-foreground">
                                                                    No bus
                                                                    assigned
                                                                </span>
                                                            )}
                                                        </dd>
                                                    </div>
                                                    <div className="min-w-0">
                                                        <dt className="text-muted-foreground text-xs">
                                                            Destination
                                                            Coordinates
                                                        </dt>
                                                        <dd className="truncate">
                                                            {coordinateText ? (
                                                                <span>
                                                                    {
                                                                        coordinateText
                                                                    }
                                                                </span>
                                                            ) : (
                                                                <span className="text-muted-foreground">
                                                                    Not set
                                                                </span>
                                                            )}
                                                        </dd>
                                                    </div>
                                                </dl>

                                                <div className="bg-muted/30 flex items-center justify-between gap-3 rounded-lg border border-dashed px-4 py-3">
                                                    {route.has_valid_coordinates ? (
                                                        <>
                                                            <div className="flex min-w-0 items-center gap-2">
                                                                <MapPin className="text-primary-strong h-4 w-4 shrink-0" />
                                                                <span className="truncate text-xs">
                                                                    {
                                                                        coordinateText
                                                                    }
                                                                </span>
                                                            </div>
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                className="shrink-0"
                                                                onClick={() =>
                                                                    setMapRoute(
                                                                        route,
                                                                    )
                                                                }
                                                                data-test="route-map-preview"
                                                            >
                                                                <Map className="h-4 w-4" />
                                                                Preview
                                                            </Button>
                                                        </>
                                                    ) : (
                                                        <div className="flex min-w-0 items-center gap-2">
                                                            <MapPinOff className="text-muted-foreground h-4 w-4 shrink-0" />
                                                            <span className="text-muted-foreground text-xs">
                                                                No destination
                                                                coordinates —
                                                                add them to
                                                                enable the map
                                                                preview.
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="mt-auto border-t pt-4">
                                                    <div className="flex items-center justify-end gap-1.5">
                                                        <Button
                                                            asChild
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-8 w-8"
                                                        >
                                                            <Link
                                                                href={`/admin/routes/${route.id}/edit`}
                                                            >
                                                                <Edit2 className="h-4 w-4" />
                                                                <span className="sr-only">
                                                                    Edit
                                                                </span>
                                                            </Link>
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="text-destructive-strong hover:bg-destructive/10 h-8 w-8"
                                                            title={deleteBlockedTitle(
                                                                route,
                                                            )}
                                                            disabled={isDeleteBlocked(
                                                                route,
                                                            )}
                                                            onClick={() =>
                                                                setRouteToDelete(
                                                                    route,
                                                                )
                                                            }
                                                            data-test="route-delete"
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                            <span className="sr-only">
                                                                Delete
                                                            </span>
                                                        </Button>
                                                    </div>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    );
                                })}
                            </div>
                        ) : (
                            <div data-test="route-table-view">
                                <Table containerClassName="rounded-lg border">
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Route Name</TableHead>
                                            <TableHead>Origin</TableHead>
                                            <TableHead>Destination</TableHead>
                                            <TableHead>
                                                Assigned Buses
                                            </TableHead>
                                            <TableHead>
                                                Destination Coordinates
                                            </TableHead>
                                            <TableHead>Status</TableHead>
                                            <TableHead className="text-right">
                                                Actions
                                            </TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {filteredRoutes.map((route) => {
                                            const busNumbers = route.buses
                                                .map((bus) => bus.bus_number)
                                                .join(', ');
                                            const coordinateText =
                                                formatCoordinatePair(
                                                    route.destination_lat,
                                                    route.destination_lng,
                                                );

                                            return (
                                                <TableRow key={route.id}>
                                                    <TableCell className="max-w-[220px] font-medium">
                                                        <span className="block truncate">
                                                            {route.name}
                                                        </span>
                                                    </TableCell>
                                                    <TableCell className="max-w-[180px]">
                                                        <span className="block truncate">
                                                            {route.origin}
                                                        </span>
                                                    </TableCell>
                                                    <TableCell className="max-w-[180px]">
                                                        <span className="block truncate">
                                                            {route.destination}
                                                        </span>
                                                    </TableCell>
                                                    <TableCell className="max-w-[200px]">
                                                        {busNumbers ? (
                                                            <span
                                                                className="block truncate"
                                                                title={
                                                                    busNumbers
                                                                }
                                                            >
                                                                {busNumbers}
                                                            </span>
                                                        ) : (
                                                            <span className="text-muted-foreground">
                                                                No bus assigned
                                                            </span>
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="whitespace-nowrap">
                                                        {coordinateText ? (
                                                            <span>
                                                                {coordinateText}
                                                            </span>
                                                        ) : (
                                                            <span className="text-muted-foreground">
                                                                Not set
                                                            </span>
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="whitespace-nowrap">
                                                        <div className="flex flex-wrap gap-1.5">
                                                            <StatusBadge
                                                                status={
                                                                    route.status
                                                                }
                                                            />
                                                            {route.has_in_transit_trip && (
                                                                <TripBadge />
                                                            )}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-right whitespace-nowrap">
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-8 w-8"
                                                            title={
                                                                route.has_valid_coordinates
                                                                    ? 'Preview destination map'
                                                                    : 'No destination coordinates to preview'
                                                            }
                                                            disabled={
                                                                !route.has_valid_coordinates
                                                            }
                                                            onClick={() =>
                                                                setMapRoute(
                                                                    route,
                                                                )
                                                            }
                                                            data-test="route-table-preview"
                                                        >
                                                            <Map className="h-4 w-4" />
                                                            <span className="sr-only">
                                                                Preview Map
                                                            </span>
                                                        </Button>
                                                        <Button
                                                            asChild
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-8 w-8"
                                                        >
                                                            <Link
                                                                href={`/admin/routes/${route.id}/edit`}
                                                            >
                                                                <Edit2 className="h-4 w-4" />
                                                                <span className="sr-only">
                                                                    Edit
                                                                </span>
                                                            </Link>
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="text-destructive-strong hover:bg-destructive/10 h-8 w-8"
                                                            title={deleteBlockedTitle(
                                                                route,
                                                            )}
                                                            disabled={isDeleteBlocked(
                                                                route,
                                                            )}
                                                            onClick={() =>
                                                                setRouteToDelete(
                                                                    route,
                                                                )
                                                            }
                                                            data-test="route-table-delete"
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                            <span className="sr-only">
                                                                Delete
                                                            </span>
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            </div>
                        )}
                    </>
                )}
            </div>

            <Dialog
                open={routeToDelete !== null}
                onOpenChange={(open) => {
                    if (!open) {
                        setRouteToDelete(null);
                    }
                }}
            >
                <DialogContent data-test="route-delete-dialog">
                    <DialogHeader>
                        <DialogTitle>Delete Route</DialogTitle>
                        <DialogDescription>
                            Are you sure you want to delete route{' '}
                            <span className="text-foreground font-medium">
                                {routeToDelete?.name}
                            </span>{' '}
                            ({routeToDelete?.origin} →{' '}
                            {routeToDelete?.destination})? This action cannot be
                            undone.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button
                            variant="ghost"
                            onClick={() => setRouteToDelete(null)}
                            disabled={deleting}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={confirmDelete}
                            disabled={deleting}
                        >
                            {deleting ? 'Deleting...' : 'Delete Route'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog
                open={mapRoute !== null}
                onOpenChange={(open) => {
                    if (!open) {
                        setMapRoute(null);
                    }
                }}
            >
                <DialogContent
                    className="sm:max-w-2xl"
                    data-test="route-preview-dialog"
                >
                    <DialogHeader>
                        <DialogTitle>Map Preview</DialogTitle>
                        <DialogDescription>
                            {mapRoute
                                ? `${mapRoute.name} — ${mapRoute.origin} → ${mapRoute.destination}`
                                : ''}
                        </DialogDescription>
                    </DialogHeader>
                    {mapRoute && (
                        <div className="flex flex-col gap-3">
                            <RouteCoordinatePreview
                                latitude={mapRoute.destination_lat}
                                longitude={mapRoute.destination_lng}
                                label={mapRoute.destination}
                                className="h-80"
                            />
                            <p
                                className="text-muted-foreground text-xs"
                                data-test="route-preview-coordinates"
                            >
                                Destination coordinates:{' '}
                                {formatCoordinatePair(
                                    mapRoute.destination_lat,
                                    mapRoute.destination_lng,
                                ) ?? 'Not set'}
                            </p>
                            <p className="text-muted-foreground text-xs">
                                The map shows the stored destination marker only
                                — road geometry is not stored for this route.
                            </p>
                        </div>
                    )}
                    <DialogFooter>
                        <Button
                            variant="ghost"
                            onClick={() => setMapRoute(null)}
                            data-test="route-preview-close"
                        >
                            Close
                        </Button>
                        {mapRoute && (
                            <Button asChild>
                                <Link
                                    href={`/admin/routes/${mapRoute.id}/edit`}
                                >
                                    <Edit2 className="h-4 w-4" />
                                    Edit Route
                                </Link>
                            </Button>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </AppSidebarLayout>
    );
}
