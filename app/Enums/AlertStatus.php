<?php

declare(strict_types=1);

namespace App\Enums;

enum AlertStatus: string
{
    case NEW         = 'new';
    case ACKNOWLEDGED = 'acknowledged';
    case RESOLVED    = 'resolved';

    public function label(): string
    {
        return match ($this) {
            self::NEW         => 'New',
            self::ACKNOWLEDGED => 'Acknowledged',
            self::RESOLVED    => 'Resolved',
        };
    }
}
