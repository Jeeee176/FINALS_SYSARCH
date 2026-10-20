import { Head } from '@inertiajs/react';
import { BellRing } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import AppSidebarLayout from '@/layouts/app/app-sidebar-layout';
import { type FleetAlert } from '@/components/active-alerts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

type AlertStatus = 'active' | 'new' | 'acknowledged' | 'resolved' | 'all';

type PageMeta = {
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
};

type AlertsPageProps = {
    alerts?: { data: FleetAlert[]; meta: PageMeta } | null;
};

function formatAlertTime(value: string): string {
    if (!value) return '—';

    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?/);

    if (match) {
        const [, year, month, day, hour, minute, second = '00'] = match;
        const date = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
        if (!Number.isNaN(date.getTime())) {
            return date.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
        }
    }
    const iso = new Date(value);
    if (!Number.isNaN(iso.getTime())) {
        return iso.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    }
    return value;
}

function alertContext(alert: FleetAlert): string {
    const parts: string[] = [];
    const bus = alert.alertable?.bus;
    if (bus?.bus_number) parts.push(`Bus ${bus.bus_number}${bus.plate_number ? ` · ${bus.plate_number}` : ''}`);
    const driverName = alert.alertable?.driver?.user?.name;
    if (driverName) parts.push(driverName);
    const reason = alert.alertable?.reason;
    if (reason) parts.push(`Reason: ${reason}`);
    const details = alert.alertable?.details;
    if (details) parts.push(details);
    return parts.join(' · ');
}

const STATUS_LABELS: Record<string, string> = { new: 'New', acknowledged: 'Acknowledged', resolved: 'Resolved' };
const SEVERITY_STYLES: Record<string, string> = { critical: 'bg-destructive text-destructive-foreground', warning: 'bg-warning text-warning-foreground', info: 'bg-primary/10 text-primary-strong' };
const SEVERITY_LABELS: Record<string, string> = { critical: 'Critical', warning: 'Warning', info: 'Info' };

function AlertRow({ alert, onAcknowledge, onResolve, busyId }: {
    alert: FleetAlert;
    onAcknowledge?: (id: number) => void;
    onResolve?: (id: number) => void;
    busyId?: number | null;
}) {
    const isBusy = busyId === alert.id;
    const context = alertContext(alert);

    return (
        <div className="flex flex-wrap items-start gap-3 rounded-lg border px-4 py-3 transition-colors hover:bg-muted/30">
            <div className="mt-0.5 shrink-0">
                <Badge className={cn('border-transparent', SEVERITY_STYLES[alert.severity] ?? 'bg-muted text-muted-foreground')}>
                    {SEVERITY_LABELS[alert.severity] ?? 'Info'}
                </Badge>
            </div>
            <div className="min-w-[12rem] flex-1 min-w-0">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                    <h4 className="shrink truncate text-sm font-medium">{alert.title}</h4>
                    <span className="text-muted-foreground shrink-0 text-xs whitespace-nowrap">{formatAlertTime(alert.created_at)}</span>
                </div>
                <p className="text-muted-foreground mt-0.5 text-sm line-clamp-2">{alert.message}</p>
                {context !== '' && <p className="text-muted-foreground mt-0.5 text-xs">{context}</p>}
            </div>
            <div className="ml-auto flex shrink-0 flex-col items-end gap-1.5">
                <Badge className="text-xs" variant="secondary">{STATUS_LABELS[alert.status] ?? alert.status}</Badge>
                <div className="flex items-center gap-1">
                    {alert.status === 'new' && (
                        <button
                            type="button"
                            onClick={() => onAcknowledge?.(alert.id)}
                            disabled={isBusy}
                            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded border border-transparent hover:border-border disabled:opacity-50"
                        >
                            Acknowledge
                        </button>
                    )}
                    {alert.status === 'acknowledged' && (
                        <button
                            type="button"
                            onClick={() => onResolve?.(alert.id)}
                            disabled={isBusy}
                            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded border border-transparent hover:border-border disabled:opacity-50"
                        >
                            Resolve
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

export default function AdminAlertsPage({ alerts: initialAlerts }: AlertsPageProps) {
    const [status, setStatus] = useState<AlertStatus>('active');
    const [page, setPage] = useState(1);
    const perPage = 20;
    const [alerts, setAlerts] = useState<FleetAlert[]>(initialAlerts?.data ?? []);
    const [meta, setMeta] = useState<PageMeta | null>(initialAlerts?.meta ?? null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [busyId, setBusyId] = useState<number | null>(null);

    const fetchAlerts = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams({ status, per_page: String(perPage), page: String(page) });
            const response = await fetch(`/api/alerts?${params}`);
            if (!response.ok) throw new Error('Failed to load alerts');
            const body = await response.json();
            if (body.success) {
                setAlerts(body.data);
                setMeta(body.meta);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load alerts');
        } finally {
            setLoading(false);
        }
    }, [status, page, perPage]);

    useEffect(() => { void fetchAlerts(); }, [fetchAlerts]);

    const handleAcknowledge = async (id: number) => {
        setBusyId(id);
        try {
            const res = await fetch(`/api/alerts/${id}/acknowledge`, { method: 'PATCH' });
            if (!res.ok) throw new Error('Failed to acknowledge alert');
            const body = await res.json();
            if (body.success) {
                setAlerts(prev => prev.map(a => a.id === id ? { ...a, status: 'acknowledged' } : a));
            }
        } catch {
            setError('Failed to acknowledge alert');
        } finally { setBusyId(null); }
    };

    const handleResolve = async (id: number) => {
        setBusyId(id);
        try {
            const res = await fetch(`/api/alerts/${id}/resolve`, { method: 'PATCH' });
            if (!res.ok) throw new Error('Failed to resolve alert');
            const body = await res.json();
            if (body.success) {
                setAlerts(prev => prev.filter(a => a.id !== id));
            }
        } catch {
            setError('Failed to resolve alert');
        } finally { setBusyId(null); }
    };

    const statusOptions: { value: AlertStatus; label: string }[] = [
        { value: 'active', label: 'Active' },
        { value: 'new', label: 'New' },
        { value: 'acknowledged', label: 'Acknowledged' },
        { value: 'resolved', label: 'Resolved' },
        { value: 'all', label: 'All' },
    ];

    return (
        <AppSidebarLayout
            breadcrumbs={[
                { title: 'Dashboard', href: '/admin/dashboard' },
                { title: 'Alerts', href: '/admin/alerts' },
            ]}
        >
            <Head title="Alerts" />
            <div className="flex flex-1 flex-col gap-6 px-6 md:px-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-semibold tracking-tight">Alerts</h1>
                        <p className="text-muted-foreground mt-1 text-sm">Manage system and fleet alerts.</p>
                    </div>
                </div>

                <Card>
                    <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3">
                        <div>
                            <CardTitle className="text-base">Active Alerts ({meta?.total ?? 0})</CardTitle>
                            <CardDescription>System and fleet alerts that require attention.</CardDescription>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            {statusOptions.map(opt => (
                                <Button
                                    key={opt.value}
                                    variant={status === opt.value ? 'default' : 'outline'}
                                    size="sm"
                                    onClick={() => { setStatus(opt.value); setPage(1); }}
                                >
                                    {opt.label}
                                </Button>
                            ))}
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {error && (
                            <div className="border-destructive/50 bg-destructive/10 text-destructive-strong rounded-lg border p-3 text-sm">
                                {error}
                            </div>
                        )}
                        {loading && (
                            <div className="flex items-center justify-center py-8">
                                <Spinner className="text-primary size-5" />
                            </div>
                        )}
                        {alerts.length === 0 && !loading && (
                            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-10 text-center">
                                <div className="bg-muted text-muted-foreground flex size-10 items-center justify-center rounded-full">
                                    <BellRing className="size-5" />
                                </div>
                                <p className="mt-3 text-sm font-medium">No alerts</p>
                                <p className="text-muted-foreground mt-1 max-w-sm text-sm">
                                    No alerts match the current filter.
                                </p>
                            </div>
                        )}
                        <div className="space-y-2">
                            {alerts.map(alert => (
                                <AlertRow
                                    key={alert.id}
                                    alert={alert}
                                    onAcknowledge={handleAcknowledge}
                                    onResolve={handleResolve}
                                    busyId={busyId}
                                />
                            ))}
                        </div>
                        {meta && meta.last_page > 1 && (
                            <div className="mt-4 flex items-center justify-center gap-1">
                                {Array.from({ length: meta.last_page }, (_, i) => i + 1).map(p => (
                                    <button
                                        key={p}
                                        onClick={() => setPage(p)}
                                        className={cn('px-3 py-1 text-sm rounded border transition-colors', p === page ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}
                                    >
                                        {p}
                                    </button>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </AppSidebarLayout>
    );
}
