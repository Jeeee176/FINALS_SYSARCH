<?php

namespace App\Http\Controllers\Admin;

use App\Enums\DepartureQueueStatus;
use App\Enums\TripStatus;
use App\Http\Controllers\Controller;
use App\Models\Bus;
use App\Models\DepartureQueue;
use App\Models\Route;
use App\Models\Trip;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use RuntimeException;

class RouteController extends Controller
{
    /**
     * Display a listing of the resource.
     */
    public function index()
    {
        $routes = Route::query()
            ->with(['buses' => fn ($query) => $query->orderBy('bus_number')])
            ->orderBy('name')
            ->get();

        // Open trips (scheduled or in progress) grouped by route. Historical
        // trips are intentionally excluded — they are not current activity.
        $openTripsByRoute = Trip::query()
            ->whereIn('status', [TripStatus::SCHEDULED->value, TripStatus::IN_TRANSIT->value])
            ->whereNotNull('route_id')
            ->get(['route_id', 'status'])
            ->groupBy('route_id');

        $routes = $routes->map(function (Route $route) use ($openTripsByRoute) {
            $openTrips = $openTripsByRoute->get($route->id, collect());

            return [
                'id' => $route->id,
                'name' => $route->name,
                'origin' => $route->origin,
                'destination' => $route->destination,
                'destination_lat' => $route->destination_lat,
                'destination_lng' => $route->destination_lng,
                'status' => $route->status,
                'has_valid_coordinates' => $this->hasValidDestinationCoordinates($route),
                'has_in_transit_trip' => $openTrips->contains(
                    'status',
                    TripStatus::IN_TRANSIT->value,
                ),
                'has_open_trips' => $openTrips->isNotEmpty(),
                'buses' => $route->buses->map(fn (Bus $bus) => [
                    'id' => $bus->id,
                    'bus_number' => $bus->bus_number,
                    'plate_number' => $bus->plate_number,
                    'status' => $bus->status,
                ])->values(),
            ];
        });

        // Summary totals are derived from the loaded dataset so they always
        // agree with the route list. Each route is counted at most once.
        $total = $routes->count();
        $validCoordinates = $routes
            ->where('has_valid_coordinates', true)
            ->count();

        $summary = [
            'total' => $total,
            'with_buses' => $routes
                ->filter(fn (array $route) => count($route['buses']) > 0)
                ->count(),
            'valid_coordinates' => $validCoordinates,
            'missing_or_invalid_coordinates' => $total - $validCoordinates,
        ];

        return Inertia::render('admin/routes/index', [
            'routes' => $routes,
            'summary' => $summary,
        ]);
    }

    /**
     * Show the form for creating a new resource.
     */
    public function create()
    {
        return Inertia::render('admin/routes/create');
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
                'unique:routes,name',
            ],
            'origin' => [
                'required',
                'string',
                'max:255',
            ],
            'destination' => [
                'required',
                'string',
                'max:255',
            ],
            'destination_lat' => [
                'nullable',
                'numeric',
                'between:-90,90',
            ],
            'destination_lng' => [
                'nullable',
                'numeric',
                'between:-180,180',
            ],
            'status' => [
                'required',
                'in:active,inactive',
            ],
        ]);

        Route::create($validated);

        Inertia::flash('toast', [
            'type' => 'success',
            'message' => 'Route created successfully.',
        ]);

        return redirect()->route('admin.routes.index');
    }

    /**
     * Show the form for editing the specified resource.
     */
    public function edit(Route $route)
    {
        return Inertia::render('admin/routes/edit', [
            'route' => $route,
        ]);
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(Request $request, Route $route)
    {
        $validated = $request->validate([
            'name' => [
                'required',
                'string',
                'max:255',
                Rule::unique('routes', 'name')->ignore($route->id),
            ],
            'origin' => [
                'required',
                'string',
                'max:255',
            ],
            'destination' => [
                'required',
                'string',
                'max:255',
            ],
            'destination_lat' => [
                'nullable',
                'numeric',
                'between:-90,90',
            ],
            'destination_lng' => [
                'nullable',
                'numeric',
                'between:-180,180',
            ],
            'status' => [
                'required',
                'in:active,inactive',
            ],
        ]);

        $route->update($validated);

        Inertia::flash('toast', [
            'type' => 'success',
            'message' => 'Route updated successfully.',
        ]);

        return redirect()->route('admin.routes.index');
    }

    /**
     * Remove the specified resource from storage.
     *
     * Deletion is blocked while the route still has buses assigned or open
     * (scheduled / in-progress) trips or active departure queue entries.
     * Historical trips and departed queue entries keep their records; the
     * database nulls their route reference (SET NULL), which is the schema's
     * existing, safe behaviour.
     */
    public function destroy(Route $route)
    {
        try {
            DB::transaction(function () use ($route) {
                // Reload fresh attributes so stale snapshots cannot bypass
                // the relationship guards below.
                $route->refresh();

                if ($route->buses()->exists()) {
                    throw new RuntimeException(
                        'This route cannot be deleted while buses are still assigned to it. Reassign or unassign those buses first.',
                    );
                }

                $hasOpenTrips = Trip::query()
                    ->where('route_id', $route->id)
                    ->whereIn('status', [
                        TripStatus::SCHEDULED->value,
                        TripStatus::IN_TRANSIT->value,
                    ])
                    ->exists();

                if ($hasOpenTrips) {
                    throw new RuntimeException(
                        'This route cannot be deleted while it has scheduled or in-progress trips.',
                    );
                }

                $hasActiveQueueEntries = DepartureQueue::query()
                    ->where('route_id', $route->id)
                    ->whereNotIn('status', [
                        DepartureQueueStatus::DEPARTED->value,
                        DepartureQueueStatus::SKIPPED->value,
                    ])
                    ->exists();

                if ($hasActiveQueueEntries) {
                    throw new RuntimeException(
                        'This route cannot be deleted while active departure queue entries reference it.',
                    );
                }

                $route->delete();
            });
        } catch (RuntimeException $exception) {
            Inertia::flash('toast', [
                'type' => 'error',
                'message' => $exception->getMessage(),
            ]);

            return redirect()->route('admin.routes.index');
        }

        Inertia::flash('toast', [
            'type' => 'success',
            'message' => 'Route deleted successfully.',
        ]);

        return redirect()->route('admin.routes.index');
    }

    /**
     * A destination coordinate pair is usable only when both values are
     * present and inside the valid geographic range.
     */
    private function hasValidDestinationCoordinates(Route $route): bool
    {
        if ($route->destination_lat === null || $route->destination_lng === null) {
            return false;
        }

        $latitude = (float) $route->destination_lat;
        $longitude = (float) $route->destination_lng;

        return $latitude >= -90
            && $latitude <= 90
            && $longitude >= -180
            && $longitude <= 180;
    }
}
