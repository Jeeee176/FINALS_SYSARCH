<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\AlertStatus;
use App\Enums\AlertSeverity;
use App\Enums\AlertType;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\MorphTo;

class Alert extends Model
{
    use HasFactory;

    protected $fillable = [
        'alertable_type',
        'alertable_id',
        'type',
        'title',
        'message',
        'severity',
        'status',
    ];

    protected $casts = [
        'type'    => AlertType::class,
        'status'  => AlertStatus::class,
        'severity' => AlertSeverity::class,
    ];

    public function alertable(): MorphTo
    {
        return $this->morphTo();
    }

    public function trips()
    {
        return $this->morphedByMany(Trip::class, 'alertable');
    }

    public function delayIncidents()
    {
        return $this->morphedByMany(DelayIncident::class, 'alertable');
    }

    public function scopeActive($query)
    {
        return $query->whereIn('status', [AlertStatus::NEW->value, AlertStatus::ACKNOWLEDGED->value]);
    }

    public function scopeByType($query, string $type)
    {
        return $query->where('type', $type);
    }
}
