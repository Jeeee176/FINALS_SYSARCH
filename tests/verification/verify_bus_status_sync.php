<?php

declare(strict_types=1);

require __DIR__ . '/../../vendor/autoload.php';

// ── DATABASE SAFETY BARRIER ───────────────────────────────────────────────
// Read .env directly (before Laravel bootstrap) to check DB_DATABASE.
$envFile = __DIR__ . '/../../.env';
$appDb = null;
if (file_exists($envFile)) {
    $envLines = file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($envLines as $line) {
        if (str_starts_with(trim($line), 'DB_DATABASE=')) {
            $appDb = trim(substr($line, strlen('DB_DATABASE=')));
            break;
        }
    }
}

// When .env points at bus_tracking, run against the dedicated test database
// (mysql_test → bus_tracking_test) instead. Never touch production data.
$useTestConnection = ($appDb === 'bus_tracking');

// ── END SAFETY BARRIER ────────────────────────────────────────────────────

$app = require_once __DIR__ . '/../../bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

if ($useTestConnection) {
    $app->make('config')->set('database.default', 'mysql_test');
    echo "  [Info] Using dedicated test connection (mysql_test → bus_tracking_test)\n\n";
} else {
    echo '  [Info] Using .env database: ' . env('DB_DATABASE') . "\n\n";
}

use App\Enums\Role;
use App\Enums\TripStatus;
use App\Http\Controllers\Admin\BusController;
use App\Models\Bus;
use App\Models\DepartureQueue;
use App\Models\Driver;
use App\Models\Location;
use App\Models\Route as RouteModel;
use App\Models\Trip;
use App\Models\User;
use App\Services\BusAssignmentService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

echo "=== Bus Assignment → Active/Inactive Status Sync — Verification ===\n\n";

$GLOBALS['CREATED_BUSES'] = [];
$GLOBALS['CREATED_DRIVERS'] = [];
$GLOBALS['CREATED_USERS'] = [];
$results = [];
$pass = 0;
$fail = 0;

function T(string $label, callable $check): void
{
    global $results, $pass, $fail;
    try {
        $result = $check();
        if ($result === true) {
            $pass++;
            echo "  ✓ {$label}\n";
        } else {
            $fail++;
            echo "  ✗ {$label}" . (is_string($result) ? " — {$result}" : '') . "\n";
        }
        $results[$label] = ($result === true);
    } catch (\Throwable $e) {
        $fail++;
        echo "  ✗ {$label} — {$e->getMessage()}\n";
        $results[$label] = false;
    }
}

function mkUser(string $suffix): User
{
    $user = User::create([
        'name' => "BusSync Test {$suffix}",
        'email' => "bus-sync-{$suffix}-" . substr(md5((string) mt_rand()), 0, 6) . '@example.com',
        'password' => bcrypt('password'),
        'role' => Role::DRIVER,
    ]);
    $GLOBALS['CREATED_USERS'][] = $user;
    return $user;
}

function mkDriver(string $suffix, ?Bus $bus = null): Driver
{
    $user = mkUser($suffix);
    $driver = Driver::create([
        'user_id' => $user->id,
        'license_number' => "BS-LIC-{$suffix}-" . substr(md5((string) mt_rand()), 0, 6),
        'license_expiry' => now()->addYear()->toDateString(),
        'phone' => '555-0000',
        'address' => 'Test Addr',
        'status' => 'active',
    ]);
    if ($bus !== null) {
        $driver->bus_id = $bus->id;
        $driver->save();
        $bus->driver_id = $driver->id;
        $bus->save();
    }
    $GLOBALS['CREATED_DRIVERS'][] = $driver->fresh();
    return $driver->fresh();
}

function mkBus(string $suffix, ?int $routeId = null, string $status = 'active'): Bus
{
    $bus = Bus::create([
        'bus_number' => "BS-BUS-{$suffix}-" . substr(md5((string) mt_rand()), 0, 6),
        'plate_number' => "BS-PLT-{$suffix}-" . substr(md5((string) mt_rand()), 0, 6),
        'model' => 'TestBus',
        'capacity' => 20,
        'status' => $status,
        'route_id' => $routeId,
    ]);
    $GLOBALS['CREATED_BUSES'][] = $bus;
    return $bus;
}

function mkTrip(Bus $bus, string $status = 'in_transit'): Trip
{
    return Trip::create([
        'bus_id' => $bus->id,
        'route_id' => $bus->route_id,
        'driver_id' => $bus->driver_id,
        'status' => $status,
        'started_at' => now(),
    ]);
}

// ── Snapshot pre-existing data to prove nothing is mass-changed ──────────
$initialBuses = DB::table('buses')->get(['id', 'status', 'driver_id'])->keyBy('id');
$initialDrivers = DB::table('drivers')->get(['id', 'bus_id'])->keyBy('id');

$route = RouteModel::firstWhere('status', 'active') ?: RouteModel::first();
$routeId = $route?->id;
$suffix = substr(md5((string) time()), 0, 6);

// ── 1. Route protection (authorization preserved) ────────────────────────

$router = $app->make('router');
$routesByName = [];
foreach ($router->getRoutes() as $registered) {
    if ($registered->getName()) {
        $routesByName[$registered->getName()] = $registered;
    }
}

T('1. assign-driver route keeps auth+verified+role:admin middleware', function () use ($routesByName) {
    $r = $routesByName['admin.buses.assignDriver'] ?? null;
    if ($r === null) return 'route missing';
    $mw = $r->gatherMiddleware();
    return in_array('auth', $mw, true) && in_array('verified', $mw, true) && in_array('role:admin', $mw, true);
});

T('2. unassign-driver route keeps auth+verified+role:admin middleware', function () use ($routesByName) {
    $r = $routesByName['admin.buses.unassignDriver'] ?? null;
    if ($r === null) return 'route missing';
    $mw = $r->gatherMiddleware();
    return in_array('auth', $mw, true) && in_array('verified', $mw, true) && in_array('role:admin', $mw, true);
});

T('3. admin.buses resource routes keep auth+verified+role:admin middleware', function () use ($routesByName) {
    foreach (['admin.buses.index', 'admin.buses.store', 'admin.buses.update', 'admin.buses.destroy'] as $name) {
        $r = $routesByName[$name] ?? null;
        if ($r === null) return "{$name} missing";
        $mw = $r->gatherMiddleware();
        if (!in_array('role:admin', $mw, true)) return "{$name} missing role:admin";
    }
    return true;
});

// ── 4-6. Core automatic status rule ──────────────────────────────────────

T('4. assignDriver() links both sides and sets bus Active', function () use ($suffix, $routeId) {
    $bus = mkBus("{$suffix}-a1", $routeId, 'inactive');
    $driver = mkDriver("{$suffix}-a1");

    BusAssignmentService::assignDriver($bus, $driver);

    $bus = $bus->fresh();
    $driver = $driver->fresh();

    return $bus->driver_id === $driver->id
        && $driver->bus_id === $bus->id
        && $bus->status === 'active';
});

T('5. unassignDriver() clears both sides and sets bus Inactive', function () use ($suffix, $routeId) {
    $bus = mkBus("{$suffix}-a2", $routeId, 'active');
    $driver = mkDriver("{$suffix}-a2", $bus);

    $released = BusAssignmentService::unassignDriver($bus);

    $bus = $bus->fresh();
    $driver = $driver->fresh();

    return $released !== null
        && $released->id === $driver->id
        && $bus->driver_id === null
        && $bus->status === 'inactive'
        && $driver->bus_id === null;
});

T('6. unassignDriver() on an unassigned bus is a safe no-op', function () use ($suffix, $routeId) {
    $bus = mkBus("{$suffix}-a3", $routeId, 'active');

    $released = BusAssignmentService::unassignDriver($bus);

    return $released === null && $bus->fresh()->driver_id === null;
});

// ── 7-8. Reassignment consistency ────────────────────────────────────────

T('7. reassignment releases driver\'s old bus and sets it Inactive', function () use ($suffix, $routeId) {
    $oldBus = mkBus("{$suffix}-r1o", $routeId, 'active');
    $newBus = mkBus("{$suffix}-r1n", $routeId, 'inactive');
    $driver = mkDriver("{$suffix}-r1", $oldBus);

    BusAssignmentService::assignDriver($newBus, $driver);

    $oldBus = $oldBus->fresh();
    $newBus = $newBus->fresh();
    $driver = $driver->fresh();

    return $oldBus->driver_id === null
        && $oldBus->status === 'inactive'
        && $newBus->driver_id === $driver->id
        && $newBus->status === 'active'
        && $driver->bus_id === $newBus->id;
});

T('8. replacing a bus\'s driver releases the previous driver', function () use ($suffix, $routeId) {
    $bus = mkBus("{$suffix}-r2", $routeId, 'active');
    $oldDriver = mkDriver("{$suffix}-r2old", $bus);
    $newDriver = mkDriver("{$suffix}-r2new");

    BusAssignmentService::assignDriver($bus, $newDriver);

    $bus = $bus->fresh();

    return $bus->driver_id === $newDriver->id
        && $bus->status === 'active'
        && $oldDriver->fresh()->bus_id === null
        && $newDriver->fresh()->bus_id === $bus->id;
});

// ── 9-11. Ongoing-trip protection ────────────────────────────────────────

T('9. unassign is blocked while the bus trip is in progress (state unchanged)', function () use ($suffix, $routeId) {
    $bus = mkBus("{$suffix}-g1", $routeId, 'active');
    $driver = mkDriver("{$suffix}-g1", $bus);
    mkTrip($bus);

    try {
        BusAssignmentService::unassignDriver($bus);
        return 'no exception thrown';
    } catch (\RuntimeException $e) {
        $blocked = str_contains($e->getMessage(), 'trip in progress');
        $bus = $bus->fresh();
        $driver = $driver->fresh();
        return $blocked
            && $bus->driver_id === $driver->id
            && $bus->status === 'active'
            && $driver->bus_id === $bus->id
            ? true
            : 'blocked but state changed';
    }
});

T('10. changing a tripping bus\'s driver is blocked (state unchanged)', function () use ($suffix, $routeId) {
    $bus = mkBus("{$suffix}-g2", $routeId, 'active');
    $currentDriver = mkDriver("{$suffix}-g2cur", $bus);
    $otherDriver = mkDriver("{$suffix}-g2new");
    mkTrip($bus);

    try {
        BusAssignmentService::assignDriver($bus, $otherDriver);
        return 'no exception thrown';
    } catch (\RuntimeException $e) {
        $bus = $bus->fresh();
        return str_contains($e->getMessage(), 'trip in progress')
            && $bus->driver_id === $currentDriver->id
            && $otherDriver->fresh()->bus_id === null
            ? true
            : 'blocked but state changed';
    }
});

T('11. moving a driver off a tripping bus is blocked (state unchanged)', function () use ($suffix, $routeId) {
    $trippingBus = mkBus("{$suffix}-g3t", $routeId, 'active');
    $freeBus = mkBus("{$suffix}-g3f", $routeId, 'inactive');
    $driver = mkDriver("{$suffix}-g3", $trippingBus);
    mkTrip($trippingBus);

    try {
        BusAssignmentService::assignDriver($freeBus, $driver);
        return 'no exception thrown';
    } catch (\RuntimeException $e) {
        return str_contains($e->getMessage(), 'trip in progress')
            && $trippingBus->fresh()->driver_id === $driver->id
            && $driver->fresh()->bus_id === $trippingBus->id
            && $freeBus->fresh()->driver_id === null
            ? true
            : 'blocked but state changed';
    }
});

T('12. assigning to a driverless tripping bus stays allowed (repair case)', function () use ($suffix, $routeId) {
    $bus = mkBus("{$suffix}-g4", $routeId, 'inactive');
    mkTrip($bus);
    $driver = mkDriver("{$suffix}-g4");

    BusAssignmentService::assignDriver($bus, $driver);

    $bus = $bus->fresh();

    return $bus->driver_id === $driver->id && $bus->status === 'active';
});

// ── 13-15. Deletion paths ────────────────────────────────────────────────

T('13. destroy() refuses to delete a bus with a trip in progress', function () use ($suffix, $routeId) {
    $bus = mkBus("{$suffix}-d1", $routeId, 'active');
    mkDriver("{$suffix}-d1", $bus);
    mkTrip($bus);

    (new BusController())->destroy($bus);

    return Bus::find($bus->id) !== null ? true : 'bus was deleted';
});

T('14. destroy() deletes an assigned bus and releases its driver', function () use ($suffix, $routeId) {
    $bus = mkBus("{$suffix}-d2", $routeId, 'active');
    $driver = mkDriver("{$suffix}-d2", $bus);

    (new BusController())->destroy($bus);

    return Bus::find($bus->id) === null && $driver->fresh()->bus_id === null;
});

T('15. driver deletion releases the bus and sets it Inactive', function () use ($suffix, $routeId) {
    $bus = mkBus("{$suffix}-d3", $routeId, 'active');
    $driver = mkDriver("{$suffix}-d3", $bus);

    BusAssignmentService::releaseBusForDriverDeletion($driver);

    $bus = $bus->fresh();

    return $bus->driver_id === null
        && $bus->status === 'inactive'
        && $driver->fresh()->bus_id === null;
});

T('16. driver deletion is blocked while their bus trip is in progress', function () use ($suffix, $routeId) {
    $bus = mkBus("{$suffix}-d4", $routeId, 'active');
    $driver = mkDriver("{$suffix}-d4", $bus);
    mkTrip($bus);

    try {
        BusAssignmentService::releaseBusForDriverDeletion($driver);
        return 'no exception thrown';
    } catch (\RuntimeException $e) {
        return str_contains($e->getMessage(), 'trip in progress')
            && $bus->fresh()->driver_id === $driver->id
            ? true
            : 'blocked but state changed';
    }
});

// ── 17-20. Untouched subsystems ──────────────────────────────────────────

T('17. departure queue entries survive unassignment (snapshot preserved)', function () use ($suffix, $routeId) {
    $bus = mkBus("{$suffix}-q1", $routeId, 'active');
    $driver = mkDriver("{$suffix}-q1", $bus);

    $entry = DepartureQueue::create([
        'bus_id' => $bus->id,
        'driver_id' => $driver->id,
        'route_id' => $routeId,
        'queue_position' => 99,
        'status' => 'queued',
    ]);

    BusAssignmentService::unassignDriver($bus);

    $entry = $entry->fresh();

    return $entry !== null
        && $entry->status->value === 'queued'
        && $entry->driver_id === $driver->id
        && $entry->bus_id === $bus->id;
});

T('18. GPS records and live-tracking payload are unaffected by status change', function () use ($suffix, $routeId) {
    $bus = mkBus("{$suffix}-gps", $routeId, 'active');
    $driver = mkDriver("{$suffix}-gps", $bus);

    $location = Location::create([
        'bus_id' => $bus->id,
        'latitude' => 14.5995,
        'longitude' => 120.9842,
        'recorded_at' => now(),
    ]);

    BusAssignmentService::unassignDriver($bus);

    if (Location::find($location->id) === null) {
        return 'location row was removed';
    }

    $payload = (new \App\Http\Controllers\Api\LocationController())->indexLatest()->getData(true);
    $entry = collect($payload['buses'] ?? [])->firstWhere('id', $bus->id);

    return $entry !== null
        && $entry['location'] !== null
        && $entry['location']['latitude'] == 14.5995
        && $entry['status'] === 'inactive'
        ? true
        : 'bus missing from tracking payload or location lost';
});

T('19. route assignment is preserved across status changes', function () use ($suffix, $routeId) {
    $bus = mkBus("{$suffix}-rt", $routeId, 'active');
    $driver = mkDriver("{$suffix}-rt", $bus);

    BusAssignmentService::unassignDriver($bus);

    return $bus->fresh()->route_id === $routeId ? true : 'route_id changed';
});

T('20. pre-existing buses and drivers were not mass-changed', function () use ($initialBuses, $initialDrivers) {
    $nowBuses = DB::table('buses')->get(['id', 'status', 'driver_id'])->keyBy('id');
    $nowDrivers = DB::table('drivers')->get(['id', 'bus_id'])->keyBy('id');

    foreach ($initialBuses as $id => $before) {
        $after = $nowBuses[$id] ?? null;
        if ($after === null) return "bus {$id} disappeared";
        if ($after->status !== $before->status || $after->driver_id !== $before->driver_id) {
            return "bus {$id} changed (status {$before->status} → {$after->status})";
        }
    }

    foreach ($initialDrivers as $id => $before) {
        $after = $nowDrivers[$id] ?? null;
        if ($after === null) return "driver {$id} disappeared";
        if ($after->bus_id !== $before->bus_id) {
            return "driver {$id} bus_id changed";
        }
    }

    return true;
});

// ── SUMMARY + CRASH-SAFE CLEANUP ─────────────────────────────────────────

$total = $pass + $fail;
echo "\n=== SUMMARY ===\n";
echo "Passed: {$pass}/{$total}\n";
echo "Failed: {$fail}\n";

register_shutdown_function(function () {
    global $fail, $results;

    // Delete trips first (they cascade-delete with the bus, but explicit is safer).
    foreach ($GLOBALS['CREATED_BUSES'] as $bus) {
        try {
            Trip::where('bus_id', $bus->id)->delete();
            Location::where('bus_id', $bus->id)->delete();
            DepartureQueue::where('bus_id', $bus->id)->delete();
        } catch (\Throwable $e) {
            fwrite(STDERR, "  Warning: cleanup (children) failed: {$e->getMessage()}\n");
        }
    }

    // Query-builder updates: stale Eloquent snapshots are not "dirty" when the
    // stored value equals the snapshot, which would make save() a no-op.
    foreach ($GLOBALS['CREATED_DRIVERS'] as $driver) {
        try {
            DB::table('drivers')->where('id', $driver->id)->update(['bus_id' => null]);
        } catch (\Throwable $e) {
            fwrite(STDERR, "  Warning: cleanup (driver) failed: {$e->getMessage()}\n");
        }
    }

    foreach ($GLOBALS['CREATED_BUSES'] as $bus) {
        try {
            DB::table('buses')->where('id', $bus->id)->update(['driver_id' => null]);
            Bus::where('id', $bus->id)->delete();
        } catch (\Throwable $e) {
            fwrite(STDERR, "  Warning: cleanup (bus) failed: {$e->getMessage()}\n");
        }
    }

    foreach ($GLOBALS['CREATED_DRIVERS'] as $driver) {
        try {
            $driver->fresh()?->delete();
        } catch (\Throwable $e) {
            fwrite(STDERR, "  Warning: cleanup (driver delete) failed: {$e->getMessage()}\n");
        }
    }

    foreach ($GLOBALS['CREATED_USERS'] as $user) {
        try {
            $user->delete();
        } catch (\Throwable $e) {
            fwrite(STDERR, "  Warning: cleanup (user) failed: {$e->getMessage()}\n");
        }
    }

    if ($fail > 0) {
        echo "\nFailed tests:\n";
        foreach ($results as $label => $ok) {
            if (!$ok) echo "  - {$label}\n";
        }
        exit(1);
    }
    echo "\nAll bus status-sync tests passed.\n";
    exit(0);
});
