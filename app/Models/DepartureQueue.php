<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\DepartureQueueStatus;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphMany;
use Illuminate\Database\Eloquent\Relations\MorphTo;
use Illuminate\Database\Eloquent\Builder;

class DepartureQueue extends Model
{
    use HasFactory;

    protected $table = 'departure_queue';

    protected $fillable = [
        'bus_id',
        'driver_id',
        'route_id',
        'queue_position',
        'status',
        'notified_at',
        'driver_acknowledged_at',
        'loading_started_at',
        'departed_at',
    ];

    protected $casts = [
        'status'                 => DepartureQueueStatus::class,
        'notified_at'            => 'datetime',
        'driver_acknowledged_at' => 'datetime',
        'loading_started_at'     => 'datetime',
        'departed_at'            => 'datetime',
    ];

    /* ------------------------------------------------------------------ */
    /*  Relationships                                                      */
    /* ------------------------------------------------------------------ */

    public function bus(): BelongsTo
    {
        return $this->belongsTo(Bus::class);
    }

    public function driver(): BelongsTo
    {
        return $this->belongsTo(Driver::class);
    }

    public function route(): BelongsTo
    {
        return $this->belongsTo(Route::class);
    }

    public function alertable(): MorphTo
    {
        return $this->morphTo();
    }

    public function alerts(): MorphMany
    {
        return $this->morphMany(Alert::class, 'alertable');
    }

    /* ------------------------------------------------------------------ */
    /*  Scopes                                                             */
    /* ------------------------------------------------------------------ */

    public function scopeActive(Builder $query): Builder
    {
        return $query->whereIn('status', [
            DepartureQueueStatus::QUEUED->value,
            DepartureQueueStatus::NEXT->value,
            DepartureQueueStatus::NOTIFIED->value,
            DepartureQueueStatus::ACKNOWLEDGED->value,
            DepartureQueueStatus::LOADING->value,
        ]);
    }

    public function scopeQueued(Builder $query): Builder
    {
        return $query->where('status', DepartureQueueStatus::QUEUED->value);
    }

    public function scopeNext(Builder $query): Builder
    {
        return $query->where('status', DepartureQueueStatus::NEXT->value);
    }

    public function scopeInProgress(Builder $query): Builder
    {
        return $query->whereIn('status', [
            DepartureQueueStatus::NEXT->value,
            DepartureQueueStatus::NOTIFIED->value,
            DepartureQueueStatus::ACKNOWLEDGED->value,
            DepartureQueueStatus::LOADING->value,
        ]);
    }

    public function scopeHistorical(Builder $query): Builder
    {
        return $query->whereIn('status', [
            DepartureQueueStatus::DEPARTED->value,
            DepartureQueueStatus::SKIPPED->value,
        ]);
    }

    public function scopeOrdered(Builder $query): Builder
    {
        return $query->orderBy('queue_position', 'asc')->orderBy('id', 'asc');
    }

    /* ------------------------------------------------------------------ */
    /*  Helpers                                                            */
    /* ------------------------------------------------------------------ */

    public function isInActiveQueue(): bool
    {
        $active = $this->status?->value ?? '';
        return in_array($active, [
            DepartureQueueStatus::QUEUED->value,
            DepartureQueueStatus::NEXT->value,
            DepartureQueueStatus::NOTIFIED->value,
            DepartureQueueStatus::ACKNOWLEDGED->value,
            DepartureQueueStatus::LOADING->value,
        ], true);
    }

    public function isNext(): bool
    {
        return $this->status?->value === DepartureQueueStatus::NEXT->value;
    }
}
