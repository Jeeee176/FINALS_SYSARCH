import { MapPinOff } from 'lucide-react';
import { TrackingMap } from '@/components/tracking-map';
import { cn } from '@/lib/utils';

/**
 * Parse a coordinate value coming from the database (decimal string), a form
 * input or an API payload. Returns null when the value is missing, empty or
 * not a finite number.
 */
export function parseCoordinate(value: unknown): number | null {
    if (value === null || value === undefined) {
        return null;
    }

    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : null;
    }

    if (typeof value !== 'string') {
        return null;
    }

    const text = value.trim();

    if (text === '') {
        return null;
    }

    const parsed = Number(text);

    return Number.isFinite(parsed) ? parsed : null;
}

/**
 * A destination coordinate pair is usable only when both values are present
 * and within the valid geographic range (lat -90..90, lng -180..180).
 */
export function hasValidCoordinates(
    latitude: unknown,
    longitude: unknown,
): boolean {
    const lat = parseCoordinate(latitude);
    const lng = parseCoordinate(longitude);

    if (lat === null || lng === null) {
        return false;
    }

    return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

export function formatCoordinatePair(
    latitude: unknown,
    longitude: unknown,
): string | null {
    const lat = parseCoordinate(latitude);
    const lng = parseCoordinate(longitude);

    if (lat === null || lng === null || !hasValidCoordinates(lat, lng)) {
        return null;
    }

    return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

type RouteCoordinatePreviewProps = {
    latitude: unknown;
    longitude: unknown;
    label?: string | null;
    className?: string;
    emptyHint?: string;
};

/**
 * Compact Leaflet/OpenStreetMap preview of a route's destination.
 *
 * Uses stored coordinates only — no geocoding, no fabricated markers. When
 * the coordinates are missing or invalid a fallback panel is shown instead of
 * a map, so callers never have to guard the map themselves.
 */
export function RouteCoordinatePreview({
    latitude,
    longitude,
    label,
    className,
    emptyHint = 'Add a valid latitude and longitude to preview the destination.',
}: RouteCoordinatePreviewProps) {
    if (!hasValidCoordinates(latitude, longitude)) {
        return (
            <div
                data-test="route-coordinate-empty"
                className={cn(
                    'bg-muted/30 flex flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed px-4 py-6 text-center',
                    className,
                )}
            >
                <MapPinOff className="text-muted-foreground h-5 w-5" />
                <p className="text-muted-foreground text-sm">
                    No usable destination coordinates
                </p>
                <p className="text-muted-foreground text-xs">{emptyHint}</p>
            </div>
        );
    }

    const lat = parseCoordinate(latitude) as number;
    const lng = parseCoordinate(longitude) as number;

    return (
        <TrackingMap
            destination={{ lat, lng, label: label ?? 'Destination' }}
            fitBounds
            autoResize
            className={cn('h-64 w-full', className)}
        />
    );
}
