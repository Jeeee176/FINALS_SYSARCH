<?php

declare(strict_types=1);

namespace App\Listeners;

use App\Models\User;
use App\Services\OperatorPresenceService;
use Illuminate\Auth\Events\Login;
use Illuminate\Auth\Events\Logout;

/**
 * Bridges the authentication lifecycle to operator presence:
 *
 *  - Login  -> operator becomes "active";
 *  - Logout -> operator becomes "inactive" (only when it was the last session).
 *
 * The Login event only fires after credentials were accepted, so failed
 * login attempts can never flip an operator to "active".
 */
class SyncOperatorPresence
{
    public function __construct(
        private readonly OperatorPresenceService $presence,
    ) {}

    public function handleLogin(Login $event): void
    {
        if (! $event->user instanceof User) {
            return;
        }

        $this->presence->markOperatorActive($event->user);
    }

    public function handleLogout(Logout $event): void
    {
        if (! $event->user instanceof User) {
            return;
        }

        $sessionId = request()->hasSession()
            ? request()->session()->getId()
            : null;

        $this->presence->markOperatorInactiveOnLastLogout(
            $event->user,
            $sessionId,
        );
    }
}
