<?php

declare(strict_types=1);

namespace App\Enums;

enum DepartureQueueStatus: string
{
    case QUEUED         = 'queued';
    case NEXT           = 'next';
    case NOTIFIED       = 'notified';
    case ACKNOWLEDGED   = 'acknowledged';
    case LOADING        = 'loading';
    case DEPARTED       = 'departed';
    case SKIPPED        = 'skipped';

    public function label(): string
    {
        return match ($this) {
            self::QUEUED         => 'Queued',
            self::NEXT           => 'Next',
            self::NOTIFIED       => 'Notified',
            self::ACKNOWLEDGED   => 'Acknowledged',
            self::LOADING        => 'Loading',
            self::DEPARTED       => 'Departed',
            self::SKIPPED        => 'Skipped',
        };
    }
}
