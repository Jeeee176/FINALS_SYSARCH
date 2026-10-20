<?php

namespace App\Http\Controllers\Driver;

use App\Http\Controllers\Controller;
use App\Models\Bus;
use App\Services\EtaService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class EtaController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        $user = $request->user();

        if (!$user) {
            return response()->json(['error' => 'Unauthorized'], 401);
        }

        if ($user->role->value !== 'driver') {
            return response()->json(['error' => 'Forbidden'], 403);
        }

        $driver = $user->driver;

        if (!$driver) {
            return response()->json(['error' => 'Driver record not found'], 404);
        }

        $busId = $driver->bus_id;

        if (!$busId) {
            return response()->json([
                'error' => 'No bus assigned. Assign a bus before submitting GPS.',
            ], 422);
        }

        $bus = Bus::with(['route', 'locations' => function ($query) {
            $query->orderByDesc('recorded_at');
        }])->find($busId);

        if (!$bus) {
            return response()->json(['error' => 'Bus not found'], 404);
        }

        $service = new EtaService();
        $result = $service->calculateForBus($bus);

        return response()->json([
            'success' => true,
            'eta' => $result->toArray(),
        ]);
    }
}
