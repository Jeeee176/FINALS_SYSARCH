<?php

namespace App\Http\Controllers\Operator;

use App\Http\Controllers\Controller;
use App\Models\Bus;
use App\Models\DepartureQueue;
use App\Models\Driver;
use App\Models\Location;
use App\Models\Route;
use App\Models\Trip;
use App\Models\Alert;
use App\Enums\AlertStatus;
use App\Enums\TripStatus;
use Inertia\Inertia;

class OperatorDashboardController extends Controller
{
    /**
     * Display the operator dashboard with fleet overview and live monitoring data.
     */
    public function index()
    {
        $totalBuses     = Bus::count();
        $activeBuses    = Bus::where('status', 'active')->count();

        $totalDrivers   = Driver::count();
        $activeDrivers  = Driver::where('status', 'active')->count();

        $totalRoutes    = Route::count();
        $activeRoutes   = Route::where('status', 'active')->count();

        // Buses that have a driver assigned (operationally active).
        $assignedBuses = Bus::whereNotNull('driver_id')
            ->with(['driver.user', 'route'])
            ->orderBy('bus_number')
            ->get();

        // Buses without a driver — need attention.
        $unassignedBuses = Bus::whereNull('driver_id')
            ->with(['driver.user', 'route'])
            ->orderBy('bus_number')
            ->get();

        // Latest 10 GPS records across the fleet.
        $latestLocations = Location::with('bus')
            ->orderByDesc('recorded_at')
            ->limit(10)
            ->get();

        // Active alerts for the operator.
        $activeAlerts = Alert::with(['alertable'])
            ->whereIn('status', [AlertStatus::NEW->value, AlertStatus::ACKNOWLEDGED->value])
            ->orderByDesc('created_at')
            ->limit(20)
            ->get();

        // Exact active-alert count (the 20-row payload above is display-capped).
        $activeAlertsTotal = Alert::active()->count();

        // Trips currently underway (same definition used by tracking/reports).
        $inTransitTrips = Trip::where('status', TripStatus::IN_TRANSIT->value)->count();

        // Active queue entries (uses the same scope as the queue page).
        $waitingInQueue = DepartureQueue::active()->count();

        // Next entries in the dispatch queue, in the canonical queue order.
        $queuePreview = DepartureQueue::active()
            ->with(['bus.driver.user', 'route'])
            ->ordered()
            ->limit(5)
            ->get()
            ->map(fn (DepartureQueue $entry) => [
                'id'             => $entry->id,
                'queue_position' => $entry->queue_position,
                'status'         => $entry->status->value,
                'bus_number'     => $entry->bus?->bus_number,
                'bus'            => [
                    'id'           => $entry->bus_id,
                    'bus_number'   => $entry->bus?->bus_number,
                    'plate_number' => $entry->bus?->plate_number,
                ],
                'driver'         => [
                    'id'   => $entry->driver_id,
                    'name' => $entry->driver?->user?->name,
                ],
                'route'          => [
                    'id'          => $entry->route_id,
                    'name'        => $entry->route?->name,
                    'destination' => $entry->route?->destination,
                ],
            ]);

        return Inertia::render('operator/dashboard', [
            'stats' => [
                'buses' => [
                    'total'  => $totalBuses,
                    'active' => $activeBuses,
                ],
                'drivers' => [
                    'total'  => $totalDrivers,
                    'active' => $activeDrivers,
                ],
                'routes' => [
                    'total'  => $totalRoutes,
                    'active' => $activeRoutes,
                ],
                'trips' => [
                    'in_transit' => $inTransitTrips,
                ],
                'queue' => [
                    'waiting' => $waitingInQueue,
                ],
                'alerts' => [
                    'active' => $activeAlertsTotal,
                ],
            ],
            'queuePreview'   => $queuePreview,
            'assignedBuses'  => $assignedBuses,
            'unassignedBuses'=> $unassignedBuses,
            'latestLocations'=> $latestLocations,
            'alerts'         => $activeAlerts,
        ]);
    }
}
