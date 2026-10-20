<?php

declare(strict_types=1);

namespace App\Enums;

enum AlertType: string
{
    case TRIP_STARTED      = 'trip_started';
    case TRIP_ENDED        = 'trip_ended';
    case DELAY_REPORTED    = 'delay_reported';
    case INCIDENT_REPORTED = 'incident_reported';
    case DISPATCH_NOTIFICATION = 'dispatch_notification';

    public function label(): string
    {
        return match ($this) {
            self::TRIP_STARTED      => 'Trip Started',
            self::TRIP_ENDED        => 'Trip Ended',
            self::DELAY_REPORTED    => 'Delay Reported',
            self::INCIDENT_REPORTED => 'Incident Reported',
            self::DISPATCH_NOTIFICATION => 'Dispatch Notification',
        };
    }
}
