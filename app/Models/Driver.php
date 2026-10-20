<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Driver extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'license_number',
        'license_expiry',
        'phone',
        'address',
        'status',
    ];

    protected $casts = [
        'license_expiry' => 'date',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function bus(): BelongsTo
    {
        return $this->belongsTo(Bus::class);
    }

    public function trips(): HasMany
    {
        return $this->hasMany(Trip::class);
    }
}
