import { Head, router, useForm } from '@inertiajs/react';
import type { ReactNode } from 'react';
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

type Props = {
    routes?: Route[];
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

export default function AdminBusesCreatePage({ routes = [] }: Props) {
    const { data, setData, post, processing, errors, reset } = useForm({
        bus_number: '',
        plate_number: '',
        model: '',
        capacity: '',
        status: 'active',
        route_id: '',
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (processing) {
            return;
        }
        post('/admin/buses');
    };

    const handleCancel = () => {
        reset();
        router.visit('/admin/buses');
    };

    const getRouteLabel = (routeId: string): string => {
        if (!routeId) {
            return 'No route assigned';
        }
        const route = routes.find((r) => r.id === Number(routeId));
        return route
            ? `${route.name} · ${route.origin} → ${route.destination}`
            : 'Select a route';
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
                    title: 'Add Bus',
                    href: '/admin/buses/create',
                },
            ]}
        >
            <Head title="Add Bus" />

            <div className="flex flex-col gap-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-semibold">Add Bus</h1>
                        <p className="text-muted-foreground">
                            Create a new bus and register it in the fleet.
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
                    </FormSection>

                    <FormSection
                        title="Route Assignment"
                        description="Assign a route to this bus. Leave empty for no route. Driver assignments are managed from the Driver Management page."
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
                            {processing ? 'Saving...' : 'Save Bus'}
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
