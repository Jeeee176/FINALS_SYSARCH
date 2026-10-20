<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('departure_queue', function (Blueprint $table) {
            $table->id();
            $table->foreignId('bus_id')->constrained()->cascadeOnDelete();
            $table->foreignId('driver_id')->nullable()->constrained('drivers')->nullOnDelete();
            $table->foreignId('route_id')->nullable()->constrained()->nullOnDelete();
            $table->unsignedInteger('queue_position')->default(0);
            $table->string('status')->default('queued');
            $table->timestamp('notified_at')->nullable();
            $table->timestamp('driver_acknowledged_at')->nullable();
            $table->timestamp('loading_started_at')->nullable();
            $table->timestamp('departed_at')->nullable();
            $table->timestamps();

            $table->index('status');
            $table->index('bus_id');
            $table->index('driver_id');
            $table->index('route_id');
            $table->index('queue_position');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('departure_queue');
    }
};
