<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\MorphMany;
use App\Enums\TripStatus;

class Bus extends Model
{
    use HasFactory;

    protected $fillable = [
        'bus_number',
        'plate_number',
        'model',
        'capacity',
        'status',
        'route_id',
        'driver_id',
    ];

    protected $casts = [
        'capacity' => 'integer',
    ];

    public function route(): BelongsTo
    {
        return $this->belongsTo(Route::class);
    }

    public function driver(): BelongsTo
    {
        return $this->belongsTo(Driver::class);
    }

    public function locations(): HasMany
    {
        return $this->hasMany(Location::class);
    }

    public function trips(): HasMany
    {
        return $this->hasMany(Trip::class);
    }

    public function currentTrip(): ?Trip
    {
        return $this->trips()
            ->where('status', TripStatus::IN_TRANSIT->value)
            ->orderByDesc('started_at')
            ->first();
    }

    public function alerts(): MorphMany
    {
        return $this->morphMany(Alert::class, 'alertable');
    }
}
