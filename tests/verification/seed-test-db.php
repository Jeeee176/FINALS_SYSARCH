<?php
/**
 * Minimal seeder for the test database (bus_tracking_test).
 * Creates the minimum data needed for verification scripts to run.
 *
 * Usage: php tests/verification/seed-test-db.php
 * Reset: php tests/verification/clear-test-db.php
 */
require __DIR__ . '/../../vendor/autoload.php';

$app = require_once __DIR__ . '/../../bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

// Always use the dedicated test connection — never touch the real DB
$app->make('config')->set('database.default', 'mysql_test');

use App\Models\User;
use App\Models\Route;
use App\Models\Bus;
use App\Models\Driver;
use App\Enums\Role;
use Illuminate\Support\Facades\DB;

echo "=== Seeding test database ===\n\n";

DB::transaction(function () {
    // 1. Create admin user
    $admin = User::firstWhere('email', 'admin@test.local')
        ?? User::create([
            'name' => 'Test Admin',
            'email' => 'admin@test.local',
            'password' => bcrypt('password'),
            'role' => Role::ADMIN,
        ]);
    echo "  Admin user: {$admin->id} ({$admin->email})\n";

    // 2. Create operator user
    $operator = User::firstWhere('email', 'operator@test.local')
        ?? User::create([
            'name' => 'Test Operator',
            'email' => 'operator@test.local',
            'password' => bcrypt('password'),
            'role' => Role::OPERATOR,
        ]);
    echo "  Operator user: {$operator->id} ({$operator->email})\n";

    // 3. Create primary driver user + profile
    $driverUser = User::firstWhere('email', 'driver@test.local')
        ?? User::create([
            'name' => 'Test Driver',
            'email' => 'driver@test.local',
            'password' => bcrypt('password'),
            'role' => Role::DRIVER,
        ]);
    echo "  Driver user: {$driverUser->id} ({$driverUser->email})\n";

    $driver = Driver::firstWhere('user_id', $driverUser->id)
        ?? Driver::create([
            'user_id' => $driverUser->id,
            'license_number' => 'TEST-LIC-001',
            'license_expiry' => now()->addYear()->toDateString(),
            'phone' => '555-0001',
            'address' => 'Test Address',
            'status' => 'active',
        ]);
    echo "  Driver profile: {$driver->id}\n";

    // 3b. Create test@example.com driver user for verify_fix.php (test 2 expects 403)
    $fixDriverUser = User::firstWhere('email', 'test@example.com')
        ?? User::create([
            'name' => 'Test Driver Fix',
            'email' => 'test@example.com',
            'password' => bcrypt('password'),
            'role' => Role::DRIVER,
        ]);
    echo "  Fix driver user: {$fixDriverUser->id} ({$fixDriverUser->email})";

    $fixDriver = Driver::firstWhere('user_id', $fixDriverUser->id)
        ?? Driver::create([
            'user_id' => $fixDriverUser->id,
            'license_number' => 'TEST-LIC-002',
            'license_expiry' => now()->addYear()->toDateString(),
            'phone' => '555-0002',
            'address' => 'Test Address 2',
            'status' => 'active',
        ]);
    echo "  Fix driver profile: {$fixDriver->id}";

    // 4. Create routes (need 2+ for verification tests)
    $route = Route::firstWhere('name', 'Test Route')
        ?? Route::create([
            'name' => 'Test Route',
            'origin' => 'Test Origin',
            'destination' => 'Test Destination',
            'status' => 'active',
            'origin_lat' => 14.5995,
            'origin_lng' => 120.9842,
            'destination_lat' => 14.6321,
            'destination_lng' => 120.9654,
        ]);
    echo "  Route: {$route->id} ({$route->name})";

    $route2 = Route::firstWhere('name', 'Test Route 2')
        ?? Route::create([
            'name' => 'Test Route 2',
            'origin' => 'Test Origin 2',
            'destination' => 'Test Destination 2',
            'status' => 'active',
            'origin_lat' => 14.6000,
            'origin_lng' => 120.9850,
            'destination_lat' => 14.6330,
            'destination_lng' => 120.9660,
        ]);
    echo "  Route 2: {$route2->id} ({$route2->name})";

    // 5. Create primary bus
    $bus = Bus::firstWhere('bus_number', 'TEST-BUS-001')
        ?? Bus::create([
            'bus_number' => 'TEST-BUS-001',
            'plate_number' => 'TEST-PLATE-001',
            'model' => 'TestBus',
            'capacity' => 20,
            'status' => 'active',
            'route_id' => $route->id,
            'driver_id' => $driver->id,
        ]);
    echo "  Bus: {$bus->id} ({$bus->bus_number})";

    // 5b. Create BUS-001 (for verify_fix.php)
    $bus2 = Bus::firstWhere('bus_number', 'BUS-001')
        ?? Bus::create([
            'bus_number' => 'BUS-001',
            'plate_number' => 'TEST-PLATE-002',
            'model' => 'TestBus',
            'capacity' => 30,
            'status' => 'active',
            'route_id' => $route2->id,
        ]);
    echo "  Bus 2: {$bus2->id} ({$bus2->bus_number})";

    // 6. Link driver + bus (bidirectional)
    $driver->bus_id = $bus->id;
    $driver->save();
    $bus->driver_id = $driver->id;
    $bus->save();
    echo "  Bidirectional link established\n";

    // 7. Create trips
    $trip = \App\Models\Trip::create([
        'bus_id' => $bus->id,
        'driver_id' => $driver->id,
        'route_id' => $route->id,
        'status' => 'scheduled',
        'started_at' => null,
        'completed_at' => null,
    ]);
    echo "  Trip: {$trip->id}\n";

    $trip2 = \App\Models\Trip::create([
        'bus_id' => $bus2->id,
        'driver_id' => $driver->id,
        'route_id' => $route2->id,
        'status' => 'scheduled',
        'started_at' => null,
        'completed_at' => null,
    ]);
    echo "  Trip 2: {$trip2->id}";

    // 8. Create locations
    \App\Models\Location::create([
        'bus_id' => $bus->id,
        'latitude' => 14.5995,
        'longitude' => 120.9842,
        'speed' => 0,
        'heading' => 0,
        'recorded_at' => now(),
    ]);
    echo "  Location created";

    \App\Models\Location::create([
        'bus_id' => $bus2->id,
        'latitude' => 14.5995,
        'longitude' => 120.9842,
        'speed' => 0,
        'heading' => 0,
        'recorded_at' => now(),
    ]);
    echo "  Location 2 created";
});

echo "\n\n=== Test database seeded successfully ===\n";
