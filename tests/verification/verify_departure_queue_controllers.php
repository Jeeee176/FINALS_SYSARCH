<?php
declare(strict_types=1);

require_once __DIR__ . '/../../vendor/autoload.php';

// ── DATABASE SAFETY BARRIER ──────────────────────────────────────────────
// Read .env directly (before Laravel bootstrap) to check DB_DATABASE.
$envFile = __DIR__ . '/../../.env';
$appDb = 'unknown';
if (file_exists($envFile)) {
    $envLines = file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($envLines as $line) {
        if (str_starts_with(trim($line), 'DB_DATABASE=')) {
            $appDb = trim(substr($line, strlen('DB_DATABASE=')));
            break;
        }
    }
}

// If .env points to bus_tracking, use the dedicated mysql_test connection
// which points to bus_tracking_test — no .env modification needed.
$useTestConnection = ($appDb === 'bus_tracking');

// ── END SAFETY BARRIER ────────────────────────────────────────────────────

use App\Enums\DepartureQueueStatus;
use App\Enums\AlertType;
use App\Enums\AlertStatus;
use App\Enums\Role;
use App\Models\Bus;
use App\Models\DepartureQueue;
use App\Models\Driver;
use App\Models\Route as RouteModel;
use App\Models\User;
use App\Services\DepartureQueueService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Schema;

// Boot Laravel (minimal)
$app = require_once __DIR__ . '/../../bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

// Override default connection to use dedicated test database
if ($useTestConnection) {
    $app->make('config')->set('database.default', 'mysql_test');
}

echo "=== Departure Queue — Controller + Route Verification ===\n\n";

$GLOBALS['G'] = [];
$GLOBALS['CREATED'] = [];   // Track every created Bus+Driver pair
$GLOBALS['CREATED_DRIVERS'] = []; // Track standalone driver creations
$GLOBALS['CREATED_USERS'] = [];   // Track standalone user creations

$tests      = 0;
$passed     = 0;
$failed     = 0;
$failures   = [];

function test(string $label, callable $check): void
{
    global $tests, $passed, $failed, $failures;
    $tests++;
    try {
        $result = $check();
        if ($result === true) {
            $passed++;
            echo "  ✓ {$label}\n";
        } else {
            $failed++;
            $failures[] = $label;
            echo "  ✗ {$label}" . ($result !== null ? " — {$result}" : "") . "\n";
        }
    } catch (Throwable $e) {
        $failed++;
        $failures[] = $label;
        echo "  ✗ {$label} — {$e->getMessage()}\n";
    }
}

function trackBusDriver(array $obj): void
{
    global $GLOBALS;
    $GLOBALS['CREATED'][] = $obj;
}

function trackDriver(Driver $driver): void
{
    global $GLOBALS;
    $GLOBALS['CREATED_DRIVERS'][] = $driver;
}

function trackUser(User $user): void
{
    global $GLOBALS;
    $GLOBALS['CREATED_USERS'][] = $user;
}

function createTestBusDriver(string $suffix, int $routeId, ?int $userId = null): array
{
    $driverUserEmail = "test-drv-{$suffix}@example.com";
    $driverUser = User::firstWhere('email', $driverUserEmail)
        ?? User::create([
            'name'     => 'Test Driver ' . $suffix,
            'email'    => $driverUserEmail,
            'password' => 'password',
            'role'     => Role::DRIVER,
        ]);
    trackUser($driverUser);

    $driver = Driver::create([
        'user_id'        => $driverUser->id,
        'license_number' => 'DQ-CRE-LIC-' . $suffix,
        'license_expiry' => now()->addYear()->toDateString(),
        'phone'          => '555-' . $suffix,
        'address'        => 'Test Address',
        'status'         => 'active',
    ]);
    trackDriver($driver);

    $bus = Bus::create([
        'bus_number'   => 'DQ-CRE-BUS-' . $suffix,
        'plate_number' => 'DQ-CRE-PLATE-' . $suffix,
        'model'        => 'TestBus',
        'capacity'     => 20,
        'status'       => 'active',
        'route_id'     => $routeId,
        'driver_id'    => $driver->id,
    ]);

    $driver->bus_id = $bus->id;
    $driver->save();

    $obj = ['bus' => $bus, 'driver' => $driver, 'driverUser' => $driverUser];
    trackBusDriver($obj);
    return $obj;
}

function fullCleanupBusDriver(array $obj): void
{
    if (!isset($obj['bus'])) return;
    $bus = $obj['bus'];
    $driver = $obj['driver'] ?? null;
    $driverUser = $obj['driverUser'] ?? null;

    // 1. Clear departure queue entries for this bus
    DepartureQueue::where('bus_id', $bus->id)->delete();

    // 2. Null bidirectional FKs (bus.driver_id first — RESTRICT on buses.driver_id)
    if ($driver !== null && $driver->bus_id !== null) {
        $driver->bus_id = null;
        $driver->save();
    }
    if ($bus->driver_id !== null) {
        $bus->driver_id = null;
        $bus->save();
    }

    // 3. Delete in order: bus, driver, user
    $bus->delete();
    if ($driver !== null) {
        $driver->delete();
    }
    if ($driverUser !== null) {
        // Only delete user if it's a test user we created (email contains test-)
        if (str_contains($driverUser->email, 'test-')) {
            $driverUser->delete();
        }
    }
}

function fullCleanupDriver(Driver $driver): void
{
    DepartureQueue::where('driver_id', $driver->id)->delete();
    if ($driver->bus_id !== null) {
        $driver->bus_id = null;
        $driver->save();
    }
    $driver->delete();
}

function fullCleanupUser(User $user): void
{
    // Only delete users we explicitly tracked as created for this test run
    if (str_contains($user->email, 'test-') || str_contains($user->email, 'ctrl-')) {
        $user->delete();
    }
}

function fullCleanupAll(): void
{
    global $GLOBALS;

    // Clean up standalone users first (only if no driver references them)
    foreach ($GLOBALS['CREATED_USERS'] ?? [] as $user) {
        try {
            // Check if any driver references this user
            $hasDriver = \App\Models\Driver::where('user_id', $user->id)->exists();
            if (!$hasDriver) {
                fullCleanupUser($user);
            } else {
                fwrite(STDERR, "  Note: skipping user {$user->id} deletion — driver still references it\n");
            }
        } catch (Throwable $e) {
            fwrite(STDERR, "  Warning: cleanup failed for user {$user->id}: {$e->getMessage()}\n");
        }
    }

    // Clean up tracked bus+driver pairs
    foreach ($GLOBALS['CREATED'] ?? [] as $obj) {
        try {
            fullCleanupBusDriver($obj);
        } catch (Throwable $e) {
            fwrite(STDERR, "  Warning: cleanup failed for tracked bus/driver: {$e->getMessage()}\n");
        }
    }

    // Clean up standalone drivers
    foreach ($GLOBALS['CREATED_DRIVERS'] ?? [] as $driver) {
        try {
            fullCleanupDriver($driver);
        } catch (Throwable $e) {
            fwrite(STDERR, "  Warning: cleanup failed for driver {$driver->id}: {$e->getMessage()}\n");
        }
    }
}

// ── Setup test data ────────────────────────────────────────────────────

$suffix     = substr(md5((string) mt_rand()), 0, 6);
$route      = RouteModel::firstWhere('status', 'active') ?: RouteModel::first();
$routeId    = $route->id;

// Admin user (check if exists first, only create if missing)
$adminUser   = User::firstWhere('role', Role::ADMIN->value)
    ?? User::create([
        'name'     => 'Admin Test ' . $suffix,
        'email'    => "admin-test-{$suffix}@example.com",
        'password' => 'password',
        'role'     => Role::ADMIN,
    ]);
if (!User::firstWhere('role', Role::ADMIN->value)) {
    trackUser($adminUser);
}

// Operator user (check if exists first)
$operatorUser = User::firstWhere('role', Role::OPERATOR->value)
    ?? User::create([
        'name'     => 'Operator Test ' . $suffix,
        'email'    => "operator-test-{$suffix}@example.com",
        'password' => 'password',
        'role'     => Role::OPERATOR,
    ]);
if (!User::firstWhere('role', Role::OPERATOR->value)) {
    trackUser($operatorUser);
}

// Driver user + Driver + Bus (always create new for test isolation)
$driverObj = createTestBusDriver($suffix, $routeId);
$driverUser  = $driverObj['driverUser'];
$driver      = $driverObj['driver'];
$bus         = $driverObj['bus'];

$GLOBALS['G']['adminUser']    = $adminUser;
$GLOBALS['G']['operatorUser'] = $operatorUser;
$GLOBALS['G']['driverUser']   = $driverUser;
$GLOBALS['G']['driver']       = $driver;
$GLOBALS['G']['bus']          = $bus;
$GLOBALS['G']['routeId']      = $routeId;

// ── SECTION 1: Service + Model layer ───────────────────────────────────

test('Service: addBus() creates QUEUED entry', function () {
    $entry = DepartureQueueService::addBus($GLOBALS['G']['bus']);
    $GLOBALS['G']['entry'] = $entry;
    return $entry->status->value === 'queued'
        && $entry->bus_id === $GLOBALS['G']['bus']->id;
});

test('Service: addBus() snapshots driver + route', function () {
    $e = $GLOBALS['G']['entry'];
    return $e->driver_id === $GLOBALS['G']['driver']->id
        && $e->route_id === $GLOBALS['G']['routeId'];
});

test('Service: addBus() assigns queue_position >= 1', function () {
    $e = $GLOBALS['G']['entry'];
    return (int) $e->queue_position >= 1;
});

test('Service: promoteToNext() QUEUED → NEXT', function () {
    $r = DepartureQueueService::promoteToNext($GLOBALS['G']['entry']);
    return $r->status->value === 'next';
});

test('Service: notifyDriver() creates Alert DISPATCH_NOTIFICATION + NOTIFIED', function () {
    $e = $GLOBALS['G']['entry'];
    $r = DepartureQueueService::notifyDriver($e);
    $alert = $r->alerts()->first();
    return $alert !== null
        && $alert->type->value === 'dispatch_notification'
        && $alert->status->value === 'new'
        && $alert->severity->value === 'info'
        && $r->status->value === 'notified';
});

test('Service: acknowledgeByDriver() NOTIFIED → ACKNOWLEDGED', function () {
    $e = $GLOBALS['G']['entry'];
    $d = $GLOBALS['G']['driver'];
    $r = DepartureQueueService::acknowledgeByDriver($e, $d);
    $alert = $r->alerts()->where('type', 'dispatch_notification')->first();
    return $r->status->value === 'acknowledged'
        && $alert && $alert->status->value === 'acknowledged';
});

test('Service: markLoading() ACKNOWLEDGED → LOADING', function () {
    $r = DepartureQueueService::markLoading($GLOBALS['G']['entry']);
    return $r->status->value === 'loading';
});

test('Service: markDeparted() LOADING → DEPARTED + advances queue', function () {
    $e = $GLOBALS['G']['entry'];
    $r = DepartureQueueService::markDeparted($e);
    return $r->status->value === 'departed'
        && $r->departed_at !== null
        && (int) $r->queue_position === 0;
});

// ── SECTION 2: Operator Controller ─────────────────────────────────────

// Create fresh test data for operator controller tests
$suffix2    = substr(md5((string) mt_rand()), 0, 6);
$route2     = RouteModel::firstWhere('status', 'active') ?: RouteModel::first();
$routeId2   = $route2->id;

$operatorObj = createTestBusDriver($suffix2 . '-op', $routeId2);
$operatorDriver = $operatorObj['driver'];
$operatorBus  = $operatorObj['bus'];
$operatorDriverUser = $operatorObj['driverUser'];

// Pre-populate queue via service (so controller tests have data)
$operatorEntry = DepartureQueueService::addBus($operatorBus);

// Create operator User + session (use existing or create new)
$operatorUser = User::firstWhere('role', Role::OPERATOR->value)
    ?? User::create([
        'name'     => 'Operator Ctrl Test ' . $suffix2,
        'email'    => "operator-ctrl-{$suffix2}@example.com",
        'password' => 'password',
        'role'     => Role::OPERATOR,
    ]);
if (str_contains($operatorUser->email, 'ctrl-')) {
    trackUser($operatorUser);
}

// Simulate authenticated session using DB sessions
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Session;

// Store operator user id in session
$sessionKey = 'login_' . md5($operatorUser->email);
Session::put($sessionKey, $operatorUser->id);
Session::put('login_' . md5($operatorUser->email) . '_id', $operatorUser->id);

// Authenticate as operator
Auth::login($operatorUser);

// Instantiate controller
$controller = new App\Http\Controllers\Operator\DepartureQueueController();

// test: index() returns Inertia Response with active queue
test('Operator.index() returns Inertia Response with active queue', function () use ($controller) {
    $response = $controller->index();

    if (!($response instanceof Inertia\Response)) {
        return 'Expected Inertia\Response, got ' . get_class($response);
    }

    // Read props via reflection
    $reflection = new ReflectionClass($response);
    $proposalProp = $reflection->getProperty('props');
    $proposalProp->setAccessible(true);
    $props = $proposalProp->getValue($response);

    if (!isset($props['active'])) {
        return 'Missing "active" prop in response';
    }

    $active = $props['active'];
    if ($active instanceof \Illuminate\Support\Collection) {
        $active = $active->toArray();
    }
    if (!is_iterable($active)) {
        return 'Active prop is not iterable' . ' (type: ' . (is_object($active) ? get_class($active) : gettype($active)) . ')';
    }

    $first = current($active);
    if ($first === false || !is_array($first)) {
        return 'Active array is empty or not array' . (is_object($active) ? ' (type: ' . get_class($active) . ')' : '');
    }

    // Verify structure
    if (!isset($first['id'], $first['bus_number'], $first['status'])) {
        return 'Active entry missing required fields (id, bus_number, status)';
    }

    return true;
});

// test: store() adds a bus
test('Operator.store() adds a bus to queue', function () use ($controller, $operatorUser) {
    Auth::login($operatorUser);

    // Create another test bus using tracked creation
    $suffix3 = substr(md5((string) mt_rand()), 0, 6);
    $testObj = createTestBusDriver($suffix3 . '-store', $GLOBALS['G']['routeId']);
    $testBus = $testObj['bus'];

    $request = new Illuminate\Http\Request();
    $request->merge(['bus_id' => $testBus->id]);

    $response = $controller->store($request);

    // Verify via query
    $entry = DepartureQueue::where('bus_id', $testBus->id)
        ->where('status', 'queued')
        ->first();

    if (!$entry) {
        return 'No QUEUED entry created for bus_id ' . $testBus->id;
    }

    return true;
});

// test: store() rejects invalid bus_id
test('Operator.store() rejects invalid bus_id', function () use ($controller, $operatorUser) {
    Auth::login($operatorUser);

    $request = new Illuminate\Http\Request();
    $request->merge(['bus_id' => 99999]);

    try {
        $controller->store($request);
        return 'Expected validation exception';
    } catch (\Illuminate\Validation\ValidationException $e) {
        return true;
    } catch (\Throwable $e) {
        return 'Unexpected exception: ' . $e->getMessage();
    }
});

// ── SECTION 3: Admin Controller ─────────────────────────────────────────

$adminUser = User::firstWhere('role', Role::ADMIN->value)
    ?? User::create([
        'name'     => 'Admin Ctrl Test ' . $suffix2,
        'email'    => "admin-ctrl-{$suffix2}@example.com",
        'password' => 'password',
        'role'     => Role::ADMIN,
    ]);
if (str_contains($adminUser->email, 'ctrl-')) {
    trackUser($adminUser);
}

Auth::login($adminUser);

$adminController = new App\Http\Controllers\Admin\DepartureQueueController();

// test: Admin.index() returns Inertia Response
test('Admin.index() returns Inertia Response', function () use ($adminController) {
    $response = $adminController->index();

    if (!($response instanceof Inertia\Response)) {
        return 'Expected Inertia\Response, got ' . get_class($response);
    }

    $reflection = new ReflectionClass($response);
    $proposalProp = $reflection->getProperty('props');
    $proposalProp->setAccessible(true);
    $props = $proposalProp->getValue($response);

    if (!isset($props['active'], $props['historical'])) {
        return 'Missing active/historical props';
    }

    return true;
});

// ── SECTION 4: Driver Controller ────────────────────────────────────────

// Create driver user + session
$driverObj2 = createTestBusDriver($suffix2 . '-drv', $routeId2);
$driverUser2 = $driverObj2['driverUser'];
$driverProfile = $driverObj2['driver'];
$driverBus = $driverObj2['bus'];

// Add to queue
$driverEntry = DepartureQueueService::addBus($driverBus);
DepartureQueueService::promoteToNext($driverEntry);
DepartureQueueService::notifyDriver($driverEntry);

// Auth as driver
Auth::login($driverUser2);

$driverController = new App\Http\Controllers\Driver\DepartureQueueController();

// test: Driver.index() returns Inertia Response with dispatch for own bus
test('Driver.index() returns Inertia Response with dispatch for own bus', function () use ($driverController, $driverEntry, $driverProfile) {
    $response = $driverController->index();

    if (!($response instanceof Inertia\Response)) {
        return 'Expected Inertia\Response, got ' . get_class($response);
    }

    $reflection = new ReflectionClass($response);
    $proposalProp = $reflection->getProperty('props');
    $proposalProp->setAccessible(true);
    $props = $proposalProp->getValue($response);

    if (!isset($props['dispatch'])) {
        return 'Missing "dispatch" prop';
    }

    $dispatch = $props['dispatch'];
    if (!is_array($dispatch) || !isset($dispatch['id'])) {
        return 'Dispatch prop is not a valid entry array';
    }

    // Verify it's the correct entry (driver's own)
    if ((int) $dispatch['id'] !== $driverEntry->id) {
        return 'Dispatch entry id does not match driver\'s queue entry';
    }

    return true;
});

// test: Driver.acknowledge() succeeds for own entry
test('Driver.acknowledge() succeeds for own dispatch', function () use ($driverController, $driverEntry, $driverProfile, $driverUser2) {
    Auth::login($driverUser2);

    $request = new Illuminate\Http\Request();
    $response = $driverController->acknowledge($request, $driverEntry);

    // Verify via query
    $fresh = $driverEntry->fresh();
    $alert = $fresh->alerts()->where('type', 'dispatch_notification')->first();

    return $fresh->status->value === 'acknowledged'
        && $alert && $alert->status->value === 'acknowledged';
});

// test: Driver.acknowledge() fails for another driver's entry
test('Driver.acknowledge() fails for another driver\'s entry', function () use ($driverController, $driverUser2) {
    Auth::login($driverUser2);

    // Find a queue entry belonging to a different driver
    $otherEntry = DepartureQueue::active()
        ->where('driver_id', '!=', $driverUser2->driver->id)
        ->with('driver')
        ->first();

    if (!$otherEntry) {
        return 'SKIP: no other driver\'s entry found in active queue';
    }

    $request = new Illuminate\Http\Request();
    $driverController->acknowledge($request, $otherEntry);

    // Verify the entry was NOT acknowledged (status unchanged)
    $fresh = $otherEntry->fresh();
    if ($fresh->status->value === 'acknowledged') {
        return 'Entry was incorrectly acknowledged by another driver';
    }

    return true;
});

// ── SECTION 5: Route registration verification ─────────────────────────

test('Route: GET /admin/departure-queue registered with auth+verified+role:admin', function () {
    $route = Route::getRoutes()->getByName('admin.departureQueue');
    if (!$route) return 'Route admin.departureQueue not found';

    $middleware = $route->gatherMiddleware();
    $middleware = is_array($middleware) ? $middleware : [];

    $hasAuth       = in_array('auth', $middleware);
    $hasVerified   = in_array('verified', $middleware);
    $hasRoleAdmin  = in_array('role:admin', $middleware);

    if (!$hasAuth) return 'Missing auth middleware';
    if (!$hasVerified) return 'Missing verified middleware';
    if (!$hasRoleAdmin) return 'Missing role:admin middleware';

    return true;
});

test('Route: GET /operator/departure-queue registered with auth+verified+role:operator', function () {
    $route = Route::getRoutes()->getByName('operator.departureQueue');
    if (!$route) return 'Route operator.departureQueue not found';

    $middleware = $route->gatherMiddleware();
    $middleware = is_array($middleware) ? $middleware : [];

    $hasAuth       = in_array('auth', $middleware);
    $hasVerified   = in_array('verified', $middleware);
    $hasRoleOp     = in_array('role:operator', $middleware);

    if (!$hasAuth) return 'Missing auth middleware';
    if (!$hasVerified) return 'Missing verified middleware';
    if (!$hasRoleOp) return 'Missing role:operator middleware';

    return true;
});

test('Route: POST /operator/departure-queue (store) registered with auth+verified+role:operator', function () {
    $route = Route::getRoutes()->getByName('operator.departureQueue.store');
    if (!$route) return 'Route operator.departureQueue.store not found';

    $middleware = $route->gatherMiddleware();
    $middleware = is_array($middleware) ? $middleware : [];

    $hasAuth       = in_array('auth', $middleware);
    $hasVerified   = in_array('verified', $middleware);
    $hasRoleOp     = in_array('role:operator', $middleware);

    if (!$hasAuth) return 'Missing auth middleware';
    if (!$hasVerified) return 'Missing verified middleware';
    if (!$hasRoleOp) return 'Missing role:operator middleware';

    return true;
});

test('Route: POST /operator/departure-queue/{entry}/promote registered', function () {
    $route = Route::getRoutes()->getByName('operator.departureQueue.promote');
    if (!$route) return 'Route operator.departureQueue.promote not found';

    $middleware = $route->gatherMiddleware();
    $middleware = is_array($middleware) ? $middleware : [];

    $hasAuth   = in_array('auth', $middleware);
    $hasVerified = in_array('verified', $middleware);
    $hasRoleOp = in_array('role:operator', $middleware);

    if (!$hasAuth || !$hasVerified || !$hasRoleOp) {
        return 'Missing required middleware';
    }

    return true;
});

test('Route: POST /operator/departure-queue/{entry}/notify registered', function () {
    $route = Route::getRoutes()->getByName('operator.departureQueue.notify');
    if (!$route) return 'Route operator.departureQueue.notify not found';

    $middleware = $route->gatherMiddleware();
    $middleware = is_array($middleware) ? $middleware : [];

    $hasAuth       = in_array('auth', $middleware);
    $hasVerified   = in_array('verified', $middleware);
    $hasRoleOp     = in_array('role:operator', $middleware);

    if (!$hasAuth || !$hasVerified || !$hasRoleOp) {
        return 'Missing required middleware';
    }

    return true;
});

test('Route: POST /operator/departure-queue/{entry}/loading registered', function () {
    $route = Route::getRoutes()->getByName('operator.departureQueue.loading');
    if (!$route) return 'Route operator.departureQueue.loading not found';

    $middleware = $route->gatherMiddleware();
    $middleware = is_array($middleware) ? $middleware : [];

    $hasAuth       = in_array('auth', $middleware);
    $hasVerified   = in_array('verified', $middleware);
    $hasRoleOp     = in_array('role:operator', $middleware);

    if (!$hasAuth || !$hasVerified || !$hasRoleOp) {
        return 'Missing required middleware';
    }

    return true;
});

test('Route: POST /operator/departure-queue/{entry}/depart registered', function () {
    $route = Route::getRoutes()->getByName('operator.departureQueue.depart');
    if (!$route) return 'Route operator.departureQueue.depart not found';

    $middleware = $route->gatherMiddleware();
    $middleware = is_array($middleware) ? $middleware : [];

    $hasAuth       = in_array('auth', $middleware);
    $hasVerified   = in_array('verified', $middleware);
    $hasRoleOp     = in_array('role:operator', $middleware);

    if (!$hasAuth || !$hasVerified || !$hasRoleOp) {
        return 'Missing required middleware';
    }

    return true;
});

test('Route: POST /operator/departure-queue/{entry}/skip registered', function () {
    $route = Route::getRoutes()->getByName('operator.departureQueue.skip');
    if (!$route) return 'Route operator.departureQueue.skip not found';

    $middleware = $route->gatherMiddleware();
    $middleware = is_array($middleware) ? $middleware : [];

    $hasAuth       = in_array('auth', $middleware);
    $hasVerified   = in_array('verified', $middleware);
    $hasRoleOp     = in_array('role:operator', $middleware);

    if (!$hasAuth || !$hasVerified || !$hasRoleOp) {
        return 'Missing required middleware';
    }

    return true;
});

test('Route: POST /operator/departure-queue/{entry}/reorder registered', function () {
    $route = Route::getRoutes()->getByName('operator.departureQueue.reorder');
    if (!$route) return 'Route operator.departureQueue.reorder not found';

    $middleware = $route->gatherMiddleware();
    $middleware = is_array($middleware) ? $middleware : [];

    $hasAuth       = in_array('auth', $middleware);
    $hasVerified   = in_array('verified', $middleware);
    $hasRoleOp     = in_array('role:operator', $middleware);

    if (!$hasAuth || !$hasVerified || !$hasRoleOp) {
        return 'Missing required middleware';
    }

    return true;
});

test('Route: GET /driver/departure-queue registered with auth+verified+role:driver', function () {
    $route = Route::getRoutes()->getByName('driver.departureQueue');
    if (!$route) return 'Route driver.departureQueue not found';

    $middleware = $route->gatherMiddleware();
    $middleware = is_array($middleware) ? $middleware : [];

    $hasAuth      = in_array('auth', $middleware);
    $hasVerified  = in_array('verified', $middleware);
    $hasRoleDrv   = in_array('role:driver', $middleware);

    if (!$hasAuth) return 'Missing auth middleware';
    if (!$hasVerified) return 'Missing verified middleware';
    if (!$hasRoleDrv) return 'Missing role:driver middleware';

    return true;
});

test('Route: POST /driver/departure-queue/{entry}/acknowledge registered with auth+verified+role:driver', function () {
    $route = Route::getRoutes()->getByName('driver.departureQueue.acknowledge');
    if (!$route) return 'Route driver.departureQueue.acknowledge not found';

    $middleware = $route->gatherMiddleware();
    $middleware = is_array($middleware) ? $middleware : [];

    $hasAuth      = in_array('auth', $middleware);
    $hasVerified  = in_array('verified', $middleware);
    $hasRoleDrv   = in_array('role:driver', $middleware);

    if (!$hasAuth) return 'Missing auth middleware';
    if (!$hasVerified) return 'Missing verified middleware';
    if (!$hasRoleDrv) return 'Missing role:driver middleware';

    return true;
});

// ── SECTION 6: Cross-role access verification ──────────────────────────

test('Admin cannot POST to operator/departure-queue (route middleware role:operator blocks admin)', function () {
    $route = Route::getRoutes()->getByName('operator.departureQueue.store');
    if (!$route) return 'Route not found';

    $middleware = $route->gatherMiddleware();
    $middleware = is_array($middleware) ? $middleware : [];

    $hasRoleOp = in_array('role:operator', $middleware);
    if (!$hasRoleOp) return 'role:operator middleware missing from store route';

    return true;
});

test('Driver cannot POST to operator/departure-queue (route middleware role:operator blocks driver)', function () {
    $route = Route::getRoutes()->getByName('operator.departureQueue.store');
    if (!$route) return 'Route not found';

    $middleware = $route->gatherMiddleware();
    $middleware = is_array($middleware) ? $middleware : [];

    $hasRoleOp = in_array('role:operator', $middleware);
    if (!$hasRoleOp) return 'role:operator middleware missing from store route';

    return true;
});

test('Admin cannot POST to driver/departure-queue/acknowledge (route middleware role:driver blocks admin)', function () {
    $route = Route::getRoutes()->getByName('driver.departureQueue.acknowledge');
    if (!$route) return 'Route not found';

    $middleware = $route->gatherMiddleware();
    $middleware = is_array($middleware) ? $middleware : [];

    $hasRoleDrv = in_array('role:driver', $middleware);
    if (!$hasRoleDrv) return 'role:driver middleware missing from acknowledge route';

    return true;
});

test('Operator cannot POST to driver/departure-queue/acknowledge (route middleware role:driver blocks operator)', function () {
    $route = Route::getRoutes()->getByName('driver.departureQueue.acknowledge');
    if (!$route) return 'Route not found';

    $middleware = $route->gatherMiddleware();
    $middleware = is_array($middleware) ? $middleware : [];

    $hasRoleDrv = in_array('role:driver', $middleware);
    if (!$hasRoleDrv) return 'role:driver middleware missing from acknowledge route';

    return true;
});

// ── SECTION 7: Existing features still intact ──────────────────────────

test('Existing trips table intact', function () {
    return Schema::hasTable('trips')
        && \App\Models\Trip::count() >= 0;
});

test('Existing alerts table intact', function () {
    return Schema::hasTable('alerts')
        && \App\Models\Alert::count() >= 0;
});

test('Existing locations table intact', function () {
    return Schema::hasTable('locations')
        && \App\Models\Location::count() >= 0;
});

test('Existing buses table intact', function () {
    return Schema::hasTable('buses')
        && \App\Models\Bus::count() >= 2; // Original 2 buses
});

test('Existing drivers table intact', function () {
    return Schema::hasTable('drivers')
        && \App\Models\Driver::count() >= 1;
});

// ── CRASH-SAFE CLEANUP (runs even on fatal errors) ─────────────────────

register_shutdown_function(function () {
    global $failed, $failures, $passed;
    fullCleanupAll();
    echo "\n=== RESULTS ===\n";
    echo "Total:  " . ($passed + $failed) . "\n";
    echo "Passed: {$passed}\n";
    echo "Failed: {$failed}\n";

    if ($failed > 0) {
        echo "\nFailed tests:\n";
        foreach ($failures as $label) {
            echo "  - {$label}\n";
        }
        exit(1);
    }

    echo "\nAll controller + route verification tests passed.\n";
    exit(0);
});
