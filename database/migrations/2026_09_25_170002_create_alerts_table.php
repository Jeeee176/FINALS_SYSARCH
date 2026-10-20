<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('alerts', function (Blueprint $table) {
            $table->id();
            $table->morphs('alertable');
            $table->string('type');
            $table->string('title');
            $table->text('message');
            $table->string('severity')->default('info');
            $table->string('status')->default('new');
            $table->timestamps();

            $table->index('type');
            $table->index('severity');
            $table->index('status');
            // Note: $table->morphs('alertable') already creates
            // alertable_type + alertable_id + index on both.
            // Do NOT add a duplicate index here.
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('alerts');
    }
};
