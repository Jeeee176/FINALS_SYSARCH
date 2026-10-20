import { BusFront, CalendarX2, History, MapPin } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { TrackingMap } from '@/components/tracking-map';
import type { BusMapMarker, MapPoint } from '@/components/tracking-map';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

const DEFAULT_LIMIT = 100;
const PHILIPPINES_CENTER = { lat: 14.5995, lng: 120.9842 };
const INITIAL_ZOOM = 5;

type Status = 'active' | 'inactive';

export type HistoryBus = {
    id: number;
    bus_number: string;
    plate_number: string;
    status: Status;
};

export type HistoryLocation = {
    id: number;
    latitude: string;
    longitude: string;
    recorded_at: string;
};

export type LocationHistoryPrintSnapshot = {
    bus: HistoryBus;
    locations: HistoryLocation[];
    total: number;
    hasMore: boolean;
    startDate: string;
    endDate: string;
};

type HistoryResponse = {
    success: boolean;
    bus: HistoryBus;
    locations: HistoryLocation[];
    count: number;
    total?: number;
    has_more?: boolean;
};

type Props = {
    buses: HistoryBus[];
    onPrintRequest?: (snapshot: LocationHistoryPrintSnapshot) => void;
};

function StatusBadge({ status }: { status: Status }) {
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

function formatDateTime(value: string): string {
    const iso = new Date(value);

    if (Number.isNaN(iso.getTime())) {
        return value;
    }

    return iso.toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
    });
}

function parseCoordinate(value: string): number {
    return parseFloat(value);
}

function formatCoordinate(value: number): string {
    if (Number.isNaN(value)) {
        return '—';
    }
    return value.toFixed(6);
}

function parseLocalDate(value: string): Date | null {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);

    if (!match) {
        return null;
    }

    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function toLocalDayStartIso(value: string): string | null {
    const date = parseLocalDate(value);

    if (!date) {
        return null;
    }

    date.setHours(0, 0, 0, 0);

    return date.toISOString();
}

function toLocalDayEndIso(value: string): string | null {
    const date = parseLocalDate(value);

    if (!date) {
        return null;
    }

    date.setHours(23, 59, 59, 999);

    return date.toISOString();
}

function buildHistoryParams(start: string, end: string, offset: number): string {
    const params = new URLSearchParams({
        limit: String(DEFAULT_LIMIT),
        offset: String(offset),
    });

    const after = start ? toLocalDayStartIso(start) : null;
    const before = end ? toLocalDayEndIso(end) : null;

    if (after) {
        params.set('after', after);
    }

    if (before) {
        params.set('before', before);
    }

    return params.toString();
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
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-12 text-center">
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

export function LocationHistorySection({ buses, onPrintRequest }: Props) {
    const [selectedBusId, setSelectedBusId] = useState<string>('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [locations, setLocations] = useState<HistoryLocation[]>([]);
    const [total, setTotal] = useState(0);
    const [hasMore, setHasMore] = useState(false);
    const [loading, setLoading] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [loadedBusId, setLoadedBusId] = useState<string | null>(null);

    const selectedBus = buses.find((bus) => String(bus.id) === selectedBusId);

    // API returns newest -> oldest; reverse so the path follows chronological order.
    const polylinePoints = useMemo<MapPoint[]>(
        () =>
            locations
                .map((loc) => ({
                    lat: parseCoordinate(loc.latitude),
                    lng: parseCoordinate(loc.longitude),
                }))
                .reverse(),
        [locations],
    );

    const mapMarkers = useMemo<BusMapMarker[]>(
        () =>
            locations.map((location) => ({
                id: location.id,
                lat: parseCoordinate(location.latitude),
                lng: parseCoordinate(location.longitude),
                title: `Bus ${selectedBus?.bus_number ?? ''}`.trim(),
                status: selectedBus?.status,
                recordedAt: location.recorded_at,
            })),
        [locations, selectedBus],
    );

    const latestLocationId = useMemo(
        () => (locations.length > 0 ? locations[0].id : null),
        [locations],
    );

    const loadHistory = async (
        busId: string,
        start: string,
        end: string,
        signal?: AbortSignal,
    ) => {
        setLoading(true);
        setError(null);

        try {
            const response = await fetch(
                `/api/buses/${busId}/locations/history?${buildHistoryParams(start, end, 0)}`,
                { signal },
            );

            if (!response.ok) {
                throw new Error(
                    `Unable to load location history (HTTP ${response.status}).`,
                );
            }

            const data: HistoryResponse = await response.json();

            if (!data.success || !Array.isArray(data.locations)) {
                throw new Error('Unable to load location history.');
            }

            setLocations(data.locations);
            setTotal(data.total ?? data.locations.length);
            setHasMore(
                data.has_more ?? data.locations.length >= DEFAULT_LIMIT,
            );
            setLoadedBusId(busId);
        } catch (err) {
            if (
                err instanceof Error &&
                err.name !== 'AbortError' &&
                (!signal || !signal.aborted)
            ) {
                setLocations([]);
                setTotal(0);
                setHasMore(false);
                setLoadedBusId(null);
                setError('Unable to load location history.');
            }
        } finally {
            if (!signal || !signal.aborted) {
                setLoading(false);
            }
        }
    };

    useEffect(() => {
        if (!selectedBusId) {
            return;
        }

        const controller = new AbortController();
        loadHistory(selectedBusId, startDate, endDate, controller.signal);

        return () => controller.abort();
    }, [selectedBusId, startDate, endDate]);

    const handleLoadMore = async () => {
        if (!selectedBusId || loadingMore || loading) {
            return;
        }

        const busId = selectedBusId;
        const start = startDate;
        const end = endDate;
        const offset = locations.length;

        setLoadingMore(true);

        try {
            const response = await fetch(
                `/api/buses/${busId}/locations/history?${buildHistoryParams(start, end, offset)}`,
            );

            if (!response.ok) {
                throw new Error(
                    `Unable to load location history (HTTP ${response.status}).`,
                );
            }

            const data: HistoryResponse = await response.json();

            if (!data.success || !Array.isArray(data.locations)) {
                throw new Error('Unable to load location history.');
            }

            // Ignore stale responses if the user changed the selection while
            // the request was in flight.
            if (
                selectedBusId !== busId ||
                startDate !== start ||
                endDate !== end
            ) {
                return;
            }

            setLocations((previous) => [...previous, ...data.locations]);
            setTotal(data.total ?? data.locations.length);
            setHasMore(data.has_more ?? false);
        } catch {
            setHasMore(false);
        } finally {
            setLoadingMore(false);
        }
    };

    const handleBusChange = (value: string) => {
        setSelectedBusId(value);
        setStartDate('');
        setEndDate('');
        setLocations([]);
        setTotal(0);
        setHasMore(false);
        setError(null);
    };

    const handleClearFilters = () => {
        setStartDate('');
        setEndDate('');
    };

    const showBusDropdownEmpty = buses.length === 0;
    const showNoBusSelected =
        !showBusDropdownEmpty && !selectedBusId && !loading;
    const isFiltered =
        loadedBusId === selectedBusId && (startDate !== '' || endDate !== '');
    const showEmptyHistory =
        selectedBusId !== '' && !loading && !error && locations.length === 0;
    const showMap =
        selectedBusId !== '' && !loading && !error && locations.length > 0;

    return (
        <div className="flex flex-col gap-6">
            {showBusDropdownEmpty ? (
                <EmptyState
                    icon={BusFront}
                    title="No buses available"
                    description="Add a bus to the fleet to view its location history."
                />
            ) : (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-base">
                            <BusFront className="text-primary size-4 shrink-0" />
                            Select Bus
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-4">
                        <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-end">
                            <div className="flex flex-col gap-2">
                                <Label htmlFor="history-bus-select">Bus</Label>
                                <Select
                                    value={selectedBusId}
                                    onValueChange={handleBusChange}
                                >
                                    <SelectTrigger
                                        id="history-bus-select"
                                        className="w-full"
                                    >
                                        <SelectValue placeholder="Select a bus..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {buses.map((bus) => (
                                            <SelectItem
                                                key={bus.id}
                                                value={String(bus.id)}
                                            >
                                                {bus.bus_number} —{' '}
                                                {bus.plate_number}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="flex flex-col gap-2">
                                <Label htmlFor="history-start-date">
                                    Start Date
                                </Label>
                                <Input
                                    id="history-start-date"
                                    type="date"
                                    value={startDate}
                                    onChange={(e) =>
                                        setStartDate(e.target.value)
                                    }
                                />
                            </div>

                            <div className="flex flex-col gap-2">
                                <Label htmlFor="history-end-date">
                                    End Date
                                </Label>
                                <Input
                                    id="history-end-date"
                                    type="date"
                                    value={endDate}
                                    onChange={(e) =>
                                        setEndDate(e.target.value)
                                    }
                                />
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={startDate === '' && endDate === ''}
                                onClick={handleClearFilters}
                            >
                                <CalendarX2 className="size-4" />
                                Clear Filters
                            </Button>
                            {isFiltered && (
                                <Badge className="bg-primary/10 text-primary-strong border-transparent">
                                    Filtered
                                </Badge>
                            )}
                            {onPrintRequest &&
                                selectedBus &&
                                locations.length > 0 && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="ml-auto"
                                        onClick={() =>
                                            onPrintRequest({
                                                bus: selectedBus,
                                                locations,
                                                total,
                                                hasMore,
                                                startDate,
                                                endDate,
                                            })
                                        }
                                    >
                                        Print this bus history
                                    </Button>
                                )}
                        </div>
                    </CardContent>
                </Card>
            )}

            {showNoBusSelected && (
                <EmptyState
                    icon={MapPin}
                    title="Select a bus to view its location history."
                />
            )}

            {selectedBusId !== '' && selectedBus && !loading && !error && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-base">
                            <BusFront className="text-primary size-4 shrink-0" />
                            {selectedBus.bus_number} —{' '}
                            {selectedBus.plate_number}
                            <StatusBadge status={selectedBus.status} />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                            <div>
                                <dt className="text-muted-foreground text-xs">
                                    Bus Number
                                </dt>
                                <dd className="mt-0.5 font-medium">
                                    {selectedBus.bus_number}
                                </dd>
                            </div>
                            <div>
                                <dt className="text-muted-foreground text-xs">
                                    Plate Number
                                </dt>
                                <dd className="mt-0.5 font-medium">
                                    {selectedBus.plate_number}
                                </dd>
                            </div>
                            <div>
                                <dt className="text-muted-foreground text-xs">
                                    Status
                                </dt>
                                <dd className="mt-0.5">
                                    <StatusBadge
                                        status={selectedBus.status}
                                    />
                                </dd>
                            </div>
                            <div>
                                <dt className="text-muted-foreground text-xs">
                                    Records Returned
                                </dt>
                                <dd className="text-primary-strong mt-0.5 font-semibold tabular-nums">
                                    {loading
                                        ? '—'
                                        : `${locations.length} of ${total}`}
                                </dd>
                            </div>
                        </dl>
                    </CardContent>
                </Card>
            )}

            {loading && (
                <div className="flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-14 text-center">
                    <Spinner className="text-primary size-5" />
                    <p className="text-muted-foreground mt-3 text-sm">
                        Loading location history...
                    </p>
                </div>
            )}

            {error && !loading && selectedBusId !== '' && (
                <div className="border-destructive/50 bg-destructive/10 text-destructive-strong rounded-lg border p-4">
                    <p className="font-medium">
                        Unable to load location history.
                    </p>
                    <p className="mt-1 text-sm">
                        Please try again later or select a different bus.
                    </p>
                </div>
            )}

            {showEmptyHistory && (
                <EmptyState
                    icon={MapPin}
                    title="No location history available for this bus."
                    description="GPS location reports will appear here once this bus records its position."
                />
            )}

            {showMap && (
                <>
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-base">
                                <MapPin className="text-primary size-4 shrink-0" />
                                Route Map
                                <span className="text-muted-foreground ml-auto text-xs font-normal">
                                    {locations.length}{' '}
                                    {locations.length === 1
                                        ? 'point'
                                        : 'points'}
                                </span>
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <TrackingMap
                                key={loadedBusId ?? selectedBusId}
                                markers={mapMarkers}
                                path={polylinePoints}
                                pathColor="#D63635"
                                latestMarkerId={latestLocationId}
                                fitBounds
                                fitPadding={40}
                                center={PHILIPPINES_CENTER}
                                zoom={INITIAL_ZOOM}
                                className="h-[60vh] min-h-[420px] w-full rounded-none border-0"
                            />
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-base">
                                <History className="text-primary size-4 shrink-0" />
                                Location Records ({locations.length} of{' '}
                                {total})
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>#</TableHead>
                                        <TableHead>Date / Time</TableHead>
                                        <TableHead>Latitude</TableHead>
                                        <TableHead>Longitude</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {locations.map((location, index) => (
                                        <TableRow key={location.id}>
                                            <TableCell className="whitespace-nowrap tabular-nums">
                                                {index + 1}
                                            </TableCell>
                                            <TableCell className="whitespace-nowrap">
                                                {formatDateTime(
                                                    location.recorded_at,
                                                )}
                                            </TableCell>
                                            <TableCell className="whitespace-nowrap tabular-nums">
                                                {formatCoordinate(
                                                    parseCoordinate(
                                                        location.latitude,
                                                    ),
                                                )}
                                            </TableCell>
                                            <TableCell className="whitespace-nowrap tabular-nums">
                                                {formatCoordinate(
                                                    parseCoordinate(
                                                        location.longitude,
                                                    ),
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                            {hasMore && (
                                <div className="flex flex-col items-center gap-2 border-t p-4">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        disabled={loadingMore}
                                        onClick={handleLoadMore}
                                    >
                                        {loadingMore
                                            ? 'Loading...'
                                            : 'Load more records'}
                                    </Button>
                                    <p className="text-muted-foreground text-xs">
                                        Showing {locations.length} of {total}{' '}
                                        records
                                    </p>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </>
            )}
        </div>
    );
}
