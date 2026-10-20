<?php

declare(strict_types=1);

namespace App\Http\Controllers\Driver;

use App\Http\Controllers\Controller;
use App\Models\Driver;
use App\Models\DepartureQueue;
use App\Services\DepartureQueueService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class DepartureQueueController extends Controller
{
    /**
     * Display dispatch notification(s) for the authenticated driver.
     *
     * Only shows entries where this driver is the assigned driver.
     */
    public function index(): Response
    {
        /** @var Driver $driver */
        $driver = auth()->user()->driver;

        if ($driver === null) {
            return Inertia::render('driver/departure-queue', [
                'dispatch' => null,
                'message'  => 'No driver profile found.',
            ]);
        }

        $entry = DepartureQueue::active()
            ->where('driver_id', $driver->id)
            ->with(['bus', 'route'])
            ->first();

        $dispatch = $entry !== null
            ? [
                'id'                     => $entry->id,
                'queue_position'         => $entry->queue_position,
                'status'                 => $entry->status->value,
                'notified_at'            => $entry->notified_at?->toIso8601String(),
                'driver_acknowledged_at' => $entry->driver_acknowledged_at?->toIso8601String(),
                'loading_started_at'     => $entry->loading_started_at?->toIso8601String(),
                'departed_at'            => $entry->departed_at?->toIso8601String(),
                'bus'                    => [
                    'id'          => $entry->bus_id,
                    'bus_number'  => $entry->bus?->bus_number,
                    'plate_number'=> $entry->bus?->plate_number,
                ],
                'route'                  => [
                    'id'          => $entry->route_id,
                    'name'        => $entry->route?->name,
                    'destination' => $entry->route?->destination,
                ],
            ]
            : null;

        return Inertia::render('driver/departure-queue', [
            'dispatch' => $dispatch,
        ]);
    }

    /**
     * Acknowledge the driver's own dispatch notification.
     *
     * POST /driver/departure-queue/{entry}/acknowledge
     * Requires authenticated driver whose id matches the queue entry's driver_id.
     */
    public function acknowledge(Request $request, DepartureQueue $entry): RedirectResponse
    {
        $driver = auth()->user()->driver;

        if ($driver === null) {
            return redirect()->route('driver.departureQueue')
                ->with('error', 'No driver profile found.');
        }

        try {
            DepartureQueueService::acknowledgeByDriver($entry, $driver);
            return redirect()->route('driver.departureQueue')
                ->with('success', 'Dispatch notification acknowledged.');
        } catch (\RuntimeException $e) {
            return redirect()->route('driver.departureQueue')
                ->with('error', $e->getMessage());
        }
    }
}
