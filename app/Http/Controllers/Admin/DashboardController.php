<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Bus;
use App\Models\Driver;
use App\Models\Location;
use App\Models\Operator;
use App\Models\Route;
use App\Models\Alert;
use App\Enums\AlertStatus;
use Illuminate\Http\Request;
use Inertia\Inertia;

class DashboardController extends Controller
{
    /**
     * Display the admin dashboard with fleet statistics and recent activity.
     */
    public function index()
    {
        $totalBuses       = Bus::count();
        $activeBuses      = Bus::where('status', 'active')->count();

        $totalDrivers     = Driver::count();
        $activeDrivers    = Driver::where('status', 'active')->count();

        $totalOperators   = Operator::count();
        $activeOperators  = Operator::where('status', 'active')->count();

        $totalRoutes      = Route::count();
        $activeRoutes     = Route::where('status', 'active')->count();

        // Latest tracked locations: one row per bus, most recent first.
        $latestLocations = Location::with('bus')
            ->select('locations.*')
            ->join('buses', 'locations.bus_id', '=', 'buses.id')
            ->orderByDesc('locations.recorded_at')
            ->limit(10)
            ->get();

        // Recent bus activity: latest 10 location records across all buses.
        $recentActivity = Location::with('bus')
            ->orderByDesc('recorded_at')
            ->limit(10)
            ->get();

        // Assigned buses: compact preview; the full list lives in Bus Management.
        $assignedBuses = Bus::with(['driver.user', 'route'])
            ->whereNotNull('driver_id')
            ->orderBy('bus_number')
            ->limit(5)
            ->get();

        $assignedBusesTotal = Bus::whereNotNull('driver_id')->count();

        // Active alerts: new and acknowledged.
        $activeAlerts = Alert::with(['alertable', 'alertable.bus', 'alertable.driver', 'alertable.driver.user'])
            ->whereIn('status', [AlertStatus::NEW->value, AlertStatus::ACKNOWLEDGED->value])
            ->orderByDesc('created_at')
            ->limit(20)
            ->get();

        return Inertia::render('admin/dashboard', [
            'stats' => [
                'buses' => [
                    'total'  => $totalBuses,
                    'active' => $activeBuses,
                ],
                'drivers' => [
                    'total'  => $totalDrivers,
                    'active' => $activeDrivers,
                ],
                'operators' => [
                    'total'  => $totalOperators,
                    'active' => $activeOperators,
                ],
                'routes' => [
                    'total'  => $totalRoutes,
                    'active' => $activeRoutes,
                ],
            ],
            'latestLocations' => $latestLocations,
            'recentActivity'  => $recentActivity,
            'assignedBuses'   => $assignedBuses,
            'assignedBusesTotal' => $assignedBusesTotal,
            'alerts'          => $activeAlerts,
        ]);
    }
}
