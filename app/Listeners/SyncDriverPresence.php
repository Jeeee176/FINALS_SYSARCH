<?php

declare(strict_types=1);

namespace App\Listeners;

use App\Models\User;
use App\Services\DriverPresenceService;
use Illuminate\Auth\Events\Login;
use Illuminate\Auth\Events\Logout;

/**
 * Bridges the authentication lifecycle to driver presence:
 *
 *  - Login  -> driver becomes "active";
 *  - Logout -> driver becomes "inactive" (only when it was the last session).
 *
 * The Login event only fires after credentials were accepted, so failed
 * login attempts can never flip a driver to "active".
 */
class SyncDriverPresence
{
    public function __construct(
        private readonly DriverPresenceService $presence,
    ) {}

    public function handleLogin(Login $event): void
    {
        if (! $event->user instanceof User) {
            return;
        }

        $this->presence->markDriverActive($event->user);
    }

    public function handleLogout(Logout $event): void
    {
        if (! $event->user instanceof User) {
            return;
        }

        $sessionId = request()->hasSession()
            ? request()->session()->getId()
            : null;

        $this->presence->markDriverInactiveOnLastLogout(
            $event->user,
            $sessionId,
        );
    }
}
