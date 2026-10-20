import { Head, Link, router } from '@inertiajs/react';
import {
    Bus as BusIcon,
    BusFront,
    CircleCheck,
    Edit2,
    FilterX,
    Link2Off,
    Navigation,
    Plus,
    PowerOff,
    Repeat,
    Search,
    Trash2,
    UserCheck,
    UserPlus,
    X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
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
import { Spinner } from '@/components/ui/spinner';
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

type Props = {
    buses: Bus[];
    availableDrivers: BusDriver[];
};

type AssignmentFilter = 'all' | 'assigned' | 'unassigned';
type StatusFilter = 'all' | 'active' | 'inactive';

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

function AssignmentBadge({ assigned }: { assigned: boolean }) {
    return (
        <Badge
            variant="outline"
            className={cn(
                'gap-1',
                assigned
                    ? 'border-success/30 bg-success/10 text-foreground'
                    : 'text-muted-foreground',
            )}
        >
            <UserCheck className="h-3 w-3" />
            {assigned ? 'Assigned' : 'Unassigned'}
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

function DriverCell({ driver }: { driver: BusDriver | null }) {
    if (driver === null) {
        return (
            <span className="text-muted-foreground text-sm">Not assigned</span>
        );
    }
    return <span className="text-sm font-medium">{driver.name}</span>;
}

function RouteCell({ route }: { route: BusRoute | null }) {
    if (route === null) {
        return (
            <span className="text-muted-foreground text-sm">Not assigned</span>
        );
    }
    return (
        <>
            <p className="text-sm font-medium whitespace-nowrap">
                {route.name}
            </p>
            <p className="text-muted-foreground text-xs whitespace-nowrap">
                {route.origin} → {route.destination}
            </p>
        </>
    );
}

export default function AdminBusesIndexPage({
    buses,
    availableDrivers,
}: Props) {
    const [search, setSearch] = useState('');
    const [assignmentFilter, setAssignmentFilter] =
        useState<AssignmentFilter>('all');
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
    const [busToDelete, setBusToDelete] = useState<Bus | null>(null);
    const [assignTarget, setAssignTarget] = useState<Bus | null>(null);
    const [selectedDriverId, setSelectedDriverId] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [unassignTarget, setUnassignTarget] = useState<Bus | null>(null);
    const [unassigning, setUnassigning] = useState(false);

    const counts = useMemo(
        () => ({
            total: buses.length,
            active: buses.filter((bus) => bus.status === 'active').length,
            inactive: buses.filter((bus) => bus.status === 'inactive').length,
            assigned: buses.filter((bus) => bus.driver !== null).length,
        }),
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
                ].some((field) => field.toLowerCase().includes(query));

                if (!matchesQuery) {
                    return false;
                }
            }

            if (assignmentFilter === 'assigned' && bus.driver === null) {
                return false;
            }

            if (assignmentFilter === 'unassigned' && bus.driver !== null) {
                return false;
            }

            if (statusFilter !== 'all' && bus.status !== statusFilter) {
                return false;
            }

            return true;
        });
    }, [buses, search, assignmentFilter, statusFilter]);

    const hasActiveFilters =
        search.trim() !== '' ||
        assignmentFilter !== 'all' ||
        statusFilter !== 'all';

    const clearFilters = () => {
        setSearch('');
        setAssignmentFilter('all');
        setStatusFilter('all');
    };

    const confirmDelete = () => {
        if (busToDelete) {
            router.delete(`/admin/buses/${busToDelete.id}`);
            setBusToDelete(null);
        }
    };

    const openAssignDialog = (bus: Bus) => {
        setAssignTarget(bus);
        setSelectedDriverId('');
        setSubmitting(false);
    };

    const handleAssignSubmit = () => {
        if (!assignTarget || !selectedDriverId || submitting) {
            return;
        }

        const driverId = Number(selectedDriverId);
        if (!Number.isInteger(driverId)) {
            return;
        }

        setSubmitting(true);

        router.post(
            `/admin/buses/${assignTarget.id}/assign-driver`,
            { driver_id: driverId },
            {
                preserveScroll: true,
                onSuccess: () => {
                    setAssignTarget(null);
                    setSelectedDriverId('');
                    setSubmitting(false);
                },
                onError: () => setSubmitting(false),
            },
        );
    };

    const handleUnassignSubmit = () => {
        if (!unassignTarget || unassigning) {
            return;
        }

        setUnassigning(true);

        router.post(
            `/admin/buses/${unassignTarget.id}/unassign-driver`,
            {},
            {
                preserveScroll: true,
                onSuccess: () => {
                    setUnassignTarget(null);
                    setUnassigning(false);
                },
                onError: () => setUnassigning(false),
            },
        );
    };

    return (
        <AppSidebarLayout
            breadcrumbs={[
                {
                    title: 'Dashboard',
                    href: '/admin/dashboard',
                },
                {
                    title: 'Bus Management',
                    href: '/admin/buses',
                },
            ]}
        >
            <Head title="Bus Management" />

            <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h1 className="text-2xl font-semibold">
                            Bus Management
                        </h1>
                        <p className="text-muted-foreground">
                            Manage fleet records, driver assignments, and
                            operational status of every bus.
                        </p>
                    </div>
                    <Button asChild className="sm:shrink-0">
                        <Link href="/admin/buses/create">
                            <Plus className="h-4 w-4" />
                            Add Bus
                        </Link>
                    </Button>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <SummaryCard
                        label="Total Buses"
                        value={counts.total}
                        sublabel="In the fleet"
                        icon={BusIcon}
                    />
                    <SummaryCard
                        label="Active Buses"
                        value={counts.active}
                        sublabel="Operational"
                        icon={CircleCheck}
                    />
                    <SummaryCard
                        label="Inactive Buses"
                        value={counts.inactive}
                        sublabel="Not operational"
                        icon={PowerOff}
                    />
                    <SummaryCard
                        label="Assigned Buses"
                        value={counts.assigned}
                        sublabel="With an assigned driver"
                        icon={UserCheck}
                    />
                </div>

                {buses.length === 0 ? (
                    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-16 text-center">
                        <div className="bg-muted mb-4 flex h-12 w-12 items-center justify-center rounded-full">
                            <BusFront className="text-muted-foreground h-6 w-6" />
                        </div>
                        <h2 className="text-base font-semibold">
                            No buses yet
                        </h2>
                        <p className="text-muted-foreground mt-1 max-w-sm text-sm">
                            Add your first bus to start building your fleet.
                        </p>
                        <Button className="mt-4" asChild>
                            <Link href="/admin/buses/create">
                                <Plus className="h-4 w-4" />
                                Add your first bus
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
                                    placeholder="Search by bus or plate number..."
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    className="pr-9 pl-9"
                                    aria-label="Search buses"
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
                                    value={assignmentFilter}
                                    onValueChange={(value) =>
                                        setAssignmentFilter(
                                            value as AssignmentFilter,
                                        )
                                    }
                                >
                                    <SelectTrigger
                                        aria-label="Filter by assignment"
                                        className="w-[170px]"
                                    >
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">
                                            All assignments
                                        </SelectItem>
                                        <SelectItem value="assigned">
                                            Assigned
                                        </SelectItem>
                                        <SelectItem value="unassigned">
                                            Unassigned
                                        </SelectItem>
                                    </SelectContent>
                                </Select>

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

                                {hasActiveFilters && (
                                    <Button
                                        variant="ghost"
                                        onClick={clearFilters}
                                    >
                                        <FilterX className="h-4 w-4" />
                                        Clear Filters
                                    </Button>
                                )}
                            </div>
                        </div>

                        <p className="text-muted-foreground text-sm">
                            Showing {filteredBuses.length} of {counts.total}{' '}
                            buses
                        </p>

                        {filteredBuses.length === 0 ? (
                            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-12 text-center">
                                <p className="text-muted-foreground text-sm">
                                    No buses match your filters.
                                </p>
                                <Button
                                    variant="ghost"
                                    className="mt-2"
                                    onClick={clearFilters}
                                >
                                    Clear Filters
                                </Button>
                            </div>
                        ) : (
                            <Table containerClassName="rounded-lg border">
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Bus</TableHead>
                                        <TableHead>Plate Number</TableHead>
                                        <TableHead>Assigned Driver</TableHead>
                                        <TableHead>Assigned Route</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>Assignment</TableHead>
                                        <TableHead className="text-right">
                                            Actions
                                        </TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredBuses.map((bus) => (
                                        <TableRow key={bus.id}>
                                            <TableCell className="whitespace-nowrap">
                                                <p className="font-medium">
                                                    {bus.bus_number}
                                                </p>
                                                <p className="text-muted-foreground text-xs">
                                                    {[
                                                        bus.model,
                                                        bus.capacity !== null
                                                            ? `${bus.capacity} seats`
                                                            : null,
                                                    ]
                                                        .filter(Boolean)
                                                        .join(' · ') || '—'}
                                                </p>
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
                                                <RouteCell route={bus.route} />
                                            </TableCell>
                                            <TableCell className="whitespace-nowrap">
                                                <div className="flex flex-col items-start gap-1">
                                                    <StatusBadge
                                                        status={bus.status}
                                                    />
                                                    {bus.has_in_transit_trip && (
                                                        <TripBadge />
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell className="whitespace-nowrap">
                                                <AssignmentBadge
                                                    assigned={
                                                        bus.driver !== null
                                                    }
                                                />
                                            </TableCell>
                                            <TableCell className="text-right whitespace-nowrap">
                                                <div className="flex items-center justify-end gap-1.5">
                                                    {bus.driver === null ? (
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={() =>
                                                                openAssignDialog(
                                                                    bus,
                                                                )
                                                            }
                                                        >
                                                            <UserPlus className="h-4 w-4" />
                                                            Assign Driver
                                                        </Button>
                                                    ) : (
                                                        <>
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                disabled={
                                                                    bus.has_in_transit_trip
                                                                }
                                                                title={
                                                                    bus.has_in_transit_trip
                                                                        ? 'Trip in progress — end the trip first'
                                                                        : 'Change driver'
                                                                }
                                                                onClick={() =>
                                                                    openAssignDialog(
                                                                        bus,
                                                                    )
                                                                }
                                                            >
                                                                <Repeat className="h-4 w-4" />
                                                                Change Driver
                                                            </Button>
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                className="text-destructive-strong hover:bg-destructive/10 h-8 w-8"
                                                                disabled={
                                                                    bus.has_in_transit_trip
                                                                }
                                                                title={
                                                                    bus.has_in_transit_trip
                                                                        ? 'Trip in progress — end the trip first'
                                                                        : 'Unassign driver'
                                                                }
                                                                onClick={() =>
                                                                    setUnassignTarget(
                                                                        bus,
                                                                    )
                                                                }
                                                            >
                                                                <Link2Off className="h-4 w-4" />
                                                                <span className="sr-only">
                                                                    Unassign
                                                                    Driver
                                                                </span>
                                                            </Button>
                                                        </>
                                                    )}
                                                    <Button
                                                        asChild
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8"
                                                    >
                                                        <Link
                                                            href={`/admin/buses/${bus.id}/edit`}
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
                                                        disabled={
                                                            bus.has_in_transit_trip
                                                        }
                                                        title={
                                                            bus.has_in_transit_trip
                                                                ? 'Trip in progress — end the trip first'
                                                                : 'Delete bus'
                                                        }
                                                        onClick={() =>
                                                            setBusToDelete(bus)
                                                        }
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                        <span className="sr-only">
                                                            Delete
                                                        </span>
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </>
                )}
            </div>

            <Dialog
                open={assignTarget !== null}
                onOpenChange={(open) => {
                    if (!open && !submitting) {
                        setAssignTarget(null);
                        setSelectedDriverId('');
                    }
                }}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>
                            {assignTarget?.driver
                                ? 'Change Driver'
                                : 'Assign Driver'}
                        </DialogTitle>
                        <DialogDescription>
                            Select a driver for{' '}
                            <span className="text-foreground font-medium">
                                {assignTarget
                                    ? `${assignTarget.bus_number} · ${assignTarget.plate_number}`
                                    : ''}
                            </span>
                            {assignTarget?.driver && (
                                <>
                                    {' '}
                                    (currently{' '}
                                    <span className="text-foreground font-medium">
                                        {assignTarget.driver.name}
                                    </span>
                                    )
                                </>
                            )}
                            . The bus will be set to Active automatically.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="grid gap-4">
                        {availableDrivers.length === 0 ? (
                            <div className="rounded-lg border border-dashed px-4 py-6 text-center text-sm">
                                <p className="text-muted-foreground">
                                    No unassigned drivers available.
                                </p>
                                <p className="text-muted-foreground mt-1 text-xs">
                                    Every driver already has a bus assigned.
                                </p>
                            </div>
                        ) : (
                            <div className="grid gap-2">
                                <span className="text-muted-foreground text-sm">
                                    Driver
                                </span>
                                <Select
                                    value={selectedDriverId}
                                    onValueChange={setSelectedDriverId}
                                >
                                    <SelectTrigger
                                        aria-label="Driver"
                                        className="w-full"
                                    >
                                        <SelectValue placeholder="Select a driver" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {availableDrivers.map((driver) => (
                                            <SelectItem
                                                key={driver.id}
                                                value={String(driver.id)}
                                            >
                                                {driver.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}
                    </div>

                    <DialogFooter>
                        <Button
                            variant="ghost"
                            disabled={submitting}
                            onClick={() => {
                                setAssignTarget(null);
                                setSelectedDriverId('');
                            }}
                        >
                            Cancel
                        </Button>
                        <Button
                            disabled={
                                submitting ||
                                availableDrivers.length === 0 ||
                                !selectedDriverId
                            }
                            onClick={handleAssignSubmit}
                        >
                            {submitting && <Spinner />}
                            {assignTarget?.driver
                                ? 'Change Driver'
                                : 'Assign Driver'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog
                open={unassignTarget !== null}
                onOpenChange={(open) => {
                    if (!open && !unassigning) {
                        setUnassignTarget(null);
                    }
                }}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Unassign Driver</DialogTitle>
                        <DialogDescription>
                            Remove{' '}
                            <span className="text-foreground font-medium">
                                {unassignTarget?.driver?.name ?? 'the driver'}
                            </span>{' '}
                            from{' '}
                            <span className="text-foreground font-medium">
                                {unassignTarget
                                    ? `${unassignTarget.bus_number} · ${unassignTarget.plate_number}`
                                    : ''}
                            </span>
                            ? The bus will be set to Inactive automatically and
                            become available for reassignment.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button
                            variant="ghost"
                            disabled={unassigning}
                            onClick={() => setUnassignTarget(null)}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            disabled={unassigning}
                            onClick={handleUnassignSubmit}
                        >
                            {unassigning && <Spinner />}
                            Unassign Driver
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog
                open={busToDelete !== null}
                onOpenChange={(open) => {
                    if (!open) {
                        setBusToDelete(null);
                    }
                }}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Delete Bus</DialogTitle>
                        <DialogDescription>
                            Are you sure you want to delete bus{' '}
                            <span className="text-foreground font-medium">
                                {busToDelete?.bus_number}
                            </span>{' '}
                            ({busToDelete?.plate_number})? This action cannot be
                            undone.
                            {busToDelete?.driver && (
                                <>
                                    {' '}
                                    The assigned driver{' '}
                                    <span className="text-foreground font-medium">
                                        {busToDelete.driver.name}
                                    </span>{' '}
                                    will become unassigned.
                                </>
                            )}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button
                            variant="ghost"
                            onClick={() => setBusToDelete(null)}
                        >
                            Cancel
                        </Button>
                        <Button variant="destructive" onClick={confirmDelete}>
                            Delete Bus
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </AppSidebarLayout>
    );
}
