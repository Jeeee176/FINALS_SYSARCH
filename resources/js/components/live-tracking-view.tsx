import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Bus,
    Check,
    Crosshair,
    MapPin,
    Navigation,
    RefreshCw,
    Satellite,
    Search,
    TriangleAlert,
    Users,
    X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { TrackingMap } from '@/components/tracking-map';
import type { BusMapMarker } from '@/components/tracking-map';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

export type TrackingRouteInfo = {
    id: number;
    name: string;
    status: string | null;
};

export type TrackingDriverInfo = {
    id: number;
    name: string | null;
};

export type TrackingLocation = {
    latitude: string | number;
    longitude: string | number;
    accuracy: number | null;
    recorded_at: string;
};

export type TrackingTrip = {
    id: number;
    status: string;
    started_at: string | null;
};

type TrackingApiBus = {
    id: number;
    bus_number: string;
    plate_number: string;
    model?: string | null;
    status: string;
    location: TrackingLocation | null;
    is_tracking_active?: boolean;
    current_trip: TrackingTrip | null;
    route?: TrackingRouteInfo | null;
    driver?: TrackingDriverInfo | null;
};

export type LiveTrackingInitialBus = {
    id: number;
    bus_number: string;
    plate_number: string;
    model?: string | null;
    status: string;
    latitude: string | number | null;
    longitude: string | number | null;
    accuracy?: number | null;
    recorded_at?: string | null;
    current_trip: TrackingTrip | null;
    is_tracking_active?: boolean;
    route?: TrackingRouteInfo | null;
    driver?: TrackingDriverInfo | null;
};

type LiveBus = {
    id: number;
    bus_number: string;
    plate_number: string;
    model: string | null;
    status: string;
    location: TrackingLocation | null;
    current_trip: TrackingTrip | null;
    is_tracking_active: boolean;
    route: TrackingRouteInfo | null;
    driver: TrackingDriverInfo | null;
};

type EtaStatus =
    | 'ok'
    | 'stale_position'
    | 'no_destination_coordinates'
    | 'no_gps_location'
    | 'no_assigned_route'
    | 'inactive_route';

type BusEtaResponse = {
    success: boolean;
    bus: {
        id: number;
        bus_number: string;
        plate_number: string;
        status: string;
    };
    route: {
        id: number | null;
        name: string | null;
        destination: string | null;
        status: string | null;
    };
    current_position: {
        latitude: number;
        longitude: number;
        recorded_at: string;
        age_minutes: number;
    } | null;
    current_speed_kmh: number | null;
    destination: {
        latitude: number;
        longitude: number;
    } | null;
    distance_km: number | null;
    estimated_duration_minutes: number | null;
    estimated_arrival_at: string | null;
    eta_status: EtaStatus;
    warning: string | null;
};

type EtaRequestState =
    | { status: 'idle' }
    | { status: 'loading' }
    | { status: 'error' }
    | { status: 'success'; eta: BusEtaResponse };

type LiveTrackingViewProps = {
    initialBuses?: LiveTrackingInitialBus[];
    onRefresh?: () => Promise<void> | void;
    alertsSlot?: ReactNode;
    keepMissingBuses?: boolean;
};

const POLLING_INTERVAL_MS = 5000;
const PHILIPPINES_CENTER = { lat: 14.5995, lng: 120.9842 };
const INITIAL_ZOOM = 5;

// Mirrors config('eta.gps_stale_minutes') — the backend marks ETA positions
// stale when the latest GPS record is older than this many minutes.
const GPS_STALE_MINUTES = 15;

function normalizeApiBus(bus: TrackingApiBus): LiveBus {
    return {
        id: bus.id,
        bus_number: bus.bus_number,
        plate_number: bus.plate_number,
        model: bus.model ?? null,
        status: bus.status,
        location: bus.location,
        current_trip: bus.current_trip,
        is_tracking_active:
            bus.current_trip !== null || bus.is_tracking_active === true,
        route: bus.route ?? null,
        driver: bus.driver ?? null,
    };
}

function normalizeInitialBus(bus: LiveTrackingInitialBus): LiveBus {
    const hasCoordinates = bus.latitude !== null && bus.longitude !== null;

    return {
        id: bus.id,
        bus_number: bus.bus_number,
        plate_number: bus.plate_number,
        model: bus.model ?? null,
        status: bus.status,
        location: hasCoordinates
            ? {
                  latitude: bus.latitude as string | number,
                  longitude: bus.longitude as string | number,
                  accuracy: bus.accuracy ?? null,
                  recorded_at: bus.recorded_at ?? '',
              }
            : null,
        current_trip: bus.current_trip,
        is_tracking_active:
            bus.current_trip !== null || bus.is_tracking_active === true,
        route: bus.route ?? null,
        driver: bus.driver ?? null,
    };
}

/**
 * Keeps the first occurrence of each bus id. The operator fleet prop can
 * contain the same bus twice (in-transit with and without GPS), and duplicate
 * React keys would otherwise ghost-duplicate list rows.
 */
function dedupeFleet(buses: LiveBus[]): LiveBus[] {
    const seen = new Set<number>();

    return buses.filter((bus) => {
        if (seen.has(bus.id)) {
            return false;
        }

        seen.add(bus.id);
        return true;
    });
}

function mergeFleet(current: LiveBus[], incoming: LiveBus[]): LiveBus[] {
    if (current.length === 0) {
        return incoming;
    }

    const byId = new Map(incoming.map((bus) => [bus.id, bus]));
    const merged = current.map((bus) => byId.get(bus.id) ?? bus);
    const known = new Set(current.map((bus) => bus.id));

    for (const bus of incoming) {
        if (!known.has(bus.id)) {
            merged.push(bus);
        }
    }

    return dedupeFleet(merged);
}

/**
 * Parse a timestamp into epoch milliseconds. Values without an explicit
 * timezone are treated as UTC because the database stores UTC timestamps.
 */
function parseTimestamp(value: string | null | undefined): number | null {
    if (!value) {
        return null;
    }

    const trimmed = value.trim();
    const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(trimmed);

    if (hasTimezone) {
        const date = new Date(trimmed);
        return Number.isNaN(date.getTime()) ? null : date.getTime();
    }

    const match = trimmed.match(
        /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/,
    );

    if (match) {
        const [, year, month, day, hour, minute, second = '00'] = match;
        return Date.UTC(
            Number(year),
            Number(month) - 1,
            Number(day),
            Number(hour),
            Number(minute),
            Number(second),
        );
    }

    const fallback = new Date(trimmed);
    return Number.isNaN(fallback.getTime()) ? null : fallback.getTime();
}

function formatDateTime(timestamp: number | null): string {
    if (timestamp === null) {
        return 'Unavailable';
    }

    return new Date(timestamp).toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });
}

function formatGpsAge(value: string | null | undefined): string {
    const timestamp = parseTimestamp(value);

    if (timestamp === null) {
        return 'Unavailable';
    }

    const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));

    if (seconds < 5) {
        return 'Just now';
    }
    if (seconds < 60) {
        return `${seconds} sec ago`;
    }

    const minutes = Math.floor(seconds / 60);

    if (minutes < 60) {
        return `${minutes} min ago`;
    }

    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;

    return remainder === 0
        ? `${hours} hr ago`
        : `${hours} hr ${remainder} min ago`;
}

function formatSpeed(value: number | null): string {
    if (value === null) {
        return 'Unavailable';
    }

    return `${value.toFixed(1).replace(/\.0$/, '')} km/h`;
}

function formatDistance(value: number | null): string {
    if (value === null) {
        return 'Unavailable';
    }

    return `${value.toFixed(1).replace(/\.0$/, '')} km`;
}

function formatEtaDuration(totalMinutes: number | null): string {
    if (totalMinutes === null) {
        return 'Unavailable';
    }

    const rounded = Math.max(0, Math.round(totalMinutes));
    const hours = Math.floor(rounded / 60);
    const minutes = rounded % 60;

    if (hours === 0) {
        return `${minutes}m`;
    }
    if (minutes === 0) {
        return `${hours}h`;
    }

    return `${hours}h ${minutes}m`;
}

function formatArrivalTime(iso: string | null): string {
    if (!iso) {
        return 'Unavailable';
    }

    const date = new Date(iso);

    if (Number.isNaN(date.getTime())) {
        return 'Unavailable';
    }

    return date.toLocaleTimeString(undefined, {
        hour: 'numeric',
        minute: '2-digit',
    });
}

type GpsState = {
    kind: 'none' | 'invalid' | 'fresh' | 'stale';
    ageMinutes: number | null;
};

function locationNumbers(bus: LiveBus): { lat: number; lng: number } | null {
    if (!bus.location) {
        return null;
    }

    const lat = Number(bus.location.latitude);
    const lng = Number(bus.location.longitude);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return null;
    }

    return { lat, lng };
}

function gpsStateOf(bus: LiveBus): GpsState {
    if (!bus.location) {
        return { kind: 'none', ageMinutes: null };
    }

    if (locationNumbers(bus) === null) {
        return { kind: 'invalid', ageMinutes: null };
    }

    const timestamp = parseTimestamp(bus.location.recorded_at);

    if (timestamp === null) {
        return { kind: 'stale', ageMinutes: null };
    }

    const ageMinutes = Math.max(0, (Date.now() - timestamp) / 60000);

    return {
        kind: ageMinutes <= GPS_STALE_MINUTES ? 'fresh' : 'stale',
        ageMinutes,
    };
}

function isInTransit(bus: LiveBus): boolean {
    return bus.current_trip !== null;
}

function GpsBadge({ state }: { state: GpsState }) {
    if (state.kind === 'none') {
        return (
            <Badge variant="secondary" className="text-muted-foreground">
                No GPS data
            </Badge>
        );
    }

    if (state.kind === 'invalid') {
        return <Badge variant="warning">GPS unavailable</Badge>;
    }

    if (state.kind === 'fresh') {
        return <Badge variant="success">Live</Badge>;
    }

    return <Badge variant="warning">Stale</Badge>;
}

function StatusBadge({ status }: { status: string }) {
    const isActive = status === 'active';

    return (
        <Badge
            variant={isActive ? 'success' : 'secondary'}
            className={cn(!isActive && 'text-muted-foreground')}
        >
            {isActive ? 'Active' : 'Inactive'}
        </Badge>
    );
}

function SummaryCard({
    icon: Icon,
    label,
    value,
    dataTest,
}: {
    icon: LucideIcon;
    label: string;
    value: number | string;
    dataTest?: string;
}) {
    return (
        <div className="bg-card rounded-lg border p-4" data-test={dataTest}>
            <div className="flex items-center justify-between gap-2">
                <p className="text-muted-foreground text-xs">{label}</p>
                <Icon className="text-muted-foreground size-4 shrink-0" />
            </div>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
        </div>
    );
}

function DetailRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-baseline justify-between gap-3 py-0.5">
            <span className="text-muted-foreground shrink-0 text-xs">
                {label}
            </span>
            <span className="text-foreground text-right text-xs font-medium tabular-nums">
                {value}
            </span>
        </div>
    );
}

function EtaDetails({ eta }: { eta: BusEtaResponse }) {
    const isStale = eta.eta_status === 'stale_position';
    const isInactiveRoute =
        eta.eta_status === 'inactive_route' || eta.route.status === 'inactive';
    const showEta = eta.eta_status === 'ok' || isStale || isInactiveRoute;

    const missingReason =
        eta.eta_status === 'no_destination_coordinates'
            ? 'Destination coordinates are not configured.'
            : eta.eta_status === 'no_gps_location'
              ? 'No GPS location available.'
              : eta.eta_status === 'no_assigned_route'
                ? 'No route assigned.'
                : null;

    return (
        <>
            <DetailRow
                label="ETA"
                value={
                    showEta
                        ? formatEtaDuration(eta.estimated_duration_minutes)
                        : 'Unavailable'
                }
            />
            <DetailRow
                label="Current speed"
                value={formatSpeed(eta.current_speed_kmh)}
            />
            {showEta && (
                <DetailRow
                    label="Distance to destination"
                    value={formatDistance(eta.distance_km)}
                />
            )}
            {showEta && eta.estimated_arrival_at != null && (
                <DetailRow
                    label="Arrival"
                    value={formatArrivalTime(eta.estimated_arrival_at)}
                />
            )}
            {missingReason && (
                <div className="pt-1">
                    <p className="text-foreground text-xs font-semibold">
                        ETA unavailable
                    </p>
                    <p className="text-muted-foreground mt-0.5 text-xs">
                        {missingReason}
                    </p>
                </div>
            )}
            {isInactiveRoute && (
                <p className="bg-warning/15 text-foreground mt-1 flex items-start gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium">
                    <TriangleAlert className="text-warning-strong mt-0.5 size-3.5 shrink-0" />
                    <span>Route is inactive.</span>
                </p>
            )}
        </>
    );
}

function PopupDetails({
    bus,
    etaState,
}: {
    bus: LiveBus;
    etaState: EtaRequestState;
}) {
    const gps = gpsStateOf(bus);

    return (
        <div className="mt-2 min-w-[220px] space-y-0.5 border-t pt-2">
            <DetailRow
                label="Route"
                value={bus.route?.name ?? 'No route assigned'}
            />
            <DetailRow
                label="Driver"
                value={bus.driver?.name ?? 'No driver assigned'}
            />

            <div className="border-t pt-1.5">
                {etaState.status === 'loading' && (
                    <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
                        <Spinner className="text-primary size-3.5 shrink-0" />
                        Loading ETA...
                    </p>
                )}
                {etaState.status === 'error' && (
                    <p className="text-muted-foreground text-xs">
                        ETA information unavailable.
                    </p>
                )}
                {etaState.status === 'success' && (
                    <EtaDetails eta={etaState.eta} />
                )}
            </div>

            <div className="border-t pt-1.5">
                <DetailRow
                    label="Last GPS update"
                    value={formatGpsAge(bus.location?.recorded_at ?? null)}
                />
                {gps.kind === 'stale' && gps.ageMinutes !== null && (
                    <p className="bg-warning/15 text-foreground mt-1 flex items-start gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium">
                        <TriangleAlert className="text-warning-strong mt-0.5 size-3.5 shrink-0" />
                        <span>
                            GPS position is stale ({Math.round(gps.ageMinutes)}{' '}
                            minutes old)
                        </span>
                    </p>
                )}
            </div>
        </div>
    );
}

function BusListItem({
    bus,
    selected,
    onTrack,
}: {
    bus: LiveBus;
    selected: boolean;
    onTrack: (busId: number) => void;
}) {
    const gps = gpsStateOf(bus);
    const canTrack = locationNumbers(bus) !== null;
    const inTransit = isInTransit(bus);

    const trackDisabledReason = !canTrack
        ? 'No GPS location yet — this bus can be tracked once its driver\u2019s device sends a location.'
        : undefined;

    return (
        <div
            className={cn(
                'flex items-start justify-between gap-3 px-3 py-3',
                selected && 'bg-primary/5 ring-primary/30 ring-1 ring-inset',
            )}
            data-test="tracking-bus-item"
            data-bus-id={bus.id}
        >
            <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                    <p className="truncate text-sm font-semibold">
                        {bus.bus_number}
                    </p>
                    {inTransit ? (
                        <Badge
                            variant="info"
                            className="gap-1"
                            data-test="tracking-trip-badge"
                        >
                            <Navigation className="size-3" />
                            In Transit
                        </Badge>
                    ) : (
                        <StatusBadge status={bus.status} />
                    )}
                    {selected && (
                        <Badge
                            variant="default"
                            className="gap-1"
                            data-test="tracking-selected-badge"
                        >
                            <Crosshair className="size-3" />
                            Selected
                        </Badge>
                    )}
                </div>
                <p className="text-muted-foreground truncate text-xs">
                    {bus.plate_number}
                </p>
                <p className="text-muted-foreground mt-1 truncate text-xs">
                    Route: {bus.route?.name ?? 'No route assigned'}
                </p>
                <p className="text-muted-foreground truncate text-xs">
                    Driver: {bus.driver?.name ?? 'No driver assigned'}
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <GpsBadge state={gps} />
                    {gps.ageMinutes !== null && (
                        <span className="text-muted-foreground text-xs">
                            {formatGpsAge(bus.location?.recorded_at ?? null)}
                        </span>
                    )}
                    {gps.kind === 'none' && inTransit && (
                        <span className="text-muted-foreground text-xs">
                            Waiting for the driver&apos;s device to send a
                            location.
                        </span>
                    )}
                </div>
            </div>

            <div className="flex shrink-0 flex-col items-end">
                <Button
                    type="button"
                    size="sm"
                    variant={selected ? 'secondary' : 'outline'}
                    className="gap-1.5"
                    disabled={!canTrack || selected}
                    title={trackDisabledReason}
                    onClick={() => onTrack(bus.id)}
                    data-test="track-bus"
                >
                    {selected ? (
                        <>
                            <Check className="size-3.5" />
                            Focused
                        </>
                    ) : (
                        <>
                            <Crosshair className="size-3.5" />
                            Track
                        </>
                    )}
                </Button>
            </div>
        </div>
    );
}

export function LiveTrackingView({
    initialBuses,
    onRefresh,
    alertsSlot,
    keepMissingBuses = false,
}: LiveTrackingViewProps) {
    const [fleet, setFleet] = useState<LiveBus[]>(() =>
        dedupeFleet((initialBuses ?? []).map(normalizeInitialBus)),
    );
    const [fleetTotal, setFleetTotal] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    const [query, setQuery] = useState('');
    const [selectedBusId, setSelectedBusId] = useState<number | null>(null);
    const [selectionNotice, setSelectionNotice] = useState<string | null>(null);
    const [etaState, setEtaState] = useState<EtaRequestState>({
        status: 'idle',
    });

    const abortRef = useRef<AbortController | null>(null);
    const inFlightRef = useRef(false);
    const etaAbortRef = useRef<AbortController | null>(null);
    const etaRequestIdRef = useRef(0);
    const etaStatusRef = useRef<EtaRequestState['status']>('idle');
    const lastEtaRecordedAtRef = useRef<string | null>(null);
    const selectedIdRef = useRef<number | null>(null);
    const selectedLabelRef = useRef('The selected bus');

    useEffect(() => {
        etaStatusRef.current = etaState.status;
    }, [etaState.status]);

    const fetchEta = useCallback((busId: number) => {
        etaAbortRef.current?.abort();
        etaAbortRef.current = null;

        const requestId = ++etaRequestIdRef.current;

        setEtaState({ status: 'loading' });

        const controller = new AbortController();
        etaAbortRef.current = controller;

        void fetch(`/api/buses/${busId}/eta`, {
            signal: controller.signal,
            headers: { Accept: 'application/json' },
            cache: 'no-store',
        })
            .then(async (response) => {
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }

                const data = (await response.json()) as BusEtaResponse;

                if (
                    requestId === etaRequestIdRef.current &&
                    !controller.signal.aborted
                ) {
                    lastEtaRecordedAtRef.current =
                        data.current_position?.recorded_at ?? null;
                    setEtaState({ status: 'success', eta: data });
                }
            })
            .catch(() => {
                if (
                    requestId === etaRequestIdRef.current &&
                    !controller.signal.aborted
                ) {
                    setEtaState({ status: 'error' });
                }
            });
    }, []);

    const clearEta = useCallback(() => {
        etaAbortRef.current?.abort();
        etaAbortRef.current = null;
        etaRequestIdRef.current++;
        lastEtaRecordedAtRef.current = null;
        setEtaState({ status: 'idle' });
    }, []);

    const fetchLocations = useCallback(
        async (isInitial: boolean) => {
            if (inFlightRef.current) {
                return;
            }

            inFlightRef.current = true;

            try {
                const response = await fetch('/api/buses/locations/latest', {
                    signal: abortRef.current?.signal,
                    headers: { Accept: 'application/json' },
                    cache: 'no-store',
                });

                if (!response.ok) {
                    throw new Error(
                        `Failed to fetch tracking data (HTTP ${response.status})`,
                    );
                }

                const data = (await response.json()) as {
                    success: boolean;
                    fleet_total?: number;
                    buses?: TrackingApiBus[];
                };

                if (abortRef.current?.signal.aborted) {
                    return;
                }

                console.log('[GPS_TRACE] live tracking poll:', {
                    success: data.success,
                    busCount: data.buses?.length,
                    fleetTotal: data.fleet_total,
                });

                if (!data.success || !Array.isArray(data.buses)) {
                    throw new Error('Unexpected tracking response.');
                }

                const incoming = data.buses.map(normalizeApiBus);

                // The operator page receives its own initial fleet prop, which
                // can include buses the locations endpoint does not return
                // (buses that never had a trip). Keep those; on the admin page
                // the polled payload is the authoritative dataset.
                setFleet((previous) =>
                    keepMissingBuses
                        ? mergeFleet(previous, incoming)
                        : incoming,
                );

                if (typeof data.fleet_total === 'number') {
                    setFleetTotal(data.fleet_total);
                }

                setError(null);

                if (isInitial) {
                    setLoading(false);
                }

                const selected = selectedIdRef.current;

                if (selected !== null && etaStatusRef.current !== 'loading') {
                    const bus = incoming.find((item) => item.id === selected);

                    if (bus) {
                        const recordedAt = bus.location?.recorded_at ?? null;
                        const shouldRefresh =
                            etaStatusRef.current === 'error' ||
                            recordedAt !== lastEtaRecordedAtRef.current;

                        if (shouldRefresh) {
                            fetchEta(selected);
                        }
                    }
                }
            } catch (err) {
                if (
                    err instanceof Error &&
                    err.name !== 'AbortError' &&
                    !abortRef.current?.signal.aborted
                ) {
                    setError(err.message);

                    if (isInitial) {
                        setLoading(false);
                    }
                }
            } finally {
                inFlightRef.current = false;
            }
        },
        [fetchEta, keepMissingBuses],
    );

    useEffect(() => {
        const controller = new AbortController();
        abortRef.current = controller;

        void fetchLocations(true);

        const intervalId = window.setInterval(() => {
            if (!controller.signal.aborted) {
                void fetchLocations(false);
            }
        }, POLLING_INTERVAL_MS);

        return () => {
            controller.abort();
            window.clearInterval(intervalId);
            abortRef.current = null;
            etaAbortRef.current?.abort();
            etaAbortRef.current = null;
        };
    }, [fetchLocations]);

    const selectBus = useCallback(
        (busId: number | null) => {
            if (busId === selectedIdRef.current) {
                return;
            }

            selectedIdRef.current = busId;
            setSelectedBusId(busId);
            setSelectionNotice(null);

            if (busId === null) {
                clearEta();
                return;
            }

            lastEtaRecordedAtRef.current = null;
            fetchEta(busId);
        },
        [clearEta, fetchEta],
    );

    useEffect(() => {
        if (selectedBusId === null) {
            return;
        }

        const bus = fleet.find((item) => item.id === selectedBusId);

        if (bus) {
            selectedLabelRef.current = `Bus ${bus.bus_number}`;
        }
    }, [fleet, selectedBusId]);

    // A selected bus can disappear from the dataset (for example after it is
    // deleted or untracked). Clear the focus gracefully and explain why
    // instead of leaving a broken popup or an orphaned selection.
    useEffect(() => {
        if (
            selectedBusId !== null &&
            !fleet.some((bus) => bus.id === selectedBusId)
        ) {
            selectedIdRef.current = null;
            setSelectedBusId(null);
            setSelectionNotice(
                `${selectedLabelRef.current} is no longer in the live dataset — showing all buses.`,
            );
            clearEta();
        }
    }, [fleet, selectedBusId, clearEta]);

    const sortedFleet = useMemo(
        () =>
            [...fleet].sort((a, b) =>
                a.bus_number.localeCompare(b.bus_number, undefined, {
                    numeric: true,
                }),
            ),
        [fleet],
    );

    const filteredFleet = useMemo(() => {
        const normalized = query.trim().toLowerCase();

        if (!normalized) {
            return sortedFleet;
        }

        return sortedFleet.filter(
            (bus) =>
                bus.bus_number.toLowerCase().includes(normalized) ||
                bus.plate_number.toLowerCase().includes(normalized) ||
                (bus.driver?.name ?? '').toLowerCase().includes(normalized) ||
                (bus.route?.name ?? '').toLowerCase().includes(normalized),
        );
    }, [sortedFleet, query]);

    const selectedBus = useMemo(
        () =>
            selectedBusId === null
                ? null
                : (fleet.find((bus) => bus.id === selectedBusId) ?? null),
        [fleet, selectedBusId],
    );

    const toMarker = useCallback((bus: LiveBus): BusMapMarker | null => {
        const numbers = locationNumbers(bus);

        if (!numbers) {
            return null;
        }

        return {
            id: bus.id,
            lat: numbers.lat,
            lng: numbers.lng,
            title: bus.bus_number,
            subtitle: bus.plate_number,
            status: bus.status,
            recordedAt: bus.location?.recorded_at ?? null,
            accuracy: bus.location?.accuracy ?? null,
        };
    }, []);

    const markers = useMemo(
        () =>
            filteredFleet
                .map(toMarker)
                .filter((marker): marker is BusMapMarker => marker !== null),
        [filteredFleet, toMarker],
    );

    const visibleMarkers = useMemo(() => {
        if (selectedBus === null) {
            return markers;
        }

        const marker = toMarker(selectedBus);

        return marker === null ? markers : [marker];
    }, [markers, selectedBus, toMarker]);

    const summary = useMemo(() => {
        const total = fleetTotal ?? fleet.length;
        const inTransit = fleet.filter(isInTransit).length;
        const recentGps = fleet.filter(
            (bus) => gpsStateOf(bus).kind === 'fresh',
        ).length;

        return {
            total,
            inTransit,
            recentGps,
            staleOrUnavailable: Math.max(0, total - recentGps),
        };
    }, [fleet, fleetTotal]);

    const awaitingGpsCount = useMemo(
        () =>
            fleet.filter(
                (bus) => locationNumbers(bus) === null && isInTransit(bus),
            ).length,
        [fleet],
    );

    const lastUpdate = useMemo(() => {
        let latest: number | null = null;

        for (const bus of fleet) {
            const timestamp = parseTimestamp(bus.location?.recorded_at ?? null);

            if (timestamp !== null && (latest === null || timestamp > latest)) {
                latest = timestamp;
            }
        }

        return latest === null ? null : formatDateTime(latest);
    }, [fleet]);

    const handleRefresh = useCallback(() => {
        setRefreshing(true);

        void Promise.all([
            fetchLocations(false),
            Promise.resolve(onRefresh?.()),
        ])
            .catch(() => {})
            .finally(() => setRefreshing(false));
    }, [fetchLocations, onRefresh]);

    const handleMarkerSelect = useCallback(
        (markerId: string | number | null) => {
            if (markerId === null) {
                selectBus(null);
                return;
            }

            const busId = Number(markerId);
            selectBus(Number.isNaN(busId) ? null : busId);
        },
        [selectBus],
    );

    const showEmptyState = !loading && !error && fleet.length === 0;
    const hasSearch = query.trim().length > 0;

    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <div className="bg-primary/10 text-primary-strong flex size-11 shrink-0 items-center justify-center rounded-xl">
                        <MapPin className="size-6" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-semibold">
                            Live Tracking
                        </h1>
                        <p className="text-muted-foreground">
                            Monitor the live fleet, select a bus, and follow its
                            latest GPS position and ETA.
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <span className="text-muted-foreground hidden text-xs sm:inline">
                        Auto-refresh every {POLLING_INTERVAL_MS / 1000}s
                        {lastUpdate ? ` · Last update: ${lastUpdate}` : ''}
                    </span>
                    <Button
                        type="button"
                        onClick={handleRefresh}
                        disabled={refreshing}
                        className="gap-2"
                        data-test="tracking-refresh"
                    >
                        <RefreshCw
                            className={cn(
                                'size-4',
                                refreshing && 'animate-spin',
                            )}
                        />
                        Refresh
                    </Button>
                </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <SummaryCard
                    icon={Bus}
                    label="Total Buses"
                    value={summary.total}
                    dataTest="summary-total"
                />
                <SummaryCard
                    icon={Navigation}
                    label="In Transit"
                    value={summary.inTransit}
                    dataTest="summary-in-transit"
                />
                <SummaryCard
                    icon={Satellite}
                    label="With Recent GPS"
                    value={summary.recentGps}
                    dataTest="summary-recent-gps"
                />
                <SummaryCard
                    icon={TriangleAlert}
                    label="Stale or Unavailable GPS"
                    value={summary.staleOrUnavailable}
                    dataTest="summary-stale-gps"
                />
            </div>

            {selectionNotice && (
                <div
                    className="border-warning/50 bg-warning/15 text-foreground flex items-start gap-2 rounded-lg border p-3 text-sm"
                    data-test="tracking-selection-notice"
                >
                    <TriangleAlert className="text-warning-strong mt-0.5 size-4 shrink-0" />
                    <p className="flex-1">{selectionNotice}</p>
                    <button
                        type="button"
                        aria-label="Dismiss"
                        className="text-muted-foreground hover:text-foreground"
                        onClick={() => setSelectionNotice(null)}
                    >
                        <X className="size-4" />
                    </button>
                </div>
            )}

            {loading && fleet.length === 0 && (
                <div className="flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-16 text-center">
                    <Spinner className="text-primary size-5" />
                    <p className="text-muted-foreground mt-3 text-sm">
                        Loading bus locations...
                    </p>
                </div>
            )}

            {error && (
                <div className="border-destructive/50 bg-destructive/10 text-destructive-strong rounded-lg border p-4">
                    <p className="font-medium">Unable to load tracking data</p>
                    <p className="mt-1 text-sm">
                        {fleet.length > 0
                            ? `${error} Showing last known locations.`
                            : error}
                    </p>
                </div>
            )}

            {showEmptyState && (
                <div className="flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-16 text-center">
                    <div className="bg-muted text-muted-foreground flex size-12 items-center justify-center rounded-full">
                        <MapPin className="size-6" />
                    </div>
                    <p className="mt-3 text-sm font-medium">
                        No buses are currently being tracked
                    </p>
                    <p className="text-muted-foreground mt-1 max-w-sm text-sm">
                        Buses with GPS locations or active trips will appear
                        here. This page updates automatically every{' '}
                        {POLLING_INTERVAL_MS / 1000} seconds.
                    </p>
                </div>
            )}

            {fleet.length > 0 && (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
                    <div className="bg-card flex flex-col overflow-hidden rounded-lg border lg:h-[640px]">
                        <div className="space-y-2 border-b px-3 py-2.5">
                            <div className="flex items-center justify-between gap-2">
                                <h2 className="text-sm font-medium">
                                    Buses ({filteredFleet.length}
                                    {filteredFleet.length !== fleet.length
                                        ? ` of ${fleet.length}`
                                        : ''}
                                    )
                                </h2>
                                {selectedBus && (
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        className="gap-1.5"
                                        onClick={() => selectBus(null)}
                                        data-test="show-all-buses"
                                    >
                                        <Users className="size-3.5" />
                                        Show All Buses
                                    </Button>
                                )}
                            </div>
                            <div className="relative">
                                <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
                                <Input
                                    value={query}
                                    onChange={(event) =>
                                        setQuery(event.target.value)
                                    }
                                    placeholder="Search bus, driver, or route..."
                                    className="pr-8 pl-8"
                                    data-test="tracking-search"
                                />
                                {hasSearch && (
                                    <button
                                        type="button"
                                        aria-label="Clear search"
                                        className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2"
                                        onClick={() => setQuery('')}
                                        data-test="tracking-clear-search"
                                    >
                                        <X className="size-4" />
                                    </button>
                                )}
                            </div>
                        </div>

                        <div
                            className="flex-1 divide-y overflow-y-auto"
                            data-test="tracking-list"
                        >
                            {filteredFleet.length === 0 ? (
                                <div
                                    className="px-4 py-10 text-center"
                                    data-test="tracking-empty-search"
                                >
                                    <p className="text-sm font-medium">
                                        No buses match your search
                                    </p>
                                    <p className="text-muted-foreground mt-1 text-xs">
                                        Try a different bus number, driver, or
                                        route.
                                    </p>
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        className="mt-3"
                                        onClick={() => setQuery('')}
                                        data-test="tracking-empty-clear"
                                    >
                                        Clear search
                                    </Button>
                                </div>
                            ) : (
                                filteredFleet.map((bus) => (
                                    <BusListItem
                                        key={bus.id}
                                        bus={bus}
                                        selected={bus.id === selectedBusId}
                                        onTrack={selectBus}
                                    />
                                ))
                            )}
                        </div>

                        {awaitingGpsCount > 0 && (
                            <p className="text-muted-foreground border-t px-3 py-2 text-xs">
                                {awaitingGpsCount}{' '}
                                {awaitingGpsCount === 1
                                    ? 'bus is'
                                    : 'buses are'}{' '}
                                tracking but have no GPS fix yet. The marker
                                will appear as soon as the driver&apos;s device
                                sends a location.
                            </p>
                        )}
                    </div>

                    <div className="flex min-w-0 flex-col gap-2">
                        <p
                            className="text-muted-foreground text-xs"
                            data-test="tracking-map-status"
                        >
                            {selectedBus
                                ? `Focused on ${selectedBus.bus_number} — other markers are hidden.`
                                : `Showing ${visibleMarkers.length} ${
                                      visibleMarkers.length === 1
                                          ? 'bus'
                                          : 'buses'
                                  } with GPS locations.`}
                        </p>
                        <div className="relative">
                            <TrackingMap
                                markers={visibleMarkers}
                                center={PHILIPPINES_CENTER}
                                zoom={INITIAL_ZOOM}
                                fitBoundsOnce
                                selectedMarkerId={selectedBusId}
                                onMarkerSelect={handleMarkerSelect}
                                className="h-[60vh] min-h-[420px] w-full lg:h-[620px]"
                                infoWindowExtra={
                                    selectedBus ? (
                                        <PopupDetails
                                            bus={selectedBus}
                                            etaState={etaState}
                                        />
                                    ) : null
                                }
                            />
                            {visibleMarkers.length === 0 && !selectedBus && (
                                <div
                                    className="pointer-events-none absolute inset-0 flex items-center justify-center"
                                    data-test="tracking-map-empty-overlay"
                                >
                                    <p className="bg-background/90 text-muted-foreground rounded-lg border px-4 py-2 text-sm">
                                        No buses with GPS locations yet.
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {alertsSlot}
        </div>
    );
}
