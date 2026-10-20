<?php

declare(strict_types=1);

namespace App\Enums;

enum AlertSeverity: string
{
    case INFO     = 'info';
    case WARNING  = 'warning';
    case CRITICAL = 'critical';

    public function label(): string
    {
        return match ($this) {
            self::INFO     => 'Info',
            self::WARNING  => 'Warning',
            self::CRITICAL => 'Critical',
        };
    }
}
