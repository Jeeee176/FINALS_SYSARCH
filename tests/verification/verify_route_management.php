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

use App\Enums\DepartureQueueStatus;
use App\Enums\TripStatus;
use App\Http\Controllers\Admin\RouteController;
use App\Models\Bus;
use App\Models\DepartureQueue;
use App\Models\Route as RouteModel;
use App\Models\Trip;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Inertia\Support\SessionKey;

echo "=== Admin Route Management — Verification ===\n\n";

$GLOBALS['CREATED_ROUTES'] = [];
$GLOBALS['CREATED_BUSES'] = [];
$GLOBALS['CREATED_TRIPS'] = [];
$GLOBALS['CREATED_QUEUE'] = [];
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

$suffix = substr(md5((string) time()), 0, 6);

function mkRoute(string $tag, array $attrs = []): RouteModel
{
    $route = RouteModel::create(array_merge([
        'name' => "VRM-{$tag}-" . substr(md5((string) mt_rand()), 0, 6),
        'origin' => "VRM Origin {$tag}",
        'destination' => "VRM Destination {$tag}",
        'destination_lat' => null,
        'destination_lng' => null,
        'status' => 'active',
    ], $attrs));
    $GLOBALS['CREATED_ROUTES'][] = $route->id;
    return $route;
}

function mkBus(string $tag, ?int $routeId): Bus
{
    $bus = Bus::create([
        'bus_number' => "VRM-BUS-{$tag}-" . substr(md5((string) mt_rand()), 0, 6),
        'plate_number' => "VRM-PLT-{$tag}-" . substr(md5((string) mt_rand()), 0, 6),
        'model' => 'VRM TestBus',
        'capacity' => 20,
        'status' => 'active',
        'route_id' => $routeId,
    ]);
    $GLOBALS['CREATED_BUSES'][] = $bus->id;
    return $bus;
}

function mkTrip(Bus $bus, ?int $routeId, string $status): Trip
{
    $trip = Trip::create([
        'bus_id' => $bus->id,
        'route_id' => $routeId,
        'driver_id' => null,
        'status' => $status,
        'started_at' => now(),
        'ended_at' => $status === TripStatus::COMPLETED->value ? now() : null,
    ]);
    $GLOBALS['CREATED_TRIPS'][] = $trip->id;
    return $trip;
}

function mkQueue(Bus $bus, ?int $routeId, string $status): DepartureQueue
{
    $entry = DepartureQueue::create([
        'bus_id' => $bus->id,
        'driver_id' => null,
        'route_id' => $routeId,
        'queue_position' => 1,
        'status' => $status,
    ]);
    $GLOBALS['CREATED_QUEUE'][] = $entry->id;
    return $entry;
}

function indexProps(): array
{
    $controller = new RouteController();
    $response = $controller->index();
    $reflection = new ReflectionObject($response);
    $property = $reflection->getProperty('props');
    $property->setAccessible(true);
    return $property->getValue($response);
}

function flashedToast(): ?array
{
    $data = session(SessionKey::FLASH_DATA);
    $toast = $data['toast'] ?? null;
    return is_array($toast) ? $toast : null;
}

// ── Snapshot pre-existing operational data (must stay untouched) ─────────
$initialRoutes = DB::table('routes')->pluck('id')->sort()->values()->all();
$initialBuses = DB::table('buses')->get(['id', 'status', 'route_id', 'driver_id'])->keyBy('id');
$initialTrips = DB::table('trips')->get(['id', 'bus_id', 'route_id', 'status'])->keyBy('id');
$initialQueue = DB::table('departure_queue')->get(['id', 'bus_id', 'route_id', 'status'])->keyBy('id');
$initialDrivers = DB::table('drivers')->get(['id', 'bus_id', 'status'])->keyBy('id');

// ── 1. RBAC: admin.routes routes keep their middleware ──────────────────
$router = $app->make('router');
$routesByName = [];
foreach ($router->getRoutes() as $registered) {
    if ($registered->getName()) {
        $routesByName[$registered->getName()] = $registered;
    }
}

T('1. admin.routes resource routes keep auth+verified+role:admin middleware', function () use ($routesByName) {
    foreach (['admin.routes.index', 'admin.routes.store', 'admin.routes.update', 'admin.routes.destroy'] as $name) {
        $route = $routesByName[$name] ?? null;
        if ($route === null) {
            return "{$name} missing";
        }
        $middleware = $route->gatherMiddleware();
        if (!in_array('auth', $middleware, true)
            || !in_array('verified', $middleware, true)
            || !in_array('role:admin', $middleware, true)) {
            return "{$name} middleware changed";
        }
    }
    return true;
});

// ── Fixtures ─────────────────────────────────────────────────────────────
$routeA = mkRoute("{$suffix}-A", [
    'destination_lat' => '14.8527000',
    'destination_lng' => '120.8160000',
]);
$routeB = mkRoute("{$suffix}-B");
$busB = mkBus("{$suffix}-B", $routeB->id);
$routeC = mkRoute("{$suffix}-C", ['destination_lat' => '14.5000000']);
$routeD = mkRoute("{$suffix}-D", [
    'destination_lat' => '95.0000000',
    'destination_lng' => '200.0000000',
]);
$routeE = mkRoute("{$suffix}-E", [
    'destination_lat' => '14.6000000',
    'destination_lng' => '121.0000000',
]);
$busE = mkBus("{$suffix}-E", $routeE->id);
$tripE = mkTrip($busE, $routeE->id, TripStatus::IN_TRANSIT->value);
$routeF = mkRoute("{$suffix}-F");
$routeG = mkRoute("{$suffix}-G");
$busG = mkBus("{$suffix}-G", $routeG->id);
$tripF = mkTrip($busG, $routeF->id, TripStatus::SCHEDULED->value);
$routeH = mkRoute("{$suffix}-H");
$tripH = mkTrip($busG, $routeH->id, TripStatus::COMPLETED->value);
$queueH = mkQueue($busG, $routeH->id, DepartureQueueStatus::DEPARTED->value);
$routeI = mkRoute("{$suffix}-I");
$queueI = mkQueue($busG, $routeI->id, DepartureQueueStatus::QUEUED->value);

// ── 2. Index summary counts ──────────────────────────────────────────────
T('2. index summary totals agree with the database', function () {
    $props = indexProps();
    $summary = $props['summary'];

    $total = RouteModel::count();
    $withBuses = RouteModel::whereHas('buses')->count();
    $valid = RouteModel::query()
        ->whereNotNull('destination_lat')
        ->whereNotNull('destination_lng')
        ->whereBetween('destination_lat', [-90, 90])
        ->whereBetween('destination_lng', [-180, 180])
        ->count();

    if ($summary['total'] !== $total) {
        return "total {$summary['total']} != {$total}";
    }
    if ($summary['with_buses'] !== $withBuses) {
        return "with_buses {$summary['with_buses']} != {$withBuses}";
    }
    if ($summary['valid_coordinates'] !== $valid) {
        return "valid_coordinates {$summary['valid_coordinates']} != {$valid}";
    }
    if ($summary['missing_or_invalid_coordinates'] !== $total - $valid) {
        return 'missing_or_invalid != total - valid';
    }
    if (count($props['routes']) !== $total) {
        return 'routes list length != total';
    }
    return true;
});

T('3. index flags: valid coordinates only when both values are present and in range', function () use ($routeA, $routeB, $routeC, $routeD) {
    $props = indexProps();
    $routes = collect($props['routes'])->keyBy('id');

    $a = $routes[$routeA->id] ?? null;
    $b = $routes[$routeB->id] ?? null;
    $c = $routes[$routeC->id] ?? null;
    $d = $routes[$routeD->id] ?? null;

    if ($a === null || $b === null || $c === null || $d === null) {
        return 'fixture routes missing from payload';
    }
    if ($a['has_valid_coordinates'] !== true) {
        return 'full valid pair was not flagged valid';
    }
    if ($b['has_valid_coordinates'] !== false) {
        return 'null pair was not flagged invalid';
    }
    if ($c['has_valid_coordinates'] !== false) {
        return 'partial pair (lat only) was not flagged invalid';
    }
    if ($d['has_valid_coordinates'] !== false) {
        return 'out-of-range pair was not flagged invalid';
    }
    return true;
});

T('4. index flags open trips (in-progress vs scheduled) per route', function () use ($routeE, $routeF) {
    $props = indexProps();
    $routes = collect($props['routes'])->keyBy('id');

    $e = $routes[$routeE->id] ?? null;
    $f = $routes[$routeF->id] ?? null;

    if ($e === null || $f === null) {
        return 'fixture routes missing from payload';
    }
    if ($e['has_in_transit_trip'] !== true || $e['has_open_trips'] !== true) {
        return 'in-transit route flags wrong';
    }
    if ($f['has_in_transit_trip'] !== false || $f['has_open_trips'] !== true) {
        return 'scheduled-only route flags wrong';
    }
    return true;
});

T('5. index lists assigned buses per route (relationship, not trip history)', function () use ($routeB, $busB) {
    $props = indexProps();
    $routes = collect($props['routes'])->keyBy('id');

    $b = $routes[$routeB->id] ?? null;
    if ($b === null) {
        return 'fixture route missing from payload';
    }
    if (count($b['buses']) !== 1) {
        return 'expected exactly one assigned bus';
    }
    if ($b['buses'][0]['bus_number'] !== $busB->bus_number) {
        return 'assigned bus payload mismatch';
    }
    return true;
});

// ── 6. store() validation and creation ───────────────────────────────────
T('6. store() creates a route with the validated payload', function () use ($suffix) {
    $name = "VRM-STORE-{$suffix}-" . substr(md5((string) mt_rand()), 0, 6);
    $controller = new RouteController();
    $request = Request::create('/admin/routes', 'POST', [
        'name' => $name,
        'origin' => 'Store Origin',
        'destination' => 'Store Destination',
        'destination_lat' => '14.1000000',
        'destination_lng' => '121.1000000',
        'status' => 'active',
    ]);

    $response = $controller->store($request);

    $created = RouteModel::where('name', $name)->first();
    if ($created === null) {
        return 'route was not created';
    }
    $GLOBALS['CREATED_ROUTES'][] = $created->id;

    if (!$response->isRedirect()) {
        return 'store() did not redirect';
    }
    $toast = flashedToast();
    return is_array($toast) && ($toast['type'] ?? null) === 'success'
        ? true
        : 'success toast was not flashed';
});

T('7. store() rejects invalid payloads (duplicate name, out-of-range coordinates)', function () use ($routeA) {
    $controller = new RouteController();

    $base = [
        'origin' => 'Bad Origin',
        'destination' => 'Bad Destination',
        'destination_lat' => null,
        'destination_lng' => null,
        'status' => 'active',
    ];

    try {
        $controller->store(Request::create('/admin/routes', 'POST', $base + ['name' => $routeA->name]));
        return 'duplicate name was accepted';
    } catch (ValidationException $e) {
        if (!isset($e->errors()['name'])) {
            return 'duplicate name error missing';
        }
    }

    try {
        $controller->store(Request::create('/admin/routes', 'POST', [
            'name' => 'VRM-BAD-COORDS-' . substr(md5((string) mt_rand()), 0, 6),
            'origin' => 'Bad Origin',
            'destination' => 'Bad Destination',
            'destination_lat' => '91',
            'destination_lng' => '181',
            'status' => 'active',
        ]));
        return 'out-of-range coordinates were accepted';
    } catch (ValidationException $e) {
        $errors = $e->errors();
        return isset($errors['destination_lat'], $errors['destination_lng'])
            ? true
            : 'coordinate errors missing';
    }
});

T('8. update() saves changes and ignores the route\'s own name for uniqueness', function () use ($suffix) {
    $route = mkRoute("{$suffix}-UPD", [
        'destination_lat' => '14.2000000',
        'destination_lng' => '121.2000000',
    ]);

    $controller = new RouteController();
    $request = Request::create('/admin/routes/' . $route->id, 'PUT', [
        'name' => $route->name,
        'origin' => 'Updated Origin',
        'destination' => 'Updated Destination',
        'destination_lat' => null,
        'destination_lng' => null,
        'status' => 'inactive',
    ]);

    $response = $controller->update($request, $route);
    $route = $route->fresh();

    if (!$response->isRedirect()) {
        return 'update() did not redirect';
    }
    return $route->origin === 'Updated Origin'
        && $route->status === 'inactive'
        && $route->destination_lat === null
        && $route->destination_lng === null
        ? true
        : 'route attributes were not updated as expected';
});

// ── 9-13. destroy() relationship safety ──────────────────────────────────
T('9. destroy() is blocked while buses are assigned (route preserved)', function () use ($routeB) {
    $controller = new RouteController();
    $response = $controller->destroy($routeB->fresh());

    if (!RouteModel::where('id', $routeB->id)->exists()) {
        return 'route was deleted despite assigned buses';
    }
    $toast = flashedToast();
    if (!is_array($toast) || ($toast['type'] ?? null) !== 'error') {
        return 'error toast was not flashed';
    }
    if (!str_contains($toast['message'] ?? '', 'buses are still assigned')) {
        return 'unexpected error message: ' . ($toast['message'] ?? 'none');
    }
    return $response->isRedirect();
});

T('10. destroy() is blocked while a scheduled trip references the route', function () use ($routeF) {
    $controller = new RouteController();
    $response = $controller->destroy($routeF->fresh());

    if (!RouteModel::where('id', $routeF->id)->exists()) {
        return 'route was deleted despite open trip';
    }
    $toast = flashedToast();
    return is_array($toast)
        && ($toast['type'] ?? null) === 'error'
        && str_contains($toast['message'] ?? '', 'scheduled or in-progress trips')
        && $response->isRedirect()
        ? true
        : 'blocked without the expected trip message';
});

T('11. destroy() is blocked while an active departure queue entry references the route', function () use ($routeI) {
    $controller = new RouteController();
    $response = $controller->destroy($routeI->fresh());

    if (!RouteModel::where('id', $routeI->id)->exists()) {
        return 'route was deleted despite active queue entry';
    }
    $toast = flashedToast();
    return is_array($toast)
        && ($toast['type'] ?? null) === 'error'
        && str_contains($toast['message'] ?? '', 'departure queue')
        && $response->isRedirect()
        ? true
        : 'blocked without the expected queue message';
});

T('12. destroy() deletes a clean route', function () use ($routeA) {
    $controller = new RouteController();
    $response = $controller->destroy($routeA->fresh());

    if (RouteModel::where('id', $routeA->id)->exists()) {
        return 'route was not deleted';
    }
    $toast = flashedToast();
    return $response->isRedirect()
        && is_array($toast)
        && ($toast['type'] ?? null) === 'success'
        ? true
        : 'deleted without the expected success toast';
});

T('13. destroy() keeps historical trips and departed queue entries (route reference nulled)', function () use ($routeH, $tripH, $queueH) {
    $controller = new RouteController();
    $response = $controller->destroy($routeH->fresh());

    if (RouteModel::where('id', $routeH->id)->exists()) {
        return 'route was not deleted';
    }
    if (!$response->isRedirect()) {
        return 'destroy() did not redirect';
    }

    $trip = Trip::find($tripH->id);
    $entry = DepartureQueue::find($queueH->id);

    if ($trip === null) {
        return 'historical trip was deleted with the route';
    }
    if ($entry === null) {
        return 'departed queue entry was deleted with the route';
    }
    if ($trip->route_id !== null || $entry->route_id !== null) {
        return 'route references were not nulled';
    }
    return true;
});

// ── 14. Pre-existing data untouched ──────────────────────────────────────
T('14. pre-existing routes, buses, trips, queue entries and drivers were not modified', function () use ($initialRoutes, $initialBuses, $initialTrips, $initialQueue, $initialDrivers) {
    $nowRoutes = DB::table('routes')->pluck('id')->sort()->values()->all();
    foreach ($initialRoutes as $id) {
        if (!in_array($id, $nowRoutes, true)) {
            return "pre-existing route {$id} disappeared";
        }
    }

    $nowBuses = DB::table('buses')->get(['id', 'status', 'route_id', 'driver_id'])->keyBy('id');
    foreach ($initialBuses as $id => $before) {
        $after = $nowBuses[$id] ?? null;
        if ($after === null) {
            return "pre-existing bus {$id} disappeared";
        }
        if ($after->status !== $before->status
            || $after->route_id !== $before->route_id
            || $after->driver_id !== $before->driver_id) {
            return "pre-existing bus {$id} changed";
        }
    }

    $nowTrips = DB::table('trips')->get(['id', 'bus_id', 'route_id', 'status'])->keyBy('id');
    foreach ($initialTrips as $id => $before) {
        $after = $nowTrips[$id] ?? null;
        if ($after === null) {
            return "pre-existing trip {$id} disappeared";
        }
        if ($after->route_id !== $before->route_id || $after->status !== $before->status) {
            return "pre-existing trip {$id} changed";
        }
    }

    $nowQueue = DB::table('departure_queue')->get(['id', 'bus_id', 'route_id', 'status'])->keyBy('id');
    foreach ($initialQueue as $id => $before) {
        $after = $nowQueue[$id] ?? null;
        if ($after === null) {
            return "pre-existing queue entry {$id} disappeared";
        }
        if ($after->route_id !== $before->route_id || $after->status !== $before->status) {
            return "pre-existing queue entry {$id} changed";
        }
    }

    $nowDrivers = DB::table('drivers')->get(['id', 'bus_id', 'status'])->keyBy('id');
    foreach ($initialDrivers as $id => $before) {
        $after = $nowDrivers[$id] ?? null;
        if ($after === null) {
            return "pre-existing driver {$id} disappeared";
        }
        if ($after->bus_id !== $before->bus_id || $after->status !== $before->status) {
            return "pre-existing driver {$id} changed";
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

    foreach ($GLOBALS['CREATED_QUEUE'] as $id) {
        try {
            DepartureQueue::where('id', $id)->delete();
        } catch (\Throwable $e) {
            fwrite(STDERR, "  Warning: cleanup (queue {$id}) failed: {$e->getMessage()}\n");
        }
    }

    foreach ($GLOBALS['CREATED_TRIPS'] as $id) {
        try {
            Trip::where('id', $id)->delete();
        } catch (\Throwable $e) {
            fwrite(STDERR, "  Warning: cleanup (trip {$id}) failed: {$e->getMessage()}\n");
        }
    }

    foreach ($GLOBALS['CREATED_BUSES'] as $id) {
        try {
            DB::table('buses')->where('id', $id)->update(['driver_id' => null]);
            Bus::where('id', $id)->delete();
        } catch (\Throwable $e) {
            fwrite(STDERR, "  Warning: cleanup (bus {$id}) failed: {$e->getMessage()}\n");
        }
    }

    foreach ($GLOBALS['CREATED_ROUTES'] as $id) {
        try {
            RouteModel::where('id', $id)->delete();
        } catch (\Throwable $e) {
            fwrite(STDERR, "  Warning: cleanup (route {$id}) failed: {$e->getMessage()}\n");
        }
    }

    // Belt and braces: remove anything still carrying the fixture markers.
    try {
        $busIds = DB::table('buses')->where('bus_number', 'like', 'VRM-BUS-%')->pluck('id');
        if ($busIds->isNotEmpty()) {
            Trip::whereIn('bus_id', $busIds)->delete();
            DepartureQueue::whereIn('bus_id', $busIds)->delete();
            Bus::whereIn('id', $busIds)->delete();
        }
        RouteModel::where('name', 'like', 'VRM-%')->delete();
    } catch (\Throwable $e) {
        fwrite(STDERR, "  Warning: marker cleanup failed: {$e->getMessage()}\n");
    }

    if ($fail > 0) {
        echo "\nFailed tests:\n";
        foreach ($results as $label => $ok) {
            if (!$ok) {
                echo "  - {$label}\n";
            }
        }
        exit(1);
    }
    echo "\nAll route management tests passed.\n";
    exit(0);
});
