<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\DepartureQueue;
use Inertia\Inertia;
use Inertia\Response;

class DepartureQueueController extends Controller
{
    /**
     * Display the departure queue (read-only for Admin).
     *
     * Admin sees the same data as Operator but cannot mutate.
     */
    public function index(): Response
    {
        $active = DepartureQueue::active()
            ->with(['bus.driver.user', 'route'])
            ->orderBy('queue_position')
            ->orderBy('id')
            ->get()
            ->map(fn($e) => $this->formatEntry($e));

        $historical = DepartureQueue::historical()
            ->with(['bus.driver.user', 'route'])
            ->orderByDesc('departed_at')
            ->orderByDesc('created_at')
            ->limit(20)
            ->get()
            ->map(fn($e) => $this->formatEntry($e));

        return Inertia::render('admin/departure-queue', [
            'active'     => $active,
            'historical' => $historical,
        ]);
    }

    /**
     * Format a DepartureQueue entry for Inertia props.
     */
    private function formatEntry(DepartureQueue $entry): array
    {
        return [
            'id'                       => $entry->id,
            'queue_position'           => $entry->queue_position,
            'status'                   => $entry->status->value,
            'bus_number'               => $entry->bus?->bus_number,
            'notified_at'              => $entry->notified_at?->toIso8601String(),
            'driver_acknowledged_at'   => $entry->driver_acknowledged_at?->toIso8601String(),
            'loading_started_at'       => $entry->loading_started_at?->toIso8601String(),
            'departed_at'              => $entry->departed_at?->toIso8601String(),
            'created_at'               => $entry->created_at?->toIso8601String(),
            'bus'                      => [
                'id'          => $entry->bus_id,
                'bus_number'  => $entry->bus?->bus_number,
                'plate_number'=> $entry->bus?->plate_number,
            ],
            'driver'                   => [
                'id'    => $entry->driver_id,
                'name'  => $entry->driver?->user?->name,
            ],
            'route'                    => [
                'id'          => $entry->route_id,
                'name'        => $entry->route?->name,
                'destination' => $entry->route?->destination,
            ],
        ];
    }
}
