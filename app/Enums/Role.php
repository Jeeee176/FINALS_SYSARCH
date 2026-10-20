<?php

declare(strict_types=1);

namespace App\Enums;

enum Role: string
{
    case ADMIN = 'admin';
    case OPERATOR = 'operator';
    case DRIVER = 'driver';

    public function label(): string
    {
        return match ($this) {
            self::ADMIN => 'Admin',
            self::OPERATOR => 'Operator',
            self::DRIVER => 'Driver',
        };
    }
}
