<?php

declare(strict_types=1);

namespace App\Enums;

enum DelayReason: string
{
    case FLAT_TIRE               = 'Flat Tire';
    case TRAFFIC                 = 'Traffic';
    case ENGINE_MECHANICAL       = 'Engine/Mechanical Problem';
    case ACCIDENT                = 'Accident';
    case WEATHER                 = 'Weather';
    case PASSENGER_RELATED_DELAY = 'Passenger-related Delay';
    case ROAD_CLOSURE            = 'Road Closure';
    case FUEL_REFUELING          = 'Fuel/Refueling';
    case POLICE_CHECKPOINT       = 'Police/Checkpoint';
    case OTHER                   = 'Other';

    public function label(): string
    {
        return $this->value;
    }

    /**
     * Reasons that should be treated as incidents (incident_reported alert type).
     */
    public function isIncident(): bool
    {
        return match ($this) {
            self::ACCIDENT,
            self::FLAT_TIRE,
            self::ENGINE_MECHANICAL,
            self::POLICE_CHECKPOINT => true,
            default => false,
        };
    }

    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }
}
