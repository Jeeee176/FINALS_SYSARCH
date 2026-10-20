<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Enums\Role;
use Closure;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Support\Header;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Response;

class EnsureCorrectRole
{
    /**
     * Handle an incoming request.
     *
     * @param  \Closure(Request): (Response)  $next
     */
    public function handle(Request $request, Closure $next, string ...$allowedRoles): mixed
    {
        $user = $request->user();

        if (! $user) {
            return $this->forbiddenResponse($request, 'Unauthorized');
        }

        $userRole = $user->role;

        if (! $userRole instanceof Role) {
            return $this->forbiddenResponse($request, 'Invalid role');
        }

        foreach ($allowedRoles as $allowedRole) {
            if ($userRole->value === $allowedRole) {
                return $next($request);
            }
        }

        return $this->forbiddenResponse($request, 'Forbidden');
    }

    /**
     * Return an Inertia-compatible 403 response if the request is an Inertia navigation,
     * otherwise return a plain JSON 403.
     */
    private function forbiddenResponse(Request $request, string $message): mixed
    {
        if ($request->header(Header::INERTIA)) {
            return Inertia::render('errors/error', [
                'status' => 403,
                'message' => $message,
            ])->toResponse($request)->setStatusCode(403);
        }

        return new JsonResponse(['error' => $message], 403);
    }
}
