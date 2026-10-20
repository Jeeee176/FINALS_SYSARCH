<?php

use Illuminate\Support\Facades\Route;

Route::inertia('/', 'welcome')->name('home');

Route::get('admin/dashboard', [App\Http\Controllers\Admin\DashboardController::class, 'index'])
    ->name('admin.dashboard')
    ->middleware(['auth', 'verified', 'role:admin']);

Route::get('operator/dashboard', [App\Http\Controllers\Operator\OperatorDashboardController::class, 'index'])
    ->name('operator.dashboard')
    ->middleware(['auth', 'verified', 'role:operator']);

Route::get('operator/buses', [App\Http\Controllers\Operator\BusController::class, 'index'])
    ->name('operator.buses')
    ->middleware(['auth', 'verified', 'role:operator']);

Route::get('operator/drivers', [App\Http\Controllers\Operator\DriverController::class, 'index'])
    ->name('operator.drivers')
    ->middleware(['auth', 'verified', 'role:operator']);

Route::get('operator/routes', [App\Http\Controllers\Operator\RouteController::class, 'index'])
    ->name('operator.routes')
    ->middleware(['auth', 'verified', 'role:operator']);

Route::get('operator/tracking', [App\Http\Controllers\Operator\LiveMonitoringController::class, 'index'])
    ->name('operator.tracking')
    ->middleware(['auth', 'verified', 'role:operator']);

Route::get('driver/dashboard', [App\Http\Controllers\Driver\DriverDashboardController::class, 'index'])
    ->name('driver.dashboard')
    ->middleware(['auth', 'verified', 'role:driver']);

Route::get('driver/bus', [App\Http\Controllers\Driver\BusController::class, 'show'])
    ->name('driver.bus')
    ->middleware(['auth', 'verified', 'role:driver']);

Route::get('driver/route', [App\Http\Controllers\Driver\RouteController::class, 'show'])
    ->name('driver.route')
    ->middleware(['auth', 'verified', 'role:driver']);

Route::get('driver/gps', [App\Http\Controllers\Driver\GpsController::class, 'index'])
    ->name('driver.gps')
    ->middleware(['auth', 'verified', 'role:driver']);

Route::get('driver/eta', [App\Http\Controllers\Driver\EtaController::class, 'show'])
    ->name('driver.eta')
    ->middleware(['auth', 'verified', 'role:driver']);

Route::inertia('admin/alerts', 'admin/alerts')
    ->name('admin.alerts')
    ->middleware(['auth', 'verified', 'role:admin']);

Route::inertia('operator/alerts', 'operator/alerts')
    ->name('operator.alerts')
    ->middleware(['auth', 'verified', 'role:operator']);

Route::resource('admin/buses', \App\Http\Controllers\Admin\BusController::class)
    ->names('admin.buses')
    ->middleware(['auth', 'verified', 'role:admin']);

Route::post('admin/buses/{bus}/assign-driver', [App\Http\Controllers\Admin\BusController::class, 'assignDriver'])
    ->name('admin.buses.assignDriver')
    ->middleware(['auth', 'verified', 'role:admin']);

Route::post('admin/buses/{bus}/unassign-driver', [App\Http\Controllers\Admin\BusController::class, 'unassignDriver'])
    ->name('admin.buses.unassignDriver')
    ->middleware(['auth', 'verified', 'role:admin']);

Route::resource('admin/drivers', \App\Http\Controllers\Admin\DriverController::class)
    ->names('admin.drivers')
    ->middleware(['auth', 'verified', 'role:admin']);

Route::resource('admin/operators', \App\Http\Controllers\Admin\OperatorController::class)
    ->names('admin.operators')
    ->middleware(['auth', 'verified', 'role:admin']);

Route::resource('admin/routes', \App\Http\Controllers\Admin\RouteController::class)
    ->names('admin.routes')
    ->middleware(['auth', 'verified', 'role:admin']);

Route::inertia('admin/tracking', 'admin/tracking')
    ->name('admin.tracking')
    ->middleware(['auth', 'verified', 'role:admin']);

Route::get('admin/reports', [App\Http\Controllers\Admin\ReportController::class, 'index'])
    ->name('admin.reports')
    ->middleware(['auth', 'verified', 'role:admin']);

Route::get('admin/location-history', [App\Http\Controllers\Admin\LocationHistoryController::class, 'index'])
    ->name('admin.locationHistory')
    ->middleware(['auth', 'verified', 'role:admin']);

// ── Departure Queue (shared between Admin and Operator) ────────────────
Route::get('admin/departure-queue', [App\Http\Controllers\Admin\DepartureQueueController::class, 'index'])
    ->name('admin.departureQueue')
    ->middleware(['auth', 'verified', 'role:admin']);

Route::get('operator/departure-queue', [App\Http\Controllers\Operator\DepartureQueueController::class, 'index'])
    ->name('operator.departureQueue')
    ->middleware(['auth', 'verified', 'role:operator']);

Route::post('operator/departure-queue', [App\Http\Controllers\Operator\DepartureQueueController::class, 'store'])
    ->name('operator.departureQueue.store')
    ->middleware(['auth', 'verified', 'role:operator']);

Route::post('operator/departure-queue/{entry}/promote', [App\Http\Controllers\Operator\DepartureQueueController::class, 'promote'])
    ->name('operator.departureQueue.promote')
    ->middleware(['auth', 'verified', 'role:operator'])
    ->where('entry', '[0-9]+');

Route::post('operator/departure-queue/{entry}/notify', [App\Http\Controllers\Operator\DepartureQueueController::class, 'notify'])
    ->name('operator.departureQueue.notify')
    ->middleware(['auth', 'verified', 'role:operator'])
    ->where('entry', '[0-9]+');

Route::post('operator/departure-queue/{entry}/loading', [App\Http\Controllers\Operator\DepartureQueueController::class, 'markLoading'])
    ->name('operator.departureQueue.loading')
    ->middleware(['auth', 'verified', 'role:operator'])
    ->where('entry', '[0-9]+');

Route::post('operator/departure-queue/{entry}/depart', [App\Http\Controllers\Operator\DepartureQueueController::class, 'markDeparted'])
    ->name('operator.departureQueue.depart')
    ->middleware(['auth', 'verified', 'role:operator'])
    ->where('entry', '[0-9]+');

Route::post('operator/departure-queue/{entry}/skip', [App\Http\Controllers\Operator\DepartureQueueController::class, 'skip'])
    ->name('operator.departureQueue.skip')
    ->middleware(['auth', 'verified', 'role:operator'])
    ->where('entry', '[0-9]+');

Route::post('operator/departure-queue/{entry}/reorder', [App\Http\Controllers\Operator\DepartureQueueController::class, 'reorder'])
    ->name('operator.departureQueue.reorder')
    ->middleware(['auth', 'verified', 'role:operator'])
    ->where('entry', '[0-9]+');

Route::get('driver/departure-queue', [App\Http\Controllers\Driver\DepartureQueueController::class, 'index'])
    ->name('driver.departureQueue')
    ->middleware(['auth', 'verified', 'role:driver']);

Route::post('driver/departure-queue/{entry}/acknowledge', [App\Http\Controllers\Driver\DepartureQueueController::class, 'acknowledge'])
    ->name('driver.departureQueue.acknowledge')
    ->middleware(['auth', 'verified', 'role:driver'])
    ->where('entry', '[0-9]+');

require __DIR__.'/settings.php';
