import { Head } from '@inertiajs/react';
import { ArrowDown, Route as RouteIcon } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import DriverSidebarLayout from '@/layouts/app/driver-sidebar-layout';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type Status = 'active' | 'inactive';

type Route = {
    id: number;
    name: string;
    origin: string;
    destination: string;
    status: Status;
};

type Props = {
    assignedRoute: Route | null;
};

function StatusBadge({ status }: { status: Status }) {
    const isActive = status === 'active';

    return (
        <Badge
            className={cn(
                'border-transparent',
                isActive
                    ? 'bg-success text-success-foreground'
                    : 'bg-muted text-muted-foreground',
            )}
        >
            {isActive ? 'Active' : 'Inactive'}
        </Badge>
    );
}

function StopLabel({ label }: { label: string }) {
    return (
        <span className="text-muted-foreground mb-1 block text-xs font-medium tracking-wide uppercase">
            {label}
        </span>
    );
}

function EmptyState({
    icon: Icon,
    title,
    description,
}: {
    icon: LucideIcon;
    title: string;
    description?: string;
}) {
    return (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-10 text-center">
            <div className="bg-muted text-muted-foreground flex size-10 items-center justify-center rounded-full">
                <Icon className="size-5" />
            </div>
            <p className="mt-3 text-sm font-medium">{title}</p>
            {description && (
                <p className="text-muted-foreground mt-1 max-w-sm text-sm">
                    {description}
                </p>
            )}
        </div>
    );
}

export default function DriverRoutePage({ assignedRoute }: Props) {
    return (
        <DriverSidebarLayout
            breadcrumbs={[
                {
                    title: 'My Route',
                    href: '/driver/route',
                },
            ]}
        >
            <Head title="My Route" />

            <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight">
                        My Route
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        View the route assigned to your bus.
                    </p>
                </div>

                <Card>
                    <CardContent className="p-6">
                        {!assignedRoute ? (
                            <EmptyState
                                icon={RouteIcon}
                                title="No route assigned"
                                description="Your assigned bus does not currently have a route."
                            />
                        ) : (
                            <>
                                <div className="bg-primary/10 text-primary-strong flex items-center gap-3 rounded-lg px-4 py-3">
                                    <RouteIcon className="size-5 shrink-0" />
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-medium">
                                            {assignedRoute.name}
                                        </p>
                                    </div>
                                    <StatusBadge
                                        status={assignedRoute.status}
                                    />
                                </div>

                                <div className="mt-6 grid grid-cols-1 items-center gap-4 sm:grid-cols-[1fr_auto_1fr]">
                                    <div className="bg-muted rounded-lg border border-transparent p-5 text-center sm:text-left">
                                        <StopLabel label="Origin" />
                                        <p className="text-lg font-semibold">
                                            {assignedRoute.origin}
                                        </p>
                                    </div>

                                    <div className="mx-auto flex size-9 items-center justify-center sm:mx-0">
                                        <ArrowDown className="text-primary size-5" />
                                    </div>

                                    <div className="bg-muted rounded-lg border border-transparent p-5 text-center sm:text-right">
                                        <StopLabel label="Destination" />
                                        <p className="text-lg font-semibold">
                                            {assignedRoute.destination}
                                        </p>
                                    </div>
                                </div>
                            </>
                        )}
                    </CardContent>
                </Card>
            </div>
        </DriverSidebarLayout>
    );
}
