<?php

declare(strict_types=1);

namespace App\Http\Controllers\Operator;

use App\Http\Controllers\Controller;
use App\Models\Bus;
use App\Models\Trip;
use App\Enums\TripStatus;
use Inertia\Inertia;

class LiveMonitoringController extends Controller
{
    /**
     * Route and driver summary used by the live tracking pages.
     * Returns null entries when the bus has no route or no driver assigned
     * so the frontend can render an explicit "not assigned" state.
     *
     * @return array{route: array{id: int, name: string, status: string|null}|null, driver: array{id: int, name: string|null}|null}
     */
    private function routeAndDriver(Bus $bus): array
    {
        return [
            'route' => $bus->route === null ? null : [
                'id' => $bus->route->id,
                'name' => $bus->route->name,
                'status' => $bus->route->status,
            ],
            'driver' => $bus->driver === null ? null : [
                'id' => $bus->driver->id,
                'name' => $bus->driver->user?->name,
            ],
        ];
    }

    /**
     * Display live fleet monitoring — only buses with an active in_transit trip.
     * 
     * A bus is considered actively trackable when it has an in_transit trip.
     * Completed/cancelled/scheduled trips do NOT make a bus appear here.
     */
    public function index()
    {
        // Get all buses that have an in_transit trip
        $activeTripBuses = Trip::where('status', TripStatus::IN_TRANSIT->value)
            ->with(['bus.driver.user', 'bus.route', 'bus.locations' => function ($query) {
                $query->orderByDesc('recorded_at');
            }])
            ->get()
            ->map(fn($trip) => $trip->bus)
            ->filter()
            ->unique('id');

        // Buses with an in_transit trip AND at least one GPS record. Buses
        // without locations are covered by $untrackedWithActiveTrip below, so
        // filtering here keeps every bus in the payload exactly once.
        $tracked = $activeTripBuses
            ->filter(fn ($bus) => $bus->locations->isNotEmpty())
            ->map(function ($bus) {
                $latest = $bus->locations->first();

                $currentTrip = $bus->currentTrip();

                return [
                    'id'           => $bus->id,
                    'bus_number'   => $bus->bus_number,
                    'plate_number' => $bus->plate_number,
                    'model'        => $bus->model,
                    'status'       => $bus->status,
                    'latitude'     => $latest?->latitude,
                    'longitude'    => $latest?->longitude,
                    'recorded_at'  => $latest?->recorded_at,
                    'current_trip' => $currentTrip ? [
                        'id'         => $currentTrip->id,
                        'status'     => $currentTrip->status->value,
                        'started_at' => $currentTrip->started_at?->toIso8601String(),
                    ] : null,
                    ...$this->routeAndDriver($bus),
                ];
            });

        // Buses with no location data yet, but with active trips
        $untrackedWithActiveTrip = $activeTripBuses
            ->reject(fn($bus) => $bus->locations()->exists())
            ->map(fn($bus) => [
                'id'           => $bus->id,
                'bus_number'   => $bus->bus_number,
                'plate_number' => $bus->plate_number,
                'model'        => $bus->model,
                'status'       => $bus->status,
                'latitude'     => null,
                'longitude'    => null,
                'recorded_at'  => null,
                'current_trip' => $bus->currentTrip() ? [
                    'id'         => $bus->currentTrip()->id,
                    'status'     => $bus->currentTrip()->status->value,
                    'started_at' => $bus->currentTrip()->started_at?->toIso8601String(),
                ] : null,
                ...$this->routeAndDriver($bus),
            ]);

        $allBuses = collect(
            $tracked->concat($untrackedWithActiveTrip)->sortBy('bus_number')->values()
        );

        // Also include all buses that have never had a trip for reference
        $neverHadTrip = Bus::whereDoesntHave('trips')
            ->with(['route', 'driver.user'])
            ->get()
            ->map(fn($bus) => [
                'id'           => $bus->id,
                'bus_number'   => $bus->bus_number,
                'plate_number' => $bus->plate_number,
                'model'        => $bus->model,
                'status'       => $bus->status,
                'latitude'     => null,
                'longitude'    => null,
                'recorded_at'  => null,
                'current_trip' => null,
                'is_tracking_active' => false,
                ...$this->routeAndDriver($bus),
            ]);

        $allBuses = $allBuses->merge($neverHadTrip)->sortBy('bus_number')->values();

        return Inertia::render('operator/tracking', [
            'buses' => $allBuses,
            'active_only' => true,
        ]);
    }
}
