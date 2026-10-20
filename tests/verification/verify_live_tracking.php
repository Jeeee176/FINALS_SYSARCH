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

use App\Enums\Role;
use App\Enums\TripStatus;
use App\Http\Controllers\Api\LocationController;
use App\Http\Controllers\Operator\LiveMonitoringController;
use App\Models\Bus;
use App\Models\Driver;
use App\Models\Location;
use App\Models\Route as RouteModel;
use App\Models\Trip;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route as RouteFacade;

// Boot Laravel (minimal)
$app = require_once __DIR__ . '/../../bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

// Override default connection to use dedicated test database
if ($useTestConnection) {
    $app->make('config')->set('database.default', 'mysql_test');
}

echo "=== Live Tracking — API Payload + Operator Fleet Verification ===\n\n";

$tests    = 0;
$passed   = 0;
$failed   = 0;
$failures = [];

$CREATED = [
    'route'   => null,
    'users'   => [],
    'drivers' => [],
    'buses'   => [],
    'trips'   => [],
];

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

// ── FIXTURES ─────────────────────────────────────────────────────────────

$suffix = bin2hex(random_bytes(4));

$route = RouteModel::create([
    'name'            => 'LT-VERIFY-RT-' . $suffix,
    'origin'          => 'Verification Origin',
    'destination'     => 'Verification Destination',
    'destination_lat' => 14.85,
    'destination_lng' => 120.95,
    'status'          => 'active',
]);
$CREATED['route'] = $route->id;

$driverUser = User::create([
    'name'     => 'LT Verify Driver ' . $suffix,
    'email'    => "lt-verify-drv-{$suffix}@example.com",
    'password' => 'password',
    'role'     => Role::DRIVER,
]);
$CREATED['users'][] = $driverUser->id;

$driver = Driver::create([
    'user_id'        => $driverUser->id,
    'license_number' => 'LT-V-LIC-' . $suffix,
    'license_expiry' => now()->addYear()->toDateString(),
    'phone'          => '555-0000',
    'address'        => 'Verification Address',
    'status'         => 'active',
]);
$CREATED['drivers'][] = $driver->id;

// Bus 1: route + driver + two GPS locations (full case)
$busFull = Bus::create([
    'bus_number'   => 'LT-V-FULL-' . $suffix,
    'plate_number' => 'LT-V-001',
    'model'        => 'Verification Model',
    'capacity'     => 40,
    'status'       => 'active',
    'route_id'     => $route->id,
    'driver_id'    => $driver->id,
]);
$CREATED['buses'][] = $busFull->id;

Location::create([
    'bus_id'      => $busFull->id,
    'latitude'    => 14.7000000,
    'longitude'   => 120.9800000,
    'accuracy'    => 8.5,
    'recorded_at' => now()->subMinutes(2),
]);
Location::create([
    'bus_id'      => $busFull->id,
    'latitude'    => 14.7010000,
    'longitude'   => 120.9810000,
    'accuracy'    => 7.5,
    'recorded_at' => now()->subMinute(),
]);

// Bus 2: in-transit trip, no route, no driver, no GPS (awaiting-GPS case)
$busAwaiting = Bus::create([
    'bus_number'   => 'LT-V-AWAIT-' . $suffix,
    'plate_number' => 'LT-V-002',
    'model'        => null,
    'capacity'     => 40,
    'status'       => 'active',
    'route_id'     => null,
    'driver_id'    => null,
]);
$CREATED['buses'][] = $busAwaiting->id;

$trip = Trip::create([
    'bus_id'     => $busAwaiting->id,
    'route_id'   => null,
    'driver_id'  => null,
    'status'     => TripStatus::IN_TRANSIT->value,
    'started_at' => now()->subMinutes(10),
]);
$CREATED['trips'][] = $trip->id;

// Bus 3: no trips, no locations, no route (must stay out of the API payload)
$busIdle = Bus::create([
    'bus_number'   => 'LT-V-IDLE-' . $suffix,
    'plate_number' => 'LT-V-003',
    'model'        => null,
    'capacity'     => 40,
    'status'       => 'active',
    'route_id'     => null,
    'driver_id'    => null,
]);
$CREATED['buses'][] = $busIdle->id;

// Bus 4: route + one location, no driver (route without driver case)
$busNoDriver = Bus::create([
    'bus_number'   => 'LT-V-NODRV-' . $suffix,
    'plate_number' => 'LT-V-004',
    'model'        => null,
    'capacity'     => 40,
    'status'       => 'active',
    'route_id'     => $route->id,
    'driver_id'    => null,
]);
$CREATED['buses'][] = $busNoDriver->id;

Location::create([
    'bus_id'      => $busNoDriver->id,
    'latitude'    => 14.7200000,
    'longitude'   => 120.9900000,
    'accuracy'    => null,
    'recorded_at' => now()->subMinutes(3),
]);

// ── HELPERS ──────────────────────────────────────────────────────────────

function indexLatestPayload(): array
{
    $controller = new LocationController();
    $response = $controller->indexLatest();
    $decoded = json_decode($response->getContent(), true);

    if (!is_array($decoded)) {
        throw new RuntimeException('indexLatest() did not return JSON');
    }

    return $decoded;
}

function operatorFleetProps(): array
{
    $controller = new LiveMonitoringController();
    $response = $controller->index();

    if (!($response instanceof Inertia\Response)) {
        throw new RuntimeException(
            'Expected Inertia\\Response, got ' . get_class($response),
        );
    }

    $reflection = new ReflectionClass($response);
    $property = $reflection->getProperty('props');
    $props = $property->getValue($response);

    if (!isset($props['buses'])) {
        throw new RuntimeException('Operator fleet props missing "buses"');
    }

    return $props;
}

$payload = indexLatestPayload();
$byId = collect($payload['buses'] ?? [])->keyBy('id');

// ── SECTION 1: indexLatest response contract ────────────────────────────

test('indexLatest returns success with buses array and fleet_total', function () use ($payload) {
    if (($payload['success'] ?? null) !== true) return 'success !== true';
    if (!is_array($payload['buses'] ?? null)) return 'buses is not an array';
    if (!is_int($payload['fleet_total'] ?? null)) return 'fleet_total is not an integer';
    return true;
});

test('fleet_total equals the real bus count (single counting source)', function () use ($payload) {
    $expected = Bus::count();
    if ($payload['fleet_total'] !== $expected) {
        return "expected {$expected}, got {$payload['fleet_total']}";
    }
    return true;
});

test('bus with route + driver + GPS carries route object', function () use ($byId, $busFull, $route) {
    $entry = $byId->get($busFull->id);
    if (!$entry) return 'bus missing from payload';
    $routeInfo = $entry['route'] ?? 'absent';
    if (!is_array($routeInfo)) return 'route is not an object';
    if ($routeInfo['id'] !== $route->id) return 'route.id mismatch';
    if ($routeInfo['name'] !== $route->name) return 'route.name mismatch';
    if ($routeInfo['status'] !== $route->status) return 'route.status mismatch';
    return true;
});

test('bus with route + driver + GPS carries driver object with user name', function () use ($byId, $busFull, $driver, $driverUser) {
    $entry = $byId->get($busFull->id);
    if (!$entry) return 'bus missing from payload';
    $driverInfo = $entry['driver'] ?? 'absent';
    if (!is_array($driverInfo)) return 'driver is not an object';
    if ($driverInfo['id'] !== $driver->id) return 'driver.id mismatch';
    if ($driverInfo['name'] !== $driverUser->name) return 'driver.name mismatch';
    return true;
});

test('existing indexLatest fields are unchanged (dashboard compatibility)', function () use ($byId, $busFull) {
    $entry = $byId->get($busFull->id);
    if (!$entry) return 'bus missing from payload';

    foreach (['id', 'bus_number', 'plate_number', 'model', 'status', 'location', 'is_tracking_active', 'current_trip'] as $key) {
        if (!array_key_exists($key, $entry)) return "missing key: {$key}";
    }

    $location = $entry['location'];
    if (!is_array($location)) return 'location is not an object';
    foreach (['latitude', 'longitude', 'accuracy', 'recorded_at'] as $key) {
        if (!array_key_exists($key, $location)) return "missing location key: {$key}";
    }

    if ($entry['is_tracking_active'] !== false) return 'is_tracking_active should be false (no trip)';
    if ($entry['current_trip'] !== null) return 'current_trip should be null (no trip)';
    if ($entry['status'] !== 'active') return 'status mismatch';
    return true;
});

test('in-transit bus without GPS appears with null location and null route/driver', function () use ($byId, $busAwaiting, $trip) {
    $entry = $byId->get($busAwaiting->id);
    if (!$entry) return 'awaiting-GPS bus missing from payload';
    if ($entry['location'] !== null) return 'location should be null';
    if ($entry['is_tracking_active'] !== true) return 'is_tracking_active should be true';
    if (($entry['current_trip']['id'] ?? null) !== $trip->id) return 'current_trip.id mismatch';
    if (($entry['current_trip']['status'] ?? null) !== TripStatus::IN_TRANSIT->value) return 'current_trip.status mismatch';
    if ($entry['route'] !== null) return 'route should be null';
    if ($entry['driver'] !== null) return 'driver should be null';
    return true;
});

test('bus with route but no driver reports driver null without breaking route', function () use ($byId, $busNoDriver, $route) {
    $entry = $byId->get($busNoDriver->id);
    if (!$entry) return 'bus missing from payload';
    if ($entry['driver'] !== null) return 'driver should be null';
    if (($entry['route']['id'] ?? null) !== $route->id) return 'route.id mismatch';
    return true;
});

test('bus with no locations and no trips stays out of the payload (unchanged bus set)', function () use ($byId, $busIdle) {
    if ($byId->has($busIdle->id)) {
        return 'idle bus should not appear in indexLatest';
    }
    return true;
});

// ── SECTION 2: Operator fleet (Inertia) props ───────────────────────────

$operatorProps = operatorFleetProps();
$operatorById = collect($operatorProps['buses'])->keyBy('id');

test('operator fleet includes the in-transit bus with route/driver keys', function () use ($operatorById, $busAwaiting, $trip) {
    $entry = $operatorById->get($busAwaiting->id);
    if (!$entry) return 'in-transit bus missing from operator fleet';
    if (!array_key_exists('route', $entry)) return 'route key missing';
    if (!array_key_exists('driver', $entry)) return 'driver key missing';
    if ($entry['route'] !== null) return 'route should be null';
    if ($entry['driver'] !== null) return 'driver should be null';
    if (($entry['current_trip']['id'] ?? null) !== $trip->id) return 'current_trip.id mismatch';
    return true;
});

test('operator fleet never-had-trip bus carries route/driver objects', function () use ($operatorById, $busFull, $route, $driver, $driverUser) {
    $entry = $operatorById->get($busFull->id);
    if (!$entry) return 'never-trip bus missing from operator fleet';
    if (($entry['route']['id'] ?? null) !== $route->id) return 'route.id mismatch';
    if (($entry['route']['name'] ?? null) !== $route->name) return 'route.name mismatch';
    if (($entry['driver']['id'] ?? null) !== $driver->id) return 'driver.id mismatch';
    if (($entry['driver']['name'] ?? null) !== $driverUser->name) return 'driver.name mismatch';
    if (($entry['is_tracking_active'] ?? null) !== false) return 'is_tracking_active should be false';
    return true;
});

test('operator fleet existing fields are unchanged', function () use ($operatorById, $busAwaiting) {
    $entry = $operatorById->get($busAwaiting->id);
    if (!$entry) return 'bus missing from operator fleet';

    foreach (['id', 'bus_number', 'plate_number', 'model', 'status', 'latitude', 'longitude', 'recorded_at', 'current_trip'] as $key) {
        if (!array_key_exists($key, $entry)) return "missing key: {$key}";
    }

    return true;
});

test('operator fleet lists every bus exactly once', function () use ($operatorProps, $busAwaiting) {
    $ids = collect($operatorProps['buses'])->pluck('id')->all();

    if (count($ids) !== count(array_unique($ids))) {
        return 'duplicate bus ids in operator fleet';
    }

    if (count(array_keys($ids, $busAwaiting->id)) !== 1) {
        return 'in-transit bus without GPS should appear exactly once';
    }

    return true;
});

// ── SECTION 3: RBAC spot checks (tracking surfaces) ─────────────────────

test('/api/buses/{bus}/eta still requires authentication', function () {
    $route = RouteFacade::getRoutes()->getByName('api.buses.eta.show')
        ?? collect(RouteFacade::getRoutes()->getRoutes())
            ->first(fn($r) => str_contains($r->uri(), 'buses/{bus}/eta'));

    if (!$route) return 'ETA route not found';

    $middleware = $route->gatherMiddleware();
    if (!in_array('auth', $middleware)) return 'auth middleware missing';

    return true;
});

test('admin/tracking route keeps role:admin middleware', function () {
    $route = RouteFacade::getRoutes()->getByName('admin.tracking');
    if (!$route) return 'Route not found';

    $middleware = $route->gatherMiddleware();
    foreach (['auth', 'verified', 'role:admin'] as $expected) {
        if (!in_array($expected, $middleware)) return "missing middleware: {$expected}";
    }

    return true;
});

test('operator/tracking route keeps role:operator middleware', function () {
    $route = RouteFacade::getRoutes()->getByName('operator.tracking');
    if (!$route) return 'Route not found';

    $middleware = $route->gatherMiddleware();
    foreach (['auth', 'verified', 'role:operator'] as $expected) {
        if (!in_array($expected, $middleware)) return "missing middleware: {$expected}";
    }

    return true;
});

// ── CRASH-SAFE CLEANUP ───────────────────────────────────────────────────

register_shutdown_function(function () {
    global $failed, $failures, $passed, $CREATED;

    if (!empty($CREATED['buses'])) {
        Location::whereIn('bus_id', $CREATED['buses'])->delete();
    }
    if (!empty($CREATED['trips'])) {
        Trip::whereIn('id', $CREATED['trips'])->delete();
    }
    if (!empty($CREATED['buses'])) {
        Bus::whereIn('id', $CREATED['buses'])->delete();
    }
    if (!empty($CREATED['drivers'])) {
        Driver::whereIn('id', $CREATED['drivers'])->delete();
    }
    if (!empty($CREATED['users'])) {
        User::whereIn('id', $CREATED['users'])->delete();
    }
    if (!empty($CREATED['route'])) {
        RouteModel::where('id', $CREATED['route'])->delete();
    }

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

    echo "\nAll live tracking verification tests passed.\n";
    exit(0);
});
