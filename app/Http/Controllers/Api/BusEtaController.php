<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Bus;
use App\Services\EtaService;
use App\Services\BusSpeedCalculator;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class BusEtaController extends Controller
{
    /**
     * Return ETA and current speed for a specific bus.
     *
     * Authorization:
     * - Requires authentication.
     * - Driver role is forbidden (drivers use GET /driver/eta instead).
     * - Admin and Operator may query any bus.
     */
    public function show(Request $request, Bus $bus): JsonResponse
    {
        $user = $request->user();

        if (!$user) {
            return response()->json(['error' => 'Unauthenticated'], 401);
        }

        if ($user->role->value === 'driver') {
            return response()->json(['error' => 'Forbidden'], 403);
        }

        $service = new EtaService();
        $eta = $service->calculateForBus($bus);

        $speedCalculator = new BusSpeedCalculator();
        $currentSpeedKmh = $speedCalculator->calculate($bus);

        return response()->json([
            'success' => true,
            'bus' => [
                'id' => $bus->id,
                'bus_number' => $bus->bus_number,
                'plate_number' => $bus->plate_number,
                'status' => $bus->status,
            ],
            'route' => $eta->route,
            'current_position' => $eta->currentPosition,
            'current_speed_kmh' => $currentSpeedKmh,
            'destination' => $eta->destination,
            'distance_km' => $eta->distanceKm,
            'estimated_duration_minutes' => $eta->estimatedDurationMinutes,
            'estimated_arrival_at' => $eta->estimatedArrivalAt,
            'eta_status' => $eta->status,
            'warning' => $eta->warning,
        ]);
    }
}
