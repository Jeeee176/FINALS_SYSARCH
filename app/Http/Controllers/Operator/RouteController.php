<?php

namespace App\Http\Controllers\Operator;

use App\Http\Controllers\Controller;
use App\Models\Route;
use Inertia\Inertia;

class RouteController extends Controller
{
    /**
     * Display a listing of routes for operator reference.
     * Read-only — operators view route assignments but do not manage routes.
     */
    public function index()
    {
        $routes = Route::with(['buses.driver.user'])
            ->orderBy('name')
            ->get();

        return Inertia::render('operator/routes', [
            'routes' => $routes,
        ]);
    }
}
