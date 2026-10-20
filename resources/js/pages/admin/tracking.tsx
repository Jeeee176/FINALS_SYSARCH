import { Head } from '@inertiajs/react';
import AppSidebarLayout from '@/layouts/app/app-sidebar-layout';
import { LiveTrackingView } from '@/components/live-tracking-view';

export default function AdminTrackingPage() {
    return (
        <AppSidebarLayout
            breadcrumbs={[
                {
                    title: 'Dashboard',
                    href: '/admin/dashboard',
                },
                {
                    title: 'Live Tracking',
                    href: '/admin/tracking',
                },
            ]}
        >
            <Head title="Live Tracking" />

            <LiveTrackingView />
        </AppSidebarLayout>
    );
}
