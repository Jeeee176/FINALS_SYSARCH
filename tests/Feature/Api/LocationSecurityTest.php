<?php

namespace Tests\Feature\Api;

use App\Models\User;
use App\Models\Bus;
use App\Models\Location;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

// Note: phpunit.xml sets DB_CONNECTION=sqlite :memory:
// This test uses RefreshDatabase which runs migrations against that SQLite DB.
// If you need to test against the real MySQL database, remove RefreshDatabase
// and point to the MySQL connection instead.

test('POST /api/locations unauthenticated is rejected', function () {
    $response = $this->postJson('/api/locations', [
        'latitude' => 10.0,
        'longitude' => 120.0,
    ]);

    $response->assertStatus(401)
        ->assertJson(['message' => 'Unauthenticated.']);
});

test('POST /api/locations authenticated non-driver is rejected', function () {
    $admin = User::factory()->create([
        'role' => 'admin',
    ]);

    $bus = Bus::factory()->create();

    $response = $this->actingAs($admin)->postJson('/api/locations', [
        'bus_id' => $bus->id,
        'latitude' => 10.0,
        'longitude' => 120.0,
    ]);

    $response->assertStatus(403)
        ->assertJson(['error' => 'Forbidden']);
});

test('POST /api/locations driver with no Driver record is rejected', function () {
    $driverUser = User::factory()->create([
        'role' => 'driver',
    ]);
    // No Driver record created for this user.

    $response = $this->actingAs($driverUser)->postJson('/api/locations', [
        'latitude' => 10.0,
        'longitude' => 120.0,
    ]);

    $response->assertStatus(404)
        ->assertJson(['error' => 'Driver record not found']);
});

test('POST /api/locations driver with no assigned bus is rejected', function () {
    $driverUser = User::factory()->create([
        'role' => 'driver',
    ]);
    $driver = \App\Models\Driver::factory()->create([
        'user_id' => $driverUser->id,
        'bus_id' => null,
    ]);

    $response = $this->actingAs($driverUser)->postJson('/api/locations', [
        'latitude' => 10.0,
        'longitude' => 120.0,
    ]);

    $response->assertStatus(422)
        ->assertJsonFragment(['error' => 'No bus assigned. Assign a bus before submitting GPS.']);
});

test('POST /api/locations driver with assigned bus succeeds, bus_id derived from assignment', function () {
    $driverUser = User::factory()->create([
        'role' => 'driver',
    ]);
    $bus = Bus::factory()->create();
    $driver = \App\Models\Driver::factory()->create([
        'user_id' => $driverUser->id,
        'bus_id' => $bus->id,
    ]);
    // Also assign on the bus side (as the real assignDriver does)
    $bus->driver_id = $driver->id;
    $bus->save();

    $response = $this->actingAs($driverUser)->postJson('/api/locations', [
        'latitude' => 14.7568,
        'longitude' => 121.0075,
        'recorded_at' => now()->toIso8601String(),
    ]);

    $response->assertStatus(201)
        ->assertJson([
            'success' => true,
            'message' => 'Location recorded successfully.',
            'location' => [
                'bus_id' => $bus->id,
                'latitude' => '14.7568',
                'longitude' => '121.0075',
            ],
        ]);

    $this->assertDatabaseHas('locations', [
        'bus_id' => $bus->id,
        'latitude' => 14.7568,
        'longitude' => 121.0075,
    ]);
});

test('POST /api/locations driver cannot submit for another bus (client bus_id ignored)', function () {
    $driverUser = User::factory()->create([
        'role' => 'driver',
    ]);
    $assignedBus = Bus::factory()->create();
    $otherBus = Bus::factory()->create();
    $driver = \App\Models\Driver::factory()->create([
        'user_id' => $driverUser->id,
        'bus_id' => $assignedBus->id,
    ]);
    $assignedBus->driver_id = $driver->id;
    $assignedBus->save();

    // Driver submits with otherBus id — should still record on assignedBus
    $response = $this->actingAs($driverUser)->postJson('/api/locations', [
        'bus_id' => $otherBus->id, // client tries to spoof another bus
        'latitude' => 14.7568,
        'longitude' => 121.0075,
    ]);

    $response->assertStatus(201);
    $body = $response->json();
    $this->assertSame($assignedBus->id, $body['location']['bus_id']);
    $this->assertNotSame($otherBus->id, $body['location']['bus_id']);
    $this->assertDatabaseMissing('locations', [
        'bus_id' => $otherBus->id,
        'latitude' => 14.7568,
    ]);
    $this->assertDatabaseHas('locations', [
        'bus_id' => $assignedBus->id,
        'latitude' => 14.7568,
    ]);
});

test('POST /api/locations invalid latitude rejected', function () {
    $driverUser = User::factory()->create([
        'role' => 'driver',
    ]);
    $driver = \App\Models\Driver::factory()->create([
        'user_id' => $driverUser->id,
        'bus_id' => Bus::factory()->create()->id,
    ]);

    $response = $this->actingAs($driverUser)->postJson('/api/locations', [
        'latitude' => 999,
        'longitude' => 120.0,
    ]);

    $response->assertStatus(422)
        ->assertJsonValidationErrors(['latitude']);
});

test('POST /api/locations invalid longitude rejected', function () {
    $driverUser = User::factory()->create([
        'role' => 'driver',
    ]);
    $driver = \App\Models\Driver::factory()->create([
        'user_id' => $driverUser->id,
        'bus_id' => Bus::factory()->create()->id,
    ]);

    $response = $this->actingAs($driverUser)->postJson('/api/locations', [
        'latitude' => 10.0,
        'longitude' => 999,
    ]);

    $response->assertStatus(422)
        ->assertJsonValidationErrors(['longitude']);
});

test('GET /api/buses/{bus}/location/latest remains accessible without auth', function () {
    $bus = Bus::factory()->create();
    Location::factory()->create([
        'bus_id' => $bus->id,
        'latitude' => 14.7568,
        'longitude' => 121.0075,
    ]);

    $response = $this->getJson("/api/buses/{$bus->id}/location/latest");

    $response->assertStatus(200)
        ->assertJson([
            'success' => true,
            'location' => [
                'latitude' => '14.7568',
                'longitude' => '121.0075',
            ],
        ]);
});

test('GET /api/buses/locations/latest remains accessible without auth', function () {
    $bus = Bus::factory()->create();
    Location::factory()->create([
        'bus_id' => $bus->id,
        'latitude' => 14.7568,
        'longitude' => 121.0075,
    ]);

    $response = $this->getJson('/api/buses/locations/latest');

    $response->assertStatus(200)
        ->assertJson(['success' => true])
        ->assertJsonStructure(['buses']);
});
