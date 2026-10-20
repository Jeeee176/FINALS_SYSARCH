import { Head } from '@inertiajs/react';
import { BellRing } from 'lucide-react';
import OperatorSidebarLayout from '@/layouts/app/operator-sidebar-layout';
import { ActiveAlertsList, useActiveAlerts } from '@/components/active-alerts';
import {
    LiveTrackingView,
    type LiveTrackingInitialBus,
} from '@/components/live-tracking-view';
import { Badge } from '@/components/ui/badge';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

type Props = {
    buses: LiveTrackingInitialBus[];
};

export default function OperatorTrackingPage({ buses }: Props) {
    const {
        alerts,
        alertsLoading,
        alertsError,
        busyAlertId,
        handleAcknowledge,
        handleResolve,
        refresh: refreshAlerts,
    } = useActiveAlerts();

    const alertsCard = (
        <Card data-test="active-alerts-card">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <BellRing className="text-primary size-4" />
                    Active Alerts
                    <Badge
                        className={cn(
                            'ml-auto border-transparent',
                            alerts.length > 0
                                ? 'bg-warning text-warning-foreground'
                                : 'bg-muted text-muted-foreground',
                        )}
                    >
                        {alerts.length}
                    </Badge>
                </CardTitle>
                <CardDescription>
                    Alerts from active trips and reported delays/incidents.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
                {alertsError && (
                    <div className="border-destructive/50 bg-destructive/10 text-destructive-strong rounded-lg border p-3 text-sm">
                        {alertsError}
                    </div>
                )}
                {alertsLoading ? (
                    <p className="text-muted-foreground flex items-center gap-1.5 text-sm">
                        <Spinner className="text-primary size-4 shrink-0" />
                        Loading alerts...
                    </p>
                ) : alerts.length === 0 ? (
                    <p className="text-muted-foreground text-sm">
                        No active alerts.
                    </p>
                ) : (
                    <ActiveAlertsList
                        alerts={alerts}
                        onAcknowledge={handleAcknowledge}
                        onResolve={handleResolve}
                        busyId={busyAlertId}
                    />
                )}
            </CardContent>
        </Card>
    );

    return (
        <OperatorSidebarLayout
            breadcrumbs={[
                {
                    title: 'Dashboard',
                    href: '/operator/dashboard',
                },
                {
                    title: 'Live Tracking',
                    href: '/operator/tracking',
                },
            ]}
        >
            <Head title="Live Tracking" />

            <LiveTrackingView
                initialBuses={buses}
                keepMissingBuses
                onRefresh={refreshAlerts}
                alertsSlot={alertsCard}
            />
        </OperatorSidebarLayout>
    );
}
