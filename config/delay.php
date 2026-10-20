<?php

return [
    /*
    |--------------------------------------------------------------------------
    | Delay Incident Reason Weights
    |--------------------------------------------------------------------------
    */
    'severity_mapping' => [
        \App\Enums\DelayReason::ACCIDENT->value => 'critical',
        \App\Enums\DelayReason::FLAT_TIRE->value => 'critical',
        \App\Enums\DelayReason::ENGINE_MECHANICAL->value => 'critical',
        \App\Enums\DelayReason::POLICE_CHECKPOINT->value => 'critical',
        \App\Enums\DelayReason::WEATHER->value => 'warning',
        \App\Enums\DelayReason::ROAD_CLOSURE->value => 'warning',
        \App\Enums\DelayReason::FUEL_REFUELING->value => 'warning',
        \App\Enums\DelayReason::TRAFFIC->value => 'info',
        \App\Enums\DelayReason::PASSENGER_RELATED_DELAY->value => 'info',
        \App\Enums\DelayReason::OTHER->value => 'warning',
    ],
];
