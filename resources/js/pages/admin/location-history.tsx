import { Head } from '@inertiajs/react';
import { History } from 'lucide-react';
import AppSidebarLayout from '@/layouts/app/app-sidebar-layout';
import {
    LocationHistorySection,
} from '@/components/location-history-section';
import type { HistoryBus } from '@/components/location-history-section';

type Props = {
    buses: HistoryBus[];
};

export default function AdminLocationHistoryPage({ buses }: Props) {
    return (
        <AppSidebarLayout
            breadcrumbs={[
                {
                    title: 'Dashboard',
                    href: '/admin/dashboard',
                },
                {
                    title: 'Location History',
                    href: '/admin/location-history',
                },
            ]}
        >
            <Head title="Location History" />

            <div className="flex flex-col gap-6">
                <div className="flex items-center gap-4">
                    <div className="bg-primary/10 text-primary-strong flex size-11 shrink-0 items-center justify-center rounded-xl">
                        <History className="size-6" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-semibold">
                            Location History
                        </h1>
                        <p className="text-muted-foreground">
                            Historical GPS records for each bus in the fleet.
                        </p>
                    </div>
                </div>

                <LocationHistorySection buses={buses} />
            </div>
        </AppSidebarLayout>
    );
}
