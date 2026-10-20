<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Route extends Model
{
    use HasFactory;

    protected $fillable = [
        'name',
        'origin',
        'destination',
        'destination_lat',
        'destination_lng',
        'status',
    ];

    protected $casts = [
        'destination_lat' => 'decimal:7',
        'destination_lng' => 'decimal:7',
    ];

    public function buses(): HasMany
    {
        return $this->hasMany(Bus::class);
    }
}
