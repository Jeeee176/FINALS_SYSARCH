<?php

declare(strict_types=1);

namespace App\Enums;

enum DelayIncidentStatus: string
{
    case REPORTED      = 'reported';
    case ACKNOWLEDGED  = 'acknowledged';
    case RESOLVED      = 'resolved';

    public function label(): string
    {
        return match ($this) {
            self::REPORTED     => 'Reported',
            self::ACKNOWLEDGED => 'Acknowledged',
            self::RESOLVED     => 'Resolved',
        };
    }
}
