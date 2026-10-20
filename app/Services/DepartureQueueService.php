<?php

declare(strict_types=1);

namespace App\Services;

use App\Enums\AlertSeverity;
use App\Enums\AlertStatus;
use App\Enums\AlertType;
use App\Enums\DepartureQueueStatus;
use App\Models\Alert;
use App\Models\Bus;
use App\Models\Driver;
use App\Models\DepartureQueue;
use App\Models\Route;
use App\Models\Trip;
use Illuminate\Support\Facades\DB;

class DepartureQueueService
{
    /* ------------------------------------------------------------------ */
    /*  addBus                                                             */
    /* ------------------------------------------------------------------ */

    public static function addBus(Bus $bus, ?int $requestedPosition = null): DepartureQueue
    {
        return DB::transaction(function () use ($bus, $requestedPosition) {
            // 1. Bus must not already be in an active trip
            if ($bus->currentTrip() !== null) {
                throw new \RuntimeException(
                    'This bus already has an active trip and cannot be added to the departure queue.'
                );
            }

            // 2. Bus must not already have an active queue entry
            $existingActive = DepartureQueue::active()
                ->where('bus_id', $bus->id)
                ->first();

            if ($existingActive !== null) {
                throw new \RuntimeException(
                    'This bus already has an active departure queue entry.'
                );
            }

            // 3. Determine queue position: max active position + 1, or requested
            $maxPosition = DepartureQueue::active()->max('queue_position') ?? 0;
            $position = $requestedPosition !== null
                ? max($requestedPosition, 1)
                : ($maxPosition + 1);

            // 4. Capture snapshot of current assignment
            $driverId = $bus->driver_id;
            $routeId  = $bus->route_id;

            $entry = DepartureQueue::create([
                'bus_id'                => $bus->id,
                'driver_id'             => $driverId,
                'route_id'              => $routeId,
                'queue_position'        => $position,
                'status'                => DepartureQueueStatus::QUEUED,
            ]);

            return $entry->fresh(['bus', 'driver', 'route']);
        });
    }

    /* ------------------------------------------------------------------ */
    /*  promoteToNext                                                      */
    /* ------------------------------------------------------------------ */

    public static function promoteToNext(DepartureQueue $entry): DepartureQueue
    {
        return DB::transaction(function () use ($entry) {
            // Verify entry is active and currently QUEUED
            if (!$entry->isInActiveQueue()) {
                throw new \RuntimeException('This queue entry is not active.');
            }

            if ($entry->status !== DepartureQueueStatus::QUEUED) {
                throw new \RuntimeException(
                    'Only QUEUED entries can be promoted to NEXT.'
                );
            }

            // Demote the current NEXT entry, if any
            $currentNext = DepartureQueue::next()->first();
            if ($currentNext !== null && $currentNext->id !== $entry->id) {
                $currentNext->update([
                    'status' => DepartureQueueStatus::QUEUED,
                ]);
            }

            // Promote the selected entry
            $entry->update([
                'status' => DepartureQueueStatus::NEXT,
            ]);

            return $entry->fresh(['bus', 'driver', 'route']);
        });
    }

    /* ------------------------------------------------------------------ */
    /*  notifyDriver                                                       */
    /* ------------------------------------------------------------------ */

    public static function notifyDriver(DepartureQueue $entry): DepartureQueue
    {
        return DB::transaction(function () use ($entry) {
            // Must be NEXT
            if ($entry->status !== DepartureQueueStatus::NEXT) {
                throw new \RuntimeException(
                    'Only NEXT entries can be notified to the driver.'
                );
            }

            // Driver must exist
            if ($entry->driver === null) {
                throw new \RuntimeException(
                    'No driver is assigned to this queue entry.'
                );
            }

            // Prevent duplicate notification
            if ($entry->notified_at !== null) {
                throw new \RuntimeException(
                    'This queue entry has already been notified to the driver.'
                );
            }

            // Create dispatch alert
            $alert = Alert::create([
                'alertable_type' => DepartureQueue::class,
                'alertable_id'   => $entry->id,
                'type'           => AlertType::DISPATCH_NOTIFICATION->value,
                'title'          => 'Dispatch Notification',
                'message'        => 'Your bus ' . $entry->bus->bus_number
                    . ' is ready for departure. Please acknowledge to proceed.',
                'severity'       => AlertSeverity::INFO->value,
                'status'         => AlertStatus::NEW->value,
            ]);

            // Update queue entry
            $entry->update([
                'status'         => DepartureQueueStatus::NOTIFIED,
                'notified_at'    => now(),
            ]);

            $entry->load('alerts');

            return $entry->fresh(['bus', 'driver', 'route', 'alerts']);
        });
    }

    /* ------------------------------------------------------------------ */
    /*  acknowledgeByDriver                                                */
    /* ------------------------------------------------------------------ */

    public static function acknowledgeByDriver(
        DepartureQueue $entry,
        Driver $authenticatedDriver,
    ): DepartureQueue {
        return DB::transaction(function () use ($entry, $authenticatedDriver) {
            // Verify entry has a driver
            if ($entry->driver === null) {
                throw new \RuntimeException(
                    'No driver is assigned to this queue entry.'
                );
            }

            // Verify authenticated driver owns this queue entry
            if ($entry->driver->id !== $authenticatedDriver->id) {
                throw new \RuntimeException(
                    'You are not authorized to acknowledge this dispatch notification.'
                );
            }

            // Find the dispatch alert for this queue entry
            $alert = Alert::where('alertable_type', DepartureQueue::class)
                ->where('alertable_id', $entry->id)
                ->where('type', AlertType::DISPATCH_NOTIFICATION->value)
                ->where('status', AlertStatus::NEW->value)
                ->first();

            if ($alert === null) {
                throw new \RuntimeException(
                    'No pending dispatch notification found for this queue entry.'
                );
            }

            // Acknowledge the alert
            $alert->update([
                'status' => AlertStatus::ACKNOWLEDGED->value,
            ]);

            // Update queue entry
            $entry->update([
                'status'                   => DepartureQueueStatus::ACKNOWLEDGED,
                'driver_acknowledged_at'   => now(),
            ]);

            $entry->load('alerts');

            return $entry->fresh(['bus', 'driver', 'route', 'alerts']);
        });
    }

    /* ------------------------------------------------------------------ */
    /*  markLoading                                                        */
    /* ------------------------------------------------------------------ */

    public static function markLoading(DepartureQueue $entry): DepartureQueue
    {
        return DB::transaction(function () use ($entry) {
            // Allowed from ACKNOWLEDGED or NOTIFIED
            $allowed = [
                DepartureQueueStatus::ACKNOWLEDGED->value,
                DepartureQueueStatus::NOTIFIED->value,
            ];

            if (!in_array($entry->status->value, $allowed, true)) {
                throw new \RuntimeException(
                    'Loading can only be marked for ACKNOWLEDGED or NOTIFIED entries.'
                );
            }

            if ($entry->loading_started_at !== null) {
                throw new \RuntimeException(
                    'Loading has already been started for this queue entry.'
                );
            }

            $entry->update([
                'status'               => DepartureQueueStatus::LOADING,
                'loading_started_at'   => now(),
            ]);

            return $entry->fresh(['bus', 'driver', 'route']);
        });
    }

    /* ------------------------------------------------------------------ */
    /*  markDeparted                                                       */
    /* ------------------------------------------------------------------ */

    public static function markDeparted(DepartureQueue $entry): DepartureQueue
    {
        return DB::transaction(function () use ($entry) {
            // Must be LOADING, ACKNOWLEDGED, or NOTIFIED
            $allowed = [
                DepartureQueueStatus::LOADING->value,
                DepartureQueueStatus::ACKNOWLEDGED->value,
                DepartureQueueStatus::NOTIFIED->value,
            ];

            if (!in_array($entry->status->value, $allowed, true)) {
                throw new \RuntimeException(
                    'Departure can only be marked for LOADING, ACKNOWLEDGED, or NOTIFIED entries.'
                );
            }

            // Mark as departed
            $entry->update([
                'status'        => DepartureQueueStatus::DEPARTED,
                'departed_at'   => now(),
                'queue_position' => 0,
            ]);

            // Advance the queue
            self::advanceQueue();

            return $entry->fresh(['bus', 'driver', 'route']);
        });
    }

    /* ------------------------------------------------------------------ */
    /*  skip                                                               */
    /* ------------------------------------------------------------------ */

    public static function skip(DepartureQueue $entry): DepartureQueue
    {
        return DB::transaction(function () use ($entry) {
            // Must be active
            if (!$entry->isInActiveQueue()) {
                throw new \RuntimeException('This queue entry is not active.');
            }

            // Skip the entry
            $entry->update([
                'status'         => DepartureQueueStatus::SKIPPED,
                'queue_position' => 0,
            ]);

            // Advance the queue
            self::advanceQueue();

            return $entry->fresh(['bus', 'driver', 'route']);
        });
    }

    /* ------------------------------------------------------------------ */
    /*  reorder                                                            */
    /* ------------------------------------------------------------------ */

    public static function reorder(int $entryId, int $newPosition): DepartureQueue
    {
        return DB::transaction(function () use ($entryId, $newPosition) {
            $entry = DepartureQueue::active()->find($entryId);

            if ($entry === null) {
                throw new \RuntimeException('Active queue entry not found.');
            }

            if ($newPosition < 1) {
                throw new \RuntimeException('Position must be at least 1.');
            }

            // Get all active entries ordered by position
            $activeEntries = DepartureQueue::active()
                ->ordered()
                ->get();

            // Remove the entry being moved from the list
            $otherEntries = $activeEntries->reject(fn($e) => $e->id === $entry->id);

            // Ensure no duplicate positions after reordering
            $newPositions = [];
            foreach ($otherEntries as $index => $other) {
                $newPositions[$other->id] = $index + 1;
            }
            $newPositions[$entry->id] = $newPosition;

            // Renumber sequentially starting from 1
            $sorted = $otherEntries->sortBy(fn($e) => $e->queue_position);
            $renumbered = [];
            $position = 1;
            foreach ($sorted as $other) {
                $renumbered[$other->id] = $position++;
            }

            // Insert the moved entry at its new position
            $final = [];
            foreach ($renumbered as $id => $pos) {
                if ($pos < $newPosition) {
                    $final[$id] = $pos;
                } else {
                    $final[$id] = $pos + 1;
                }
            }
            $final[$entry->id] = $newPosition;

            // Normalize: ensure no gaps and sequential positions
            // Sort by desired position THEN by id to preserve intended ordering
            $sortedEntries = [];
            foreach ($final as $id => $desiredPos) {
                $sortedEntries[] = ['id' => $id, 'desired' => $desiredPos];
            }
            // Sort: first by desired position, then by id for ties
            usort($sortedEntries, function ($a, $b) {
                if ($a['desired'] !== $b['desired']) {
                    return $a['desired'] <=> $b['desired'];
                }
                return $a['id'] <=> $b['id'];
            });

            $normalized = [];
            $currentPos = 1;
            foreach ($sortedEntries as $item) {
                $normalized[$item['id']] = $currentPos++;
            }

            // Apply updates in bulk
            foreach ($normalized as $id => $pos) {
                DepartureQueue::where('id', $id)
                    ->where('status', '!=', DepartureQueueStatus::DEPARTED->value)
                    ->where('status', '!=', DepartureQueueStatus::SKIPPED->value)
                    ->update(['queue_position' => $pos]);
            }

            return $entry->fresh(['bus', 'driver', 'route']);
        });
    }

    /* ------------------------------------------------------------------ */
    /*  advanceQueue                                                       */
    /* ------------------------------------------------------------------ */

    public static function advanceQueue(): void
    {
        DB::transaction(function () {
            // Find the lowest-position QUEUED entry
            $nextInLine = DepartureQueue::where('status', DepartureQueueStatus::QUEUED->value)
                ->active()
                ->orderBy('queue_position', 'asc')
                ->orderBy('id', 'asc')
                ->first();

            if ($nextInLine !== null) {
                $nextInLine->update([
                    'status' => DepartureQueueStatus::NEXT,
                ]);
            }
        });
    }

    /* ------------------------------------------------------------------ */
    /*  Helpers                                                            */
    /* ------------------------------------------------------------------ */

    public static function canAddBus(Bus $bus): bool
    {
        if ($bus->currentTrip() !== null) {
            return false;
        }

        $existingActive = DepartureQueue::active()
            ->where('bus_id', $bus->id)
            ->exists();

        return !$existingActive;
    }
}
