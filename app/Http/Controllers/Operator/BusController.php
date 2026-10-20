<?php

namespace App\Http\Controllers\Operator;

use App\Enums\TripStatus;
use App\Http\Controllers\Controller;
use App\Models\Bus;
use App\Models\DepartureQueue;
use App\Models\Trip;
use App\Services\DepartureQueueService;
use Inertia\Inertia;

class BusController extends Controller
{
    /**
     * Display a listing of buses for operator monitoring.
     * Read-only — operators view fleet status but do not manage buses.
     */
    public function index()
    {
        $buses = Bus::with(['driver.user', 'route'])
            ->orderBy('bus_number')
            ->get();

        $inTransitBusIds = Trip::query()
            ->where('status', TripStatus::IN_TRANSIT->value)
            ->pluck('bus_id')
            ->unique()
            ->values();

        // Availability follows the departure queue rules: an active bus with
        // an assigned driver and route that has no active trip and no active
        // queue entry can be queued for dispatch.
        $availableCount = Bus::query()
            ->where('status', 'active')
            ->whereNotNull('driver_id')
            ->whereNotNull('route_id')
            ->get()
            ->filter(fn (Bus $bus) => DepartureQueueService::canAddBus($bus))
            ->count();

        return Inertia::render('operator/buses', [
            'buses' => $buses->map(fn (Bus $bus) => [
                'id' => $bus->id,
                'bus_number' => $bus->bus_number,
                'plate_number' => $bus->plate_number,
                'model' => $bus->model,
                'capacity' => $bus->capacity,
                'status' => $bus->status,
                'route' => $bus->route ? [
                    'id' => $bus->route->id,
                    'name' => $bus->route->name,
                    'origin' => $bus->route->origin,
                    'destination' => $bus->route->destination,
                ] : null,
                'driver' => $bus->driver ? [
                    'id' => $bus->driver->id,
                    'name' => $bus->driver->user?->name ?? 'Unknown',
                ] : null,
                'has_in_transit_trip' => $inTransitBusIds->contains($bus->id),
            ]),
            'stats' => [
                'total' => $buses->count(),
                'in_transit' => $inTransitBusIds->count(),
                'waiting_queue' => DepartureQueue::active()->count(),
                'available' => $availableCount,
            ],
        ]);
    }
}
