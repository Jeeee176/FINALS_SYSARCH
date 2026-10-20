<?php

namespace App\Http\Controllers\Driver;

use App\Http\Controllers\Controller;
use App\Models\Trip;
use App\Enums\TripStatus;
use Inertia\Inertia;

class GpsController extends Controller
{
    /**
     * Display the driver GPS/live tracking page with the assigned bus.
     */
    public function index()
    {
        $driver = auth()->user()->driver;

        $bus = $driver?->bus;

        $activeTrip = $driver ? Trip::where('driver_id', $driver->id)
            ->where('status', TripStatus::IN_TRANSIT->value)
            ->first() : null;

        return Inertia::render('driver/gps', [
            'assignedBus' => $bus ? [
                'id' => $bus->id,
                'bus_number' => $bus->bus_number,
                'plate_number' => $bus->plate_number,
                'model' => $bus->model,
                'capacity' => $bus->capacity,
                'status' => $bus->status,
            ] : null,
            'activeTrip' => $activeTrip ? [
                'id' => $activeTrip->id,
                'status' => $activeTrip->status->value,
                'started_at' => $activeTrip->started_at?->toIso8601String(),
            ] : null,
        ]);
    }
}