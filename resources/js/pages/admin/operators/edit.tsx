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
    avatar?: string | null;
};

type Operator = {
    id: number;
    user_id: number;
    phone: string | null;
    address: string | null;
    status: string;
    user: User | null;
};

type Props = {
    operator: Operator;
    availableUsers?: User[];
};

type FormData = {
    user_id: string;
    phone: string;
    address: string;
    status: string;
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

export default function AdminOperatorsEditPage({
    operator,
    availableUsers = [],
}: Props) {
    const { data, setData, put, processing, errors, reset } = useForm<FormData>(
        {
            user_id: String(operator.user_id),
            phone: operator.phone ?? '',
            address: operator.address ?? '',
            status: operator.status,
            photo: null,
            remove_photo: false,
        },
    );

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (processing) {
            return;
        }
        put(`/admin/operators/${operator.id}`, {
            preserveScroll: true,
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
                    title: 'Edit Operator',
                    href: `/admin/operators/${operator.id}/edit`,
                },
            ]}
        >
            <Head title="Edit Operator" />

            <div className="flex flex-col gap-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-semibold">
                            Edit Operator
                        </h1>
                        <p className="text-muted-foreground">
                            Update operator information and account details.
                        </p>
                    </div>
                    <Button variant="ghost" onClick={handleCancel}>
                        Cancel
                    </Button>
                </div>

                <form onSubmit={handleSubmit} className="flex flex-col gap-6">
                    <FormSection
                        title="Profile Picture"
                        description="Shown on operator cards, the table view and the account menu."
                    >
                        <ProfilePhotoUpload
                            id="operator-photo"
                            name={operator.user?.name ?? ''}
                            currentUrl={operator.user?.avatar ?? null}
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
                        title="Operator Account"
                        description="Select the user associated with this operator profile."
                    >
                        <div className="grid gap-2">
                            <Label htmlFor="user_id">
                                Select User / Operator Account <RequiredMark />
                            </Label>
                            <Select
                                name="user_id"
                                value={data.user_id}
                                onValueChange={(value) =>
                                    setData('user_id', value)
                                }
                            >
                                <SelectTrigger id="user_id">
                                    <SelectValue placeholder="Select an operator user..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {availableUsers.map((user) => (
                                        <SelectItem
                                            key={user.id}
                                            value={String(user.id)}
                                        >
                                            <div>
                                                <div className="font-medium">
                                                    {user.name}
                                                </div>
                                                <div className="text-muted-foreground text-xs">
                                                    {user.email}
                                                </div>
                                            </div>
                                        </SelectItem>
                                    ))}
                                    {availableUsers.length === 0 && (
                                        <SelectItem value="none" disabled>
                                            No operator users available.
                                        </SelectItem>
                                    )}
                                </SelectContent>
                            </Select>
                            <InputError message={errors.user_id} />
                        </div>
                    </FormSection>

                    <FormSection
                        title="Operator Information"
                        description="Contact details. Fields marked with * are required."
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
