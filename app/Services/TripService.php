<?php

declare(strict_types=1);

namespace App\Services;

use App\Enums\AlertSeverity;
use App\Enums\AlertStatus;
use App\Enums\AlertType;
use App\Enums\DelayIncidentStatus;
use App\Enums\DelayReason;
use App\Enums\TripStatus;
use App\Models\Alert;
use App\Models\Bus;
use App\Models\DelayIncident;
use App\Models\Driver;
use App\Models\Location;
use App\Models\Trip;
use Illuminate\Support\Facades\DB;

class TripService
{
    /* ------------------------------------------------------------------
     * Trip lifecycle
     * ------------------------------------------------------------------ */

    /**
     * Start a new trip for an already-assigned bus.
     *
     * @throws \RuntimeException  if the driver already has an in_transit trip
     *                             for this bus
     */
    public static function startTrip(
        Driver $driver,
        Bus    $bus,
        ?Trip  $currentTrip = null,
    ): Trip {
        return DB::transaction(function () use ($driver, $bus, $currentTrip) {
            $existing = Trip::inTransit()
                ->where('bus_id', $bus->id)
                ->first();

            if ($existing !== null) {
                throw new \RuntimeException(
                    'A trip is already in progress for this bus.'
                );
            }

            $now          = now();
            $latestLoc    = Location::where('bus_id', $bus->id)
                ->orderByDesc('recorded_at')
                ->first();

            $trip = Trip::create([
                'bus_id'         => $bus->id,
                'route_id'       => $bus->route_id,
                'driver_id'      => $driver->id,
                'status'         => TripStatus::IN_TRANSIT->value,
                'started_at'     => $now,
                'start_latitude'  => $latestLoc?->latitude,
                'start_longitude' => $latestLoc?->longitude,
            ]);

            self::createAlert(
                alertable: $trip,
                type: AlertType::TRIP_STARTED,
                title: 'Trip Started',
                message: self::tripStartedMessage($trip, $bus, $driver),
                severity: AlertSeverity::INFO,
                status: AlertStatus::NEW,
            );

            return $trip->fresh(['bus.route', 'driver.user', 'alerts']);
        });
    }

    /**
     * End an in_transit trip.
     *
     * @throws \RuntimeException  if the trip is not in_transit
     */
    public static function endTrip(Trip $trip): Trip
    {
        return DB::transaction(function () use ($trip) {
            if ($trip->status !== TripStatus::IN_TRANSIT) {
                throw new \RuntimeException(
                    'Only in-transit trips can be ended.'
                );
            }

            $latestLoc = Location::where('bus_id', $trip->bus_id)
                ->orderByDesc('recorded_at')
                ->first();

            $trip->update([
                'status'         => TripStatus::COMPLETED->value,
                'ended_at'       => now(),
                'end_latitude'   => $latestLoc?->latitude,
                'end_longitude'  => $latestLoc?->longitude,
            ]);

            $trip->load('bus.route', 'driver.user');

            self::createAlert(
                alertable: $trip->fresh(),
                type: AlertType::TRIP_ENDED,
                title: 'Trip Ended',
                message: self::tripEndedMessage($trip),
                severity: AlertSeverity::INFO,
                status: AlertStatus::NEW,
            );

            return $trip->fresh(['bus.route', 'driver.user', 'alerts']);
        });
    }

    /* ------------------------------------------------------------------
     * Delay / incident reporting
     * ------------------------------------------------------------------ */

    public static function reportDelayIncident(
        Driver $driver,
        Bus    $bus,
        string $reason,
        ?string $details = null,
        ?int   $tripId    = null,
    ): DelayIncident {
        return DB::transaction(function () use ($driver, $bus, $reason, $details, $tripId) {
            // Validate reason
            $reasonEnum = DelayReason::tryFrom($reason);
            if ($reasonEnum === null) {
                throw new \InvalidArgumentException(
                    'Invalid delay reason.'
                );
            }

            if ($reasonEnum === DelayReason::OTHER && trim($details ?? '') === '') {
                throw new \InvalidArgumentException(
                    'Details are required when the reason is "Other".'
                );
            }

            // Determine trip
            $trip = null;
            if ($tripId !== null) {
                $trip = Trip::inTransit()->where('id', $tripId)->where('bus_id', $bus->id)->first();
            }
            if ($trip === null) {
                $trip = Trip::inTransit()->where('bus_id', $bus->id)->first();
            }

            $latestLoc = Location::where('bus_id', $bus->id)
                ->orderByDesc('recorded_at')
                ->first();

            $isIncident = $reasonEnum->isIncident();
            $alertType  = $isIncident ? AlertType::INCIDENT_REPORTED : AlertType::DELAY_REPORTED;
            $severity   = $isIncident ? AlertSeverity::CRITICAL : AlertSeverity::WARNING;

            $incident = DelayIncident::create([
                'trip_id'     => $trip?->id,
                'bus_id'      => $bus->id,
                'driver_id'   => $driver->id,
                'reason'      => $reason,
                'details'     => $details,
                'latitude'    => $latestLoc?->latitude,
                'longitude'   => $latestLoc?->longitude,
                'reported_at' => now(),
                'status'      => DelayIncidentStatus::REPORTED->value,
            ]);

            $title   = $isIncident
                ? self::incidentTitle($reasonEnum)
                : 'Delay Reported';
            $message = self::incidentMessage($incident, $bus, $driver, $reasonEnum, $details);

            self::createAlert(
                alertable: $incident,
                type: $alertType,
                title: $title,
                message: $message,
                severity: $severity,
                status: AlertStatus::NEW,
            );

            $incident->load(['trip', 'bus.route', 'driver.user', 'alerts']);

            return $incident;
        });
    }

    /* ------------------------------------------------------------------
     * Alert status transitions
     * ------------------------------------------------------------------ */

    public static function acknowledgeAlert(Alert $alert): Alert
    {
        if ($alert->status !== AlertStatus::NEW) {
            throw new \RuntimeException('Only new alerts can be acknowledged.');
        }

        return DB::transaction(function () use ($alert) {
            $alert->update(['status' => AlertStatus::ACKNOWLEDGED->value]);
            return $alert->fresh();
        });
    }

    public static function resolveAlert(Alert $alert): Alert
    {
        if ($alert->status !== AlertStatus::ACKNOWLEDGED) {
            throw new \RuntimeException(
                'Only acknowledged alerts can be resolved.'
            );
        }

        return DB::transaction(function () use ($alert) {
            $alert->update(['status' => AlertStatus::RESOLVED->value]);
            return $alert->fresh();
        });
    }

    /* ------------------------------------------------------------------
     * Queries
     * ------------------------------------------------------------------ */

    /**
     * Buses that currently have an in_transit trip.
     */
    public static function activeBuses(): \Illuminate\Database\Eloquent\Collection
    {
        return Bus::distinct()
            ->join('trips', 'buses.id', '=', 'trips.bus_id')
            ->where('trips.status', TripStatus::IN_TRANSIT->value)
            ->with([
                'route',
                'driver.user',
                'locations' => function ($q) {
                    $q->orderByDesc('recorded_at');
                },
            ])
            ->select('buses.*')
            ->orderBy('buses.bus_number')
            ->get();
    }

    /**
     * Active (new / acknowledged) alerts, newest first.
     */
    public static function activeAlerts(
        int $perPage = 20,
        ?string $status = null,
    ) {
        $query = Alert::with(['alertable.bus', 'alertable.driver.user', 'alertable.trip'])
            ->active()
            ->orderByDesc('created_at');

        if ($status !== null) {
            $query->whereIn('status', [
                AlertStatus::NEW->value,
                AlertStatus::ACKNOWLEDGED->value,
            ]);
        }

        return $query->paginate($perPage);
    }

    /* ------------------------------------------------------------------
     * Internal helpers
     * ------------------------------------------------------------------ */

    private static function createAlert(
        $alertable,
        AlertType   $type,
        string      $title,
        string      $message,
        AlertSeverity $severity,
        AlertStatus $status,
    ): Alert {
        return Alert::create([
            'alertable_type' => get_class($alertable),
            'alertable_id'   => $alertable->id,
            'type'           => $type->value,
            'title'          => $title,
            'message'        => $message,
            'severity'       => $severity->value,
            'status'         => $status->value,
        ]);
    }

    private static function tripStartedMessage(Trip $trip, Bus $bus, Driver $driver): string
    {
        $driverName = $driver->user?->name ?? 'Unknown Driver';
        $routeName  = $trip->route?->name ?? 'No Route';
        return "Trip started for {$bus->bus_number} ({$bus->plate_number}) "
            . "by {$driverName}. Route: {$routeName}.";
    }

    private static function tripEndedMessage(Trip $trip): string
    {
        $bus        = $trip->bus;
        $driverName = $trip->driver?->user?->name ?? 'Unknown Driver';
        $routeName  = $trip->route?->name ?? 'No Route';
        return "Trip ended for {$bus->bus_number} ({$bus->plate_number}) "
            . "by {$driverName}. Route: {$routeName}.";
    }

    private static function incidentTitle(DelayReason $reason): string
    {
        return match ($reason) {
            DelayReason::ACCIDENT         => 'Accident Reported',
            DelayReason::FLAT_TIRE        => 'Flat Tire Reported',
            DelayReason::ENGINE_MECHANICAL => 'Mechanical Problem Reported',
            DelayReason::POLICE_CHECKPOINT => 'Police/Checkpoint Reported',
            DelayReason::ROAD_CLOSURE     => 'Road Closure Reported',
            DelayReason::WEATHER          => 'Weather Delay Reported',
            DelayReason::FUEL_REFUELING   => 'Fueling Delay Reported',
            DelayReason::TRAFFIC          => 'Traffic Delay Reported',
            DelayReason::PASSENGER_RELATED_DELAY => 'Passenger Delay Reported',
            DelayReason::OTHER            => 'Other Incident Reported',
        };
    }

    private static function incidentMessage(
        DelayIncident $incident,
        Bus           $bus,
        Driver        $driver,
        DelayReason   $reason,
        ?string       $details,
    ): string {
        $driverName = $driver->user?->name ?? 'Unknown Driver';
        $base = "Incident reported for {$bus->bus_number} ({$bus->plate_number}) "
            . "by {$driverName}. Reason: {$reason->value}";
        if ($details !== null && trim($details) !== '') {
            $base .= ". Details: {$details}";
        }
        return $base;
    }
}
