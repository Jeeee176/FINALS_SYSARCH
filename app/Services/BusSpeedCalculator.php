<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\Bus;
use App\Models\Location;

/**
 * Calculate current bus speed from the two most recent GPS records.
 *
 * Speed is a separate concept from ETA travel-time estimation:
 * - current speed = distance between two GPS points / elapsed time
 * - ETA speed = configurable average speed used to project arrival time
 */
final class BusSpeedCalculator
{
    private const float MAX_REASONABLE_KMH = 200.0;
    private const int MIN_ELAPSED_SECONDS = 3;

    public function calculate(Bus $bus): ?float
    {
        $locations = $bus->locations()
            ->orderByDesc('recorded_at')
            ->limit(2)
            ->get()
            ->sortBy('recorded_at');

        if ($locations->count() < 2) {
            return null;
        }

        $latest = $locations->first();
        $previous = $locations->get(1);

        if (!$latest instanceof Location || !$previous instanceof Location) {
            return null;
        }

        $elapsedSeconds = $latest->recorded_at->diffInSeconds($previous->recorded_at, false);

        if ($elapsedSeconds < self::MIN_ELAPSED_SECONDS) {
            return null;
        }

        $elapsedHours = $elapsedSeconds / 3600.0;

        $distanceKm = self::haversine(
            (float) $previous->latitude,
            (float) $previous->longitude,
            (float) $latest->latitude,
            (float) $latest->longitude,
        );

        $rawSpeedKmh = $distanceKm / $elapsedHours;

        if (!is_finite($rawSpeedKmh)) {
            return null;
        }

        $speedKmh = (float) $rawSpeedKmh;

        if ($speedKmh < 0.0) {
            return null;
        }

        if ($speedKmh > self::MAX_REASONABLE_KMH) {
            return null;
        }

        return round($speedKmh, 1);
    }

    /**
     * Haversine great-circle distance in kilometers.
     *
     * Same formula used by EtaService; exposed publicly so other services
     * (e.g. BusSpeedCalculator) can reuse it without duplicating the logic.
     */
    public static function haversine(float $lat1, float $lng1, float $lat2, float $lng2): float
    {
        return EtaService::haversine($lat1, $lng1, $lat2, $lng2);
    }
}
