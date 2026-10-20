<?php

declare(strict_types=1);

namespace App\Http\Controllers\Operator;

use App\Enums\DepartureQueueStatus;
use App\Http\Controllers\Controller;
use App\Models\Bus;
use App\Models\DepartureQueue;
use App\Services\DepartureQueueService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

class DepartureQueueController extends Controller
{
    /**
     * Display the departure queue (active + recent historical).
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

        $availableBuses = Bus::query()
            ->where('status', 'active')
            ->whereNotNull('driver_id')
            ->whereNotNull('route_id')
            ->with(['driver.user', 'route'])
            ->orderBy('bus_number')
            ->get()
            ->filter(fn(Bus $bus) => DepartureQueueService::canAddBus($bus))
            ->values()
            ->map(fn(Bus $bus) => [
                'id'          => $bus->id,
                'bus_number'  => $bus->bus_number,
                'plate_number'=> $bus->plate_number,
                'driver_name' => $bus->driver?->user?->name,
                'route_name'  => $bus->route?->name,
            ]);

        $readyStatuses = [
            DepartureQueueStatus::NOTIFIED->value,
            DepartureQueueStatus::ACKNOWLEDGED->value,
            DepartureQueueStatus::LOADING->value,
        ];

        $nextEntry = $active->first();

        $stats = [
            'waiting'        => $active->count(),
            'ready'          => $active
                ->whereIn('status', $readyStatuses)
                ->count(),
            'departed_today' => DepartureQueue::query()
                ->where('status', DepartureQueueStatus::DEPARTED->value)
                ->whereDate('departed_at', today())
                ->count(),
            'next_bus'       => $nextEntry === null
                ? null
                : [
                    'bus_number' => $nextEntry['bus_number'],
                    'status'     => $nextEntry['status'],
                ],
        ];

        return Inertia::render('operator/departure-queue', [
            'active'         => $active,
            'historical'     => $historical,
            'availableBuses' => $availableBuses,
            'stats'          => $stats,
        ]);
    }

    /**
     * Add a bus to the departure queue.
     */
    public function store(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'bus_id'   => ['required', 'exists:buses,id'],
            'position' => ['nullable', 'integer', 'min:1'],
        ]);

        $bus = Bus::findOrFail($validated['bus_id']);

        DepartureQueueService::addBus($bus, $validated['position'] ?? null);

        Inertia::flash('toast', [
            'type' => 'success',
            'message' => "Bus {$bus->bus_number} added to departure queue.",
        ]);

        return redirect()->route('operator.departureQueue');
    }

    /**
     * Promote a QUEUED entry to NEXT.
     */
    public function promote(DepartureQueue $entry): RedirectResponse
    {
        try {
            DepartureQueueService::promoteToNext($entry);
            Inertia::flash('toast', [
                'type' => 'success',
                'message' => "{$entry->bus->bus_number} promoted to NEXT.",
            ]);
            return redirect()->route('operator.departureQueue');
        } catch (\RuntimeException $e) {
            Inertia::flash('toast', [
                'type' => 'error',
                'message' => $e->getMessage(),
            ]);
            return redirect()->route('operator.departureQueue');
        }
    }

    /**
     * Notify the driver via dispatch alert (NEXT → NOTIFIED).
     */
    public function notify(DepartureQueue $entry): RedirectResponse
    {
        try {
            DepartureQueueService::notifyDriver($entry);
            Inertia::flash('toast', [
                'type' => 'success',
                'message' => "Dispatch notification sent to {$entry->bus->bus_number}.",
            ]);
            return redirect()->route('operator.departureQueue');
        } catch (\RuntimeException $e) {
            Inertia::flash('toast', [
                'type' => 'error',
                'message' => $e->getMessage(),
            ]);
            return redirect()->route('operator.departureQueue');
        }
    }

    /**
     * Mark loading started (ACKNOWLEDGED/NOTIFIED → LOADING).
     */
    public function markLoading(DepartureQueue $entry): RedirectResponse
    {
        try {
            DepartureQueueService::markLoading($entry);
            Inertia::flash('toast', [
                'type' => 'success',
                'message' => "Loading started for {$entry->bus->bus_number}.",
            ]);
            return redirect()->route('operator.departureQueue');
        } catch (\RuntimeException $e) {
            Inertia::flash('toast', [
                'type' => 'error',
                'message' => $e->getMessage(),
            ]);
            return redirect()->route('operator.departureQueue');
        }
    }

    /**
     * Mark departed (LOADING → DEPARTED) and advance queue.
     */
    public function markDeparted(DepartureQueue $entry): RedirectResponse
    {
        try {
            DepartureQueueService::markDeparted($entry);
            Inertia::flash('toast', [
                'type' => 'success',
                'message' => "{$entry->bus->bus_number} departed. Next bus promoted.",
            ]);
            return redirect()->route('operator.departureQueue');
        } catch (\RuntimeException $e) {
            Inertia::flash('toast', [
                'type' => 'error',
                'message' => $e->getMessage(),
            ]);
            return redirect()->route('operator.departureQueue');
        }
    }

    /**
     * Skip the entry (marks SKIPPED and advances queue).
     */
    public function skip(DepartureQueue $entry): RedirectResponse
    {
        try {
            DepartureQueueService::skip($entry);
            Inertia::flash('toast', [
                'type' => 'success',
                'message' => "{$entry->bus->bus_number} skipped. Next bus promoted.",
            ]);
            return redirect()->route('operator.departureQueue');
        } catch (\RuntimeException $e) {
            Inertia::flash('toast', [
                'type' => 'error',
                'message' => $e->getMessage(),
            ]);
            return redirect()->route('operator.departureQueue');
        }
    }

    /**
     * Reorder the queue: move entry to new position.
     */
    public function reorder(Request $request, DepartureQueue $entry): RedirectResponse
    {
        $validated = $request->validate([
            'position' => ['required', 'integer', 'min:1'],
        ]);

        try {
            DepartureQueueService::reorder($entry->id, $validated['position']);
            Inertia::flash('toast', [
                'type' => 'success',
                'message' => "Queue reordered. {$entry->bus->bus_number} moved to position {$validated['position']}.",
            ]);
            return redirect()->route('operator.departureQueue');
        } catch (\RuntimeException $e) {
            Inertia::flash('toast', [
                'type' => 'error',
                'message' => $e->getMessage(),
            ]);
            return redirect()->route('operator.departureQueue');
        }
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
