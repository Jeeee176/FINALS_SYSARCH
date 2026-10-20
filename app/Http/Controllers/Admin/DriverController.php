<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Bus;
use App\Models\Driver;
use App\Models\Trip;
use App\Models\User;
use App\Models\DepartureQueue;
use App\Enums\Role;
use App\Enums\TripStatus;
use App\Services\BusAssignmentService;
use App\Services\ProfilePhotoService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Inertia\Inertia;

class DriverController extends Controller
{
    public function __construct(
        private readonly ProfilePhotoService $photos,
    ) {}

    /**
     * Display a listing of the resource.
     */
    public function index()
    {
        $drivers = Driver::query()
            ->with(['user', 'bus'])
            ->get()
            ->sortBy(fn (Driver $driver) => strtolower($driver->user?->name ?? ''))
            ->values();

        $inTransitBusIds = Trip::query()
            ->where('status', TripStatus::IN_TRANSIT->value)
            ->pluck('bus_id')
            ->all();

        $drivers = $drivers->map(fn (Driver $driver) => [
            'id' => $driver->id,
            'user_id' => $driver->user_id,
            'license_number' => $driver->license_number,
            'license_expiry' => $driver->license_expiry?->toDateString(),
            'phone' => $driver->phone,
            'address' => $driver->address,
            'status' => $driver->status,
            'bus_id' => $driver->bus_id,
            'user' => $driver->user ? [
                'id' => $driver->user->id,
                'name' => $driver->user->name,
                'email' => $driver->user->email,
                'avatar' => $driver->user->avatarUrl(),
            ] : null,
            'bus' => $driver->bus ? [
                'id' => $driver->bus->id,
                'bus_number' => $driver->bus->bus_number,
                'plate_number' => $driver->bus->plate_number,
            ] : null,
            'has_in_transit_trip' => $driver->bus_id !== null
                && in_array($driver->bus_id, $inTransitBusIds, true),
        ]);

        // Buses without a driver — used by the assignment dialog on this page.
        $availableBuses = Bus::query()
            ->whereNull('driver_id')
            ->orderBy('bus_number')
            ->get(['id', 'bus_number', 'plate_number'])
            ->map(fn (Bus $bus) => [
                'id' => $bus->id,
                'bus_number' => $bus->bus_number,
                'plate_number' => $bus->plate_number,
            ])
            ->values();

        return Inertia::render('admin/drivers/index', [
            'drivers' => $drivers,
            'availableBuses' => $availableBuses,
        ]);
    }

    /**
     * Show the form for creating a new resource.
     */
    public function create()
    {
        return Inertia::render('admin/drivers/create');
    }

    /**
     * Store a newly created resource in storage.
     */
    public function store(Request $request)
    {
        $validated = $request->validate([
            'name' => [
                'required',
                'string',
                'max:255',
            ],
            'email' => [
                'required',
                'email',
                'max:255',
                Rule::unique('users', 'email'),
            ],
            'password' => [
                'required',
                'string',
                'min:8',
                'confirmed',
            ],
            'license_number' => [
                'required',
                'string',
                'max:255',
                'unique:drivers,license_number',
            ],
            'license_expiry' => [
                'required',
                'date',
            ],
            'phone' => [
                'nullable',
                'string',
                'max:255',
            ],
            'address' => [
                'nullable',
                'string',
            ],
            'status' => [
                'required',
                'in:active,inactive',
            ],
            'photo' => [
                'nullable',
                'image',
                'mimes:jpeg,png,webp',
                'max:2048',
            ],
        ]);

        $photoPath = $request->hasFile('photo')
            ? $this->photos->store($request->file('photo'))
            : null;

        try {
            $user = DB::transaction(function () use ($validated, $photoPath) {
                $user = User::create([
                    'name' => $validated['name'],
                    'email' => $validated['email'],
                    'password' => $validated['password'],
                    'role' => Role::DRIVER,
                    'avatar_path' => $photoPath,
                ]);

                Driver::create([
                    'user_id' => $user->id,
                    'license_number' => $validated['license_number'],
                    'license_expiry' => $validated['license_expiry'],
                    'phone' => $validated['phone'] ?? null,
                    'address' => $validated['address'] ?? null,
                    'status' => $validated['status'],
                ]);

                return $user;
            });
        } catch (\Throwable $e) {
            if ($photoPath !== null) {
                Storage::disk(ProfilePhotoService::DISK)->delete($photoPath);
            }
            throw $e;
        }

        return redirect()->route('admin.drivers.index')
            ->with('success', 'Driver account created successfully.');
    }

    /**
     * Show the form for editing the specified resource.
     */
    public function edit(Driver $driver)
    {
        $driver->load('user');

        return Inertia::render('admin/drivers/edit', [
            'driver' => $driver->only([
                'id',
                'user_id',
                'license_number',
                'license_expiry',
                'phone',
                'address',
                'status',
            ]),
            'user' => [
                'id' => $driver->user->id,
                'name' => $driver->user->name,
                'email' => $driver->user->email,
                'avatar' => $driver->user->avatarUrl(),
            ],
        ]);
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(Request $request, Driver $driver)
    {
        $validated = $request->validate([
            'license_number' => [
                'required',
                'string',
                'max:255',
                Rule::unique('drivers', 'license_number')->ignore($driver->id),
            ],
            'license_expiry' => [
                'required',
                'date',
            ],
            'phone' => [
                'nullable',
                'string',
                'max:255',
            ],
            'address' => [
                'nullable',
                'string',
            ],
            'status' => [
                'required',
                'in:active,inactive',
            ],
            // Optional: update linked user info
            'user.name' => [
                'nullable',
                'string',
                'max:255',
            ],
            'user.email' => [
                'nullable',
                'email',
                'max:255',
                Rule::unique('users', 'email')->ignore($driver->user->id),
            ],
            'user.password' => [
                'nullable',
                'string',
                'min:8',
                'confirmed',
            ],
            'photo' => [
                'nullable',
                'image',
                'mimes:jpeg,png,webp',
                'max:2048',
            ],
            'remove_photo' => [
                'nullable',
                'boolean',
            ],
        ]);

        $newPhotoPath = $request->hasFile('photo')
            ? $this->photos->store($request->file('photo'))
            : null;
        $removeRequested = $request->boolean('remove_photo');
        $oldPhotoPath = $driver->user?->avatar_path;

        try {
            DB::transaction(function () use ($driver, $validated, $newPhotoPath, $removeRequested) {
                // Update driver profile
                $driver->update([
                    'license_number' => $validated['license_number'],
                    'license_expiry' => $validated['license_expiry'],
                    'phone' => $validated['phone'] ?? null,
                    'address' => $validated['address'] ?? null,
                    'status' => $validated['status'],
                ]);

                // Update linked user if provided
                if (!empty($validated['user']['name']) || !empty($validated['user']['email'])) {
                    $updateData = [];
                    if (!empty($validated['user']['name'])) {
                        $updateData['name'] = $validated['user']['name'];
                    }
                    if (!empty($validated['user']['email'])) {
                        $updateData['email'] = $validated['user']['email'];
                    }
                    $driver->user->update($updateData);
                }

                // Update password if provided
                if (!empty($validated['user']['password'])) {
                    $driver->user->update([
                        'password' => $validated['user']['password'],
                    ]);
                }

                // Apply the photo change inside the same transaction so the
                // account and its photo never drift apart.
                if ($newPhotoPath !== null) {
                    $driver->user->update(['avatar_path' => $newPhotoPath]);
                } elseif ($removeRequested) {
                    $driver->user->update(['avatar_path' => null]);
                }
            });
        } catch (\Throwable $e) {
            if ($newPhotoPath !== null) {
                Storage::disk(ProfilePhotoService::DISK)->delete($newPhotoPath);
            }
            throw $e;
        }

        // Only after the database commit may the previous file be deleted,
        // and only when no other user still references it.
        if ($newPhotoPath !== null || $removeRequested) {
            $this->photos->deleteIfUnreferenced($oldPhotoPath, $driver->user_id);
        }

        return redirect()->route('admin.drivers.index')
            ->with('success', 'Driver updated successfully.');
    }

    /**
     * Remove the specified resource from storage.
     */
    public function destroy(Driver $driver)
    {
        try {
            DB::transaction(function () use ($driver) {
                // Reload fresh attributes from the database so guarded columns
                // like bus_id are available for the FK-clearing logic below.
                $driver->refresh();

                // Break the bidirectional Driver ↔ Bus link before deleting
                // (both sides use restrictOnDelete). The bus is marked
                // inactive once it is truly unassigned, and the change is
                // rejected while the bus has an in-progress trip.
                BusAssignmentService::releaseBusForDriverDeletion($driver);

                // Clear any departure queue entries assigned to this driver.
                // departure_queue.driver_id uses nullOnDelete(), so the FK would
                // auto-null on delete — but we explicitly clear them here to avoid
                // leaving orphaned queue entries with a NULL driver_id.
                DepartureQueue::where('driver_id', $driver->id)
                    ->update(['driver_id' => null]);

                $driver->delete();
            });
        } catch (\RuntimeException $exception) {
            return redirect()->route('admin.drivers.index')
                ->with('error', $exception->getMessage());
        }

        return redirect()->route('admin.drivers.index')
            ->with('success', 'Driver deleted successfully.');
    }
}
