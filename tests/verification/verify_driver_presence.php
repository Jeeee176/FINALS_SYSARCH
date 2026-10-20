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
use App\Models\Bus;
use App\Models\DepartureQueue;
use App\Models\Driver;
use App\Models\Location;
use App\Models\Route as RouteModel;
use App\Models\Trip;
use App\Models\User;
use App\Services\DriverPresenceService;
use Illuminate\Auth\Events\Login;
use Illuminate\Auth\Events\Logout;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

echo "=== Driver Login/Logout → Active/Inactive Presence — Verification ===\n\n";

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

function mkUser(string $suffix, Role $role = Role::DRIVER): User
{
    $user = User::create([
        'name' => "Presence Test {$suffix}",
        'email' => "presence-{$suffix}-" . substr(md5((string) mt_rand()), 0, 6) . '@example.com',
        'password' => bcrypt('password'),
        'role' => $role,
    ]);
    $GLOBALS['CREATED_USERS'][] = $user;
    return $user;
}

function mkDriver(string $suffix, ?Bus $bus = null, string $status = 'active'): Driver
{
    $user = mkUser($suffix);
    $driver = Driver::create([
        'user_id' => $user->id,
        'license_number' => "PR-LIC-{$suffix}-" . substr(md5((string) mt_rand()), 0, 6),
        'license_expiry' => now()->addYear()->toDateString(),
        'phone' => '555-0000',
        'address' => 'Test Addr',
        'status' => $status,
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
        'bus_number' => "PR-BUS-{$suffix}-" . substr(md5((string) mt_rand()), 0, 6),
        'plate_number' => "PR-PLT-{$suffix}-" . substr(md5((string) mt_rand()), 0, 6),
        'model' => 'TestBus',
        'capacity' => 20,
        'status' => $status,
        'route_id' => $routeId,
    ]);
    $GLOBALS['CREATED_BUSES'][] = $bus;
    return $bus;
}

function sessionTable(): string
{
    return (string) config('session.table', 'sessions');
}

// Store::setId() only accepts exactly 40 alphanumeric characters; anything
// else is silently replaced with a freshly generated id.
function newSessionId(): string
{
    return bin2hex(random_bytes(20));
}

function mkSession(string $id, int $userId, int $lastActivity): void
{
    DB::table(sessionTable())->insert([
        'id' => $id,
        'user_id' => $userId,
        'ip_address' => '127.0.0.1',
        'user_agent' => 'verify-driver-presence',
        'payload' => base64_encode(serialize([])),
        'last_activity' => $lastActivity,
    ]);
}

function clearSessionsFor(int $userId): void
{
    DB::table(sessionTable())->where('user_id', $userId)->delete();
}

// ── Snapshot pre-existing data to prove nothing is mass-changed ──────────
$initialBuses = DB::table('buses')->get(['id', 'status', 'driver_id'])->keyBy('id');
$initialDrivers = DB::table('drivers')->get(['id', 'status', 'bus_id'])->keyBy('id');
$initialOperators = DB::table('operators')->get(['id', 'user_id', 'status'])->keyBy('id');
// Runs before any temp user is created, so this is exactly the pre-existing set.
$initialPreExistingUsers = DB::table('users')->get(['id', 'role'])->keyBy('id');

$route = RouteModel::firstWhere('status', 'active') ?: RouteModel::first();
$routeId = $route?->id;
$suffix = substr(md5((string) time()), 0, 6);

$presence = $app->make(DriverPresenceService::class);

// ── 1-3. Wiring: routes + listeners untouched/registered ─────────────────

$router = $app->make('router');
$routesByName = [];
foreach ($router->getRoutes() as $registered) {
    if ($registered->getName()) {
        $routesByName[$registered->getName()] = $registered;
    }
}

T('1. admin.drivers resource routes keep auth+verified+role:admin middleware', function () use ($routesByName) {
    foreach (['admin.drivers.index', 'admin.drivers.create', 'admin.drivers.store', 'admin.drivers.edit', 'admin.drivers.update', 'admin.drivers.destroy'] as $name) {
        $r = $routesByName[$name] ?? null;
        if ($r === null) return "{$name} missing";
        $mw = $r->gatherMiddleware();
        if (!in_array('auth', $mw, true) || !in_array('verified', $mw, true) || !in_array('role:admin', $mw, true)) {
            return "{$name} middleware changed";
        }
    }
    return true;
});

T('2. Fortify login.store + logout routes still exist', function () use ($routesByName) {
    if (!isset($routesByName['login.store'])) return 'login.store missing';
    if (!isset($routesByName['logout'])) return 'logout missing';
    return true;
});

T('3. Login and Logout events have listeners registered', function () {
    $events = app('events');

    return $events->hasListeners(Login::class) && $events->hasListeners(Logout::class)
        ? true
        : 'listener not registered';
});

// ── 4-7. Service core ────────────────────────────────────────────────────

T('4. markDriverActive flips driver inactive → active', function () use ($presence, $suffix) {
    $driver = mkDriver("{$suffix}-act", null, 'inactive');
    $result = $presence->markDriverActive($driver->user);

    return $result === true && $driver->fresh()->status === 'active'
        ? true
        : 'service did not activate driver';
});

T('5. repeated logins keep the driver active (idempotent)', function () use ($presence, $suffix) {
    $driver = mkDriver("{$suffix}-idem", null, 'inactive');
    $presence->markDriverActive($driver->user);
    $presence->markDriverActive($driver->user);

    return $driver->fresh()->status === 'active' ? true : 'driver not active';
});

T('6. markDriverActive no-ops for admin users (no driver row touched)', function () use ($presence, $suffix) {
    $admin = mkUser("{$suffix}-adm", Role::ADMIN);
    $result = $presence->markDriverActive($admin);
    $driverRows = Driver::where('user_id', $admin->id)->count();

    return $result === false && $driverRows === 0
        ? true
        : 'admin presence was touched';
});

T('7. markDriverActive no-ops for operator users', function () use ($presence, $suffix) {
    $operator = mkUser("{$suffix}-op", Role::OPERATOR);

    return $presence->markDriverActive($operator) === false
        ? true
        : 'operator presence was touched';
});

// ── 8-9. hasOtherActiveSessions (session table query) ────────────────────

T('8. hasOtherActiveSessions: no rows → false, fresh row → true', function () use ($presence, $suffix) {
    $driver = mkDriver("{$suffix}-sess1");
    clearSessionsFor($driver->user_id);

    if ($presence->hasOtherActiveSessions($driver->user_id) !== false) {
        return 'empty session table reported active';
    }

    mkSession(newSessionId(), $driver->user_id, now()->getTimestamp());

    return $presence->hasOtherActiveSessions($driver->user_id) === true
        ? true
        : 'fresh session not detected';
});

T('9. hasOtherActiveSessions: expired row (older than lifetime) → false', function () use ($presence, $suffix) {
    $driver = mkDriver("{$suffix}-sess2");
    clearSessionsFor($driver->user_id);
    $lifetime = (int) config('session.lifetime');
    mkSession(newSessionId(), $driver->user_id, now()->getTimestamp() - ($lifetime * 60) - 120);

    return $presence->hasOtherActiveSessions($driver->user_id) === false
        ? true
        : 'stale session counted as active';
});

// ── 10-11. Last-logout rule ──────────────────────────────────────────────

T('10. last logout marks the driver inactive', function () use ($presence, $suffix) {
    $driver = mkDriver("{$suffix}-lo1", null, 'active');
    clearSessionsFor($driver->user_id);

    $result = $presence->markDriverInactiveOnLastLogout($driver->user);

    return $result === true && $driver->fresh()->status === 'inactive'
        ? true
        : 'driver not deactivated';
});

T('11. logout with another live session keeps the driver active', function () use ($presence, $suffix) {
    $driver = mkDriver("{$suffix}-lo2", null, 'active');
    clearSessionsFor($driver->user_id);
    mkSession(newSessionId(), $driver->user_id, now()->getTimestamp());

    $result = $presence->markDriverInactiveOnLastLogout($driver->user);

    return $result === false && $driver->fresh()->status === 'active'
        ? true
        : 'multi-session logout deactivated driver';
});

// ── 12-13. Real Logout event path with request session id ────────────────

function withLogoutRequest(string $currentSessionId, callable $dispatch): void
{
    $original = app('request');

    try {
        $session = app('session')->driver();
        $session->setId($currentSessionId);
        $request = Request::create('/logout', 'POST');
        $request->setLaravelSession($session);
        app()->instance('request', $request);
        $dispatch();
    } finally {
        app()->instance('request', $original);
    }
}

T('12. Logout event excludes the current session (dying session row alone cannot keep driver active)', function () use ($suffix) {
    $driver = mkDriver("{$suffix}-ev1", null, 'active');
    clearSessionsFor($driver->user_id);

    $currentId = newSessionId();
    mkSession($currentId, $driver->user_id, now()->getTimestamp());

    withLogoutRequest($currentId, function () use ($driver) {
        event(new Logout('web', $driver->user));
    });

    return $driver->fresh()->status === 'inactive'
        ? true
        : 'current session was not excluded';
});

T('13. Logout event keeps driver active when another live session exists', function () use ($suffix) {
    $driver = mkDriver("{$suffix}-ev2", null, 'active');
    clearSessionsFor($driver->user_id);

    $currentId = newSessionId();
    mkSession($currentId, $driver->user_id, now()->getTimestamp());
    mkSession(newSessionId(), $driver->user_id, now()->getTimestamp());

    withLogoutRequest($currentId, function () use ($driver) {
        event(new Logout('web', $driver->user));
    });

    return $driver->fresh()->status === 'active'
        ? true
        : 'second live session was ignored';
});

T('14. Logout event no-ops for operator users', function () use ($suffix) {
    $operator = mkUser("{$suffix}-op2", Role::OPERATOR);
    clearSessionsFor($operator->id);

    $before = DB::table('drivers')->count();
    withLogoutRequest(newSessionId(), function () use ($operator) {
        event(new Logout('web', $operator));
    });

    return DB::table('drivers')->count() === $before
        ? true
        : 'operator logout changed driver rows';
});

// ── 15-17. End-to-end Login/Logout events ────────────────────────────────

T('15. Login event marks the driver active', function () use ($suffix) {
    $driver = mkDriver("{$suffix}-e2e1", null, 'inactive');

    event(new Login('web', $driver->user, false));

    return $driver->fresh()->status === 'active'
        ? true
        : 'Login event did not activate driver';
});

T('16. Logout event marks the driver inactive when no sessions remain', function () use ($suffix) {
    $driver = mkDriver("{$suffix}-e2e2", null, 'active');
    clearSessionsFor($driver->user_id);

    event(new Logout('web', $driver->user));

    return $driver->fresh()->status === 'inactive'
        ? true
        : 'Logout event did not deactivate driver';
});

T('17. multi-session lifecycle: logout alone keeps active, final logout deactivates', function () use ($suffix) {
    $driver = mkDriver("{$suffix}-e2e3", null, 'active');
    clearSessionsFor($driver->user_id);

    mkSession(newSessionId(), $driver->user_id, now()->getTimestamp());
    event(new Logout('web', $driver->user));

    if ($driver->fresh()->status !== 'active') {
        return 'first logout deactivated the driver';
    }

    clearSessionsFor($driver->user_id);
    event(new Logout('web', $driver->user));

    return $driver->fresh()->status === 'inactive'
        ? true
        : 'final logout did not deactivate the driver';
});

// ── 18-19. Failed/again-validated credentials never change presence ──────

T('18. failed login attempts do not activate the driver', function () use ($suffix) {
    $driver = mkDriver("{$suffix}-fail", null, 'inactive');

    $validated = Auth::validate([
        'email' => $driver->user->email,
        'password' => 'definitely-wrong',
    ]);
    $attempted = Auth::guard('web')->attempt([
        'email' => $driver->user->email,
        'password' => 'definitely-wrong',
    ]);

    return $validated === false && $attempted === false && $driver->fresh()->status === 'inactive'
        ? true
        : 'failed credentials flipped presence';
});

T('19. valid credentials alone (no Login event) leave presence untouched', function () use ($suffix) {
    $driver = mkDriver("{$suffix}-cred", null, 'inactive');

    $validated = Auth::validate([
        'email' => $driver->user->email,
        'password' => 'password',
    ]);

    return $validated === true && $driver->fresh()->status === 'inactive'
        ? true
        : 'credential validation flipped presence';
});

// ── 20-23. Untouched subsystems during presence changes ─────────────────

T('20. bus assignment + bus status preserved across Login/Logout events', function () use ($suffix, $routeId) {
    $bus = mkBus("{$suffix}-b1", $routeId, 'active');
    $driver = mkDriver("{$suffix}-b1", $bus, 'inactive');
    clearSessionsFor($driver->user_id);

    event(new Login('web', $driver->user, false));
    event(new Logout('web', $driver->user));

    $driver = $driver->fresh();
    $bus = $bus->fresh();

    return $driver->status === 'inactive'
        && $driver->bus_id === $bus->id
        && $bus->driver_id === $driver->id
        && $bus->status === 'active'
        ? true
        : 'assignment or bus status changed';
});

T('21. in-transit trip untouched across Login/Logout events', function () use ($suffix, $routeId) {
    $bus = mkBus("{$suffix}-t1", $routeId, 'active');
    $driver = mkDriver("{$suffix}-t1", $bus, 'inactive');
    clearSessionsFor($driver->user_id);

    $trip = Trip::create([
        'bus_id' => $bus->id,
        'route_id' => $routeId,
        'driver_id' => $driver->id,
        'status' => 'in_transit',
        'started_at' => now(),
    ]);

    event(new Login('web', $driver->user, false));
    event(new Logout('web', $driver->user));

    $trip = $trip->fresh();

    return $trip !== null
        && $trip->status->value === 'in_transit'
        && $trip->ended_at === null
        && $driver->fresh()->status === 'inactive'
        ? true
        : 'trip was modified';
});

T('22. GPS records and live-tracking payload unaffected', function () use ($suffix, $routeId) {
    $bus = mkBus("{$suffix}-g1", $routeId, 'active');
    $driver = mkDriver("{$suffix}-g1", $bus, 'inactive');
    clearSessionsFor($driver->user_id);

    $location = Location::create([
        'bus_id' => $bus->id,
        'latitude' => 14.5995,
        'longitude' => 120.9842,
        'recorded_at' => now(),
    ]);

    event(new Login('web', $driver->user, false));
    event(new Logout('web', $driver->user));

    $payload = (new \App\Http\Controllers\Api\LocationController())->indexLatest()->getData(true);
    $entry = collect($payload['buses'] ?? [])->firstWhere('id', $bus->id);

    return $location->fresh() !== null
        && $entry !== null
        && $entry['location'] !== null
        && $entry['location']['latitude'] == 14.5995
        ? true
        : 'GPS data lost';
});

T('23. departure queue entry preserved across Login/Logout events', function () use ($suffix, $routeId) {
    $bus = mkBus("{$suffix}-q1", $routeId, 'active');
    $driver = mkDriver("{$suffix}-q1", $bus, 'inactive');
    clearSessionsFor($driver->user_id);

    $entry = DepartureQueue::create([
        'bus_id' => $bus->id,
        'driver_id' => $driver->id,
        'route_id' => $routeId,
        'queue_position' => 99,
        'status' => 'queued',
    ]);

    event(new Login('web', $driver->user, false));
    event(new Logout('web', $driver->user));

    $entry = $entry->fresh();

    return $entry !== null
        && $entry->status->value === 'queued'
        && $entry->driver_id === $driver->id
        && $entry->bus_id === $bus->id
        ? true
        : 'queue entry changed';
});

// ── 24-25. No side effects on anything else ──────────────────────────────

T('24. admin/operator Login+Logout events change nothing', function () use ($suffix, $initialOperators) {
    $admin = mkUser("{$suffix}-adm2", Role::ADMIN);
    $operator = mkUser("{$suffix}-op3", Role::OPERATOR);
    clearSessionsFor($admin->id);
    clearSessionsFor($operator->id);

    event(new Login('web', $admin, false));
    event(new Logout('web', $admin));
    event(new Login('web', $operator, false));
    event(new Logout('web', $operator));

    $nowOperators = DB::table('operators')->get(['id', 'user_id', 'status'])->keyBy('id');
    if ($nowOperators->count() !== $initialOperators->count()) {
        return 'operators table row count changed';
    }
    foreach ($initialOperators as $id => $before) {
        $after = $nowOperators[$id] ?? null;
        if ($after === null || $after->status !== $before->status || $after->user_id !== $before->user_id) {
            return "operator {$id} changed";
        }
    }

    return true;
});

T('25. pre-existing buses, drivers, operators and users were not mass-changed', function () use ($initialBuses, $initialDrivers, $initialOperators, $initialPreExistingUsers) {
    $nowBuses = DB::table('buses')->get(['id', 'status', 'driver_id'])->keyBy('id');
    foreach ($initialBuses as $id => $before) {
        $after = $nowBuses[$id] ?? null;
        if ($after === null) return "bus {$id} disappeared";
        if ($after->status !== $before->status || $after->driver_id !== $before->driver_id) {
            return "bus {$id} changed";
        }
    }

    $nowDrivers = DB::table('drivers')->get(['id', 'status', 'bus_id'])->keyBy('id');
    foreach ($initialDrivers as $id => $before) {
        $after = $nowDrivers[$id] ?? null;
        if ($after === null) return "driver {$id} disappeared";
        if ($after->status !== $before->status || $after->bus_id !== $before->bus_id) {
            return "driver {$id} changed (status {$before->status} → {$after->status})";
        }
    }

    $nowOperators = DB::table('operators')->get(['id', 'user_id', 'status'])->keyBy('id');
    foreach ($initialOperators as $id => $before) {
        $after = $nowOperators[$id] ?? null;
        if ($after === null || $after->status !== $before->status) {
            return "operator {$id} changed";
        }
    }

    $nowUsers = DB::table('users')->get(['id', 'role'])->keyBy('id');
    foreach ($initialPreExistingUsers as $id => $before) {
        $after = $nowUsers[$id] ?? null;
        if ($after === null) return "user {$id} disappeared";
        if ($after->role !== $before->role) {
            return "user {$id} role changed";
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

    // Sessions created for temp users.
    foreach ($GLOBALS['CREATED_USERS'] as $user) {
        try {
            DB::table(sessionTable())->where('user_id', $user->id)->delete();
        } catch (\Throwable $e) {
            fwrite(STDERR, "  Warning: cleanup (sessions) failed: {$e->getMessage()}\n");
        }
    }

    // Children of temp buses.
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
    echo "\nAll driver presence tests passed.\n";
    exit(0);
});
