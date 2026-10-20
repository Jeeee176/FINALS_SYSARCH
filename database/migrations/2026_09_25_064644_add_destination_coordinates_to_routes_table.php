<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('routes', function (Blueprint $table) {
            $table->decimal('destination_lat', 10, 7)->nullable()->after('destination');
            $table->decimal('destination_lng', 10, 7)->nullable()->after('destination_lat');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('routes', function (Blueprint $table) {
            $table->dropColumn('destination_lat');
            $table->dropColumn('destination_lng');
        });
    }
};
