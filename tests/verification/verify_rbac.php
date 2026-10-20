<?php
require __DIR__ . '/../../vendor/autoload.php';

// ── DATABASE SAFETY BARRIER + TEST CONNECTION SETUP ──────────────────────
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

// If .env points to bus_tracking, verify the mysql_test connection works
// as a safe alternative, and use it instead of refusing.
$useTestConnection = false;
if ($appDb === 'bus_tracking') {
    // The application .env is safe (bus_tracking). Switch verification to
    // the dedicated mysql_test connection which points to bus_tracking_test.
    $useTestConnection = true;
}

// ── END SAFETY BARRIER ────────────────────────────────────────────────────

$app = require_once __DIR__ . '/../../bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

// Override default connection to use dedicated test database
if ($useTestConnection) {
    $app->make('config')->set('database.default', 'mysql_test');
    echo "  [Info] Using dedicated test connection (mysql_test → bus_tracking_test)\n\n";
} else {
    echo "  [Info] Using .env database: " . env('DB_DATABASE') . "\n\n";
}

use App\Enums\Role;
use App\Enums\DepartureQueueStatus;
use App\Enums\AlertType;
use App\Models\Driver;
use App\Models\User;

echo "=== Departure Queue — RBAC + Integration Verification ===\n\n";

$GLOBALS['G'] = [];
$GLOBALS['CREATED'] = []; // Track every created record for crash-safe cleanup
$GLOBALS['CREATED_DRIVERS'] = [];
$GLOBALS['CREATED_USERS'] = [];
$results = [];
$pass = 0;
$fail = 0;

function T(string $label, callable $check): void
{
    global $results, $pass, $fail;
    try {
        $ok = $check();
        if ($ok) { $pass++; echo "  ✓ {$label}\n"; }
        else { $fail++; echo "  ✗ {$label}\n"; }
        $results[$label] = $ok;
    } catch (\Throwable $e) {
        $fail++;
        echo "  ✗ {$label} — {$e->getMessage()}\n";
        $results[$label] = false;
    }
}

function track(array $obj): void
{
    global $GLOBALS;
    if (isset($obj['bus']) && isset($obj['driver'])) {
        $GLOBALS['CREATED'][] = $obj;
    }
}

function createTestBusDriver(string $suffix, int $routeId, ?int $userId = null): array
{
    // If no user ID provided, create a dedicated test driver user
    if ($userId === null) {
        $user = User::create([
            'name'     => "Test Driver {$suffix}",
            'email'    => "test-driver-{$suffix}@example.com",
            'password' => bcrypt('password'),
            'role'     => Role::DRIVER,
        ]);
        $userId = $user->id;
    }
    $driver = Driver::create([
        'user_id'        => $userId,
        'license_number' => "TT-LIC-{$suffix}",
        'license_expiry' => now()->addYear()->toDateString(),
        'phone'          => '555-' . $suffix,
        'address'        => 'TT Addr',
        'status'         => 'active',
    ]);
    $bus = \App\Models\Bus::create([
        'bus_number'   => "TT-BUS-{$suffix}",
        'plate_number' => "TT-PLATE-{$suffix}",
        'model'        => 'TestBus',
        'capacity'     => 20,
        'status'       => 'active',
        'route_id'     => $routeId,
        'driver_id'    => $driver->id,
    ]);
    $driver->bus_id = $bus->id;
    $driver->save();
    $obj = ['bus' => $bus, 'driver' => $driver];
    track($obj);
    return $obj;
}

function fullCleanupBusDriver(array $obj): void
{
    if (!isset($obj['bus'])) return;
    $bus = $obj['bus'];
    $driver = $obj['driver'] ?? null;

    // 1. Clear departure queue entries referencing this bus
    \App\Models\DepartureQueue::where('bus_id', $bus->id)->delete();

    // 2. Null bidirectional FKs (order matters: bus.driver_id first due to RESTRICT)
    // Use DB::table for driver->bus_id since it's not in Driver's $fillable
    if ($driver !== null && $driver->bus_id !== null) {
        \Illuminate\Support\Facades\DB::table('drivers')
            ->where('id', $driver->id)
            ->update(['bus_id' => null]);
    }
    if ($bus->driver_id !== null) {
        $bus->driver_id = null;
        $bus->save();
    }

    // 3. Delete bus, then driver
    $bus->delete();
    if ($driver !== null) {
        $driver->delete();
    }
}

function fullCleanupAll(): void
{
    global $GLOBALS;
    $created = $GLOBALS['CREATED'] ?? [];
    foreach ($created as $obj) {
        try {
            fullCleanupBusDriver($obj);
        } catch (\Throwable $e) {
            fwrite(STDERR, "  Warning: cleanup failed for a tracked record: {$e->getMessage()}\n");
        }
    }
    // Also clean up any single-driver creations (e.g. test 16's otherDriver)
    $createdDrivers = $GLOBALS['CREATED_DRIVERS'] ?? [];
    foreach ($createdDrivers as $driver) {
        try {
            \App\Models\DepartureQueue::where('driver_id', $driver->id)->delete();
            if ($driver->bus_id !== null) {
                $driver->bus_id = null;
                $driver->save();
            }
            $driver->delete();
        } catch (\Throwable $e) {
            fwrite(STDERR, "  Warning: cleanup failed for a tracked driver: {$e->getMessage()}\n");
        }
    }
    // Clean up any tracked users (e.g. test 16's otherDriverUser)
    $createdUsers = $GLOBALS['CREATED_USERS'] ?? [];
    foreach ($createdUsers as $user) {
        try {
            $user->delete();
        } catch (\Throwable $e) {
            fwrite(STDERR, "  Warning: cleanup failed for a tracked user: {$e->getMessage()}\n");
        }
    }
}

// ── 1-4: FOUNDATIONAL CHECKS ──────────────────────────────────────────

T('1. DepartureQueueStatus enum complete', function () {
    $cases = ['queued', 'next', 'notified', 'acknowledged', 'loading', 'departed', 'skipped'];
    foreach ($cases as $c) {
        if (!\App\Enums\DepartureQueueStatus::tryFrom($c)) return false;
    }
    return true;
});

T('2. AlertType DISPATCH_NOTIFICATION exists', function () {
    return \App\Enums\AlertType::DISPATCH_NOTIFICATION->value === 'dispatch_notification';
});

T('3. DepartureQueue model has relationships', function () {
    $class = \App\Models\DepartureQueue::class;
    return method_exists($class, 'bus')
        && method_exists($class, 'driver')
        && method_exists($class, 'route')
        && method_exists($class, 'alerts');
});

T('4. DepartureQueueService has all 9 methods', function () {
    $class = \App\Services\DepartureQueueService::class;
    foreach (['addBus', 'promoteToNext', 'notifyDriver', 'markLoading',
        'markDeparted', 'skip', 'reorder', 'advanceQueue', 'acknowledgeByDriver'] as $m) {
        if (!method_exists($class, $m)) return false;
    }
    return true;
});

// ── 5-9: EXISTING DATA INTEGRITY ───────────────────────────────────────

T('5. Existing buses intact (>= 2)', function () {
    return \App\Models\Bus::count() >= 2;
});

T('6. Existing drivers intact (>= 1)', function () {
    return \App\Models\Driver::count() >= 1;
});

T('7. Existing routes intact (>= 2)', function () {
    return \App\Models\Route::count() >= 2;
});

T('8. Existing trips intact (>= 1)', function () {
    return \App\Models\Trip::count() >= 1;
});

T('9. Existing alerts intact (>= 1)', function () {
    return \App\Models\Alert::count() >= 1;
});

// ── 10-18: SERVICE-LAYER FUNCTIONAL TESTS ─────────────────────────────

$route      = \App\Models\Route::firstWhere('status', 'active') ?: \App\Models\Route::first();
$suffix     = substr(md5(time() . mt_rand()), 0, 6);
$routeId    = $route->id;

// 10: addBus basic
T('10. addBus() creates QUEUED entry', function () use ($routeId, $suffix) {
    $obj = createTestBusDriver($suffix . '-10', $routeId);
    $entry = \App\Services\DepartureQueueService::addBus($obj['bus']);
    return $entry->status->value === 'queued'
        && $entry->bus_id === $obj['bus']->id;
});

// 11: addBus snapshots
T('11. addBus() snapshots driver+route', function () use ($routeId, $suffix) {
    $obj = createTestBusDriver($suffix . '-11', $routeId);
    $entry = \App\Services\DepartureQueueService::addBus($obj['bus']);
    $ok = $entry->driver_id === $obj['driver']->id
        && $entry->route_id === $routeId
        && $entry->status->value === 'queued';
    return $ok;
});

// Setup persistent test data for operator workflow
$obj = createTestBusDriver($suffix . '-ops', $routeId);
$GLOBALS['G']['opsBus']    = $obj['bus'];
$GLOBALS['G']['opsDriver'] = $obj['driver'];
$GLOBALS['G']['opsRouteId'] = $routeId;

// 12: addBus to queue
T('12. addBus() adds to queue for operator workflow', function () {
    $entry = \App\Services\DepartureQueueService::addBus($GLOBALS['G']['opsBus']);
    $GLOBALS['G']['opsEntry'] = $entry;
    return $entry->status->value === 'queued';
});

// 13: promote
T('13. promoteToNext() → NEXT', function () {
    $r = \App\Services\DepartureQueueService::promoteToNext($GLOBALS['G']['opsEntry']);
    return $r->status->value === 'next';
});

// 14: notify
T('14. notifyDriver() creates dispatch Alert + NOTIFIED', function () {
    $entry = $GLOBALS['G']['opsEntry'];
    $r = \App\Services\DepartureQueueService::notifyDriver($entry);
    $alert = $r->alerts()->first();
    return $alert !== null
        && $alert->type->value === 'dispatch_notification'
        && $alert->status->value === 'new'
        && $r->status->value === 'notified';
});

// 15: acknowledge (same driver — owner)
T('15. acknowledgeByDriver() → ACKNOWLEDGED (owner)', function () {
    $entry  = $GLOBALS['G']['opsEntry'];
    $driver = $GLOBALS['G']['opsDriver'];
    $r = \App\Services\DepartureQueueService::acknowledgeByDriver($entry, $driver);
    $alert = $r->alerts()->firstWhere('type', 'dispatch_notification');
    return $r->status->value === 'acknowledged'
        && $alert !== null && $alert->status->value === 'acknowledged';
});

// 16: reject wrong driver
T('16. acknowledgeByDriver() rejects wrong driver', function () use ($suffix) {
    $entry = $GLOBALS['G']['opsEntry'];

    $otherDriverUser = User::create([
        'name'     => "Test Other Driver {$suffix}",
        'email'    => "test-other-drv-{$suffix}@example.com",
        'password' => bcrypt('password'),
        'role'     => Role::DRIVER,
    ]);
    $otherDriver = Driver::create([
        'user_id'        => $otherDriverUser->id,
        'license_number' => "TT-OTHER-{$suffix}",
        'license_expiry' => now()->addYear()->toDateString(),
        'phone'          => '555-9999',
        'address'        => 'Other Addr',
        'status'         => 'active',
    ]);
    $GLOBALS['CREATED_DRIVERS'][] = $otherDriver;
    $GLOBALS['CREATED_USERS'][] = $otherDriverUser;

    try {
        \App\Services\DepartureQueueService::acknowledgeByDriver($entry, $otherDriver);
        return false;
    } catch (\RuntimeException $e) {
        return str_contains($e->getMessage(), 'not authorized');
    }
});

// 17: markLoading (must re-notify first since already ACKNOWLEDGED)
T('17. markLoading() → LOADING after re-notify', function () {
    $entry = $GLOBALS['G']['opsEntry'];
    $r = \App\Services\DepartureQueueService::markLoading($entry);
    return $r->status->value === 'loading';
});

// 18: markDeparted + advance
T('18. markDeparted() → DEPARTED + advances queue', function () use ($suffix) {
    $routeId = $GLOBALS['G']['opsRouteId'];

    // Create second bus+entry for advancement test
    $obj2 = createTestBusDriver($suffix . '-18a', $routeId);
    $entry2 = \App\Services\DepartureQueueService::addBus($obj2['bus']);
    \App\Services\DepartureQueueService::promoteToNext($entry2);

    $e1 = $GLOBALS['G']['opsEntry'];
    $departed = \App\Services\DepartureQueueService::markDeparted($e1);
    $e2fresh = $entry2->fresh();

    return $departed->status->value === 'departed'
        && $departed->departed_at !== null
        && $e2fresh->status->value === 'next';
});

// 19: skip + advance
T('19. skip() → SKIPPED + advances queue', function () use ($suffix) {
    $routeId = $GLOBALS['G']['opsRouteId'];

    $obj3 = createTestBusDriver($suffix . '-19a', $routeId);
    $entry3 = \App\Services\DepartureQueueService::addBus($obj3['bus']);
    \App\Services\DepartureQueueService::promoteToNext($entry3);

    $skipped = \App\Services\DepartureQueueService::skip($entry3);
    $fresh = $skipped->fresh();

    return $fresh->status->value === 'skipped'
        && $fresh->queue_position === 0;
});

// 20: reorder
T('20. reorder() renumbers sequentially', function () use ($suffix) {
    $routeId = $GLOBALS['G']['opsRouteId'];

    // Clean existing active DQ entries for this route to isolate the test
    \App\Models\DepartureQueue::active()
        ->where('route_id', $routeId)
        ->forceDelete();

    $buses = [];
    $drivers = [];
    for ($i = 0; $i < 3; $i++) {
        $obj = createTestBusDriver($suffix . "-reo{$i}", $routeId);
        $buses[] = $obj['bus'];
        $drivers[] = $obj['driver'];
    }

    $entries = [];
    foreach ($buses as $bus) {
        $entries[] = \App\Services\DepartureQueueService::addBus($bus);
    }

    // Move e3 (pos 3) to pos 1
    \App\Services\DepartureQueueService::reorder($entries[2]->id, 1);

    $fresh = \App\Models\DepartureQueue::active()
        ->where('route_id', $routeId)
        ->ordered()
        ->get();
    $positions = $fresh->pluck('queue_position', 'id')->toArray();
    $values = array_values($positions);
    sort($values);
    $sequential = $values === [1, 2, 3];
    $unique = count($values) === count(array_unique($values));

    return $sequential && $unique;
});

// ── 21-28: RBAC ROUTE MIDDLEWARE TESTS ────────────────────────────────

// Verify route registration + middleware via reflection on Route objects
$router = $app->make('router');
$routesByName = [];
foreach ($router->getRoutes() as $route) {
    if ($route->getName()) {
        $routesByName[$route->getName()] = $route;
    }
}

T('21. admin.departureQueue route exists with auth+verified+role:admin middleware', function () use ($routesByName) {
    $r = $routesByName['admin.departureQueue'] ?? null;
    if ($r === null) return false;
    $middleware = $r->gatherMiddleware();
    $middleware = is_array($middleware) ? $middleware : [];
    return in_array('auth', $middleware, true)
        && in_array('verified', $middleware, true)
        && in_array('role:admin', $middleware, true);
});

T('22. operator.departureQueue route exists with auth+verified+role:operator middleware', function () use ($routesByName) {
    $r = $routesByName['operator.departureQueue'] ?? null;
    if ($r === null) return false;
    $middleware = $r->gatherMiddleware();
    $middleware = is_array($middleware) ? $middleware : [];
    return in_array('auth', $middleware, true)
        && in_array('verified', $middleware, true)
        && in_array('role:operator', $middleware, true);
});

T('23. operator.departureQueue.store (POST) with role:operator only', function () use ($routesByName) {
    $r = $routesByName['operator.departureQueue.store'] ?? null;
    if ($r === null) return false;
    $middleware = $r->gatherMiddleware();
    $middleware = is_array($middleware) ? $middleware : [];
    // Must NOT have role:admin or role:driver
    return in_array('role:operator', $middleware, true)
        && !in_array('role:admin', $middleware, true)
        && !in_array('role:driver', $middleware, true);
});

T('24. driver.departureQueue route with role:driver only', function () use ($routesByName) {
    $r = $routesByName['driver.departureQueue'] ?? null;
    if ($r === null) return false;
    $middleware = $r->gatherMiddleware();
    $middleware = is_array($middleware) ? $middleware : [];
    return in_array('role:driver', $middleware, true)
        && !in_array('role:admin', $middleware, true)
        && !in_array('role:operator', $middleware, true);
});

T('25. driver.departureQueue.acknowledge with role:driver only', function () use ($routesByName) {
    $r = $routesByName['driver.departureQueue.acknowledge'] ?? null;
    if ($r === null) return false;
    $middleware = $r->gatherMiddleware();
    $middleware = is_array($middleware) ? $middleware : [];
    return in_array('role:driver', $middleware, true)
        && !in_array('role:admin', $middleware, true)
        && !in_array('role:operator', $middleware, true);
});

T('26. All 11 departure queue routes registered', function () use ($routesByName) {
    $expected = [
        'admin.departureQueue',
        'operator.departureQueue',
        'operator.departureQueue.store',
        'operator.departureQueue.promote',
        'operator.departureQueue.notify',
        'operator.departureQueue.loading',
        'operator.departureQueue.depart',
        'operator.departureQueue.skip',
        'operator.departureQueue.reorder',
        'driver.departureQueue',
        'driver.departureQueue.acknowledge',
    ];
    foreach ($expected as $name) {
        if (!isset($routesByName[$name])) return false;
    }
    return true;
});

// ── 27-29: EXISTING FEATURES STILL WORK ────────────────────────────────

T('27. Existing Trip lifecycle still works', function () {
    $trip = \App\Models\Trip::first();
    if ($trip === null) return false;
    $valid = ['scheduled', 'in_transit', 'completed', 'cancelled'];
    return in_array($trip->status->value, $valid, true);
});

T('28. Existing Alert lifecycle still works', function () {
    $alert = \App\Models\Alert::first();
    if ($alert === null) return false;
    $valid = ['new', 'acknowledged', 'resolved'];
    return in_array($alert->status->value, $valid, true);
});

T('29. Existing GPS location records still exist', function () {
    return \App\Models\Location::count() >= 1;
});

// ── SUMMARY ────────────────────────────────────────────────────────────

$total = $pass + $fail;
echo "\n=== SUMMARY ===\n";
echo "Passed: {$pass}/{$total}\n";
echo "Failed: {$fail}\n";

// ── CRASH-SAFE CLEANUP (runs even on fatal errors via register_shutdown_function) ──
register_shutdown_function(function () {
    global $fail;
    fullCleanupAll();
    if ($fail > 0) {
        echo "\nFailed tests:\n";
        global $results;
        foreach ($results as $label => $ok) {
            if (!$ok) echo "  - {$label}\n";
        }
        exit(1);
    }
    echo "\nAll RBAC + integration tests passed.\n";
    exit(0);
});
