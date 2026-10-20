import { Head, Link, router } from '@inertiajs/react';
import type { LucideIcon } from 'lucide-react';
import {
    BusFront,
    CircleCheck,
    Edit2,
    FilterX,
    LayoutGrid,
    Link2Off,
    List,
    Navigation,
    Plus,
    PowerOff,
    Repeat,
    Search,
    Trash2,
    UserCheck,
    Users,
    X,
} from 'lucide-react';
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
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { UserAvatar } from '@/components/user-avatar';
import AppSidebarLayout from '@/layouts/app/app-sidebar-layout';
import { cn } from '@/lib/utils';

type User = {
    id: number;
    name: string;
    email: string;
    avatar?: string | null;
};

type AssignedBus = {
    id: number;
    bus_number: string;
    plate_number: string;
};

type Driver = {
    id: number;
    user_id: number;
    license_number: string;
    license_expiry: string | null;
    phone: string | null;
    address: string | null;
    status: string;
    bus_id: number | null;
    user: User | null;
    bus: AssignedBus | null;
    has_in_transit_trip: boolean;
};

type BusOption = {
    id: number;
    bus_number: string;
    plate_number: string;
};

type StatusFilter = 'all' | 'active' | 'inactive';

type AssignmentFilter = 'all' | 'assigned' | 'unassigned';

type ViewMode = 'cards' | 'table';

type Props = {
    drivers: Driver[];
    availableBuses: BusOption[];
};

function driverName(driver: Driver): string {
    return driver.user?.name ?? 'Unknown';
}

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

function formatDate(value: string | null | undefined): string {
    if (!value) {
        return '-';
    }
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    if (!match) {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return '-';
        }
        return date.toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
        });
    }
    const date = new Date(
        Number(match[1]),
        Number(match[2]) - 1,
        Number(match[3]),
    );
    if (Number.isNaN(date.getTime())) {
        return '-';
    }
    return date.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    });
}

export default function AdminDriversIndexPage({
    drivers,
    availableBuses,
}: Props) {
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
    const [assignmentFilter, setAssignmentFilter] =
        useState<AssignmentFilter>('all');
    const [view, setView] = useState<ViewMode>('cards');
    const [driverToDelete, setDriverToDelete] = useState<Driver | null>(null);
    const [assignTarget, setAssignTarget] = useState<Driver | null>(null);
    const [selectedBusId, setSelectedBusId] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [unassignTarget, setUnassignTarget] = useState<Driver | null>(null);
    const [unassigning, setUnassigning] = useState(false);

    const counts = useMemo(
        () => ({
            total: drivers.length,
            active: drivers.filter((driver) => driver.status === 'active')
                .length,
            inactive: drivers.filter((driver) => driver.status !== 'active')
                .length,
            assigned: drivers.filter((driver) => driver.bus_id !== null).length,
        }),
        [drivers],
    );

    const filteredDrivers = useMemo(() => {
        const query = search.trim().toLowerCase();

        return drivers.filter((driver) => {
            if (query) {
                const matchesQuery = [
                    driver.user?.name ?? '',
                    driver.user?.email ?? '',
                    driver.license_number,
                    driver.phone ?? '',
                ].some((field) => field.toLowerCase().includes(query));

                if (!matchesQuery) {
                    return false;
                }
            }

            if (statusFilter !== 'all' && driver.status !== statusFilter) {
                return false;
            }

            if (assignmentFilter === 'assigned' && driver.bus_id === null) {
                return false;
            }

            if (assignmentFilter === 'unassigned' && driver.bus_id !== null) {
                return false;
            }

            return true;
        });
    }, [drivers, search, statusFilter, assignmentFilter]);

    const hasActiveFilters =
        search.trim() !== '' ||
        statusFilter !== 'all' ||
        assignmentFilter !== 'all';

    const clearFilters = () => {
        setSearch('');
        setStatusFilter('all');
        setAssignmentFilter('all');
    };

    const confirmDelete = () => {
        if (driverToDelete) {
            router.delete(`/admin/drivers/${driverToDelete.id}`);
            setDriverToDelete(null);
        }
    };

    const openAssignDialog = (driver: Driver) => {
        setAssignTarget(driver);
        setSelectedBusId('');
        setSubmitting(false);
    };

    const handleAssignSubmit = () => {
        if (!assignTarget || !selectedBusId || submitting) {
            return;
        }

        const busId = Number(selectedBusId);
        if (!Number.isInteger(busId)) {
            return;
        }

        setSubmitting(true);

        router.post(
            `/admin/buses/${busId}/assign-driver`,
            { driver_id: assignTarget.id },
            {
                preserveScroll: true,
                onSuccess: () => {
                    setAssignTarget(null);
                    setSelectedBusId('');
                    setSubmitting(false);
                    // The bus endpoints redirect to Bus Management, so return
                    // to this page to reflect the new assignment.
                    router.visit('/admin/drivers', { preserveScroll: true });
                },
                onError: () => setSubmitting(false),
            },
        );
    };

    const handleUnassignSubmit = () => {
        if (!unassignTarget || unassignTarget.bus_id === null || unassigning) {
            return;
        }

        setUnassigning(true);

        router.post(
            `/admin/buses/${unassignTarget.bus_id}/unassign-driver`,
            {},
            {
                preserveScroll: true,
                onSuccess: () => {
                    setUnassignTarget(null);
                    setUnassigning(false);
                    router.visit('/admin/drivers', { preserveScroll: true });
                },
                onError: () => setUnassigning(false),
            },
        );
    };

    const renderActions = (driver: Driver) => {
        const tripProtected = driver.has_in_transit_trip;
        const tripTitle =
            'Cannot change assignments while the bus has a trip in progress';

        return (
            <div className="flex items-center justify-end gap-1.5">
                {driver.bus_id === null ? (
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openAssignDialog(driver)}
                    >
                        <BusFront className="h-4 w-4" />
                        Assign Bus
                    </Button>
                ) : (
                    <>
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={tripProtected}
                            title={tripProtected ? tripTitle : undefined}
                            onClick={() => openAssignDialog(driver)}
                        >
                            <Repeat className="h-4 w-4" />
                            Change Bus
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive-strong hover:bg-destructive/10 h-8 w-8"
                            title={
                                tripProtected
                                    ? tripTitle
                                    : 'Unassign the driver from this bus'
                            }
                            disabled={tripProtected}
                            onClick={() => setUnassignTarget(driver)}
                        >
                            <Link2Off className="h-4 w-4" />
                            <span className="sr-only">Unassign Bus</span>
                        </Button>
                    </>
                )}
                <Button asChild variant="ghost" size="icon" className="h-8 w-8">
                    <Link href={`/admin/drivers/${driver.id}/edit`}>
                        <Edit2 className="h-4 w-4" />
                        <span className="sr-only">Edit</span>
                    </Link>
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive-strong hover:bg-destructive/10 h-8 w-8"
                    title={
                        tripProtected
                            ? 'Cannot delete a driver whose bus has a trip in progress'
                            : 'Delete driver'
                    }
                    disabled={tripProtected}
                    onClick={() => setDriverToDelete(driver)}
                >
                    <Trash2 className="h-4 w-4" />
                    <span className="sr-only">Delete</span>
                </Button>
            </div>
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
                    title: 'Drivers',
                    href: '/admin/drivers',
                },
            ]}
        >
            <Head title="Drivers" />

            <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h1 className="text-2xl font-semibold">
                            Driver Management
                        </h1>
                        <p className="text-muted-foreground">
                            Manage driver profiles and bus assignments.
                        </p>
                    </div>
                    <Button asChild className="sm:shrink-0">
                        <Link href="/admin/drivers/create">
                            <Plus className="h-4 w-4" />
                            Add Driver
                        </Link>
                    </Button>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <SummaryCard
                        label="Total Drivers"
                        value={counts.total}
                        sublabel="Registered profiles"
                        icon={Users}
                    />
                    <SummaryCard
                        label="Active Drivers"
                        value={counts.active}
                        sublabel="Currently active"
                        icon={CircleCheck}
                    />
                    <SummaryCard
                        label="Inactive Drivers"
                        value={counts.inactive}
                        sublabel="Not currently active"
                        icon={PowerOff}
                    />
                    <SummaryCard
                        label="Assigned Drivers"
                        value={counts.assigned}
                        sublabel="With an assigned bus"
                        icon={UserCheck}
                    />
                </div>

                {drivers.length === 0 ? (
                    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-16 text-center">
                        <div className="bg-muted mb-4 flex h-12 w-12 items-center justify-center rounded-full">
                            <Users className="text-muted-foreground h-6 w-6" />
                        </div>
                        <h2 className="text-base font-semibold">
                            No drivers yet
                        </h2>
                        <p className="text-muted-foreground mt-1 max-w-sm text-sm">
                            Add your first driver to start building your fleet.
                        </p>
                        <Button className="mt-4" asChild>
                            <Link href="/admin/drivers/create">
                                <Plus className="h-4 w-4" />
                                Add your first driver
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
                                    placeholder="Search by name, email, license, phone..."
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    className="pr-9 pl-9"
                                    aria-label="Search drivers"
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

                                {hasActiveFilters && (
                                    <Button
                                        variant="ghost"
                                        onClick={clearFilters}
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
                            Showing {filteredDrivers.length} of {counts.total}{' '}
                            drivers
                        </p>

                        {filteredDrivers.length === 0 ? (
                            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-12 text-center">
                                <p className="text-muted-foreground text-sm">
                                    No drivers match your filters.
                                </p>
                                <Button
                                    variant="ghost"
                                    className="mt-2"
                                    onClick={clearFilters}
                                >
                                    Clear Filters
                                </Button>
                            </div>
                        ) : view === 'cards' ? (
                            <div
                                data-test="driver-cards-view"
                                className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
                            >
                                {filteredDrivers.map((driver) => (
                                    <Card
                                        key={driver.id}
                                        className="flex flex-col py-5"
                                    >
                                        <CardContent className="flex flex-1 flex-col gap-4 px-5">
                                            <div className="flex items-center gap-3">
                                                <UserAvatar
                                                    name={driverName(driver)}
                                                    src={driver.user?.avatar}
                                                    className="size-10"
                                                />
                                                <div className="min-w-0">
                                                    <p className="truncate font-medium">
                                                        {driverName(driver)}
                                                    </p>
                                                    {driver.user?.email && (
                                                        <p className="text-muted-foreground truncate text-xs">
                                                            {driver.user.email}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="flex flex-wrap gap-1.5">
                                                <StatusBadge
                                                    status={driver.status}
                                                />
                                                <AssignmentBadge
                                                    assigned={
                                                        driver.bus_id !== null
                                                    }
                                                />
                                                {driver.has_in_transit_trip && (
                                                    <TripBadge />
                                                )}
                                            </div>

                                            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                                                <div className="min-w-0">
                                                    <dt className="text-muted-foreground text-xs">
                                                        License Number
                                                    </dt>
                                                    <dd className="truncate font-medium">
                                                        {driver.license_number}
                                                    </dd>
                                                </div>
                                                <div className="min-w-0">
                                                    <dt className="text-muted-foreground text-xs">
                                                        License Expiry
                                                    </dt>
                                                    <dd>
                                                        {formatDate(
                                                            driver.license_expiry,
                                                        )}
                                                    </dd>
                                                </div>
                                                <div className="col-span-2 min-w-0">
                                                    <dt className="text-muted-foreground text-xs">
                                                        Assigned Bus
                                                    </dt>
                                                    <dd>
                                                        {driver.bus ? (
                                                            <span className="font-medium">
                                                                {
                                                                    driver.bus
                                                                        .bus_number
                                                                }
                                                                <span className="text-muted-foreground ml-2 text-xs font-normal">
                                                                    {
                                                                        driver
                                                                            .bus
                                                                            .plate_number
                                                                    }
                                                                </span>
                                                            </span>
                                                        ) : (
                                                            <span className="text-muted-foreground">
                                                                No bus assigned
                                                            </span>
                                                        )}
                                                    </dd>
                                                </div>
                                                <div className="col-span-2 min-w-0">
                                                    <dt className="text-muted-foreground text-xs">
                                                        Phone
                                                    </dt>
                                                    <dd>
                                                        {driver.phone ? (
                                                            <span>
                                                                {driver.phone}
                                                            </span>
                                                        ) : (
                                                            <span className="text-muted-foreground">
                                                                Not provided
                                                            </span>
                                                        )}
                                                    </dd>
                                                </div>
                                            </dl>

                                            <div className="mt-auto border-t pt-4">
                                                {renderActions(driver)}
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        ) : (
                            <div data-test="driver-table-view">
                                <Table containerClassName="rounded-lg border">
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Driver</TableHead>
                                            <TableHead>Contact</TableHead>
                                            <TableHead>
                                                License Number
                                            </TableHead>
                                            <TableHead>
                                                License Expiry
                                            </TableHead>
                                            <TableHead>Assigned Bus</TableHead>
                                            <TableHead>Status</TableHead>
                                            <TableHead className="text-right">
                                                Actions
                                            </TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {filteredDrivers.map((driver) => (
                                            <TableRow key={driver.id}>
                                                <TableCell>
                                                    <div className="flex items-center gap-3">
                                                        <UserAvatar
                                                            name={driverName(
                                                                driver,
                                                            )}
                                                            src={
                                                                driver.user
                                                                    ?.avatar
                                                            }
                                                            className="size-8"
                                                            fallbackClassName="text-xs"
                                                        />
                                                        <div className="min-w-0">
                                                            <div className="text-sm font-medium whitespace-nowrap">
                                                                {driverName(
                                                                    driver,
                                                                )}
                                                            </div>
                                                            {driver.user
                                                                ?.email && (
                                                                <div className="text-muted-foreground truncate text-xs">
                                                                    {
                                                                        driver
                                                                            .user
                                                                            .email
                                                                    }
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="whitespace-nowrap">
                                                    {driver.phone ?? '-'}
                                                </TableCell>
                                                <TableCell className="whitespace-nowrap">
                                                    {driver.license_number}
                                                </TableCell>
                                                <TableCell className="whitespace-nowrap">
                                                    {formatDate(
                                                        driver.license_expiry,
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    {driver.bus ? (
                                                        <>
                                                            <p className="text-sm font-medium whitespace-nowrap">
                                                                {
                                                                    driver.bus
                                                                        .bus_number
                                                                }
                                                            </p>
                                                            <p className="text-muted-foreground text-xs whitespace-nowrap">
                                                                {
                                                                    driver.bus
                                                                        .plate_number
                                                                }
                                                            </p>
                                                        </>
                                                    ) : (
                                                        <span className="text-muted-foreground text-sm">
                                                            No Bus Assigned
                                                        </span>
                                                    )}
                                                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                                                        <AssignmentBadge
                                                            assigned={
                                                                driver.bus_id !==
                                                                null
                                                            }
                                                        />
                                                        {driver.has_in_transit_trip && (
                                                            <TripBadge />
                                                        )}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="whitespace-nowrap">
                                                    <StatusBadge
                                                        status={driver.status}
                                                    />
                                                </TableCell>
                                                <TableCell className="text-right whitespace-nowrap">
                                                    {renderActions(driver)}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        )}
                    </>
                )}
            </div>

            <Dialog
                open={driverToDelete !== null}
                onOpenChange={(open) => {
                    if (!open) {
                        setDriverToDelete(null);
                    }
                }}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Delete Driver</DialogTitle>
                        <DialogDescription>
                            Are you sure you want to delete driver{' '}
                            <span className="text-foreground font-medium">
                                {driverToDelete
                                    ? driverName(driverToDelete)
                                    : 'Unknown'}
                            </span>
                            ? This action cannot be undone.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button
                            variant="ghost"
                            onClick={() => setDriverToDelete(null)}
                        >
                            Cancel
                        </Button>
                        <Button variant="destructive" onClick={confirmDelete}>
                            Delete Driver
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog
                open={assignTarget !== null}
                onOpenChange={(open) => {
                    if (!open && !submitting) {
                        setAssignTarget(null);
                        setSelectedBusId('');
                    }
                }}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>
                            {assignTarget?.bus_id != null
                                ? 'Change Bus'
                                : 'Assign Bus'}
                        </DialogTitle>
                        <DialogDescription>
                            Select a bus to assign to{' '}
                            <span className="text-foreground font-medium">
                                {assignTarget
                                    ? driverName(assignTarget)
                                    : 'Unknown'}
                            </span>
                            {assignTarget?.bus_id != null && (
                                <>
                                    {' '}
                                    (currently{' '}
                                    {assignTarget.bus
                                        ? `${assignTarget.bus.bus_number} · ${assignTarget.bus.plate_number}`
                                        : `Bus #${assignTarget.bus_id}`}
                                    ).
                                </>
                            )}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="grid gap-4">
                        {availableBuses.length === 0 ? (
                            <div className="rounded-lg border border-dashed px-4 py-6 text-center text-sm">
                                <p className="text-muted-foreground">
                                    No unassigned buses available.
                                </p>
                                <p className="text-muted-foreground mt-1 text-xs">
                                    Every bus already has a driver assigned.
                                </p>
                            </div>
                        ) : (
                            <div className="grid gap-2">
                                <span className="text-muted-foreground text-sm">
                                    Available Bus
                                </span>
                                <Select
                                    value={selectedBusId}
                                    onValueChange={setSelectedBusId}
                                >
                                    <SelectTrigger
                                        id="available-bus"
                                        aria-label="Available Bus"
                                        className="w-full"
                                    >
                                        <SelectValue placeholder="Select a bus" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {availableBuses.map((bus) => (
                                            <SelectItem
                                                key={bus.id}
                                                value={String(bus.id)}
                                            >
                                                {bus.bus_number} ·{' '}
                                                {bus.plate_number}
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
                            onClick={() => setAssignTarget(null)}
                        >
                            Cancel
                        </Button>
                        <Button
                            disabled={
                                submitting ||
                                availableBuses.length === 0 ||
                                !selectedBusId
                            }
                            onClick={handleAssignSubmit}
                        >
                            {submitting && <Spinner />}
                            {assignTarget?.bus_id != null
                                ? 'Change Bus'
                                : 'Assign Bus'}
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
                        <DialogTitle>Unassign Bus</DialogTitle>
                        <DialogDescription>
                            Remove bus{' '}
                            <span className="text-foreground font-medium">
                                {unassignTarget && unassignTarget.bus_id != null
                                    ? unassignTarget.bus
                                        ? `${unassignTarget.bus.bus_number} · ${unassignTarget.bus.plate_number}`
                                        : `#${unassignTarget.bus_id}`
                                    : '#'}
                            </span>{' '}
                            from driver{' '}
                            <span className="text-foreground font-medium">
                                {unassignTarget
                                    ? driverName(unassignTarget)
                                    : 'Unknown'}
                            </span>
                            ? The bus will become unassigned and available for
                            other drivers.
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
                            Unassign Bus
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </AppSidebarLayout>
    );
}
