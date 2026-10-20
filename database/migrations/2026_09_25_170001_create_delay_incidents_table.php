<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('delay_incidents', function (Blueprint $table) {
            $table->id();
            $table->foreignId('trip_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('bus_id')->constrained()->cascadeOnDelete();
            $table->foreignId('driver_id')->constrained('drivers')->cascadeOnDelete();
            $table->string('reason');
            $table->text('details')->nullable();
            $table->decimal('latitude', 10, 7)->nullable();
            $table->decimal('longitude', 10, 7)->nullable();
            $table->timestamp('reported_at');
            $table->string('status')->default('reported');
            $table->timestamps();

            $table->index('status');
            $table->index('bus_id');
            $table->index('driver_id');
            $table->index('trip_id');
            $table->index('reported_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('delay_incidents');
    }
};
