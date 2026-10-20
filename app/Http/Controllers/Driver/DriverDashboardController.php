<?php

namespace App\Http\Controllers\Driver;

use App\Http\Controllers\Controller;
use App\Models\DepartureQueue;
use App\Models\Driver;
use Inertia\Inertia;

class DriverDashboardController extends Controller
{
    /**
     * Display the driver dashboard with the driver's own profile,
     * assigned bus, and assigned route.
     *
     * Only returns data for the authenticated driver.
     */
    public function index()
    {
        $user = auth()->user();

        // Guard: should always have a user when role:driver middleware passes.
        if (!$user) {
            return Inertia::render('driver/dashboard', [
                'driver'       => null,
                'assignedBus'  => null,
                'assignedRoute'=> null,
                'currentTrip'  => null,
                'dispatch'     => null,
            ]);
        }

        $driver = $user->driver;

        if (!$driver) {
            // Authenticated as driver role but no Driver record exists.
            return Inertia::render('driver/dashboard', [
                'driver'       => null,
                'assignedBus'  => null,
                'assignedRoute'=> null,
                'currentTrip'  => null,
                'dispatch'     => null,
            ]);
        }

        // Eager-load the driver's bus and the bus's route in one query.
        $driver->load(['bus.route']);

        $assignedBus = $driver->bus;

        // Current in-progress trip for the driver's assigned bus (if any).
        $currentTrip = $assignedBus?->currentTrip();

        // The driver's own dispatch notification in the departure queue, if
        // any (same lookup the driver's Dispatch page performs).
        $dispatchEntry = DepartureQueue::active()
            ->where('driver_id', $driver->id)
            ->with(['bus', 'route'])
            ->first();

        return Inertia::render('driver/dashboard', [
            'driver' => [
                'id'             => $driver->id,
                'license_number' => $driver->license_number,
                'license_expiry' => $driver->license_expiry?->toDateString(),
                'phone'          => $driver->phone,
                'address'        => $driver->address,
                'status'         => $driver->status,
                'user'           => [
                    'id'    => $user->id,
                    'name'  => $user->name,
                    'email' => $user->email,
                ],
            ],
            'assignedBus' => $assignedBus ? [
                'id'          => $assignedBus->id,
                'bus_number'  => $assignedBus->bus_number,
                'plate_number'=> $assignedBus->plate_number,
                'model'       => $assignedBus->model,
                'capacity'    => $assignedBus->capacity,
                'status'      => $assignedBus->status,
            ] : null,
            'assignedRoute' => ($assignedBus && $assignedBus->route) ? [
                'id'         => $assignedBus->route->id,
                'name'       => $assignedBus->route->name,
                'origin'     => $assignedBus->route->origin,
                'destination'=> $assignedBus->route->destination,
                'status'     => $assignedBus->route->status,
            ] : null,
            'currentTrip' => $currentTrip ? [
                'id'         => $currentTrip->id,
                'status'     => $currentTrip->status->value,
                'started_at' => $currentTrip->started_at?->toIso8601String(),
            ] : null,
            'dispatch' => $dispatchEntry ? [
                'id'             => $dispatchEntry->id,
                'status'         => $dispatchEntry->status->value,
                'queue_position' => $dispatchEntry->queue_position,
                'notified_at'    => $dispatchEntry->notified_at?->toIso8601String(),
                'driver_acknowledged_at' => $dispatchEntry->driver_acknowledged_at?->toIso8601String(),
                'bus'            => [
                    'id'          => $dispatchEntry->bus_id,
                    'bus_number'  => $dispatchEntry->bus?->bus_number,
                    'plate_number'=> $dispatchEntry->bus?->plate_number,
                ],
                'route'          => [
                    'id'          => $dispatchEntry->route_id,
                    'name'        => $dispatchEntry->route?->name,
                    'destination' => $dispatchEntry->route?->destination,
                ],
            ] : null,
        ]);
    }
}
