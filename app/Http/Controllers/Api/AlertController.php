<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Alert;
use App\Models\Trip;
use App\Models\DelayIncident;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class AlertController extends Controller
{
    /**
     * GET /api/alerts
     *
     * List active alerts (new + acknowledged) for Admin and Operator.
     *
     * Query params:
     *   status  = new|acknowledged|resolved|active (default: active)
     *   per_page = int (default: 20, max: 100)
     */
    public function index(Request $request): JsonResponse
    {
        $user = Auth::user();

        if ($user === null) {
            return response()->json([
                'success' => false,
                'error'   => 'Unauthenticated',
            ], 401);
        }

        if (!in_array($user->role->value, ['admin', 'operator'], true)) {
            return response()->json([
                'success' => false,
                'error'   => 'Forbidden',
            ], 403);
        }

        $status  = $request->query->get('status', 'active');
        $perPage = min((int) $request->query->get('per_page', 20), 100);

        $allowed = ['new', 'acknowledged', 'resolved', 'active'];
        if (!in_array($status, $allowed, true)) {
            $status = 'active';
        }

        $query = Alert::with(['alertable.bus', 'alertable.driver.user'])
            ->orderByDesc('created_at');

        if ($status === 'active') {
            $query->active();
        } else {
            $query->where('status', $status);
        }

        $alerts = $query->paginate($perPage);

        return response()->json([
            'success' => true,
            'data'    => $alerts->items(),
            'meta'    => [
                'current_page' => $alerts->currentPage(),
                'per_page'     => $alerts->perPage(),
                'total'        => $alerts->total(),
                'last_page'    => $alerts->lastPage(),
            ],
        ]);
    }

    /**
     * PATCH /api/alerts/{alert}/acknowledge
     *
     * Acknowledge a new alert (Admin / Operator only).
     */
    public function acknowledge(Request $request, Alert $alert): JsonResponse
    {
        $user = Auth::user();

        if ($user === null) {
            return response()->json([
                'success' => false,
                'error'   => 'Unauthenticated',
            ], 401);
        }

        if (!in_array($user->role->value, ['admin', 'operator'], true)) {
            return response()->json([
                'success' => false,
                'error'   => 'Forbidden',
            ], 403);
        }

        try {
            $alert = \App\Services\TripService::acknowledgeAlert($alert);

            return response()->json([
                'success' => true,
                'message' => 'Alert acknowledged.',
                'data'    => $alert->toArray(),
            ]);
        } catch (\RuntimeException $e) {
            return response()->json([
                'success' => false,
                'error'   => $e->getMessage(),
            ], 422);
        }
    }

    /**
     * PATCH /api/alerts/{alert}/resolve
     *
     * Resolve an acknowledged alert (Admin / Operator only).
     */
    public function resolve(Request $request, Alert $alert): JsonResponse
    {
        $user = Auth::user();

        if ($user === null) {
            return response()->json([
                'success' => false,
                'error'   => 'Unauthenticated',
            ], 401);
        }

        if (!in_array($user->role->value, ['admin', 'operator'], true)) {
            return response()->json([
                'success' => false,
                'error'   => 'Forbidden',
            ], 403);
        }

        try {
            $alert = \App\Services\TripService::resolveAlert($alert);

            return response()->json([
                'success' => true,
                'message' => 'Alert resolved.',
                'data'    => $alert->toArray(),
            ]);
        } catch (\RuntimeException $e) {
            return response()->json([
                'success' => false,
                'error'   => $e->getMessage(),
            ], 422);
        }
    }

    /**
     * Simple helper to serialize an Alert with a typed alertable payload.
     */
    private function serializeAlert(Alert $alert): array
    {
        $alertable = $alert->alertable;

        $payload = null;
        if ($alertable instanceof Trip) {
            $payload = [
                'type'         => 'trip',
                'id'           => $alertable->id,
                'status'       => $alertable->status?->value ?? $alertable->status,
                'bus_number'   => $alertable->bus?->bus_number ?? null,
                'plate_number' => $alertable->bus?->plate_number ?? null,
                'route_name'   => $alertable->route?->name ?? null,
                'driver_name'  => $alertable->driver?->user?->name ?? null,
                'started_at'   => $alertable->started_at?->toIso8601String(),
                'ended_at'     => $alertable->ended_at?->toIso8601String(),
            ];
        } elseif ($alertable instanceof DelayIncident) {
            $payload = [
                'type'       => 'delay_incident',
                'id'         => $alertable->id,
                'status'     => $alertable->status?->value ?? $alertable->status,
                'reason'     => $alertable->reason,
                'details'    => $alertable->details,
                'bus_number' => $alertable->bus?->bus_number ?? null,
                'plate_number' => $alertable->bus?->plate_number ?? null,
                'driver_name'  => $alertable->driver?->user?->name ?? null,
                'reported_at' => $alertable->reported_at?->toIso8601String(),
            ];
        }

        return [
            'id'             => $alert->id,
            'type'           => $alert->type?->value ?? $alert->type,
            'title'          => $alert->title,
            'message'        => $alert->message,
            'severity'       => $alert->severity?->value ?? $alert->severity,
            'status'         => $alert->status?->value ?? $alert->status,
            'created_at'     => $alert->created_at?->toIso8601String(),
            'alertable_type' => $alert->alertable_type,
            'alertable_id'   => $alert->alertable_id,
            'alertable'      => $payload,
        ];
    }
}
