<?php

return [
    /*
    |--------------------------------------------------------------------------
    | Default average speed
    |--------------------------------------------------------------------------
    |
    | Average speed in km/h used to estimate travel time for ETA
    | calculations. This is a straight-line / haversine-based estimate,
    | so the value should account for typical stops and traffic.
    |
    */
    'default_speed_kmh' => (float) env('ETA_DEFAULT_SPEED_KMH', 40.0),

    /*
    |--------------------------------------------------------------------------
    | GPS staleness threshold
    |--------------------------------------------------------------------------
    |
    | If the latest GPS record for a bus is older than this many minutes,
    | the ETA result status will be "stale_position" and a warning will
    | be included.
    |
    */
    'gps_stale_minutes' => (int) env('ETA_GPS_STALE_MINUTES', 15),
];
