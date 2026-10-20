<?php

namespace Database\Seeders;

use App\Enums\Role;
use App\Models\User;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        $adminEmail = 'jeushllagas176@gmail.com';

        $admin = User::where('email', $adminEmail)->first();

        if (! $admin) {
            User::create([
                'name' => 'System Administrator',
                'email' => $adminEmail,
                'password' => 'Admin@12345',
                'role' => Role::ADMIN,
            ]);
        } elseif ($admin->role !== Role::ADMIN) {
            $admin->update(['role' => Role::ADMIN]);
        }

        // Existing test user
        $testUser = User::where('email', 'test@example.com')->first();

        if (! $testUser) {
            User::factory()->create([
                'name' => 'Test User',
                'email' => 'test@example.com',
            ]);
        }
    }
}
