<?php

namespace App\Http\Controllers\Admin;

use App\Enums\TripStatus;
use App\Http\Controllers\Controller;
use App\Models\Bus;
use App\Models\Driver;
use App\Models\Trip;
use App\Services\BusAssignmentService;
use Illuminate\Database\QueryException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Inertia\Inertia;

class BusController extends Controller
{
    /**
     * Display a listing of the resource.
     */
    public function index()
    {
        $buses = Bus::query()
            ->with(['driver.user', 'route'])
            ->orderBy('bus_number')
            ->get();

        $inTransitBusIds = Trip::query()
            ->where('status', TripStatus::IN_TRANSIT->value)
            ->pluck('bus_id')
            ->all();

        $buses = $buses->map(fn (Bus $bus) => [
            'id' => $bus->id,
            'bus_number' => $bus->bus_number,
            'plate_number' => $bus->plate_number,
            'model' => $bus->model,
            'capacity' => $bus->capacity,
            'status' => $bus->status,
            'route' => $bus->route ? [
                'id' => $bus->route->id,
                'name' => $bus->route->name,
                'origin' => $bus->route->origin,
                'destination' => $bus->route->destination,
            ] : null,
            'driver' => $bus->driver ? [
                'id' => $bus->driver->id,
                'name' => $bus->driver->user?->name ?? 'Unknown',
            ] : null,
            'has_in_transit_trip' => in_array($bus->id, $inTransitBusIds, true),
        ]);

        // Drivers without a bus — used by the assignment dialog on this page.
        $availableDrivers = Driver::query()
            ->with('user')
            ->whereNull('bus_id')
            ->get()
            ->sortBy(fn (Driver $driver) => strtolower($driver->user?->name ?? ''))
            ->map(fn (Driver $driver) => [
                'id' => $driver->id,
                'name' => $driver->user?->name ?? 'Unknown',
            ])
            ->values();

        return Inertia::render('admin/buses/index', [
            'buses' => $buses,
            'availableDrivers' => $availableDrivers,
        ]);
    }

    /**
     * Show the form for creating a new resource.
     */
    public function create()
    {
        $routes = \App\Models\Route::where('status', 'active')
            ->orderBy('name')
            ->get(['id', 'name', 'origin', 'destination', 'status']);

        return Inertia::render('admin/buses/create', [
            'routes' => $routes,
        ]);
    }

    /**
     * Store a newly created resource in storage.
     */
    public function store(Request $request)
    {
        $validated = $request->validate([
            'bus_number' => [
                'required',
                'string',
                'max:255',
                'unique:buses,bus_number',
            ],
            'plate_number' => [
                'required',
                'string',
                'max:255',
                'unique:buses,plate_number',
            ],
            'model' => [
                'nullable',
                'string',
                'max:255',
            ],
            'capacity' => [
                'nullable',
                'integer',
                'min:1',
            ],
            'status' => [
                'required',
                'in:active,inactive',
            ],
            'route_id' => [
                'nullable',
                'exists:routes,id',
            ],
        ]);

        $bus = Bus::create($validated);

        return redirect()->route('admin.buses.index')
            ->with('success', 'Bus created successfully.');
    }

    /**
     * Display the specified resource.
     */
    public function show(Bus $bus)
    {
        return Inertia::render('admin/buses/show', [
            'bus' => $bus,
        ]);
    }

    /**
     * Show the form for editing the specified resource.
     */
    public function edit(Bus $bus)
    {
        $routes = \App\Models\Route::where('status', 'active')
            ->orderBy('name')
            ->get(['id', 'name', 'origin', 'destination', 'status']);

        $bus->load(['route', 'driver.user']);

        return Inertia::render('admin/buses/edit', [
            'bus' => [
                'id' => $bus->id,
                'bus_number' => $bus->bus_number,
                'plate_number' => $bus->plate_number,
                'model' => $bus->model,
                'capacity' => $bus->capacity,
                'status' => $bus->status,
                'route_id' => $bus->route_id,
                'route' => $bus->route ? [
                    'id' => $bus->route->id,
                    'name' => $bus->route->name,
                    'origin' => $bus->route->origin,
                    'destination' => $bus->route->destination,
                ] : null,
                'driver' => $bus->driver ? [
                    'id' => $bus->driver->id,
                    'name' => $bus->driver->user?->name ?? 'Unknown',
                ] : null,
            ],
            'routes' => $routes,
            'hasInTransitTrip' => $bus->currentTrip() !== null,
        ]);
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(Request $request, Bus $bus)
    {
        $validated = $request->validate([
            'bus_number' => [
                'required',
                'string',
                'max:255',
                Rule::unique('buses', 'bus_number')->ignore($bus->id),
            ],
            'plate_number' => [
                'required',
                'string',
                'max:255',
                Rule::unique('buses', 'plate_number')->ignore($bus->id),
            ],
            'model' => [
                'nullable',
                'string',
                'max:255',
            ],
            'capacity' => [
                'nullable',
                'integer',
                'min:1',
            ],
            'status' => [
                'required',
                'in:active,inactive',
            ],
            'route_id' => [
                'nullable',
                'exists:routes,id',
            ],
        ]);

        $bus->update($validated);

        return redirect()->route('admin.buses.index')
            ->with('success', 'Bus updated successfully.');
    }

    /**
     * Remove the specified resource from storage.
     */
    public function destroy(Bus $bus)
    {
        if ($bus->currentTrip() !== null) {
            return redirect()->route('admin.buses.index')
                ->with('error', 'This bus has a trip in progress. End the trip before deleting the bus.');
        }

        try {
            DB::transaction(function () use ($bus) {
                // Detach the assigned driver first: drivers.bus_id uses
                // restrictOnDelete, so the bus cannot be removed while a
                // driver still references it.
                if ($bus->driver_id !== null) {
                    $driver = $bus->driver;

                    $bus->driver_id = null;
                    $bus->save();

                    if ($driver !== null) {
                        $driver->bus_id = null;
                        $driver->save();
                    }
                }

                $bus->delete();
            });
        } catch (QueryException $exception) {
            return redirect()->route('admin.buses.index')
                ->with('error', 'Unable to delete this bus because other records still reference it.');
        }

        return redirect()->route('admin.buses.index')
            ->with('success', 'Bus deleted successfully.');
    }

    /**
     * Assign a driver to the specified bus.
     *
     * The bus is marked active and the driver's previous bus (if any) is
     * released and marked inactive. Changes that would detach the driver of a
     * bus with an in-progress trip are rejected.
     */
    public function assignDriver(Request $request, Bus $bus)
    {
        $validated = $request->validate([
            'driver_id' => [
                'required',
                'exists:drivers,id',
                function ($attribute, $value, $fail) {
                    $driver = Driver::find($value);
                    if (!$driver) {
                        $fail('The selected driver does not exist.');
                        return;
                    }
                    $user = $driver->user;
                    if (!$user || $user->role->value !== 'driver') {
                        $fail('The selected record is not a valid driver.');
                        return;
                    }
                },
            ],
        ]);

        $driver = Driver::findOrFail($validated['driver_id']);

        try {
            BusAssignmentService::assignDriver($bus, $driver);
        } catch (\RuntimeException $exception) {
            return redirect()->route('admin.buses.index')
                ->with('error', $exception->getMessage());
        }

        return redirect()->route('admin.buses.index')
            ->with('success', 'Driver assigned to bus successfully.');
    }

    /**
     * Remove the driver assignment from the specified bus.
     *
     * The bus is marked inactive once it is truly unassigned. Changes on a bus
     * with an in-progress trip are rejected.
     */
    public function unassignDriver(Request $request, Bus $bus)
    {
        if ($bus->driver_id === null) {
            return redirect()->route('admin.buses.index')
                ->with('warning', 'This bus has no assigned driver.');
        }

        try {
            BusAssignmentService::unassignDriver($bus);
        } catch (\RuntimeException $exception) {
            return redirect()->route('admin.buses.index')
                ->with('error', $exception->getMessage());
        }

        return redirect()->route('admin.buses.index')
            ->with('success', 'Driver unassigned from bus successfully.');
    }
}
