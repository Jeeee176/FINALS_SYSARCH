<?php

namespace App\Http\Controllers\Api;

use App\Enums\TripStatus;
use App\Http\Controllers\Controller;
use App\Models\Bus;
use App\Models\Location;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Collection;

class LocationController extends Controller
{
    /**
     * Store a newly created GPS location.
     */
    public function store(Request $request): JsonResponse
    {
        $user = $request->user();

        if (!$user) {
            return response()->json(['error' => 'Unauthenticated'], 401);
        }

        // Drivers: derive bus_id from their assignment. Ignore any client-supplied bus_id.
        if ($user->role->value === 'driver') {
            $driver = $user->driver;

            if (!$driver) {
                return response()->json(['error' => 'Driver record not found'], 404);
            }

            if (!$driver->bus_id) {
                return response()->json([
                    'error' => 'No bus assigned. Assign a bus before submitting GPS.',
                ], 422);
            }

            $busId = $driver->bus_id;
        } else {
            // Admin or other role — require bus_id from the request.
            $request->validate([
                'bus_id' => ['required', 'integer', 'exists:buses,id'],
            ]);

            $busId = $request->bus_id;
        }

        $validated = $request->validate([
            'latitude' => ['required', 'numeric', 'between:-90,90'],
            'longitude' => ['required', 'numeric', 'between:-180,180'],
            'accuracy' => ['nullable', 'numeric', 'min:0'],
            'recorded_at' => ['nullable', 'date'],
        ]);

        $location = Location::create([
            'bus_id' => $busId,
            'latitude' => $validated['latitude'],
            'longitude' => $validated['longitude'],
            'accuracy' => $validated['accuracy'] ?? null,
            'recorded_at' => $validated['recorded_at'] ?? now(),
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Location recorded successfully.',
            'location' => $location,
        ], 201);
    }

    /**
     * Return the most recent GPS location for a bus.
     */
    public function showLatest(Bus $bus): JsonResponse
    {
        $location = $bus->locations()
            ->orderByDesc('recorded_at')
            ->first();

        if (! $location) {
            return response()->json([
                'success' => false,
                'message' => 'No location recorded for this bus.',
            ], 404);
        }

        return response()->json([
            'success' => true,
            'location' => $location,
        ]);
    }

    /**
     * Return the latest location for every bus that has location data
     * OR currently has an in-transit trip.
     *
     * A bus that has just started its first trip may not have received a GPS
     * fix yet. Those buses must still be reported, with a null location, so the
     * live trackers can list them as "awaiting GPS" instead of silently
     * dropping them. Previously the query required the bus to have at least one
     * Location row ever, which hid every newly assigned bus until its first
     * successful geolocation fix.
     */
    public function indexLatest(): JsonResponse
    {
        $inTransit = TripStatus::IN_TRANSIT->value;

        $buses = Bus::query()
            ->where(function ($query) use ($inTransit) {
                $query->has('locations')
                    ->orWhereHas('trips', function ($tripQuery) use ($inTransit) {
                        $tripQuery->where('status', $inTransit);
                    });
            })
            ->with([
                'locations' => function ($query) {
                    $query->orderByDesc('recorded_at');
                },
                'trips' => function ($query) use ($inTransit) {
                    $query->where('status', $inTransit)
                        ->orderByDesc('started_at');
                },
                'route',
                'driver.user',
            ])
            ->get();

        $result = $buses->map(function ($bus) {
            $latest = $bus->locations->first();
            $currentTrip = $bus->trips->first();

            $locationData = $latest === null ? null : [
                'latitude' => $latest->latitude,
                'longitude' => $latest->longitude,
                'accuracy' => $latest->accuracy,
                'recorded_at' => $latest->recorded_at,
            ];

            // === DIAGNOSTIC: API response for this bus ===
            \Log::info('[GPS_TRACE] indexLatest bus location', [
                'bus_id' => $bus->id,
                'bus_number' => $bus->bus_number,
                'bus_driver_id' => $bus->driver_id,
                'location' => $locationData,
            ]);

            return [
                'id' => $bus->id,
                'bus_number' => $bus->bus_number,
                'plate_number' => $bus->plate_number,
                'model' => $bus->model,
                'status' => $bus->status,
                'location' => $locationData,
                'is_tracking_active' => $currentTrip !== null,
                'current_trip' => $currentTrip ? [
                    'id' => $currentTrip->id,
                    'status' => $currentTrip->status->value,
                    'started_at' => $currentTrip->started_at?->toIso8601String(),
                ] : null,
                'route' => $bus->route === null ? null : [
                    'id' => $bus->route->id,
                    'name' => $bus->route->name,
                    'status' => $bus->route->status,
                ],
                'driver' => $bus->driver === null ? null : [
                    'id' => $bus->driver->id,
                    'name' => $bus->driver->user?->name,
                ],
            ];
        });

        return response()->json([
            'success' => true,
            'fleet_total' => Bus::count(),
            'buses' => $result,
        ]);
    }

    /**
     * Return historical GPS locations for a specific bus.
     *
     * Requires authentication (admin/operator).
     * Supports optional filtering by limit, before, and after dates.
     */
    public function history(Bus $bus, Request $request): JsonResponse
    {
        $user = $request->user();

        if (!$user) {
            return response()->json(['error' => 'Unauthenticated'], 401);
        }

        if ($user->role->value === 'driver') {
            return response()->json(['error' => 'Forbidden'], 403);
        }

        $validated = $request->validate([
            'limit' => ['nullable', 'integer', 'min:1', 'max:500'],
            'offset' => ['nullable', 'integer', 'min:0'],
            'before' => ['nullable', 'date'],
            'after' => ['nullable', 'date'],
        ]);

        // Order by recorded_at with id as a stable tiebreaker so offset-based
        // pagination (used by the Reports & Analytics GPS history) never skips
        // or duplicates records that share the same timestamp.
        $query = $bus->locations()
            ->orderByDesc('recorded_at')
            ->orderByDesc('id');

        if ($request->filled('before')) {
            $query->where('recorded_at', '<=', $validated['before']);
        }

        if ($request->filled('after')) {
            $query->where('recorded_at', '>=', $validated['after']);
        }

        $limit = $validated['limit'] ?? 100;
        $offset = $validated['offset'] ?? 0;

        $total = (clone $query)->count();
        $locations = $query->skip($offset)->take($limit)->get();

        return response()->json([
            'success' => true,
            'bus' => [
                'id' => $bus->id,
                'bus_number' => $bus->bus_number,
                'plate_number' => $bus->plate_number,
                'status' => $bus->status,
            ],
            'locations' => $locations->map(function ($location) {
                return [
                    'id' => $location->id,
                    'latitude' => $location->latitude,
                    'longitude' => $location->longitude,
                    'accuracy' => $location->accuracy,
                    'recorded_at' => $location->recorded_at->toIso8601String(),
                ];
            }),
            'count' => $locations->count(),
            'total' => $total,
            'has_more' => ($offset + $locations->count()) < $total,
        ]);
    }
}
