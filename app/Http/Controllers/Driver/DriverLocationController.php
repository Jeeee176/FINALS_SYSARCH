<?php

namespace App\Http\Controllers\Driver;

use App\Http\Controllers\Controller;
use App\Models\Driver;
use App\Models\Location;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;

class DriverLocationController extends Controller
{
    /**
     * Store a GPS location for the authenticated driver's assigned bus.
     *
     * Security:
     * - Requires authentication.
     * - Requires role = driver.
     * - Driver must have a Driver record.
     * - Driver must have an assigned bus.
     * - bus_id is derived from the driver assignment — never trusted from the client.
     *
     * The client submits only latitude, longitude, and optionally recorded_at.
     */
    public function store(Request $request): JsonResponse
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
                'error' => 'No bus assigned. Assign a bus before submitting GPS.'
            ], 422);
        }

        // === DIAGNOSTIC: Auth context ===
        \Log::info('[GPS_TRACE] Auth context', [
            'user_id' => $user->id,
            'user_email' => $user->email,
            'driver_id' => $driver->id,
            'driver_bus_id' => $driver->bus_id,
            'bus_id_used' => $busId,
        ]);

        $validated = $request->validate([
            'latitude' => ['required', 'numeric', 'between:-90,90'],
            'longitude' => ['required', 'numeric', 'between:-180,180'],
            'accuracy' => ['nullable', 'numeric', 'min:0'],
            'recorded_at' => ['nullable', 'date'],
        ]);

        // === DIAGNOSTIC: Received values ===
        \Log::info('[GPS_TRACE] DriverLocationController received', [
            'latitude' => $validated['latitude'],
            'longitude' => $validated['longitude'],
            'accuracy' => $validated['accuracy'] ?? null,
            'recorded_at' => $validated['recorded_at'] ?? now(),
        ]);

        $location = Location::create([
            'bus_id'      => $busId,
            'latitude'    => $validated['latitude'],
            'longitude'   => $validated['longitude'],
            'accuracy'    => $validated['accuracy'] ?? null,
            'recorded_at' => $validated['recorded_at'] ?? now(),
        ]);

        // === DIAGNOSTIC: Saved to database ===
        \Log::info('[GPS_TRACE] Location saved to DB', [
            'id' => $location->id,
            'bus_id' => $location->bus_id,
            'latitude' => $location->latitude,
            'longitude' => $location->longitude,
            'accuracy' => $location->accuracy,
            'recorded_at' => $location->recorded_at,
        ]);

        return response()->json([
            'success'  => true,
            'message'  => 'Location recorded successfully.',
            'location' => [
                'id'          => $location->id,
                'bus_id'      => $location->bus_id,
                'latitude'    => $location->latitude,
                'longitude'   => $location->longitude,
                'accuracy'    => $location->accuracy,
                'recorded_at' => $location->recorded_at->toIso8601String(),
            ],
        ], 201);
    }

    /**
     * Return the latest GPS location for the authenticated driver's assigned bus.
     *
     * Returns 404 if the driver has no assigned bus or no location records.
     */
    public function showLatest(): JsonResponse
    {
        $user = auth()->user();

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
                'success' => false,
                'message' => 'No bus assigned.',
            ], 404);
        }

        $location = Location::where('bus_id', $busId)
            ->orderByDesc('recorded_at')
            ->first();

        if (!$location) {
            return response()->json([
                'success' => false,
                'message' => 'No location recorded for this bus.',
            ], 404);
        }

        return response()->json([
            'success' => true,
            'location' => [
                'id'          => $location->id,
                'bus_id'      => $location->bus_id,
                'latitude'    => $location->latitude,
                'longitude'   => $location->longitude,
                'accuracy'    => $location->accuracy,
                'recorded_at' => $location->recorded_at->toIso8601String(),
            ],
        ]);
    }
}
