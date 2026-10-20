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
import { ProfilePhotoUpload } from '@/components/profile-photo-upload';
import AppSidebarLayout from '@/layouts/app/app-sidebar-layout';

type User = {
    id: number;
    name: string;
    email: string;
    avatar: string | null;
};

type Props = {
    driver: {
        id: number;
        user_id: number;
        license_number: string;
        license_expiry: string;
        phone: string | null;
        address: string | null;
        status: string;
    };
    user?: User;
};

type FormData = {
    license_number: string;
    license_expiry: string;
    phone: string;
    address: string;
    status: string;
    'user.name'?: string;
    'user.email'?: string;
    'user.password'?: string;
    'user.password_confirmation'?: string;
    photo: File | null;
    remove_photo: boolean;
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

export default function AdminDriversEditPage({
    driver,
    user = { id: 0, name: '', email: '', avatar: null },
}: Props) {
    const { data, setData, put, processing, errors, reset } = useForm<FormData>(
        {
            license_number: driver.license_number,
            license_expiry: driver.license_expiry,
            phone: driver.phone ?? '',
            address: driver.address ?? '',
            status: driver.status,
            'user.name': user.name,
            'user.email': user.email,
            'user.password': '',
            'user.password_confirmation': '',
            photo: null,
            remove_photo: false,
        },
    );

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (processing) {
            return;
        }
        put(`/admin/drivers/${driver.id}`, {
            preserveScroll: true,
        });
    };

    const handleCancel = () => {
        reset();
        router.visit('/admin/drivers');
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
                {
                    title: 'Edit Driver',
                    href: `/admin/drivers/${driver.id}/edit`,
                },
            ]}
        >
            <Head title="Edit Driver" />

            <div className="flex flex-col gap-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-semibold">Edit Driver</h1>
                        <p className="text-muted-foreground">
                            Update driver information and account details.
                        </p>
                    </div>
                    <Button variant="ghost" onClick={handleCancel}>
                        Cancel
                    </Button>
                </div>

                <form onSubmit={handleSubmit} className="flex flex-col gap-6">
                    <FormSection
                        title="Profile Picture"
                        description="Shown on driver cards, the table view and the account menu."
                    >
                        <ProfilePhotoUpload
                            id="driver-photo"
                            name={user.name}
                            currentUrl={user.avatar}
                            file={data.photo}
                            removeRequested={data.remove_photo}
                            onFileChange={(file) => setData('photo', file)}
                            onRemoveRequestedChange={(requested) =>
                                setData('remove_photo', requested)
                            }
                            error={errors.photo}
                            disabled={processing}
                        />
                    </FormSection>

                    <FormSection
                        title="Driver Profile"
                        description="License and contact details. Fields marked with * are required."
                    >
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="grid gap-2">
                                <Label htmlFor="license_number">
                                    License Number <RequiredMark />
                                </Label>
                                <Input
                                    id="license_number"
                                    name="license_number"
                                    value={data.license_number}
                                    onChange={(e) =>
                                        setData(
                                            'license_number',
                                            e.target.value,
                                        )
                                    }
                                    placeholder="e.g. DL-2024-001"
                                />
                                <InputError message={errors.license_number} />
                            </div>

                            <div className="grid gap-2">
                                <Label htmlFor="license_expiry">
                                    License Expiry <RequiredMark />
                                </Label>
                                <Input
                                    id="license_expiry"
                                    name="license_expiry"
                                    type="date"
                                    value={data.license_expiry}
                                    onChange={(e) =>
                                        setData(
                                            'license_expiry',
                                            e.target.value,
                                        )
                                    }
                                />
                                <InputError message={errors.license_expiry} />
                            </div>

                            <div className="grid gap-2">
                                <Label htmlFor="phone">Phone</Label>
                                <Input
                                    id="phone"
                                    name="phone"
                                    type="tel"
                                    value={data.phone}
                                    onChange={(e) =>
                                        setData('phone', e.target.value)
                                    }
                                    placeholder="e.g. +639123456789"
                                />
                                <InputError message={errors.phone} />
                            </div>

                            <div className="grid gap-2">
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
                                <p className="text-muted-foreground text-xs">
                                    Updates automatically when the driver logs
                                    in (Active) or logs out (Inactive).
                                </p>
                            </div>

                            <div className="grid gap-2 sm:col-span-2">
                                <Label htmlFor="address">Address</Label>
                                <Input
                                    id="address"
                                    name="address"
                                    value={data.address}
                                    onChange={(e) =>
                                        setData('address', e.target.value)
                                    }
                                    placeholder="e.g. 123, Jalan Example, City"
                                />
                                <InputError message={errors.address} />
                            </div>
                        </div>
                    </FormSection>

                    <FormSection
                        title="Account Information"
                        description="Update the driver's login credentials. Leave password blank to keep current."
                    >
                        <div className="grid gap-4">
                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="grid gap-2">
                                    <Label htmlFor="user.name">Full Name</Label>
                                    <Input
                                        id="user.name"
                                        name="user.name"
                                        value={data['user.name'] ?? ''}
                                        onChange={(e) =>
                                            setData((prev) => ({
                                                ...prev,
                                                'user.name': e.target.value,
                                            }))
                                        }
                                        placeholder="e.g. Juan Dela Cruz"
                                    />
                                    <InputError message={errors['user.name']} />
                                </div>

                                <div className="grid gap-2">
                                    <Label htmlFor="user.email">
                                        Email Address
                                    </Label>
                                    <Input
                                        id="user.email"
                                        name="user.email"
                                        type="email"
                                        value={data['user.email'] ?? ''}
                                        onChange={(e) =>
                                            setData((prev) => ({
                                                ...prev,
                                                'user.email': e.target.value,
                                            }))
                                        }
                                        placeholder="e.g. driver@company.com"
                                    />
                                    <InputError
                                        message={errors['user.email']}
                                    />
                                </div>
                            </div>

                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="grid gap-2">
                                    <Label htmlFor="user.password">
                                        New Password (optional)
                                    </Label>
                                    <Input
                                        id="user.password"
                                        name="user.password"
                                        type="password"
                                        value={data['user.password'] ?? ''}
                                        onChange={(e) =>
                                            setData((prev) => ({
                                                ...prev,
                                                'user.password': e.target.value,
                                            }))
                                        }
                                        placeholder="Min. 8 characters"
                                    />
                                    <InputError
                                        message={errors['user.password']}
                                    />
                                </div>

                                <div className="grid gap-2">
                                    <Label htmlFor="user.password_confirmation">
                                        Confirm New Password
                                    </Label>
                                    <Input
                                        id="user.password_confirmation"
                                        name="user.password_confirmation"
                                        type="password"
                                        value={
                                            data[
                                                'user.password_confirmation'
                                            ] ?? ''
                                        }
                                        onChange={(e) =>
                                            setData((prev) => ({
                                                ...prev,
                                                'user.password_confirmation':
                                                    e.target.value,
                                            }))
                                        }
                                        placeholder="Repeat new password"
                                    />
                                    <InputError
                                        message={
                                            errors['user.password_confirmation']
                                        }
                                    />
                                </div>
                            </div>
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
