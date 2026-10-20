<?php

namespace App\Http\Controllers\Driver;

use App\Http\Controllers\Controller;
use App\Models\Driver;
use Inertia\Inertia;

class BusController extends Controller
{
    /**
     * Display the authenticated driver's assigned bus, with the route
     * attached to that bus and the bus's current in-progress trip (if any).
     *
     * Read-only: the driver can view but never manage assignments.
     */
    public function show()
    {
        $driver = auth()->user()->driver;

        if (!$driver) {
            return Inertia::render('driver/bus', [
                'assignedBus'   => null,
                'assignedRoute' => null,
                'currentTrip'   => null,
                'driverStatus'  => null,
            ]);
        }

        $bus = $driver->bus;

        $currentTrip = $bus?->currentTrip();

        return Inertia::render('driver/bus', [
            'assignedBus' => $bus ? [
                'id'          => $bus->id,
                'bus_number'  => $bus->bus_number,
                'plate_number'=> $bus->plate_number,
                'model'       => $bus->model,
                'capacity'    => $bus->capacity,
                'status'      => $bus->status,
            ] : null,
            'assignedRoute' => ($bus && $bus->route) ? [
                'id'          => $bus->route->id,
                'name'        => $bus->route->name,
                'origin'      => $bus->route->origin,
                'destination' => $bus->route->destination,
                'status'      => $bus->route->status,
            ] : null,
            'currentTrip' => $currentTrip ? [
                'id'         => $currentTrip->id,
                'status'     => $currentTrip->status->value,
                'started_at' => $currentTrip->started_at?->toIso8601String(),
            ] : null,
            'driverStatus' => $driver->status,
        ]);
    }
}
