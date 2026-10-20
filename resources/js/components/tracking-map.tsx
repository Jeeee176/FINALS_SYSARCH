import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import L from 'leaflet';
import {
    MapContainer,
    Marker,
    Polyline,
    Popup,
    TileLayer,
    useMap,
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

import { cn } from '@/lib/utils';

L.Icon.Default.mergeOptions({
    iconRetinaUrl: markerIcon2x,
    iconUrl: markerIcon,
    shadowUrl: markerShadow,
});

const DEFAULT_CENTER = { lat: 14.5995, lng: 120.9842 };
const DEFAULT_ZOOM = 5;
const MAX_FIT_ZOOM = 17;
const FOCUS_ZOOM = 15;

// Minimum movement (in degrees, roughly 55 m) before a focused marker is
// considered to have moved meaningfully and the map is re-centered on it.
const FOCUS_MOVE_THRESHOLD = 0.0005;

const BUS_PIN_HTML =
    '<svg xmlns="http://www.w3.org/2000/svg" width="34" height="34" viewBox="0 0 34 34">' +
    '<path d="M17 1C9.8 1 4 6.8 4 14c0 9.6 13 19 13 19s13-9.4 13-19C30 6.8 24.2 1 17 1z" fill="#d63635" stroke="#ffffff" stroke-width="2"/>' +
    '<circle cx="17" cy="14" r="5" fill="#ffffff"/>' +
    '</svg>';

const LATEST_ICON_HTML =
    '<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 30 30">' +
    '<circle cx="15" cy="15" r="13" fill="#d63635" stroke="#ffffff" stroke-width="2"/>' +
    '<circle cx="15" cy="15" r="5" fill="#ffffff"/>' +
    '</svg>';

const DESTINATION_ICON_HTML =
    '<svg xmlns="http://www.w3.org/2000/svg" width="34" height="34" viewBox="0 0 34 34">' +
    '<path d="M17 1C9.8 1 4 6.8 4 14c0 9.6 13 19 13 19s13-9.4 13-19C30 6.8 24.2 1 17 1z" fill="#d63635" stroke="#ffffff" stroke-width="2"/>' +
    '<path d="M17 9l2 3.2 3.6.5-2.6 2.5.6 3.6-3.2-1.7-3.2 1.7.6-3.6-2.6-2.5 3.6-.5z" fill="#ffffff"/>' +
    '</svg>';

const busIcon = L.divIcon({
    className: '',
    html: BUS_PIN_HTML,
    iconSize: [34, 34],
    iconAnchor: [17, 33],
    popupAnchor: [0, -32],
});

const latestIcon = L.divIcon({
    className: '',
    html: LATEST_ICON_HTML,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -14],
});

const destinationIcon = L.divIcon({
    className: '',
    html: DESTINATION_ICON_HTML,
    iconSize: [34, 34],
    iconAnchor: [17, 33],
    popupAnchor: [0, -32],
});

export type MapPoint = {
    lat: number;
    lng: number;
};

export type BusMapMarker = {
    id: string | number;
    lat: number;
    lng: number;
    title?: string;
    subtitle?: string | null;
    status?: string | null;
    recordedAt?: string | null;
    accuracy?: number | null;
};

export type DestinationMarker = {
    lat: number;
    lng: number;
    label?: string | null;
};

type TrackingMapProps = {
    markers?: BusMapMarker[];
    destination?: DestinationMarker | null;
    path?: MapPoint[];
    pathColor?: string;
    className?: string;
    center?: MapPoint;
    zoom?: number;
    fitBounds?: boolean;
    fitPadding?: number;
    latestMarkerId?: string | number | null;
    loadingLabel?: string;
    infoWindowExtra?: ReactNode;
    onMarkerSelect?: (markerId: string | number | null) => void;
    imperativeMarkers?: boolean;
    autoResize?: boolean;
    selectedMarkerId?: string | number | null;
    fitBoundsOnce?: boolean;
};

function StatusBadge({ status }: { status?: string | null }) {
    const isActive = status === 'active';

    return (
        <span
            className={cn(
                'inline-flex items-center justify-center rounded-md border px-2 py-0.5 text-xs font-medium',
                isActive
                    ? 'bg-success text-success-foreground border-transparent'
                    : 'bg-muted text-muted-foreground',
            )}
        >
            {isActive ? 'Active' : 'Inactive'}
        </span>
    );
}

function formatCoordinates(latitude: number, longitude: number): string {
    return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
}

function formatTime(value?: string | null): string {
    if (!value) {
        return '—';
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return date.toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });
}

type MapContentProps = {
    markers: BusMapMarker[];
    destination: DestinationMarker | null;
    path: MapPoint[];
    pathColor: string;
    fitBounds: boolean;
    fitPadding: number;
    latestMarkerId: string | number | null;
    infoWindowExtra: ReactNode | null;
    onMarkerSelect?: (markerId: string | number | null) => void;
    imperativeMarkers: boolean;
    autoResize: boolean;
    selectedMarkerId: string | number | null;
    fitBoundsOnce: boolean;
};

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function buildMarkerPopupHtml(marker: BusMapMarker): string {
    const isActive = marker.status === 'active';

    const subtitle = marker.subtitle
        ? `<p class="mt-0.5 text-xs text-muted-foreground">${escapeHtml(marker.subtitle)}</p>`
        : '';

    const badgeClass = isActive
        ? 'bg-success border-transparent text-success-foreground'
        : 'bg-muted text-muted-foreground';

    const recorded = marker.recordedAt
        ? `<p class="mt-0.5 text-xs text-muted-foreground">Last recorded: ${escapeHtml(formatTime(marker.recordedAt))}</p>`
        : '';

    const accuracy =
        marker.accuracy !== undefined && marker.accuracy !== null
            ? `<p class="mt-1 text-xs text-muted-foreground">Accuracy: ${marker.accuracy.toFixed(1)} m</p>`
            : '';

    return (
        '<div class="min-w-[200px]">' +
        `<p class="text-sm font-semibold">${escapeHtml(marker.title ?? 'Bus')}</p>` +
        subtitle +
        `<div class="mt-2"><span class="inline-flex items-center justify-center rounded-md border px-2 py-0.5 text-xs font-medium ${badgeClass}">${isActive ? 'Active' : 'Inactive'}</span></div>` +
        `<p class="mt-2 text-xs text-muted-foreground">${formatCoordinates(marker.lat, marker.lng)}</p>` +
        accuracy +
        recorded +
        '</div>'
    );
}

function ImperativeBusMarkers({ markers }: { markers: BusMapMarker[] }) {
    const map = useMap();
    const markersRef = useRef<Record<string | number, L.Marker>>({});

    useEffect(() => {
        // === DIAGNOSTIC: Imperative markers received ===
        console.log('[GPS_TRACE] ImperativeBusMarkers received:', markers);

        const existingIds = Object.keys(markersRef.current);

        for (const id of existingIds) {
            const stillPresent = markers.some(
                (marker) => String(marker.id) === id,
            );

            if (!stillPresent) {
                markersRef.current[id].remove();
                delete markersRef.current[id];
            }
        }

        for (const marker of markers) {
            const existing = markersRef.current[marker.id];

            if (existing) {
                // === DIAGNOSTIC: Updating existing marker position ===
                console.log('[GPS_TRACE] Updating marker position:', {
                    id: marker.id,
                    lat: marker.lat,
                    lng: marker.lng,
                });
                existing.setLatLng([marker.lat, marker.lng]);
                existing.setPopupContent(buildMarkerPopupHtml(marker));
            } else {
                // === DIAGNOSTIC: Creating new marker ===
                console.log('[GPS_TRACE] Creating new marker:', {
                    id: marker.id,
                    lat: marker.lat,
                    lng: marker.lng,
                });
                const layer = L.marker([marker.lat, marker.lng], {
                    icon: busIcon,
                    title: marker.title ?? 'Bus',
                    zIndexOffset: 0,
                })
                    .bindPopup(buildMarkerPopupHtml(marker), {
                        closeButton: false,
                        autoPan: true,
                    })
                    .addTo(map);

                layer.on('click', () => {
                    layer.openPopup();
                });

                markersRef.current[marker.id] = layer;
            }
        }
    }, [markers, map]);

    useEffect(() => {
        return () => {
            for (const marker of Object.values(markersRef.current)) {
                marker.remove();
            }
            markersRef.current = {};
        };
    }, []);

    return null;
}

function MapContent({
    markers,
    destination,
    path,
    pathColor,
    fitBounds,
    fitPadding,
    latestMarkerId,
    infoWindowExtra,
    onMarkerSelect,
    imperativeMarkers,
    autoResize,
    selectedMarkerId,
    fitBoundsOnce,
}: MapContentProps) {
    const map = useMap();
    const [selectedMarkerIdState, setSelectedMarkerIdState] = useState<
        string | number | null
    >(null);
    const markerRefs = useRef<Map<string, L.Marker>>(new Map());
    const focusRef = useRef<{ id: string; lat: number; lng: number } | null>(
        null,
    );
    const didInitialFitRef = useRef(false);

    // Opt-in: keep the map sized correctly inside containers that mount or
    // resize after initial render (for example dialogs). Disabled by default
    // so existing pages keep their exact behaviour.
    useEffect(() => {
        if (!autoResize) {
            return;
        }

        const container = map.getContainer();
        const frame = requestAnimationFrame(() => map.invalidateSize());
        const observer = new ResizeObserver(() => map.invalidateSize());
        observer.observe(container);

        return () => {
            cancelAnimationFrame(frame);
            observer.disconnect();
        };
    }, [autoResize, map]);

    const updateSelection = (next: string | number | null) => {
        setSelectedMarkerIdState(next);
    };

    useEffect(() => {
        onMarkerSelect?.(selectedMarkerIdState);
    }, [selectedMarkerIdState, onMarkerSelect]);

    useEffect(() => {
        const handleMapClick = () => {
            setSelectedMarkerIdState(null);
        };

        map.on('click', handleMapClick);

        return () => {
            map.off('click', handleMapClick);
        };
    }, [map]);

    const allPoints = useMemo<MapPoint[]>(() => {
        const points: MapPoint[] = [...markers, ...path];
        if (destination) {
            points.push(destination);
        }
        return points;
    }, [markers, path, destination]);

    const fitAllPoints = useCallback(() => {
        if (allPoints.length === 0) {
            return;
        }

        if (allPoints.length === 1) {
            const point = allPoints[0];
            map.setView([point.lat, point.lng], MAX_FIT_ZOOM);
            return;
        }

        const bounds = L.latLngBounds(
            allPoints.map((point): [number, number] => [point.lat, point.lng]),
        );

        map.fitBounds(bounds, {
            padding: [fitPadding, fitPadding],
            maxZoom: MAX_FIT_ZOOM,
        });
    }, [allPoints, fitPadding, map]);

    useEffect(() => {
        if (!fitBounds || allPoints.length === 0) {
            return;
        }

        fitAllPoints();
    }, [fitBounds, fitAllPoints, allPoints]);

    // Fit the fleet into view once when the first markers arrive. Unlike
    // fitBounds this never re-runs on polling updates, so a user who pans the
    // map is not yanked back to the fleet every few seconds.
    useEffect(() => {
        if (!fitBoundsOnce || didInitialFitRef.current) {
            return;
        }

        if (allPoints.length === 0) {
            return;
        }

        didInitialFitRef.current = true;
        fitAllPoints();
    }, [fitBoundsOnce, allPoints, fitAllPoints]);

    // Focused mode: when a marker is selected, pan to it and open its popup.
    // The map is only re-centered when the selection changes or the marker
    // has moved meaningfully; polls that report the same position do not
    // reset the viewport. Clearing the selection closes the popup and fits
    // the whole fleet back into view.
    useEffect(() => {
        if (selectedMarkerId == null) {
            if (focusRef.current !== null) {
                focusRef.current = null;
                map.closePopup();
                fitAllPoints();
            }

            return;
        }

        const key = String(selectedMarkerId);
        const marker = markers.find((item) => String(item.id) === key);

        if (!marker) {
            return;
        }

        const layer = markerRefs.current.get(key);
        const previous = focusRef.current;
        const selectionChanged = previous === null || previous.id !== key;
        const moved =
            previous !== null &&
            previous.id === key &&
            (Math.abs(marker.lat - previous.lat) > FOCUS_MOVE_THRESHOLD ||
                Math.abs(marker.lng - previous.lng) > FOCUS_MOVE_THRESHOLD);

        if (layer && selectionChanged) {
            layer.openPopup();
            map.setView(
                [marker.lat, marker.lng],
                Math.max(map.getZoom(), FOCUS_ZOOM),
                { animate: true },
            );
        } else if (layer && moved) {
            map.panTo([marker.lat, marker.lng], { animate: true });
        }

        focusRef.current = { id: key, lat: marker.lat, lng: marker.lng };
    }, [selectedMarkerId, markers, map, fitAllPoints]);

    return (
        <>
            <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {path.length > 0 && (
                <Polyline
                    positions={path.map((point): [number, number] => [
                        point.lat,
                        point.lng,
                    ])}
                    pathOptions={{ color: pathColor, weight: 4, opacity: 1 }}
                />
            )}

            {destination && (
                <Marker
                    position={[destination.lat, destination.lng]}
                    icon={destinationIcon}
                    title={destination.label ?? 'Destination'}
                    zIndexOffset={2000}
                />
            )}

            {imperativeMarkers ? (
                <ImperativeBusMarkers markers={markers} />
            ) : (
                markers.map((marker) => {
                    // === DIAGNOSTIC: Declarative marker ===
                    console.log('[GPS_TRACE] Declarative marker:', {
                        id: marker.id,
                        lat: marker.lat,
                        lng: marker.lng,
                    });

                    const isLatest = marker.id === latestMarkerId;

                    return (
                        <Marker
                            key={marker.id}
                            ref={(instance: L.Marker | null) => {
                                const key = String(marker.id);

                                if (instance) {
                                    markerRefs.current.set(key, instance);
                                } else {
                                    markerRefs.current.delete(key);
                                }
                            }}
                            position={[marker.lat, marker.lng]}
                            icon={isLatest ? latestIcon : busIcon}
                            title={
                                isLatest
                                    ? `Latest: ${marker.title ?? ''}`
                                    : marker.title
                            }
                            zIndexOffset={isLatest ? 1500 : 0}
                            eventHandlers={{
                                click: () => updateSelection(marker.id),
                            }}
                        >
                            <Popup>
                                <div className="min-w-[200px]">
                                    <p className="text-sm font-semibold">
                                        {marker.title ?? 'Bus'}
                                    </p>
                                    {marker.subtitle && (
                                        <p className="text-muted-foreground mt-0.5 text-xs">
                                            {marker.subtitle}
                                        </p>
                                    )}
                                    <div className="mt-2">
                                        <StatusBadge status={marker.status} />
                                    </div>
                                    <p className="text-muted-foreground mt-2 text-xs">
                                        {formatCoordinates(
                                            marker.lat,
                                            marker.lng,
                                        )}
                                    </p>
                                    {marker.accuracy !== undefined &&
                                        marker.accuracy !== null && (
                                            <p className="text-muted-foreground mt-1 text-xs">
                                                Accuracy:{' '}
                                                {marker.accuracy.toFixed(1)} m
                                            </p>
                                        )}
                                    {marker.recordedAt && (
                                        <p className="text-muted-foreground mt-0.5 text-xs">
                                            Last recorded:{' '}
                                            {formatTime(marker.recordedAt)}
                                        </p>
                                    )}
                                    {infoWindowExtra}
                                </div>
                            </Popup>
                        </Marker>
                    );
                })
            )}
        </>
    );
}

export function TrackingMap({
    markers = [],
    destination = null,
    path = [],
    pathColor = '#D63635',
    className,
    center = DEFAULT_CENTER,
    zoom = DEFAULT_ZOOM,
    fitBounds = false,
    fitPadding = 40,
    latestMarkerId = null,
    infoWindowExtra = null,
    onMarkerSelect,
    imperativeMarkers = false,
    autoResize = false,
    selectedMarkerId = null,
    fitBoundsOnce = false,
}: TrackingMapProps) {
    return (
        <div
            className={cn(
                'relative z-0 overflow-hidden rounded-lg border',
                className,
            )}
        >
            <MapContainer
                center={[center.lat, center.lng]}
                zoom={zoom}
                className="z-0 h-full w-full"
                style={{ height: '100%', width: '100%' }}
            >
                <MapContent
                    markers={markers}
                    destination={destination}
                    path={path}
                    pathColor={pathColor}
                    fitBounds={fitBounds}
                    fitPadding={fitPadding}
                    latestMarkerId={latestMarkerId}
                    infoWindowExtra={infoWindowExtra}
                    onMarkerSelect={onMarkerSelect}
                    imperativeMarkers={imperativeMarkers}
                    autoResize={autoResize}
                    selectedMarkerId={selectedMarkerId}
                    fitBoundsOnce={fitBoundsOnce}
                />
            </MapContainer>
        </div>
    );
}
