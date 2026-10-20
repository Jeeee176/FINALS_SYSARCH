import { Head, Link, router, useForm } from '@inertiajs/react';
import { Navigation, User } from 'lucide-react';
import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import InputError from '@/components/input-error';
import AppSidebarLayout from '@/layouts/app/app-sidebar-layout';

type Route = {
    id: number;
    name: string;
    origin: string;
    destination: string;
    status: string;
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
    route_id: number | null;
    route?: Route;
    driver?: BusDriver | null;
};

type Props = {
    bus: Bus;
    routes?: Route[];
    hasInTransitTrip?: boolean;
};

function FormSection({
    title,
    description,
    children,
}: {
    title: string;
    description?: string;
    children: ReactNode;
}) {
    return (
        <div className="bg-muted/30 rounded-lg border p-4 sm:p-6">
            <div className="mb-4">
                <h2 className="text-base font-medium">{title}</h2>
                {description && (
                    <p className="text-muted-foreground mt-1 text-sm">
                        {description}
                    </p>
                )}
            </div>
            {children}
        </div>
    );
}

function RequiredMark() {
    return (
        <span aria-hidden="true" className="text-destructive-strong">
            *
        </span>
    );
}

export default function AdminBusesEditPage({
    bus,
    routes = [],
    hasInTransitTrip = false,
}: Props) {
    const { data, setData, put, processing, errors, reset } = useForm({
        bus_number: bus.bus_number,
        plate_number: bus.plate_number,
        model: bus.model ?? '',
        capacity: bus.capacity?.toString() ?? '',
        status: bus.status,
        route_id: bus.route_id?.toString() ?? '',
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (processing) {
            return;
        }
        put(`/admin/buses/${bus.id}`);
    };

    const handleCancel = () => {
        reset();
        router.visit('/admin/buses');
    };

    const getRouteLabel = (routeId: string): string => {
        if (!routeId) {
            return 'No route assigned';
        }
        const selected = routes.find((r) => r.id === Number(routeId));
        if (selected) {
            return `${selected.name} · ${selected.origin} → ${selected.destination}`;
        }
        if (bus.route && bus.route.id === Number(routeId)) {
            return `${bus.route.name} · ${bus.route.origin} → ${bus.route.destination}`;
        }
        return 'Select a route';
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
                {
                    title: 'Edit Bus',
                    href: `/admin/buses/${bus.id}/edit`,
                },
            ]}
        >
            <Head title="Edit Bus" />

            <div className="flex flex-col gap-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-semibold">Edit Bus</h1>
                        <p className="text-muted-foreground">
                            Update bus information and assignments.
                        </p>
                    </div>
                    <Button variant="ghost" onClick={handleCancel}>
                        Cancel
                    </Button>
                </div>

                <form onSubmit={handleSubmit} className="flex flex-col gap-6">
                    <FormSection
                        title="Bus Information"
                        description="Identification details for this bus. Fields marked with * are required."
                    >
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="grid gap-2">
                                <Label htmlFor="bus_number">
                                    Bus Number <RequiredMark />
                                </Label>
                                <Input
                                    id="bus_number"
                                    name="bus_number"
                                    value={data.bus_number}
                                    onChange={(e) =>
                                        setData('bus_number', e.target.value)
                                    }
                                    placeholder="e.g. BUS-001"
                                />
                                <InputError message={errors.bus_number} />
                            </div>

                            <div className="grid gap-2">
                                <Label htmlFor="plate_number">
                                    Plate Number <RequiredMark />
                                </Label>
                                <Input
                                    id="plate_number"
                                    name="plate_number"
                                    value={data.plate_number}
                                    onChange={(e) =>
                                        setData('plate_number', e.target.value)
                                    }
                                    placeholder="e.g. ABC-1234"
                                />
                                <InputError message={errors.plate_number} />
                            </div>

                            <div className="grid gap-2">
                                <Label htmlFor="model">Model</Label>
                                <Input
                                    id="model"
                                    name="model"
                                    value={data.model}
                                    onChange={(e) =>
                                        setData('model', e.target.value)
                                    }
                                    placeholder="e.g. Toyota Coaster"
                                />
                                <InputError message={errors.model} />
                            </div>

                            <div className="grid gap-2">
                                <Label htmlFor="capacity">Capacity</Label>
                                <Input
                                    id="capacity"
                                    name="capacity"
                                    type="number"
                                    min="1"
                                    value={data.capacity}
                                    onChange={(e) =>
                                        setData('capacity', e.target.value)
                                    }
                                    placeholder="e.g. 50"
                                />
                                <InputError message={errors.capacity} />
                            </div>
                        </div>
                    </FormSection>

                    <FormSection
                        title="Operational Status"
                        description="Status updates automatically when a driver is assigned (Active) or unassigned (Inactive). You can still adjust it manually."
                    >
                        <div className="grid gap-2 sm:max-w-xs">
                            <Label htmlFor="status">
                                Status <RequiredMark />
                            </Label>
                            <Select
                                name="status"
                                value={data.status}
                                onValueChange={(value) =>
                                    setData('status', value)
                                }
                            >
                                <SelectTrigger id="status">
                                    <SelectValue placeholder="Select status" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="active">
                                        Active
                                    </SelectItem>
                                    <SelectItem value="inactive">
                                        Inactive
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                            <InputError message={errors.status} />
                        </div>
                        {hasInTransitTrip && (
                            <p className="text-muted-foreground mt-3 text-xs">
                                This bus has a trip in progress. Driver
                                assignment changes are blocked until the trip
                                ends.
                            </p>
                        )}
                    </FormSection>

                    <FormSection
                        title="Driver Assignment"
                        description="Driver assignments are managed from the Driver Management page."
                    >
                        {bus.driver ? (
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div className="flex items-center gap-3">
                                    <div className="bg-muted flex h-8 w-8 shrink-0 items-center justify-center rounded-full">
                                        <User className="text-muted-foreground h-4 w-4" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium">
                                            {bus.driver.name}
                                        </p>
                                        <p className="text-muted-foreground text-xs">
                                            Currently assigned to this bus
                                        </p>
                                    </div>
                                    {hasInTransitTrip && (
                                        <Badge
                                            variant="warning"
                                            className="gap-1"
                                        >
                                            <Navigation className="h-3 w-3" />
                                            Trip in progress
                                        </Badge>
                                    )}
                                </div>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    asChild
                                >
                                    <Link href="/admin/drivers">
                                        Manage Drivers
                                    </Link>
                                </Button>
                            </div>
                        ) : (
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <p className="text-muted-foreground text-sm">
                                    No driver is assigned to this bus.
                                </p>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    asChild
                                >
                                    <Link href="/admin/drivers">
                                        Manage Drivers
                                    </Link>
                                </Button>
                            </div>
                        )}
                    </FormSection>

                    <FormSection
                        title="Route Assignment"
                        description="Assign a route to this bus. Leave empty for no route."
                    >
                        <div className="grid gap-2">
                            <Label htmlFor="route_id">Route</Label>
                            <Select
                                name="route_id"
                                value={data.route_id}
                                onValueChange={(value) =>
                                    setData(
                                        'route_id',
                                        value === 'none' ? '' : value,
                                    )
                                }
                            >
                                <SelectTrigger id="route_id">
                                    <SelectValue placeholder="No route assigned">
                                        {getRouteLabel(data.route_id)}
                                    </SelectValue>
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">
                                        No route assigned
                                    </SelectItem>
                                    {routes.map((route) => (
                                        <SelectItem
                                            key={route.id}
                                            value={String(route.id)}
                                        >
                                            <div>
                                                <div className="font-medium">
                                                    {route.name}
                                                </div>
                                                <div className="text-muted-foreground text-xs">
                                                    {route.origin} →{' '}
                                                    {route.destination}
                                                </div>
                                            </div>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <InputError message={errors.route_id} />
                        </div>
                    </FormSection>

                    <div className="flex items-center gap-4">
                        <Button type="submit" disabled={processing}>
                            {processing ? 'Saving...' : 'Save Changes'}
                        </Button>
                        <Button variant="ghost" onClick={handleCancel}>
                            Cancel
                        </Button>
                    </div>
                </form>
            </div>
        </AppSidebarLayout>
    );
}
