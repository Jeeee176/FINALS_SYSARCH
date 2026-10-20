<?php

namespace App\Http\Controllers\Operator;

use App\Http\Controllers\Controller;
use App\Models\Driver;
use Inertia\Inertia;

class DriverController extends Controller
{
    /**
     * Display a listing of drivers for operator monitoring.
     * Read-only — operators view driver assignments but do not manage drivers.
     */
    public function index()
    {
        $drivers = Driver::with(['user', 'bus.route'])
            ->orderBy('status')
            ->get();

        return Inertia::render('operator/drivers', [
            'drivers' => $drivers,
        ]);
    }
}
