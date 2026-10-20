<?php

declare(strict_types=1);

namespace App\Services;

use App\Enums\Role;
use App\Models\Operator;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * Keeps the operator "active"/"inactive" flag in sync with login presence:
 *
 *  - a successful login marks the operator active;
 *  - a logout only marks the operator inactive when no other live session for
 *    the same user remains (multi-session/multi-device safe).
 *
 * The check is best-effort by design: sessions that merely expire or whose
 * browser is closed never fire a Logout event, so the operator stays "active"
 * until the next logout or a manual edit. Nothing here touches bus
 * assignments, trips, GPS data, routes or the departure queue.
 */
class OperatorPresenceService
{
    public const STATUS_ACTIVE = 'active';

    public const STATUS_INACTIVE = 'inactive';

    /**
     * Mark the operator linked to the given user as active.
     *
     * Non-operator users and operator-role users without an operator profile
     * are ignored so admin/driver presence is never affected.
     */
    public function markOperatorActive(User $user): bool
    {
        if ($user->role !== Role::OPERATOR) {
            return false;
        }

        return Operator::query()
            ->where('user_id', $user->id)
            ->update(['status' => self::STATUS_ACTIVE]) > 0;
    }

    /**
     * Mark the operator inactive when the user has no other active session.
     *
     * The session performing the logout is excluded from the check because it
     * is still present in storage at the time the Logout event fires.
     */
    public function markOperatorInactiveOnLastLogout(
        User $user,
        ?string $currentSessionId = null,
    ): bool {
        if ($user->role !== Role::OPERATOR) {
            return false;
        }

        if ($this->hasOtherActiveSessions($user->id, $currentSessionId)) {
            return false;
        }

        return Operator::query()
            ->where('user_id', $user->id)
            ->update(['status' => self::STATUS_INACTIVE]) > 0;
    }

    /**
     * Determine whether the user has any other session that is still within
     * the configured session lifetime.
     */
    public function hasOtherActiveSessions(
        int $userId,
        ?string $exceptSessionId = null,
    ): bool {
        $lifetimeCutoff = now()->getTimestamp()
            - ((int) config('session.lifetime') * 60);

        return DB::table((string) config('session.table', 'sessions'))
            ->where('user_id', $userId)
            ->where('last_activity', '>=', $lifetimeCutoff)
            ->when(
                $exceptSessionId !== null && $exceptSessionId !== '',
                fn ($query) => $query->where('id', '!=', $exceptSessionId),
            )
            ->exists();
    }
}
