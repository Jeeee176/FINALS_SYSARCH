import { Head } from '@inertiajs/react';
import { LayoutGrid, List, Search, Users, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
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

type Status = 'active' | 'inactive';

type Route = {
    id: number;
    name: string;
};

type Bus = {
    id: number;
    bus_number: string;
    route: Route | null;
};

type User = {
    id: number;
    name: string;
    email: string;
};

type Driver = {
    id: number;
    user_id: number;
    license_number: string | null;
    license_expiry: string | null;
    phone: string | null;
    address: string | null;
    status: Status;
    bus: Bus | null;
    user: User | null;
};

type Props = {
    drivers: Driver[];
};

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

function formatLicenseDate(value: string | null): string {
    if (!value) return '—';

    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
        const date = new Date(
            Number(match[1]),
            Number(match[2]) - 1,
            Number(match[3]),
        );
        if (!Number.isNaN(date.getTime())) {
            return date.toLocaleDateString(undefined, {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
            });
        }
    }

    return value;
}

function LicenseStatus({ expiry }: { expiry: string | null }) {
    if (!expiry) return null;

    const match = expiry.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return null;

    const expiryDate = new Date(
        Number(match[1]),
        Number(match[2]) - 1,
        Number(match[3]),
    );
    if (Number.isNaN(expiryDate.getTime())) return null;

    const daysUntil = Math.floor(
        (expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
    );

    if (daysUntil < 0) {
        return (
            <Badge className="bg-destructive text-destructive-foreground border-transparent">
                Expired
            </Badge>
        );
    }
    if (daysUntil <= 30) {
        return (
            <Badge className="bg-warning text-warning-foreground border-transparent">
                Expiring soon
            </Badge>
        );
    }
    return null;
}

function EmptyState() {
    return (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-16 text-center">
            <div className="bg-muted text-muted-foreground flex size-12 items-center justify-center rounded-full">
                <Users className="size-6" />
            </div>
            <p className="mt-3 text-sm font-medium">No drivers found</p>
            <p className="text-muted-foreground mt-1 max-w-sm text-sm">
                Try adjusting your search or filter criteria.
            </p>
        </div>
    );
}

export default function OperatorDriversPage({ drivers }: Props) {
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [assignmentFilter, setAssignmentFilter] = useState('all');
    const [view, setView] = useState<ViewMode>('table');

    const filteredDrivers = useMemo(() => {
        const query = search.trim().toLowerCase();

        return drivers.filter((driver) => {
            const matchesSearch =
                !query ||
                [
                    driver.user?.name ?? '',
                    driver.user?.email ?? '',
                    driver.license_number ?? '',
                    driver.phone ?? '',
                    driver.address ?? '',
                    driver.bus?.bus_number ?? '',
                    driver.bus?.route?.name ?? '',
                ].some((field) => field.toLowerCase().includes(query));

            const matchesStatus =
                statusFilter === 'all' || driver.status === statusFilter;

            const matchesAssignment =
                assignmentFilter === 'all' ||
                (assignmentFilter === 'assigned' && driver.bus !== null) ||
                (assignmentFilter === 'unassigned' && driver.bus === null);

            return matchesSearch && matchesStatus && matchesAssignment;
        });
    }, [drivers, search, statusFilter, assignmentFilter]);

    const assignedCount = drivers.filter(
        (driver) => driver.bus !== null,
    ).length;
    const unassignedCount = drivers.filter(
        (driver) => driver.bus === null,
    ).length;

    return (
        <OperatorSidebarLayout
            breadcrumbs={[
                {
                    title: 'Dashboard',
                    href: '/operator/dashboard',
                },
                {
                    title: 'Driver Operations',
                    href: '/operator/drivers',
                },
            ]}
        >
            <Head title="Driver Operations" />

            <div className="flex flex-col gap-6">
                <div className="flex items-center gap-4">
                    <div className="bg-primary/10 text-primary-strong flex size-11 shrink-0 items-center justify-center rounded-xl">
                        <Users className="size-6" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-semibold">
                            Driver Operations
                        </h1>
                        <p className="text-muted-foreground">
                            Review driver details, license status, and bus
                            assignments.
                        </p>
                    </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-lg border p-4">
                        <p className="text-muted-foreground text-xs">
                            Total Drivers
                        </p>
                        <p className="mt-1 text-2xl font-semibold tabular-nums">
                            {drivers.length}
                        </p>
                    </div>
                    <div className="rounded-lg border p-4">
                        <p className="text-muted-foreground text-xs">
                            Assigned
                        </p>
                        <p className="mt-1 text-2xl font-semibold tabular-nums">
                            {assignedCount}
                        </p>
                    </div>
                    <div className="rounded-lg border p-4">
                        <p className="text-muted-foreground text-xs">
                            Unassigned
                        </p>
                        <p className="mt-1 text-2xl font-semibold tabular-nums">
                            {unassignedCount}
                        </p>
                    </div>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row">
                    <div className="relative flex-1">
                        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                        <Input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search by name, email, license, phone, or bus..."
                            className="pr-9 pl-9"
                            aria-label="Search drivers"
                            data-test="driver-search"
                        />
                        {search && (
                            <button
                                type="button"
                                onClick={() => setSearch('')}
                                className="text-muted-foreground hover:text-foreground absolute top-1/2 right-3 -translate-y-1/2"
                                aria-label="Clear search"
                            >
                                <X className="size-4" />
                            </button>
                        )}
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                        <Select
                            value={statusFilter}
                            onValueChange={setStatusFilter}
                        >
                            <SelectTrigger
                                aria-label="Filter by status"
                                className="w-full sm:w-44"
                                data-test="driver-status-filter"
                            >
                                <SelectValue placeholder="Status" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">
                                    All statuses
                                </SelectItem>
                                <SelectItem value="active">Active</SelectItem>
                                <SelectItem value="inactive">
                                    Inactive
                                </SelectItem>
                            </SelectContent>
                        </Select>
                        <Select
                            value={assignmentFilter}
                            onValueChange={setAssignmentFilter}
                        >
                            <SelectTrigger
                                aria-label="Filter by assignment"
                                className="w-full sm:w-44"
                                data-test="driver-assignment-filter"
                            >
                                <SelectValue placeholder="Assignment" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All drivers</SelectItem>
                                <SelectItem value="assigned">
                                    Assigned
                                </SelectItem>
                                <SelectItem value="unassigned">
                                    Unassigned
                                </SelectItem>
                            </SelectContent>
                        </Select>

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

                {filteredDrivers.length === 0 ? (
                    <EmptyState />
                ) : view === 'table' ? (
                    <div data-test="driver-table-view">
                        <Table containerClassName="rounded-lg border">
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Driver</TableHead>
                                    <TableHead>License Number</TableHead>
                                    <TableHead>License Expiry</TableHead>
                                    <TableHead>Phone</TableHead>
                                    <TableHead>Assigned Bus</TableHead>
                                    <TableHead>Route</TableHead>
                                    <TableHead>Status</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredDrivers.map((driver) => (
                                    <TableRow
                                        key={driver.id}
                                        data-test="driver-row"
                                        data-driver-id={driver.id}
                                    >
                                        <TableCell>
                                            <div className="max-w-[220px] min-w-0">
                                                <p className="truncate text-sm font-medium">
                                                    {driver.user?.name ??
                                                        'Unknown driver'}
                                                </p>
                                                <p className="text-muted-foreground truncate text-xs">
                                                    {driver.user?.email ??
                                                        'No email'}
                                                </p>
                                            </div>
                                        </TableCell>
                                        <TableCell className="whitespace-nowrap">
                                            {driver.license_number ?? '—'}
                                        </TableCell>
                                        <TableCell className="whitespace-nowrap">
                                            <div className="flex items-center gap-2">
                                                <span>
                                                    {formatLicenseDate(
                                                        driver.license_expiry,
                                                    )}
                                                </span>
                                                <LicenseStatus
                                                    expiry={
                                                        driver.license_expiry
                                                    }
                                                />
                                            </div>
                                        </TableCell>
                                        <TableCell className="whitespace-nowrap">
                                            {driver.phone ?? '—'}
                                        </TableCell>
                                        <TableCell className="whitespace-nowrap">
                                            {driver.bus
                                                ? `Bus ${driver.bus.bus_number}`
                                                : '—'}
                                        </TableCell>
                                        <TableCell className="whitespace-nowrap">
                                            {driver.bus?.route?.name ?? '—'}
                                        </TableCell>
                                        <TableCell className="whitespace-nowrap">
                                            <StatusBadge
                                                status={driver.status}
                                            />
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                ) : (
                    <div
                        data-test="driver-cards-view"
                        className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
                    >
                        {filteredDrivers.map((driver) => {
                            const initials =
                                driver.user?.name
                                    ?.split(' ')
                                    .map((part) => part[0])
                                    .join('')
                                    .slice(0, 2)
                                    .toUpperCase() ?? '?';

                            return (
                                <div
                                    key={driver.id}
                                    data-test="driver-card"
                                    data-driver-id={driver.id}
                                    className="bg-card flex flex-col gap-4 rounded-lg border p-5"
                                >
                                    <div className="flex items-start gap-3">
                                        <div className="bg-primary/10 text-primary-strong flex size-10 shrink-0 items-center justify-center rounded-full">
                                            <span className="text-sm font-semibold">
                                                {initials}
                                            </span>
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-sm font-medium">
                                                {driver.user?.name ??
                                                    'Unknown driver'}
                                            </p>
                                            <p className="text-muted-foreground truncate text-xs">
                                                {driver.user?.email ??
                                                    'No email'}
                                            </p>
                                        </div>
                                        <div className="flex shrink-0 items-center gap-1.5">
                                            <StatusBadge
                                                status={driver.status}
                                            />
                                            <LicenseStatus
                                                expiry={driver.license_expiry}
                                            />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-3 text-sm">
                                        <div>
                                            <p className="text-muted-foreground text-xs">
                                                License Number
                                            </p>
                                            <p className="mt-0.5 font-medium">
                                                {driver.license_number ?? '—'}
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-muted-foreground text-xs">
                                                License Expiry
                                            </p>
                                            <p className="mt-0.5 font-medium">
                                                {formatLicenseDate(
                                                    driver.license_expiry,
                                                )}
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-muted-foreground text-xs">
                                                Phone
                                            </p>
                                            <p className="mt-0.5 font-medium">
                                                {driver.phone ?? '—'}
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-muted-foreground text-xs">
                                                Assigned Bus
                                            </p>
                                            <p className="mt-0.5 font-medium">
                                                {driver.bus
                                                    ? `Bus ${driver.bus.bus_number}`
                                                    : '—'}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="border-t pt-3 text-sm">
                                        <span className="text-muted-foreground">
                                            Route:{' '}
                                        </span>
                                        <span className="font-medium">
                                            {driver.bus?.route?.name ?? 'None'}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </OperatorSidebarLayout>
    );
}
