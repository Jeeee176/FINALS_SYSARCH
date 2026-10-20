<?php

declare(strict_types=1);

namespace App\Http\Controllers\Driver;

use App\Http\Controllers\Controller;
use App\Models\Bus;
use App\Models\Driver;
use App\Models\Trip;
use App\Enums\DelayReason;
use App\Services\TripService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\Rule;

class DelayIncidentController extends Controller
{
    /**
     * POST /api/driver/delay-incidents
     *
     * Report a delay or incident for the authenticated driver's assigned bus.
     */
    public function store(Request $request): JsonResponse
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

        $validated = $request->validate([
            'reason'   => [
                'required',
                'string',
                Rule::in(DelayReason::values()),
            ],
            'details'  => [
                'nullable',
                'string',
                'max:2000',
                function ($attribute, $value, $fail) use ($request) {
                    if ($request->input('reason') === DelayReason::OTHER->value && trim($value ?? '') === '') {
                        $fail('Details are required when the reason is "Other".');
                    }
                },
            ],
            'trip_id'  => [
                'nullable',
                'integer',
                'exists:trips,id',
            ],
        ]);

        $tripId = $validated['trip_id'] ?? null;

        // If trip_id is supplied but doesn't belong to this bus, reject.
        if ($tripId !== null) {
            $trip = Trip::inTransit()->where('id', $tripId)->where('bus_id', $bus->id)->first();
            if ($trip === null) {
                return response()->json([
                    'success' => false,
                    'error'   => 'The specified trip does not exist or is not in progress for this bus.',
                ], 422);
            }
            $tripId = $trip->id;
        }

        try {
            $incident = TripService::reportDelayIncident(
                driver:  $driver,
                bus:     $bus,
                reason:  $validated['reason'],
                details: $validated['details'] ?? null,
                tripId:  $tripId,
            );

            return response()->json([
                'success'  => true,
                'message'  => 'Delay/incident reported successfully.',
                'incident' => $incident->toArray(),
            ], 201);
        } catch (\InvalidArgumentException $e) {
            return response()->json([
                'success' => false,
                'error'   => $e->getMessage(),
            ], 422);
        }
    }
}
