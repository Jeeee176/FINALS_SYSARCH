import { Head, router, useForm } from '@inertiajs/react';
import type { ReactNode } from 'react';
import { RouteCoordinatePreview } from '@/components/route-map-preview';
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

export default function AdminRoutesCreatePage() {
    const { data, setData, post, processing, errors, reset } = useForm<{
        name: string;
        origin: string;
        destination: string;
        destination_lat: string | null;
        destination_lng: string | null;
        status: string;
    }>({
        name: '',
        origin: '',
        destination: '',
        destination_lat: null,
        destination_lng: null,
        status: 'active',
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (processing) {
            return;
        }
        post('/admin/routes', {
            preserveScroll: true,
            onSuccess: () => reset(),
        });
    };

    const handleCancel = () => {
        reset();
        router.visit('/admin/routes');
    };

    return (
        <AppSidebarLayout
            breadcrumbs={[
                {
                    title: 'Dashboard',
                    href: '/admin/dashboard',
                },
                {
                    title: 'Routes',
                    href: '/admin/routes',
                },
                {
                    title: 'Add Route',
                    href: '/admin/routes/create',
                },
            ]}
        >
            <Head title="Add Route" />

            <div className="flex flex-col gap-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-semibold">Add Route</h1>
                        <p className="text-muted-foreground">
                            Create a new bus route. Fields marked with * are
                            required.
                        </p>
                    </div>
                    <Button
                        variant="ghost"
                        type="button"
                        onClick={handleCancel}
                    >
                        Cancel
                    </Button>
                </div>

                <form onSubmit={handleSubmit} className="flex flex-col gap-6">
                    <FormSection
                        title="Route Information"
                        description="Basic details shown on route cards, the table view and tracking pages."
                    >
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="grid gap-2 sm:col-span-2">
                                <Label htmlFor="name">
                                    Route Name <RequiredMark />
                                </Label>
                                <Input
                                    id="name"
                                    name="name"
                                    value={data.name}
                                    onChange={(e) =>
                                        setData('name', e.target.value)
                                    }
                                    placeholder="e.g. R-001"
                                    aria-invalid={!!errors.name}
                                />
                                <InputError message={errors.name} />
                            </div>

                            <div className="grid gap-2">
                                <Label htmlFor="origin">
                                    Origin <RequiredMark />
                                </Label>
                                <Input
                                    id="origin"
                                    name="origin"
                                    value={data.origin}
                                    onChange={(e) =>
                                        setData('origin', e.target.value)
                                    }
                                    placeholder="e.g. Caloocan"
                                    aria-invalid={!!errors.origin}
                                />
                                <InputError message={errors.origin} />
                            </div>

                            <div className="grid gap-2">
                                <Label htmlFor="destination">
                                    Destination <RequiredMark />
                                </Label>
                                <Input
                                    id="destination"
                                    name="destination"
                                    value={data.destination}
                                    onChange={(e) =>
                                        setData('destination', e.target.value)
                                    }
                                    placeholder="e.g. Meycauayan"
                                    aria-invalid={!!errors.destination}
                                />
                                <InputError message={errors.destination} />
                            </div>
                        </div>
                    </FormSection>

                    <FormSection
                        title="Destination Coordinates"
                        description="Optional. Used to place the destination marker on the Leaflet / OpenStreetMap preview and tracking maps. Leave blank if the coordinates are not known yet."
                    >
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="grid gap-2">
                                <Label htmlFor="destination_lat">
                                    Destination Latitude (optional)
                                </Label>
                                <Input
                                    id="destination_lat"
                                    name="destination_lat"
                                    type="number"
                                    step="0.0000001"
                                    value={data.destination_lat ?? ''}
                                    onChange={(e) =>
                                        setData(
                                            'destination_lat',
                                            e.target.value === ''
                                                ? null
                                                : e.target.value,
                                        )
                                    }
                                    placeholder="e.g. 14.8527000"
                                    aria-invalid={!!errors.destination_lat}
                                    aria-describedby="coordinates-help"
                                />
                                <InputError message={errors.destination_lat} />
                            </div>

                            <div className="grid gap-2">
                                <Label htmlFor="destination_lng">
                                    Destination Longitude (optional)
                                </Label>
                                <Input
                                    id="destination_lng"
                                    name="destination_lng"
                                    type="number"
                                    step="0.0000001"
                                    value={data.destination_lng ?? ''}
                                    onChange={(e) =>
                                        setData(
                                            'destination_lng',
                                            e.target.value === ''
                                                ? null
                                                : e.target.value,
                                        )
                                    }
                                    placeholder="e.g. 120.8160000"
                                    aria-invalid={!!errors.destination_lng}
                                    aria-describedby="coordinates-help"
                                />
                                <InputError message={errors.destination_lng} />
                            </div>
                        </div>

                        <p
                            id="coordinates-help"
                            className="text-muted-foreground mt-3 text-xs"
                        >
                            Decimal degrees, up to 7 decimal places. Latitude
                            must be between -90 and 90; longitude between -180
                            and 180. A pair is only used when both values are
                            valid.
                        </p>

                        <div className="mt-4">
                            <p className="text-muted-foreground mb-2 text-xs font-medium">
                                Map Preview
                            </p>
                            <RouteCoordinatePreview
                                latitude={data.destination_lat}
                                longitude={data.destination_lng}
                                label={data.destination || 'Destination'}
                                className="h-48"
                            />
                        </div>
                    </FormSection>

                    <FormSection
                        title="Status"
                        description="Inactive routes remain listed but are marked as inactive."
                    >
                        <div className="grid gap-2 sm:max-w-xs">
                            <Label htmlFor="status">
                                Route Status <RequiredMark />
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

                    <div className="flex items-center gap-4">
                        <Button type="submit" disabled={processing}>
                            {processing ? 'Saving...' : 'Save Route'}
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={handleCancel}
                            disabled={processing}
                        >
                            Cancel
                        </Button>
                    </div>
                </form>
            </div>
        </AppSidebarLayout>
    );
}
