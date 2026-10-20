<?php

declare(strict_types=1);

namespace App\Services;

/**
 * Readonly DTO returned by EtaService::calculateForBus().
 *
 * The top-level "success" from the controller is always true for an
 * authenticated driver with an assigned bus — edge cases are signaled
 * inside eta.status instead, so the frontend can branch on a single field.
 */
readonly class EtaResult
{
    public function __construct(
        public array $bus,
        public array $route,
        public ?array $currentPosition,
        public ?array $destination,
        public ?float $distanceKm,
        public float $averageSpeedKmh,
        public ?float $estimatedDurationMinutes,
        public ?string $estimatedArrivalAt,
        public string $status,
        public ?string $warning = null,
    ) {}

    public function toArray(): array
    {
        $out = [
            'bus' => $this->bus,
            'route' => $this->route,
            'status' => $this->status,
            'average_speed_kmh' => $this->averageSpeedKmh,
        ];

        if ($this->currentPosition !== null) {
            $out['current_position'] = $this->currentPosition;
        }

        if ($this->destination !== null) {
            $out['destination'] = $this->destination;
        }

        if ($this->distanceKm !== null) {
            $out['distance_km'] = $this->distanceKm;
        }

        if ($this->estimatedDurationMinutes !== null) {
            $out['estimated_duration_minutes'] = $this->estimatedDurationMinutes;
        }

        if ($this->estimatedArrivalAt !== null) {
            $out['estimated_arrival_at'] = $this->estimatedArrivalAt;
        }

        if ($this->warning !== null) {
            $out['warning'] = $this->warning;
        }

        return $out;
    }
}
