import { Head, Link, router } from '@inertiajs/react';
import type { LucideIcon } from 'lucide-react';
import {
    CircleCheck,
    Edit2,
    FilterX,
    LayoutGrid,
    List,
    Plus,
    PowerOff,
    Search,
    Trash2,
    UserCog,
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

type Operator = {
    id: number;
    user_id: number;
    phone: string | null;
    address: string | null;
    status: string;
    user: User | null;
};

type StatusFilter = 'all' | 'active' | 'inactive';

type ViewMode = 'cards' | 'table';

type Props = {
    operators: Operator[];
};

function operatorName(operator: Operator): string {
    return operator.user?.name ?? 'Unknown';
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

export default function AdminOperatorsIndexPage({ operators }: Props) {
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
    const [view, setView] = useState<ViewMode>('cards');
    const [operatorToDelete, setOperatorToDelete] = useState<Operator | null>(
        null,
    );

    const counts = useMemo(
        () => ({
            total: operators.length,
            active: operators.filter((operator) => operator.status === 'active')
                .length,
            inactive: operators.filter(
                (operator) => operator.status !== 'active',
            ).length,
        }),
        [operators],
    );

    const filteredOperators = useMemo(() => {
        const query = search.trim().toLowerCase();

        return operators.filter((operator) => {
            if (query) {
                const matchesQuery = [
                    operator.user?.name ?? '',
                    operator.user?.email ?? '',
                    operator.phone ?? '',
                ].some((field) => field.toLowerCase().includes(query));

                if (!matchesQuery) {
                    return false;
                }
            }

            if (statusFilter !== 'all' && operator.status !== statusFilter) {
                return false;
            }

            return true;
        });
    }, [operators, search, statusFilter]);

    const hasActiveFilters = search.trim() !== '' || statusFilter !== 'all';

    const clearFilters = () => {
        setSearch('');
        setStatusFilter('all');
    };

    const confirmDelete = () => {
        if (operatorToDelete) {
            router.delete(`/admin/operators/${operatorToDelete.id}`);
            setOperatorToDelete(null);
        }
    };

    const renderActions = (operator: Operator) => (
        <div className="flex items-center justify-end gap-1.5">
            <Button asChild variant="ghost" size="icon" className="h-8 w-8">
                <Link href={`/admin/operators/${operator.id}/edit`}>
                    <Edit2 className="h-4 w-4" />
                    <span className="sr-only">Edit</span>
                </Link>
            </Button>
            <Button
                variant="ghost"
                size="icon"
                className="text-destructive-strong hover:bg-destructive/10 h-8 w-8"
                title="Delete operator"
                onClick={() => setOperatorToDelete(operator)}
            >
                <Trash2 className="h-4 w-4" />
                <span className="sr-only">Delete</span>
            </Button>
        </div>
    );

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
            ]}
        >
            <Head title="Operators" />

            <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h1 className="text-2xl font-semibold">
                            Operator Management
                        </h1>
                        <p className="text-muted-foreground">
                            Manage operator profiles and account status.
                        </p>
                    </div>
                    <Button asChild className="sm:shrink-0">
                        <Link href="/admin/operators/create">
                            <Plus className="h-4 w-4" />
                            Add Operator
                        </Link>
                    </Button>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                    <SummaryCard
                        label="Total Operators"
                        value={counts.total}
                        sublabel="Registered profiles"
                        icon={Users}
                    />
                    <SummaryCard
                        label="Active Operators"
                        value={counts.active}
                        sublabel="Currently active"
                        icon={CircleCheck}
                    />
                    <SummaryCard
                        label="Inactive Operators"
                        value={counts.inactive}
                        sublabel="Not currently active"
                        icon={PowerOff}
                    />
                </div>

                {operators.length === 0 ? (
                    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-16 text-center">
                        <div className="bg-muted mb-4 flex h-12 w-12 items-center justify-center rounded-full">
                            <UserCog className="text-muted-foreground h-6 w-6" />
                        </div>
                        <h2 className="text-base font-semibold">
                            No operators yet
                        </h2>
                        <p className="text-muted-foreground mt-1 max-w-sm text-sm">
                            Add your first operator to start managing operator
                            accounts.
                        </p>
                        <Button className="mt-4" asChild>
                            <Link href="/admin/operators/create">
                                <Plus className="h-4 w-4" />
                                Add your first operator
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
                                    placeholder="Search by name, email, phone..."
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    className="pr-9 pl-9"
                                    aria-label="Search operators"
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
                            Showing {filteredOperators.length} of {counts.total}{' '}
                            operators
                        </p>

                        {filteredOperators.length === 0 ? (
                            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-12 text-center">
                                <p className="text-muted-foreground text-sm">
                                    No operators match your filters.
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
                                data-test="operator-cards-view"
                                className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
                            >
                                {filteredOperators.map((operator) => (
                                    <Card
                                        key={operator.id}
                                        className="flex flex-col py-5"
                                    >
                                        <CardContent className="flex flex-1 flex-col gap-4 px-5">
                                            <div className="flex items-center gap-3">
                                                <UserAvatar
                                                    name={operatorName(
                                                        operator,
                                                    )}
                                                    src={operator.user?.avatar}
                                                    className="size-12"
                                                />
                                                <div className="min-w-0">
                                                    <p className="truncate font-medium">
                                                        {operatorName(operator)}
                                                    </p>
                                                    {operator.user?.email && (
                                                        <p className="text-muted-foreground truncate text-xs">
                                                            {
                                                                operator.user
                                                                    .email
                                                            }
                                                        </p>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="flex flex-wrap gap-1.5">
                                                <StatusBadge
                                                    status={operator.status}
                                                />
                                            </div>

                                            <dl className="grid grid-cols-1 gap-x-4 gap-y-3 text-sm">
                                                <div className="min-w-0">
                                                    <dt className="text-muted-foreground text-xs">
                                                        Phone
                                                    </dt>
                                                    <dd>
                                                        {operator.phone ? (
                                                            <span>
                                                                {operator.phone}
                                                            </span>
                                                        ) : (
                                                            <span className="text-muted-foreground">
                                                                Not provided
                                                            </span>
                                                        )}
                                                    </dd>
                                                </div>
                                                <div className="min-w-0">
                                                    <dt className="text-muted-foreground text-xs">
                                                        Address
                                                    </dt>
                                                    <dd className="truncate">
                                                        {operator.address ? (
                                                            <span>
                                                                {
                                                                    operator.address
                                                                }
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
                                                {renderActions(operator)}
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        ) : (
                            <div data-test="operator-table-view">
                                <Table containerClassName="rounded-lg border">
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Operator</TableHead>
                                            <TableHead>Phone</TableHead>
                                            <TableHead>Address</TableHead>
                                            <TableHead>Status</TableHead>
                                            <TableHead className="text-right">
                                                Actions
                                            </TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {filteredOperators.map((operator) => (
                                            <TableRow key={operator.id}>
                                                <TableCell>
                                                    <div className="flex items-center gap-3">
                                                        <UserAvatar
                                                            name={operatorName(
                                                                operator,
                                                            )}
                                                            src={
                                                                operator.user
                                                                    ?.avatar
                                                            }
                                                            className="size-8"
                                                            fallbackClassName="text-xs"
                                                        />
                                                        <div className="min-w-0">
                                                            <div className="text-sm font-medium whitespace-nowrap">
                                                                {operatorName(
                                                                    operator,
                                                                )}
                                                            </div>
                                                            {operator.user
                                                                ?.email && (
                                                                <div className="text-muted-foreground truncate text-xs">
                                                                    {
                                                                        operator
                                                                            .user
                                                                            .email
                                                                    }
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="whitespace-nowrap">
                                                    {operator.phone ?? '-'}
                                                </TableCell>
                                                <TableCell className="max-w-[280px]">
                                                    <span className="block truncate">
                                                        {operator.address ??
                                                            '-'}
                                                    </span>
                                                </TableCell>
                                                <TableCell className="whitespace-nowrap">
                                                    <StatusBadge
                                                        status={operator.status}
                                                    />
                                                </TableCell>
                                                <TableCell className="text-right whitespace-nowrap">
                                                    {renderActions(operator)}
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
                open={operatorToDelete !== null}
                onOpenChange={(open) => {
                    if (!open) {
                        setOperatorToDelete(null);
                    }
                }}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Delete Operator</DialogTitle>
                        <DialogDescription>
                            Are you sure you want to delete operator{' '}
                            <span className="text-foreground font-medium">
                                {operatorToDelete
                                    ? operatorName(operatorToDelete)
                                    : 'Unknown'}
                            </span>
                            ? This action cannot be undone.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button
                            variant="ghost"
                            onClick={() => setOperatorToDelete(null)}
                        >
                            Cancel
                        </Button>
                        <Button variant="destructive" onClick={confirmDelete}>
                            Delete Operator
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </AppSidebarLayout>
    );
}
