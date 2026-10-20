<?php

namespace App\Providers;

use App\Listeners\SyncDriverPresence;
use App\Listeners\SyncOperatorPresence;
use Carbon\CarbonImmutable;
use Illuminate\Auth\Events\Login;
use Illuminate\Auth\Events\Logout;
use Illuminate\Support\Facades\Date;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\ServiceProvider;
use Illuminate\Validation\Rules\Password;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        $this->configureDefaults();
        $this->configureDriverPresence();
        $this->configureOperatorPresence();
    }

    /**
     * Keep the driver active/inactive flag in sync with login presence.
     */
    protected function configureDriverPresence(): void
    {
        Event::listen(Login::class, [SyncDriverPresence::class, 'handleLogin']);
        Event::listen(Logout::class, [SyncDriverPresence::class, 'handleLogout']);
    }

    /**
     * Keep the operator active/inactive flag in sync with login presence.
     */
    protected function configureOperatorPresence(): void
    {
        Event::listen(Login::class, [SyncOperatorPresence::class, 'handleLogin']);
        Event::listen(Logout::class, [SyncOperatorPresence::class, 'handleLogout']);
    }

    /**
     * Configure default behaviors for production-ready applications.
     */
    protected function configureDefaults(): void
    {
        Date::use(CarbonImmutable::class);

        DB::prohibitDestructiveCommands(
            app()->isProduction(),
        );

        Password::defaults(fn (): ?Password => app()->isProduction()
            ? Password::min(12)
                ->mixedCase()
                ->letters()
                ->numbers()
                ->symbols()
                ->uncompromised()
            : null,
        );
    }
}
