<?php

use App\Http\Controllers\Api\AlertController;
use App\Http\Controllers\Api\BusEtaController;
use App\Http\Controllers\Api\LocationController;
use App\Http\Controllers\Driver\DelayIncidentController;
use App\Http\Controllers\Driver\DriverLocationController;
use App\Http\Controllers\Driver\TripController;
use Illuminate\Support\Facades\Route;

Route::post('/locations', [LocationController::class, 'store'])->middleware('auth');

Route::get('/buses/{bus}/location/latest', [LocationController::class, 'showLatest']);
Route::get('/buses/locations/latest', [LocationController::class, 'indexLatest']);

Route::get('/buses/{bus}/eta', [BusEtaController::class, 'show'])->middleware('auth');

Route::get('/alerts', [AlertController::class, 'index'])
    ->middleware('auth')
    ->name('api.alerts.index');

Route::patch('/alerts/{alert}/acknowledge', [AlertController::class, 'acknowledge'])
    ->middleware(['auth', 'role:admin,operator'])
    ->name('api.alerts.acknowledge');

Route::patch('/alerts/{alert}/resolve', [AlertController::class, 'resolve'])
    ->middleware(['auth', 'role:admin,operator'])
    ->name('api.alerts.resolve');

Route::post('/driver/location', [DriverLocationController::class, 'store'])->middleware('auth');
Route::get('/driver/location/latest', [DriverLocationController::class, 'showLatest'])->middleware('auth');

Route::post('/driver/trips/start', [TripController::class, 'start'])
    ->middleware(['auth', 'role:driver'])
    ->name('api.driver.trips.start');

Route::post('/driver/trips/{trip}/end', [TripController::class, 'end'])
    ->middleware(['auth', 'role:driver'])
    ->name('api.driver.trips.end');

Route::post('/driver/delay-incidents', [DelayIncidentController::class, 'store'])
    ->middleware(['auth', 'role:driver'])
    ->name('api.driver.delay-incidents.store');

Route::get('/buses/{bus}/locations/history', [LocationController::class, 'history'])->middleware('auth');
