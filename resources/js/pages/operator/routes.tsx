import { Head } from '@inertiajs/react';
import { Route as RouteIcon, Search, Users, X } from 'lucide-react';
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
import OperatorSidebarLayout from '@/layouts/app/operator-sidebar-layout';
import { cn } from '@/lib/utils';

type Status = 'active' | 'inactive';

type Driver = {
    id: number;
    user: {
        id: number;
        name: string;
    } | null;
};

type Bus = {
    id: number;
    bus_number: string;
    driver: Driver | null;
};

type Route = {
    id: number;
    name: string;
    origin: string;
    destination: string;
    status: Status;
    buses: Bus[];
};

type Props = {
    routes: Route[];
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

function EmptyState() {
    return (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-16 text-center">
            <div className="bg-muted text-muted-foreground flex size-12 items-center justify-center rounded-full">
                <RouteIcon className="size-6" />
            </div>
            <p className="mt-3 text-sm font-medium">No routes found</p>
            <p className="text-muted-foreground mt-1 max-w-sm text-sm">
                Try adjusting your search or filter criteria.
            </p>
        </div>
    );
}

export default function OperatorRoutesPage({ routes }: Props) {
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');

    const filteredRoutes = useMemo(() => {
        const query = search.trim().toLowerCase();

        return routes.filter((route) => {
            const matchesSearch =
                !query ||
                [route.name, route.origin, route.destination].some((field) =>
                    field.toLowerCase().includes(query),
                );

            const matchesStatus =
                statusFilter === 'all' || route.status === statusFilter;

            return matchesSearch && matchesStatus;
        });
    }, [routes, search, statusFilter]);

    const activeRoutesCount = routes.filter(
        (route) => route.status === 'active',
    ).length;

    return (
        <OperatorSidebarLayout
            breadcrumbs={[
                {
                    title: 'Dashboard',
                    href: '/operator/dashboard',
                },
                {
                    title: 'Route Operations',
                    href: '/operator/routes',
                },
            ]}
        >
            <Head title="Route Operations" />

            <div className="flex flex-col gap-6">
                <div className="flex items-center gap-4">
                    <div className="bg-primary/10 text-primary-strong flex size-11 shrink-0 items-center justify-center rounded-xl">
                        <RouteIcon className="size-6" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-semibold">
                            Route Operations
                        </h1>
                        <p className="text-muted-foreground">
                            Routes with their assigned buses and drivers.
                        </p>
                    </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-lg border p-4">
                        <p className="text-muted-foreground text-xs">
                            Total Routes
                        </p>
                        <p className="mt-1 text-2xl font-semibold tabular-nums">
                            {routes.length}
                        </p>
                    </div>
                    <div className="rounded-lg border p-4">
                        <p className="text-muted-foreground text-xs">
                            Active Routes
                        </p>
                        <p className="mt-1 text-2xl font-semibold tabular-nums">
                            {activeRoutesCount}
                        </p>
                    </div>
                    <div className="rounded-lg border p-4">
                        <p className="text-muted-foreground text-xs">
                            Buses Assigned
                        </p>
                        <p className="mt-1 text-2xl font-semibold tabular-nums">
                            {routes.reduce(
                                (sum, route) => sum + route.buses.length,
                                0,
                            )}
                        </p>
                    </div>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row">
                    <div className="relative flex-1">
                        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                        <Input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search by route name, origin, or destination..."
                            className="pr-9 pl-9"
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
                    <Select
                        value={statusFilter}
                        onValueChange={setStatusFilter}
                    >
                        <SelectTrigger
                            aria-label="Filter by status"
                            className="w-full sm:w-44"
                        >
                            <SelectValue placeholder="Status" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All statuses</SelectItem>
                            <SelectItem value="active">Active</SelectItem>
                            <SelectItem value="inactive">Inactive</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                {filteredRoutes.length === 0 ? (
                    <EmptyState />
                ) : (
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                        {filteredRoutes.map((route) => (
                            <div
                                key={route.id}
                                className="bg-card flex flex-col gap-4 rounded-lg border p-5"
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex items-center gap-3">
                                        <div className="bg-primary/10 text-primary-strong flex size-10 shrink-0 items-center justify-center rounded-lg">
                                            <RouteIcon className="size-5" />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-medium">
                                                {route.name}
                                            </p>
                                            <div className="mt-0.5 flex items-center gap-1.5 text-xs">
                                                <span className="text-muted-foreground truncate">
                                                    {route.origin}
                                                </span>
                                                <span className="text-muted-foreground shrink-0">
                                                    →
                                                </span>
                                                <span className="text-muted-foreground truncate">
                                                    {route.destination}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <StatusBadge status={route.status} />
                                    </div>
                                </div>

                                <div className="border-t pt-3">
                                    <div className="flex items-center gap-2 text-xs">
                                        <Users className="text-muted-foreground size-3.5" />
                                        <span className="text-muted-foreground">
                                            {route.buses.length} bus
                                            {route.buses.length === 1
                                                ? ''
                                                : 'es'}{' '}
                                            assigned
                                        </span>
                                    </div>

                                    {route.buses.length === 0 ? (
                                        <p className="text-muted-foreground mt-2 text-sm">
                                            No buses assigned to this route yet.
                                        </p>
                                    ) : (
                                        <ul className="mt-2 space-y-1.5">
                                            {route.buses.map((bus) => (
                                                <li
                                                    key={bus.id}
                                                    className="bg-muted/50 flex items-center justify-between gap-2 rounded-md px-3 py-2 text-sm"
                                                >
                                                    <span className="font-medium">
                                                        Bus {bus.bus_number}
                                                    </span>
                                                    <span className="text-muted-foreground truncate">
                                                        {bus.driver?.user
                                                            ?.name ??
                                                            'No driver'}
                                                    </span>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </OperatorSidebarLayout>
    );
}
