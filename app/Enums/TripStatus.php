<?php

declare(strict_types=1);

namespace App\Enums;

enum TripStatus: string
{
    case SCHEDULED  = 'scheduled';
    case IN_TRANSIT = 'in_transit';
    case COMPLETED  = 'completed';
    case CANCELLED  = 'cancelled';

    public function label(): string
    {
        return match ($this) {
            self::SCHEDULED  => 'Scheduled',
            self::IN_TRANSIT => 'In Transit',
            self::COMPLETED  => 'Completed',
            self::CANCELLED  => 'Cancelled',
        };
    }
}
