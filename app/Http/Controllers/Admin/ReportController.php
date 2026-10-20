<?php

namespace App\Http\Controllers\Admin;

use App\Enums\DelayReason;
use App\Enums\TripStatus;
use App\Http\Controllers\Controller;
use App\Models\Bus;
use App\Models\DelayIncident;
use App\Models\Driver;
use App\Models\Location;
use App\Models\Operator;
use App\Models\Route;
use App\Models\Trip;
use Carbon\CarbonInterface;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Inertia\Inertia;

class ReportController extends Controller
{
    private const PERIODS = ['weekly', 'monthly', 'yearly', 'custom'];

    private const CATEGORIES = ['overview', 'trips', 'gps', 'delays'];

    /**
     * Reasons that are treated as incidents rather than delays.
     */
    private function incidentReasonValues(): array
    {
        return array_values(array_filter(
            DelayReason::values(),
            fn (string $reason): bool => $this->isIncidentReason($reason)
        ));
    }

    private function isIncidentReason(string $reason): bool
    {
        foreach (DelayReason::cases() as $case) {
            if ($case->value === $reason) {
                return $case->isIncident();
            }
        }

        return false;
    }

    /**
     * Display the unified Reports & Analytics page with period/category
     * filters, analytics summaries, charts, and category-specific detail
     * lists. The fleet/driver/operator/route/GPS/assignment summaries keep
     * their original shape because other pages (e.g. driver management)
     * consume the bus assignment report from this response.
     */
    public function index(Request $request)
    {
        $period = $this->normalizeChoice($request->query('period'), self::PERIODS, 'monthly');
        $category = $this->normalizeChoice($request->query('category'), self::CATEGORIES, 'overview');

        $timezoneOffset = (int) $request->query('tz', 0);
        $timezoneOffset = max(-840, min(840, $timezoneOffset));

        [$from, $to, $filterError] = $this->resolveRange($request);

        $analytics = $this->emptyAnalytics();
        $charts = $this->emptyCharts();
        $tripReport = null;
        $delayReport = null;

        if ($filterError === null && $from !== null && $to !== null) {
            $analytics = $this->buildAnalytics($from, $to);
            $charts = $this->buildCharts($from, $to, $timezoneOffset);

            if ($category === 'trips') {
                $tripReport = $this->buildTripPerformanceReport($from, $to);
            }

            if ($category === 'delays') {
                $delayReport = $this->buildDelayIncidentReport($from, $to);
            }
        }

        // ── Fleet Summary ─────────────────────────────────────────────
        $fleetSummary = [
            'total_buses'     => Bus::count(),
            'active_buses'    => Bus::where('status', 'active')->count(),
            'inactive_buses'  => Bus::where('status', 'inactive')->count(),
            'assigned_buses'  => Bus::whereNotNull('driver_id')->count(),
            'unassigned_buses'=> Bus::whereNull('driver_id')->count(),
        ];

        // ── Driver Summary ────────────────────────────────────────────
        $driverSummary = [
            'total_drivers'     => Driver::count(),
            'active_drivers'    => Driver::where('status', 'active')->count(),
            'inactive_drivers'  => Driver::where('status', 'inactive')->count(),
            'assigned_drivers'  => Driver::whereNotNull('bus_id')->count(),
            'unassigned_drivers'=> Driver::whereNull('bus_id')->count(),
        ];

        // ── Operator Summary ──────────────────────────────────────────
        $operatorSummary = [
            'total_operators'    => Operator::count(),
            'active_operators'   => Operator::where('status', 'active')->count(),
            'inactive_operators' => Operator::where('status', 'inactive')->count(),
        ];

        // ── Route Summary ─────────────────────────────────────────────
        $routeSummary = [
            'total_routes'     => Route::count(),
            'active_routes'    => Route::where('status', 'active')->count(),
            'inactive_routes'  => Route::where('status', 'inactive')->count(),
            'buses_by_route'   => Route::withCount('buses')
                ->orderBy('name')
                ->get()
                ->mapWithKeys(fn(Route $r) => [$r->id => [
                    'name'         => $r->name,
                    'buses_count'  => $r->buses_count,
                    'origin'       => $r->origin,
                    'destination'  => $r->destination,
                    'status'       => $r->status,
                ]]),
        ];

        // ── GPS / Tracking Summary (all-time coverage) ────────────────
        $gpsSummary = [
            'total_location_records'    => Location::count(),
            'tracked_buses_count'       => Bus::whereHas('locations')->distinct()->count('id'),
            'untracked_buses_count'     => Bus::whereDoesntHave('locations')->count(),
            'latest_recorded_at'        => Location::max('recorded_at'),
            'locations_by_bus'          => Location::selectRaw('bus_id, COUNT(*) as records, MAX(recorded_at) as latest')
                ->with('bus')
                ->groupBy('bus_id')
                ->orderByDesc('records')
                ->get()
                ->map(fn($row) => [
                    'bus_id'    => $row->bus_id,
                    'bus_number'=> $row->bus?->bus_number ?? 'unknown',
                    'plate_number' => $row->bus?->plate_number ?? 'unknown',
                    'records'   => (int) $row->records,
                    'latest'    => $row->latest,
                ]),
        ];

        // ── Bus Assignment Report ─────────────────────────────────────
        $busAssignmentReport = Bus::with(['driver.user', 'route'])
            ->orderBy('bus_number')
            ->get()
            ->map(fn(Bus $bus) => [
                'id'              => $bus->id,
                'bus_number'      => $bus->bus_number,
                'plate_number'    => $bus->plate_number,
                'model'           => $bus->model,
                'capacity'        => $bus->capacity,
                'status'          => $bus->status,
                'assigned_driver' => $bus->driver ? [
                    'id'         => $bus->driver->id,
                    'name'       => $bus->driver->user->name,
                    'email'      => $bus->driver->user->email,
                    'license_number' => $bus->driver->license_number,
                    'phone'      => $bus->driver->phone,
                    'status'     => $bus->driver->status,
                ] : null,
                'assigned_route'  => $bus->route ? [
                    'id'         => $bus->route->id,
                    'name'       => $bus->route->name,
                    'origin'     => $bus->route->origin,
                    'destination'=> $bus->route->destination,
                    'status'     => $bus->route->status,
                ] : null,
                'has_driver'      => $bus->driver_id !== null,
                'has_route'       => $bus->route_id !== null,
            ]);

        return Inertia::render('admin/reports', [
            'fleetSummary'         => $fleetSummary,
            'driverSummary'        => $driverSummary,
            'operatorSummary'      => $operatorSummary,
            'routeSummary'         => $routeSummary,
            'gpsSummary'           => $gpsSummary,
            'busAssignmentReport'  => $busAssignmentReport,
            'buses'                => Bus::orderBy('bus_number')
                ->get(['id', 'bus_number', 'plate_number', 'status']),
            'filters'              => [
                'period'   => $period,
                'category' => $category,
                'from'     => $from?->toIso8601String(),
                'to'       => $to?->toIso8601String(),
            ],
            'analytics'            => $analytics,
            'charts'               => $charts,
            'trips'                => $tripReport,
            'delayIncidents'       => $delayReport,
            'filterError'          => $filterError,
        ]);
    }

    private function normalizeChoice(mixed $value, array $allowed, string $default): string
    {
        return is_string($value) && in_array($value, $allowed, true) ? $value : $default;
    }

    /**
     * Resolve the requested reporting window. When the client sends explicit
     * "from"/"to" instants (ISO-8601), they are used verbatim. Otherwise a
     * default window of the last 30 days is used.
     *
     * @return array{0: ?Carbon, 1: ?Carbon, 2: ?string}
     */
    private function resolveRange(Request $request): array
    {
        $fromRaw = $request->query('from');
        $toRaw = $request->query('to');

        $hasFrom = is_string($fromRaw) && $fromRaw !== '';
        $hasTo = is_string($toRaw) && $toRaw !== '';

        if (! $hasFrom && ! $hasTo) {
            $to = Carbon::now()->utc();
            $from = $to->copy()->startOfDay()->subDays(29);

            return [$from, $to, null];
        }

        try {
            $from = $hasFrom ? Carbon::parse($fromRaw)->utc() : null;
            $to = $hasTo ? Carbon::parse($toRaw)->utc() : null;
        } catch (\Throwable $exception) {
            return [null, null, 'The provided date range is invalid.'];
        }

        if ($from === null && $to !== null) {
            $from = $to->copy()->startOfDay()->subDays(29);
        }

        if ($to === null && $from !== null) {
            $to = $from->copy()->endOfDay();
        }

        if ($from === null || $to === null) {
            return [null, null, 'The provided date range is invalid.'];
        }

        if ($from->gt($to)) {
            return [null, null, 'The start date must be before the end date.'];
        }

        return [$from, $to, null];
    }

    private function emptyAnalytics(): array
    {
        return [
            'total_trips'      => 0,
            'completed_trips'  => 0,
            'in_transit_trips' => 0,
            'cancelled_trips'  => 0,
            'delayed_trips'    => 0,
            'delay_reports'    => 0,
            'incidents'        => 0,
            'gps_records'      => 0,
            'gps_active_buses' => 0,
        ];
    }

    private function emptyCharts(): array
    {
        return [
            'granularity' => 'day',
            'trips'       => [],
            'delays'      => [],
            'statuses'    => [],
        ];
    }

    /**
     * Build the analytics overview for the selected window. Only metrics
     * that can be derived from stored records are produced; delayed trips
     * are counted as distinct trips to avoid double counting.
     */
    private function buildAnalytics(Carbon $from, Carbon $to): array
    {
        $statusCounts = Trip::query()
            ->whereBetween('started_at', [$from, $to])
            ->selectRaw('status, COUNT(*) as total')
            ->groupBy('status')
            ->pluck('total', 'status');

        $incidentReasons = $this->incidentReasonValues();

        $delayBase = DelayIncident::query()->whereBetween('reported_at', [$from, $to]);

        $delayReports = (clone $delayBase)
            ->whereNotIn('reason', $incidentReasons)
            ->count();

        $delayedTrips = (clone $delayBase)
            ->whereNotIn('reason', $incidentReasons)
            ->whereNotNull('trip_id')
            ->distinct()
            ->count('trip_id');

        $incidents = (clone $delayBase)
            ->whereIn('reason', $incidentReasons)
            ->count();

        $gpsBase = Location::query()->whereBetween('recorded_at', [$from, $to]);

        return [
            'total_trips'      => (int) $statusCounts->sum(),
            'completed_trips'  => (int) ($statusCounts[TripStatus::COMPLETED->value] ?? 0),
            'in_transit_trips' => (int) ($statusCounts[TripStatus::IN_TRANSIT->value] ?? 0),
            'cancelled_trips'  => (int) ($statusCounts[TripStatus::CANCELLED->value] ?? 0),
            'delayed_trips'    => $delayedTrips,
            'delay_reports'    => $delayReports,
            'incidents'        => $incidents,
            'gps_records'      => (clone $gpsBase)->count(),
            'gps_active_buses' => (clone $gpsBase)->distinct()->count('bus_id'),
        ];
    }

    /**
     * Build chart series for the selected window. Buckets are computed in the
     * reporting user's local timezone (sent by the client as an offset in
     * minutes) so that day/week labels match the dates the user selected.
     */
    private function buildCharts(Carbon $from, Carbon $to, int $timezoneOffset): array
    {
        $granularity = $this->granularityFor($from, $to);
        $keys = $this->bucketKeys($from, $to, $granularity, $timezoneOffset);

        $tripCounts = array_fill_keys($keys, 0);

        $tripMoments = Trip::query()
            ->whereBetween('started_at', [$from, $to])
            ->whereNotNull('started_at')
            ->get(['started_at'])
            ->map(fn (Trip $trip) => $trip->started_at)
            ->filter();

        foreach ($tripMoments as $moment) {
            $key = $this->bucketKey($moment, $granularity, $timezoneOffset);
            if (array_key_exists($key, $tripCounts)) {
                $tripCounts[$key]++;
            }
        }

        $delayCounts = array_fill_keys($keys, 0);
        $incidentCounts = array_fill_keys($keys, 0);
        $incidentReasons = $this->incidentReasonValues();

        $delayRows = DelayIncident::query()
            ->whereBetween('reported_at', [$from, $to])
            ->get(['reported_at', 'reason']);

        foreach ($delayRows as $row) {
            $key = $this->bucketKey($row->reported_at, $granularity, $timezoneOffset);

            if (! array_key_exists($key, $delayCounts)) {
                continue;
            }

            if (in_array($row->reason, $incidentReasons, true)) {
                $incidentCounts[$key]++;
            } else {
                $delayCounts[$key]++;
            }
        }

        $statusCounts = Trip::query()
            ->whereBetween('started_at', [$from, $to])
            ->selectRaw('status, COUNT(*) as total')
            ->groupBy('status')
            ->pluck('total', 'status');

        $statuses = [];
        foreach (TripStatus::cases() as $case) {
            $statuses[] = [
                'status' => $case->value,
                'label'  => $case->label(),
                'value'  => (int) ($statusCounts[$case->value] ?? 0),
            ];
        }

        return [
            'granularity' => $granularity,
            'trips'       => array_map(
                fn (string $key) => [
                    'key'   => $key,
                    'label' => $this->bucketLabel($key, $granularity),
                    'value' => $tripCounts[$key],
                ],
                $keys
            ),
            'delays'      => array_map(
                fn (string $key) => [
                    'key'       => $key,
                    'label'     => $this->bucketLabel($key, $granularity),
                    'delays'    => $delayCounts[$key],
                    'incidents' => $incidentCounts[$key],
                ],
                $keys
            ),
            'statuses'    => $statuses,
        ];
    }

    private function granularityFor(Carbon $from, Carbon $to): string
    {
        $days = $from->diffInDays($to);

        if ($days <= 31) {
            return 'day';
        }

        if ($days <= 120) {
            return 'week';
        }

        return 'month';
    }

    /**
     * @return list<string>
     */
    private function bucketKeys(Carbon $from, Carbon $to, string $granularity, int $timezoneOffset): array
    {
        $cursor = $from->copy()->utc()->addMinutes($timezoneOffset)->startOfDay();
        $last = $to->copy()->utc()->addMinutes($timezoneOffset);

        if ($granularity === 'week') {
            $cursor->startOfWeek(Carbon::MONDAY);
        }

        if ($granularity === 'month') {
            $cursor->startOfMonth();
        }

        $keys = [];

        while ($cursor->lte($last)) {
            $keys[] = $cursor->format($granularity === 'month' ? 'Y-m' : 'Y-m-d');

            match ($granularity) {
                'week'  => $cursor->addWeek(),
                'month' => $cursor->addMonth(),
                default => $cursor->addDay(),
            };
        }

        return $keys;
    }

    private function bucketKey(CarbonInterface $moment, string $granularity, int $timezoneOffset): string
    {
        $local = $moment->copy()->utc()->addMinutes($timezoneOffset);

        return match ($granularity) {
            'week'  => $local->startOfWeek(Carbon::MONDAY)->format('Y-m-d'),
            'month' => $local->format('Y-m'),
            default => $local->format('Y-m-d'),
        };
    }

    private function bucketLabel(string $key, string $granularity): string
    {
        if ($granularity === 'month') {
            return Carbon::createFromFormat('Y-m', $key)->format('M Y');
        }

        $date = Carbon::createFromFormat('Y-m-d', $key)->startOfDay();

        return $granularity === 'week'
            ? 'Week of '.$date->format('M j')
            : $date->format('M j');
    }

    /**
     * Detailed trip performance records for the selected window, paginated to
     * keep large result sets manageable.
     */
    private function buildTripPerformanceReport(Carbon $from, Carbon $to)
    {
        $paginator = Trip::query()
            ->whereBetween('started_at', [$from, $to])
            ->with([
                'bus:id,bus_number,plate_number',
                'driver.user:id,name',
                'route:id,name,origin,destination',
            ])
            ->orderByDesc('started_at')
            ->orderByDesc('id')
            ->paginate(25);

        $tripIds = collect($paginator->items())->pluck('id')->all();

        $delayRows = DelayIncident::query()
            ->whereIn('trip_id', $tripIds)
            ->selectRaw('trip_id, reason, COUNT(*) as total')
            ->groupBy('trip_id', 'reason')
            ->get()
            ->groupBy('trip_id');

        $paginator->through(function (Trip $trip) use ($delayRows) {
            $delays = collect($delayRows->get($trip->id, []))->map(fn ($row) => [
                'reason'      => $row->reason,
                'is_incident' => $this->isIncidentReason($row->reason),
                'count'       => (int) $row->total,
            ])->values();

            return [
                'id'                => $trip->id,
                'bus_number'        => $trip->bus?->bus_number,
                'plate_number'      => $trip->bus?->plate_number,
                'driver_name'       => $trip->driver?->user?->name,
                'route_name'        => $trip->route?->name,
                'route_origin'      => $trip->route?->origin,
                'route_destination' => $trip->route?->destination,
                'status'            => $trip->status->value,
                'status_label'      => $trip->status->label(),
                'started_at'        => $trip->started_at?->toIso8601String(),
                'ended_at'          => $trip->ended_at?->toIso8601String(),
                'delays'            => $delays,
            ];
        });

        return $paginator;
    }

    /**
     * Detailed delay/incident records for the selected window, paginated.
     */
    private function buildDelayIncidentReport(Carbon $from, Carbon $to)
    {
        $paginator = DelayIncident::query()
            ->whereBetween('reported_at', [$from, $to])
            ->with([
                'bus:id,bus_number,plate_number',
                'driver.user:id,name',
                'trip:id',
            ])
            ->orderByDesc('reported_at')
            ->orderByDesc('id')
            ->paginate(25);

        $paginator->through(function (DelayIncident $incident) {
            $isIncident = $this->isIncidentReason($incident->reason);

            return [
                'id'           => $incident->id,
                'reported_at'  => $incident->reported_at?->toIso8601String(),
                'reason'       => $incident->reason,
                'is_incident'  => $isIncident,
                'type_label'   => $isIncident ? 'Incident' : 'Delay',
                'status'       => $incident->status->value,
                'status_label' => $incident->status->label(),
                'details'      => $incident->details,
                'bus_number'   => $incident->bus?->bus_number,
                'plate_number' => $incident->bus?->plate_number,
                'driver_name'  => $incident->driver?->user?->name,
                'trip_id'      => $incident->trip_id,
            ];
        });

        return $paginator;
    }
}
