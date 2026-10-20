<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\TripStatus;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphMany;

class Trip extends Model
{
    use HasFactory;

    protected $fillable = [
        'bus_id',
        'route_id',
        'driver_id',
        'status',
        'started_at',
        'ended_at',
        'start_latitude',
        'start_longitude',
        'end_latitude',
        'end_longitude',
    ];

    protected $casts = [
        'status'         => TripStatus::class,
        'started_at'     => 'datetime',
        'ended_at'       => 'datetime',
        'start_latitude'  => 'decimal:7',
        'start_longitude' => 'decimal:7',
        'end_latitude'    => 'decimal:7',
        'end_longitude'   => 'decimal:7',
    ];

    public function bus(): BelongsTo
    {
        return $this->belongsTo(Bus::class);
    }

    public function route(): BelongsTo
    {
        return $this->belongsTo(Route::class);
    }

    public function driver(): BelongsTo
    {
        return $this->belongsTo(Driver::class);
    }

    public function alerts(): MorphMany
    {
        return $this->morphMany(Alert::class, 'alertable');
    }

    public function scopeInTransit($query)
    {
        return $query->where('status', TripStatus::IN_TRANSIT->value);
    }

    public function scopeScheduled($query)
    {
        return $query->where('status', TripStatus::SCHEDULED->value);
    }

    public function scopeCompleted($query)
    {
        return $query->where('status', TripStatus::COMPLETED->value);
    }
}
