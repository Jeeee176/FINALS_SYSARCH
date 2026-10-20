import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, CheckCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

export const ALERT_POLL_INTERVAL_MS = 5000;

export type FleetAlert = {
    id: number;
    type: string;
    status: string;
    severity: string;
    title: string;
    message: string;
    created_at: string;
    alertable?: {
        bus?: { bus_number?: string; plate_number?: string } | null;
        driver?: { user?: { name?: string } | null } | null;
        reason?: string | null;
        details?: string | null;
        reported_at?: string | null;
        started_at?: string | null;
        status?: string | null;
    } | null;
};

type ActiveAlertsListProps = {
    alerts: FleetAlert[];
    onAcknowledge?: (alertId: number) => void;
    onResolve?: (alertId: number) => void;
    busyId?: number | null;
};

const SEVERITY_STYLES: Record<string, string> = {
    critical: 'bg-destructive text-destructive-foreground',
    warning: 'bg-warning text-warning-foreground',
    info: 'bg-primary/10 text-primary-strong',
};

const SEVERITY_LABELS: Record<string, string> = {
    critical: 'Critical',
    warning: 'Warning',
    info: 'Info',
};

function formatAlertTime(value: string): string {
    if (!value) {
        return '—';
    }

    const match = value.match(
        /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?/,
    );

    if (match) {
        const [, year, month, day, hour, minute, second = '00'] = match;
        const date = new Date(
            Number(year),
            Number(month) - 1,
            Number(day),
            Number(hour),
            Number(minute),
            Number(second),
        );
        if (!Number.isNaN(date.getTime())) {
            return date.toLocaleString(undefined, {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
            });
        }
    }

    const iso = new Date(value);
    if (!Number.isNaN(iso.getTime())) {
        return iso.toLocaleString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
        });
    }

    return value;
}

function alertContext(alert: FleetAlert): string {
    const parts: string[] = [];

    const bus = alert.alertable?.bus;
    if (bus?.bus_number) {
        parts.push(
            `Bus ${bus.bus_number}${bus.plate_number ? ` · ${bus.plate_number}` : ''}`,
        );
    }

    const driverName = alert.alertable?.driver?.user?.name;
    if (driverName) {
        parts.push(driverName);
    }

    const reason = alert.alertable?.reason;
    if (reason) {
        parts.push(`Reason: ${reason}`);
    }

    return parts.join(' · ');
}

export async function patchAlert(
    alertId: number,
    action: 'acknowledge' | 'resolve',
): Promise<boolean> {
    try {
        const response = await fetch(`/api/alerts/${alertId}/${action}`, {
            method: 'PATCH',
        });

        if (!response.ok) {
            return false;
        }

        const body = (await response.json()) as {
            success?: boolean;
            error?: string;
        };

        return body.success === true;
    } catch {
        return false;
    }
}

export function useActiveAlerts(initialAlerts: FleetAlert[] = []) {
    const [alerts, setAlerts] = useState<FleetAlert[]>(initialAlerts);
    const [alertsTotal, setAlertsTotal] = useState<number | null>(null);
    const [alertsLoading, setAlertsLoading] = useState(true);
    const [alertsError, setAlertsError] = useState<string | null>(null);
    const [busyAlertId, setBusyAlertId] = useState<number | null>(null);

    const mountedRef = useRef(true);

    const load = useCallback(async () => {
        try {
            const response = await fetch('/api/alerts?status=active');

            if (!response.ok) {
                if (mountedRef.current) {
                    setAlertsError('Could not load alerts.');
                }
                return;
            }

            const body = (await response.json()) as {
                data?: FleetAlert[];
                meta?: { total?: number };
            };
            const incoming = Array.isArray(body.data) ? body.data : [];

            if (!mountedRef.current) {
                return;
            }

            const seen = new Set<number>();
            setAlerts(
                incoming.filter((alert) => {
                    if (seen.has(alert.id)) {
                        return false;
                    }
                    seen.add(alert.id);
                    return true;
                }),
            );

            // The list payload is paginated; meta.total is the exact count of
            // matching alerts, so cards can show a correct overall number.
            if (typeof body.meta?.total === 'number') {
                setAlertsTotal(body.meta.total);
            }

            setAlertsError(null);
        } catch {
            if (mountedRef.current) {
                setAlertsError('Could not load alerts.');
            }
        } finally {
            if (mountedRef.current) {
                setAlertsLoading(false);
            }
        }
    }, []);

    useEffect(() => {
        mountedRef.current = true;

        void load();

        const timer = window.setInterval(() => {
            void load();
        }, ALERT_POLL_INTERVAL_MS);

        return () => {
            mountedRef.current = false;
            window.clearInterval(timer);
        };
    }, [load]);

    const handleAcknowledge = useCallback(async (alertId: number) => {
        setAlertsError(null);
        setBusyAlertId(alertId);

        const ok = await patchAlert(alertId, 'acknowledge');

        if (!mountedRef.current) {
            return;
        }

        if (ok) {
            setAlerts((prev) =>
                prev.map((alert) =>
                    alert.id === alertId
                        ? { ...alert, status: 'acknowledged' }
                        : alert,
                ),
            );
        } else {
            setAlertsError(
                'Could not acknowledge this alert. It may have already been updated.',
            );
        }

        setBusyAlertId(null);
    }, []);

    const handleResolve = useCallback(async (alertId: number) => {
        setAlertsError(null);
        setBusyAlertId(alertId);

        const ok = await patchAlert(alertId, 'resolve');

        if (!mountedRef.current) {
            return;
        }

        if (ok) {
            setAlerts((prev) => prev.filter((alert) => alert.id !== alertId));
            setAlertsTotal((total) =>
                total !== null && total > 0 ? total - 1 : total,
            );
        } else {
            setAlertsError(
                'Could not resolve this alert. It may have already been updated.',
            );
        }

        setBusyAlertId(null);
    }, []);

    return {
        alerts,
        alertsTotal,
        alertsLoading,
        alertsError,
        busyAlertId,
        handleAcknowledge,
        handleResolve,
        refresh: load,
    };
}

export function ActiveAlertsList({
    alerts,
    onAcknowledge,
    onResolve,
    busyId = null,
}: ActiveAlertsListProps) {
    return (
        <div className="space-y-2">
            {alerts.map((alert) => {
                const isBusy = busyId === alert.id;
                const severityStyle =
                    SEVERITY_STYLES[alert.severity] ??
                    'bg-muted text-muted-foreground';
                const severityLabel = SEVERITY_LABELS[alert.severity] ?? 'Info';
                const context = alertContext(alert);

                return (
                    <div
                        key={alert.id}
                        className="flex flex-wrap items-start gap-3 rounded-lg border px-4 py-3"
                    >
                        <Badge
                            className={cn(
                                'mt-0.5 shrink-0 border-transparent',
                                severityStyle,
                            )}
                        >
                            {severityLabel}
                        </Badge>

                        {/* min-w keeps the body readable on very narrow
                            screens instead of collapsing it to zero width */}
                        <div className="min-w-[12rem] flex-1">
                            <p className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                                <span className="shrink truncate text-sm font-medium">
                                    {alert.title}
                                </span>
                                <span className="text-muted-foreground shrink-0 text-xs">
                                    {formatAlertTime(alert.created_at)}
                                </span>
                            </p>
                            <p className="text-muted-foreground mt-0.5 text-xs">
                                {alert.message}
                            </p>
                            {context !== '' && (
                                <p className="text-muted-foreground mt-1 text-xs">
                                    {context}
                                </p>
                            )}
                        </div>

                        <div className="ml-auto flex shrink-0 flex-col items-end gap-2">
                            <span className="text-muted-foreground text-xs">
                                {alert.status === 'new'
                                    ? 'New'
                                    : 'Acknowledged'}
                            </span>
                            {alert.status === 'new' && onAcknowledge && (
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    disabled={isBusy || busyId !== null}
                                    onClick={() => onAcknowledge(alert.id)}
                                >
                                    {isBusy ? (
                                        <Spinner className="size-3.5" />
                                    ) : (
                                        <Check className="size-3.5" />
                                    )}
                                    Acknowledge
                                </Button>
                            )}
                            {alert.status === 'acknowledged' && onResolve && (
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    disabled={isBusy || busyId !== null}
                                    onClick={() => onResolve(alert.id)}
                                >
                                    {isBusy ? (
                                        <Spinner className="size-3.5" />
                                    ) : (
                                        <CheckCheck className="size-3.5" />
                                    )}
                                    Resolve
                                </Button>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
