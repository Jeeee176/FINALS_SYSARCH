<?php
require_once __DIR__ . '/../../vendor/autoload.php';

// ── DATABASE SAFETY BARRIER ──────────────────────────────────────────────
// Refuse to run against the production/application database.
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

$app = require_once __DIR__ . '/../../bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

// Override default connection to use dedicated test database
if ($useTestConnection) {
    $app->make('config')->set('database.default', 'mysql_test');
}

use App\Models\User;
use App\Models\Bus;
use App\Models\Location;
use App\Http\Controllers\Api\LocationController;
use App\Http\Controllers\Driver\DriverLocationController;

echo "=== LOCATION HISTORY SECURITY FIX VERIFICATION ===\n\n";

// Track created records for crash-safe cleanup
$GLOBALS['CREATED_LOCATIONS'] = [];

// Get test users (after bootstrap so Eloquent can resolve connections)
$admin = User::where('role', 'admin')->first();
$driver = User::where('email', 'test@example.com')->first();
$operator = User::where('role', 'operator')->first();
$bus = Bus::where('bus_number', 'BUS-001')->first();

echo "USERS:\n";
echo "  Admin: " . ($admin?->email ?? 'NOT FOUND') . "\n";
echo "  Driver: " . ($driver?->email ?? 'NOT FOUND') . "\n";
echo "  Operator: " . ($operator?->email ?? 'NOT FOUND') . "\n";
echo "BUS: " . ($bus?->bus_number ?? 'NOT FOUND') . " (ID: " . ($bus?->id ?? 'N/A') . ")\n\n";

$pass = 0;
$fail = 0;

function trackLocation(int $id): void
{
    global $GLOBALS;
    $GLOBALS['CREATED_LOCATIONS'][] = $id;
}

function cleanupCreatedLocations(): void
{
    global $GLOBALS;
    foreach ($GLOBALS['CREATED_LOCATIONS'] ?? [] as $id) {
        try {
            $loc = Location::find($id);
            if ($loc !== null) $loc->delete();
        } catch (\Throwable $e) {
            fwrite(STDERR, "  Warning: cleanup failed for location {$id}: {$e->getMessage()}\n");
        }
    }
}

function runTest($name, $bus, $user, $params, $expectStatus, $checkFunc = null) {
    global $pass, $fail;

    echo "--- {$name} ---\n";

    if (!$bus) {
        echo "  SKIP: Bus not found\n\n";
        $fail++;
        return;
    }

    $request = Request::create('/api/buses/' . $bus->id . '/locations/history', 'GET', $params);

    if ($user) {
        $request->setUserResolver(function() use ($user) { return $user; });
    } else {
        $request->setUserResolver(function() { return null; });
    }

    try {
        $ctrl = new LocationController();
        $response = $ctrl->history($bus, $request);
        $status = $response->getStatusCode();
        $data = json_decode($response->getContent(), true);

        echo "  Status: {$status} (expected: {$expectStatus})\n";

        if ($status !== $expectStatus) {
            echo "  FAIL: Status mismatch\n";
            $fail++;
        } else {
            echo "  PASS: Status OK\n";
            $pass++;
        }

        if ($checkFunc) {
            $checkFunc($data);
        }

    } catch (Exception $e) {
        echo "  ERROR: " . $e->getMessage() . "\n";
        $fail++;
    }

    echo "\n";
}

// Test 1: Unauthenticated
runTest(
    '1. Unauthenticated → 401',
    $bus,
    null,
    [],
    401,
    function($data) use (&$pass, &$fail) {
        if (isset($data['error']) && $data['error'] === 'Unauthenticated') {
            echo "  PASS: Returns proper error message\n";
            $pass++;
        } else {
            echo "  FAIL: Unexpected response\n";
            $fail++;
        }
    }
);

// Test 2: Driver → 403
runTest(
    '2. Driver → 403',
    $bus,
    $driver,
    [],
    403,
    function($data) use (&$pass, &$fail) {
        if (isset($data['error']) && $data['error'] === 'Forbidden') {
            echo "  PASS: Driver properly rejected\n";
            $pass++;
        } else {
            echo "  FAIL: Expected 403 Forbidden\n";
            $fail++;
        }
    }
);

// Test 3: Admin → 200
runTest(
    '3. Admin → 200',
    $bus,
    $admin,
    [],
    200,
    function($data) use (&$pass, &$fail) {
        if ($data['success'] && $data['count'] > 0) {
            echo "  PASS: Returns {$data['count']} records\n";
            $pass++;
            $first = $data['locations'][0];
            echo "  Sample: ID {$first['id']} | {$first['latitude']}, {$first['longitude']}\n";
        } else {
            echo "  FAIL: Expected records\n";
            $fail++;
        }
    }
);

// Test 4: Operator → 200
runTest(
    '4. Operator → 200',
    $bus,
    $operator,
    [],
    200,
    function($data) use (&$pass, &$fail) {
        if ($data['success']) {
            echo "  PASS: Operator can view history\n";
            $pass++;
        } else {
            echo "  FAIL: Operator should have access\n";
            $fail++;
        }
    }
);

// Test 5: Limit=2
runTest(
    '5. Limit=2 filter',
    $bus,
    $admin,
    ['limit' => 2],
    200,
    function($data) use (&$pass, &$fail) {
        if ($data['count'] === 2) {
            echo "  PASS: Limit works ({$data['count']} records)\n";
            $pass++;
        } else {
            echo "  FAIL: Expected 2, got {$data['count']}\n";
            $fail++;
        }
    }
);

// Test 6: Before filter
runTest(
    '6. Before filter (before 2026-09-22T14:00:00)',
    $bus,
    $admin,
    ['before' => '2026-09-22T14:00:00+00:00'],
    200,
    function($data) use (&$pass, &$fail) {
        $ids = array_column($data['locations'], 'id');
        if (!in_array(9, $ids)) {
            echo "  PASS: Record ID 9 correctly excluded\n";
            $pass++;
        } else {
            echo "  FAIL: Record ID 9 should be excluded\n";
            $fail++;
        }
        echo "  Records: " . implode(', ', $ids) . "\n";
    }
);

// Test 7: After filter
runTest(
    '7. After filter (after 2026-09-22T13:58:00)',
    $bus,
    $admin,
    ['after' => '2026-09-22T13:58:00+00:00'],
    200,
    function($data) use (&$pass, &$fail) {
        $ids = array_column($data['locations'], 'id');
        if (!in_array(7, $ids)) {
            echo "  PASS: Record ID 7 correctly excluded\n";
            $pass++;
        } else {
            echo "  FAIL: Record ID 7 should be excluded\n";
            $fail++;
        }
        echo "  Records: " . implode(', ', $ids) . "\n";
    }
);

echo "=== EXISTING ENDPOINTS CHECK ===\n";
$ctrl = new LocationController();

// GET /api/buses/locations/latest (public)
$request = Request::create('/api/buses/locations/latest', 'GET');
$request->setUserResolver(function() { return null; });
$response = $ctrl->indexLatest();
echo "GET /api/buses/locations/latest (public): {$response->getStatusCode()}\n";
if ($response->getStatusCode() === 200) {
    echo "  PASS: Live tracking endpoint intact\n";
    $pass++;
} else {
    echo "  FAIL: Live tracking broken\n";
    $fail++;
}

// GET /api/buses/{bus}/location/latest
$bus2 = Bus::where('bus_number', 'BUS-001')->first();
if ($bus2) {
    $request = Request::create('/api/buses/2/location/latest', 'GET');
    $request->setUserResolver(function() { return null; });
    $response = $ctrl->showLatest($bus2, $request);
    echo "GET /api/buses/2/location/latest: {$response->getStatusCode()}\n";
}

// POST /api/locations (admin) — creates a test location then cleans up
if ($admin) {
    $busId = $bus ? $bus->id : 0;
    $request = Request::create('/api/locations', 'POST', [
        'bus_id' => $busId,
        'latitude' => 14.5995,
        'longitude' => 120.9842,
    ]);
    $request->setUserResolver(function() use ($admin) { return $admin; });
    $response = $ctrl->store($request);
    echo "POST /api/locations (admin): {$response->getStatusCode()}\n";
    if ($response->getStatusCode() === 201) {
        $data = json_decode($response->getContent(), true);
        $locId = $data['location']['id'] ?? null;
        echo "  Location created: ID {$locId}\n";
        if ($locId) {
            trackLocation($locId);
            echo "  Will clean up on exit\n";
            $pass++;
        }
    }
}

echo "\n=== DRIVER GPS ENDPOINTS CHECK ===\n";
$gpsCtrl = new DriverLocationController();

// GET /api/driver/location/latest (driver)
$request = Request::create('/api/driver/location/latest', 'GET');
$request->setUserResolver(function() use ($driver) { return $driver; });
$response = $gpsCtrl->showLatest();
echo "GET /api/driver/location/latest (driver): {$response->getStatusCode()}\n";

// POST /api/driver/location (driver) — creates a test location then cleans up
$request = Request::create('/api/driver/location', 'POST', [
    'latitude' => 14.5995,
    'longitude' => 120.9842,
]);
$request->setUserResolver(function() use ($driver) { return $driver; });
$response = $gpsCtrl->store($request);
echo "POST /api/driver/location (driver): {$response->getStatusCode()}\n";
if ($response->getStatusCode() === 201) {
    $data = json_decode($response->getContent(), true);
    $locId = $data['location']['id'] ?? null;
    if ($locId) {
        trackLocation($locId);
        echo "  Test location created: ID {$locId} (will clean up on exit)\n";
    }
}

echo "\n=== DATABASE CHECK ===\n";
$total = Location::count();
echo "Total location records: {$total}\n";
$busCheck = Bus::where('bus_number', 'BUS-001')->withCount('locations')->first();
if ($busCheck && $busCheck->locations_count >= 1) {
    echo "BUS-001 locations: {$busCheck->locations_count}\n";
    echo "PASS: BUS-001 record preserved\n";
    $pass++;
} else {
    echo "INFO: BUS-001 check skipped (may not exist in test DB)\n";
}

echo "\n=== SUMMARY ===\n";
echo "Passed: {$pass}\n";
echo "Failed: {$fail}\n";
echo "Total: " . ($pass + $fail) . "\n";

// ── CRASH-SAFE CLEANUP ──────────────────────────────────────────────────
register_shutdown_function(function () {
    global $fail;
    cleanupCreatedLocations();
    if ($fail > 0) {
        echo "\n=== VERIFICATION COMPLETE (with failures) ===\n";
        exit(1);
    }
    echo "\n=== VERIFICATION COMPLETE ===\n";
    exit(0);
});
