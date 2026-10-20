<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\DelayIncidentStatus;
use App\Enums\DelayReason;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphMany;

class DelayIncident extends Model
{
    use HasFactory;

    protected $fillable = [
        'trip_id',
        'bus_id',
        'driver_id',
        'reason',
        'details',
        'latitude',
        'longitude',
        'reported_at',
        'status',
    ];

    protected $casts = [
        'reported_at'  => 'datetime',
        'latitude'     => 'decimal:7',
        'longitude'    => 'decimal:7',
        'status'       => DelayIncidentStatus::class,
    ];

    public function trip(): BelongsTo
    {
        return $this->belongsTo(Trip::class);
    }

    public function bus(): BelongsTo
    {
        return $this->belongsTo(Bus::class);
    }

    public function driver(): BelongsTo
    {
        return $this->belongsTo(Driver::class);
    }

    public function alerts(): MorphMany
    {
        return $this->morphMany(Alert::class, 'alertable');
    }

    public function scopeReported($query)
    {
        return $query->where('status', DelayIncidentStatus::REPORTED->value);
    }

    public function scopeIncidentType($query)
    {
        return $query->whereIn('reason', [
            DelayReason::ACCIDENT->value,
            DelayReason::FLAT_TIRE->value,
            DelayReason::ENGINE_MECHANICAL->value,
            DelayReason::POLICE_CHECKPOINT->value,
        ]);
    }
}
