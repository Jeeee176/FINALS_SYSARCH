<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\Bus;
use App\Models\Route;
use App\Models\Location;
use Carbon\Carbon;

final class EtaService
{
    private const float EARTH_RADIUS_KM = 6371.0;
    private const float PI_OVER_180 = M_PI / 180.0;

    public function calculateForBus(Bus $bus): EtaResult
    {
        $averageSpeedKmh = (float) config('eta.default_speed_kmh', 40.0);
        $staleThreshold = (int) config('eta.gps_stale_minutes', 15);

        // 1. Bus
        $busArray = [
            'id' => $bus->id,
            'bus_number' => $bus->bus_number,
        ];

        // 2. Route
        $route = $bus->route;
        if ($route === null) {
            return new EtaResult(
                bus: $busArray,
                route: ['id' => null, 'name' => null, 'destination' => null, 'status' => null],
                currentPosition: null,
                destination: null,
                distanceKm: null,
                averageSpeedKmh: $averageSpeedKmh,
                estimatedDurationMinutes: null,
                estimatedArrivalAt: null,
                status: 'no_assigned_route',
            );
        }

        $routeArray = [
            'id' => $route->id,
            'name' => $route->name,
            'destination' => $route->destination,
            'status' => $route->status,
        ];

        // 3. Latest GPS
        $latestLocation = $bus->locations()
            ->orderByDesc('recorded_at')
            ->first();

        if ($latestLocation === null) {
            return new EtaResult(
                bus: $busArray,
                route: $routeArray,
                currentPosition: null,
                destination: null,
                distanceKm: null,
                averageSpeedKmh: $averageSpeedKmh,
                estimatedDurationMinutes: null,
                estimatedArrivalAt: null,
                status: 'no_gps_location',
            );
        }

        $currentPosition = [
            'latitude' => (float) $latestLocation->latitude,
            'longitude' => (float) $latestLocation->longitude,
            'recorded_at' => $latestLocation->recorded_at->toIso8601String(),
        ];

        $ageMinutes = (int) $latestLocation->recorded_at->diffInMinutes(Carbon::now());

        // 4. Destination coordinates
        $destLat = $route->destination_lat;
        $destLng = $route->destination_lng;

        if ($destLat === null || $destLng === null) {
            $currentPosition['age_minutes'] = $ageMinutes;
            return new EtaResult(
                bus: $busArray,
                route: $routeArray,
                currentPosition: $currentPosition,
                destination: null,
                distanceKm: null,
                averageSpeedKmh: $averageSpeedKmh,
                estimatedDurationMinutes: null,
                estimatedArrivalAt: null,
                status: 'no_destination_coordinates',
            );
        }

        $destination = [
            'latitude' => (float) $destLat,
            'longitude' => (float) $destLng,
        ];

        // 5. Haversine distance
        $distanceKm = $this->haversine(
            (float) $latestLocation->latitude,
            (float) $latestLocation->longitude,
            (float) $destLat,
            (float) $destLng,
        );

        // 6. Travel time
        if ($averageSpeedKmh <= 0.0) {
            $averageSpeedKmh = 40.0;
        }

        $estimatedDurationMinutes = ($distanceKm / $averageSpeedKmh) * 60.0;

        // 7. Estimated arrival
        $estimatedArrivalAt = $latestLocation->recorded_at
            ->copy()
            ->addMinutes($estimatedDurationMinutes)
            ->toIso8601String();

        // 8. Stale position check
        $warning = null;
        $status = 'ok';
        $currentPosition['age_minutes'] = $ageMinutes;

        if ($ageMinutes > $staleThreshold) {
            $status = 'stale_position';
            $warning = "GPS position is stale ({$ageMinutes} minutes old)";
        }

        return new EtaResult(
            bus: $busArray,
            route: $routeArray,
            currentPosition: $currentPosition,
            destination: $destination,
            distanceKm: round($distanceKm, 1),
            averageSpeedKmh: $averageSpeedKmh,
            estimatedDurationMinutes: round($estimatedDurationMinutes, 1),
            estimatedArrivalAt: $estimatedArrivalAt,
            status: $status,
            warning: $warning,
        );
    }

    public static function haversine(float $lat1, float $lng1, float $lat2, float $lng2): float
    {
        $dLat = ($lat2 - $lat1) * self::PI_OVER_180;
        $dLng = ($lng2 - $lng1) * self::PI_OVER_180;

        $lat1Rad = $lat1 * self::PI_OVER_180;
        $lat2Rad = $lat2 * self::PI_OVER_180;

        $a = sin($dLat / 2) ** 2
            + cos($lat1Rad) * cos($lat2Rad) * sin($dLng / 2) ** 2;

        $c = 2 * atan2(sqrt($a), sqrt(1 - $a));

        return self::EARTH_RADIUS_KM * $c;
    }
}
