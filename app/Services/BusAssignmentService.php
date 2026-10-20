<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\Bus;
use App\Models\Driver;
use Illuminate\Support\Facades\DB;

/**
 * Centralizes the bidirectional Driver ↔ Bus assignment flow and keeps the
 * bus operational status in sync with assignment state:
 *
 *  - a bus that (re)gains a driver becomes "active";
 *  - a bus whose driver is removed becomes "inactive".
 *
 * In-progress trips are protected: any change that would detach the driver of
 * a bus with an in_transit trip is rejected with a RuntimeException so the
 * driver's GPS submissions and trip-end flow keep working until the trip is
 * ended. GPS collection, route assignments and departure queue entries are
 * never touched here.
 */
class BusAssignmentService
{
    public const STATUS_ACTIVE = 'active';

    public const STATUS_INACTIVE = 'inactive';

    /**
     * Assign a driver to a bus (also used for reassignment).
     *
     * Handles both sides of the 1:1 relationship:
     *  - releases the driver's previous bus and marks it inactive;
     *  - releases the bus's previous driver;
     *  - assigns on both sides and marks the bus active.
     *
     * @throws \RuntimeException when the change would detach the driver of a
     *                           bus whose trip is in progress.
     */
    public static function assignDriver(Bus $bus, Driver $driver): void
    {
        DB::transaction(function () use ($bus, $driver) {
            $bus->refresh();
            $driver->refresh();

            $oldBus = $driver->bus_id !== null && $driver->bus_id !== $bus->id
                ? Bus::find($driver->bus_id)
                : null;

            $previousDriver = $bus->driver_id !== null && $bus->driver_id !== $driver->id
                ? Driver::find($bus->driver_id)
                : null;

            if ($oldBus !== null && $oldBus->currentTrip() !== null) {
                throw new \RuntimeException(
                    'This driver is currently on a bus with a trip in progress. End the trip before reassigning the driver.'
                );
            }

            if ($previousDriver !== null && $bus->currentTrip() !== null) {
                throw new \RuntimeException(
                    'This bus has a trip in progress. End the trip before changing its driver.'
                );
            }

            if ($oldBus !== null) {
                $oldBus->driver_id = null;
                $oldBus->status = self::STATUS_INACTIVE;
                $oldBus->save();
            }

            if ($previousDriver !== null) {
                $previousDriver->bus_id = null;
                $previousDriver->save();
            }

            $driver->bus_id = $bus->id;
            $driver->save();

            $bus->driver_id = $driver->id;
            $bus->status = self::STATUS_ACTIVE;
            $bus->save();
        });
    }

    /**
     * Remove the driver assignment from a bus and mark the bus inactive.
     * Returns the released driver (null when the bus had no driver).
     *
     * @throws \RuntimeException when the bus has a trip in progress.
     */
    public static function unassignDriver(Bus $bus): ?Driver
    {
        return DB::transaction(function () use ($bus) {
            $bus->refresh();

            if ($bus->driver_id === null) {
                return null;
            }

            if ($bus->currentTrip() !== null) {
                throw new \RuntimeException(
                    'This bus has a trip in progress. End the trip before unassigning the driver.'
                );
            }

            $driver = $bus->driver;

            $bus->driver_id = null;
            $bus->status = self::STATUS_INACTIVE;
            $bus->save();

            if ($driver !== null) {
                $driver->bus_id = null;
                $driver->save();
            }

            return $driver;
        });
    }

    /**
     * Release the bus assigned to a driver who is about to be deleted.
     * Marks the bus inactive only when it is truly left without a driver.
     * Returns the affected bus (null when the driver had no bus).
     *
     * @throws \RuntimeException when the bus has a trip in progress.
     */
    public static function releaseBusForDriverDeletion(Driver $driver): ?Bus
    {
        return DB::transaction(function () use ($driver) {
            $driver->refresh();

            if ($driver->bus_id === null) {
                return null;
            }

            $bus = Bus::find($driver->bus_id);

            if ($bus === null) {
                return null;
            }

            if ($bus->currentTrip() !== null) {
                throw new \RuntimeException(
                    'This driver is currently on a bus with a trip in progress. End the trip before deleting the driver.'
                );
            }

            if ($bus->driver_id === $driver->id) {
                $bus->driver_id = null;
                $bus->status = self::STATUS_INACTIVE;
                $bus->save();
            }

            $driver->bus_id = null;
            $driver->save();

            return $bus;
        });
    }
}
