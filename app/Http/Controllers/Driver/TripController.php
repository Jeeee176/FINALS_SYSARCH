<?php

declare(strict_types=1);

namespace App\Http\Controllers\Driver;

use App\Http\Controllers\Controller;
use App\Models\Bus;
use App\Models\Driver;
use App\Models\Location;
use App\Models\Trip;
use App\Services\TripService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class TripController extends Controller
{
    /**
     * POST /api/driver/trips/start
     *
     * Start a new trip for the authenticated driver's assigned bus.
     */
    public function start(Request $request): JsonResponse
    {
        $user = Auth::user();

        if ($user === null) {
            return response()->json([
                'success' => false,
                'error'   => 'Unauthenticated',
            ], 401);
        }

        $driver = $user->driver;

        if ($driver === null) {
            return response()->json([
                'success' => false,
                'error'   => 'No driver profile found.',
            ], 404);
        }

        $bus = $driver->bus;

        if ($bus === null) {
            return response()->json([
                'success' => false,
                'error'   => 'No bus assigned to this driver.',
            ], 404);
        }

        if ($bus->route_id === null) {
            return response()->json([
                'success' => false,
                'error'   => 'The assigned bus has no route.',
            ], 422);
        }

        // Prevent duplicate in-transit trip on the same bus
        $existing = Trip::inTransit()->where('bus_id', $bus->id)->first();
        if ($existing !== null) {
            return response()->json([
                'success' => false,
                'error'   => 'A trip is already in progress for this bus.',
            ], 422);
        }

        try {
            $trip = TripService::startTrip($driver, $bus);

            $latest = Location::where('bus_id', $bus->id)
                ->orderByDesc('recorded_at')
                ->first();

            return response()->json([
                'success'     => true,
                'message'     => 'Trip started successfully.',
                'trip'        => $trip->toArray(),
                'latest_location' => $latest
                    ? [
                        'id'          => $latest->id,
                        'latitude'    => (float) $latest->latitude,
                        'longitude'   => (float) $latest->longitude,
                        'recorded_at' => $latest->recorded_at?->toIso8601String(),
                    ]
                    : null,
            ], 201);
        } catch (\RuntimeException $e) {
            return response()->json([
                'success' => false,
                'error'   => $e->getMessage(),
            ], 422);
        }
    }

    /**
     * POST /api/driver/trips/{trip}/end
     *
     * End the specified in-transit trip.
     */
    public function end(Request $request, Trip $trip): JsonResponse
    {
        $user = Auth::user();

        if ($user === null) {
            return response()->json([
                'success' => false,
                'error'   => 'Unauthenticated',
            ], 401);
        }

        $driver = $user->driver;

        if ($driver === null) {
            return response()->json([
                'success' => false,
                'error'   => 'No driver profile found.',
            ], 404);
        }

        $bus = $driver->bus;

        if ($bus === null) {
            return response()->json([
                'success' => false,
                'error'   => 'No bus assigned to this driver.',
            ], 404);
        }

        // The trip must belong to this driver's bus
        if ($trip->bus_id !== $bus->id) {
            return response()->json([
                'success' => false,
                'error'   => 'This trip does not belong to your assigned bus.',
            ], 403);
        }

        try {
            $ended = TripService::endTrip($trip);

            $latest = Location::where('bus_id', $bus->id)
                ->orderByDesc('recorded_at')
                ->first();

            return response()->json([
                'success'     => true,
                'message'     => 'Trip ended successfully.',
                'trip'        => $ended->toArray(),
                'latest_location' => $latest
                    ? [
                        'id'          => $latest->id,
                        'latitude'    => (float) $latest->latitude,
                        'longitude'   => (float) $latest->longitude,
                        'recorded_at' => $latest->recorded_at?->toIso8601String(),
                    ]
                    : null,
            ]);
        } catch (\RuntimeException $e) {
            return response()->json([
                'success' => false,
                'error'   => $e->getMessage(),
            ], 422);
        }
    }
}
