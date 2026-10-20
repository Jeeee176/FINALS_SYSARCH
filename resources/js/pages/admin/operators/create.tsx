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

export default function AdminOperatorsCreatePage() {
    const { data, setData, post, processing, errors, reset } = useForm({
        name: '',
        email: '',
        password: '',
        password_confirmation: '',
        phone: '',
        address: '',
        status: 'active',
        photo: null as File | null,
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (processing) {
            return;
        }
        post('/admin/operators', {
            preserveScroll: true,
            onSuccess: () => reset(),
        });
    };

    const handleCancel = () => {
        reset();
        router.visit('/admin/operators');
    };

    return (
        <AppSidebarLayout
            breadcrumbs={[
                {
                    title: 'Dashboard',
                    href: '/admin/dashboard',
                },
                {
                    title: 'Operators',
                    href: '/admin/operators',
                },
                {
                    title: 'Add Operator',
                    href: '/admin/operators/create',
                },
            ]}
        >
            <Head title="Add Operator" />

            <div className="flex flex-col gap-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-semibold">Add Operator</h1>
                        <p className="text-muted-foreground">
                            Create a new operator account with login credentials
                            and profile.
                        </p>
                    </div>
                    <Button variant="ghost" onClick={handleCancel}>
                        Cancel
                    </Button>
                </div>

                <form onSubmit={handleSubmit} className="flex flex-col gap-6">
                    <FormSection
                        title="Profile Picture"
                        description="Optional. Shown on operator cards, the table view and the account menu."
                    >
                        <ProfilePhotoUpload
                            id="operator-photo"
                            name={data.name}
                            currentUrl={null}
                            file={data.photo}
                            removeRequested={false}
                            onFileChange={(file) => setData('photo', file)}
                            onRemoveRequestedChange={() => {}}
                            error={errors.photo}
                            disabled={processing}
                        />
                    </FormSection>

                    <FormSection
                        title="Account Information"
                        description="The operator will use these credentials to log in. Role is automatically set to Operator. Fields marked with * are required."
                    >
                        <div className="grid gap-4">
                            <div className="grid gap-2">
                                <Label htmlFor="name">
                                    Full Name <RequiredMark />
                                </Label>
                                <Input
                                    id="name"
                                    name="name"
                                    value={data.name}
                                    onChange={(e) =>
                                        setData('name', e.target.value)
                                    }
                                    placeholder="e.g. Juan Dela Cruz"
                                />
                                <InputError message={errors.name} />
                            </div>

                            <div className="grid gap-2">
                                <Label htmlFor="email">
                                    Email Address <RequiredMark />
                                </Label>
                                <Input
                                    id="email"
                                    name="email"
                                    type="email"
                                    value={data.email}
                                    onChange={(e) =>
                                        setData('email', e.target.value)
                                    }
                                    placeholder="e.g. operator@company.com"
                                />
                                <InputError message={errors.email} />
                            </div>

                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="grid gap-2">
                                    <Label htmlFor="password">
                                        Password <RequiredMark />
                                    </Label>
                                    <Input
                                        id="password"
                                        name="password"
                                        type="password"
                                        value={data.password}
                                        onChange={(e) =>
                                            setData('password', e.target.value)
                                        }
                                        placeholder="Min. 8 characters"
                                    />
                                    <InputError message={errors.password} />
                                </div>

                                <div className="grid gap-2">
                                    <Label htmlFor="password_confirmation">
                                        Confirm Password <RequiredMark />
                                    </Label>
                                    <Input
                                        id="password_confirmation"
                                        name="password_confirmation"
                                        type="password"
                                        value={data.password_confirmation}
                                        onChange={(e) =>
                                            setData(
                                                'password_confirmation',
                                                e.target.value,
                                            )
                                        }
                                        placeholder="Repeat password"
                                    />
                                    <InputError
                                        message={errors.password_confirmation}
                                    />
                                </div>
                            </div>
                        </div>
                    </FormSection>

                    <FormSection
                        title="Operator Information"
                        description="Contact details for the operator profile."
                    >
                        <div className="grid gap-4 sm:grid-cols-2">
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
                                    placeholder="e.g. +601****6789"
                                />
                                <InputError message={errors.phone} />
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
                                    Updates automatically when the operator logs
                                    in (Active) or logs out (Inactive).
                                </p>
                            </div>
                        </div>
                    </FormSection>

                    <div className="flex items-center gap-4">
                        <Button type="submit" disabled={processing}>
                            {processing ? 'Creating...' : 'Create Operator'}
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
