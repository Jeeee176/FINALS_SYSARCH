<?php

namespace App\Http\Controllers\Driver;

use App\Http\Controllers\Controller;
use Inertia\Inertia;

class RouteController extends Controller
{
    /**
     * Display the route associated with the authenticated driver's assigned bus.
     */
    public function show()
    {
        $driver = auth()->user()->driver;

        if (!$driver || !$driver->bus) {
            return Inertia::render('driver/route', [
                'assignedRoute' => null,
            ]);
        }

        $route = $driver->bus->route;

        return Inertia::render('driver/route', [
            'assignedRoute' => $route ? [
                'id' => $route->id,
                'name' => $route->name,
                'origin' => $route->origin,
                'destination' => $route->destination,
                'status' => $route->status,
            ] : null,
        ]);
    }
}
