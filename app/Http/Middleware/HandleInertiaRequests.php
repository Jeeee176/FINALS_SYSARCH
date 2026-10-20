<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Inertia\Middleware;
use Inertia\Ssr\Gateway;
use Inertia\Support\Header;
use Inertia\Inertia;
use Inertia\DevTools\DevTools;
use Inertia\Ssr\ExcludesSsrPaths;
use Inertia\Support\SessionKey;
use Symfony\Component\HttpFoundation\Response;

class HandleInertiaRequests extends Middleware
{
    /**
     * The root template that's loaded on the first page visit.
     *
     * @see https://inertiajs.com/server-side-setup#root-template
     *
     * @var string
     */
    protected $rootView = 'app';

    /**
     * Determines the current asset version.
     *
     * @see https://inertiajs.com/asset-versioning
     */
    public function version(Request $request): ?string
    {
        return parent::version($request);
    }

    /**
     * Handle the incoming request.
     *
     * Fixed version check: only compare versions if client actually sent a version header.
     * The parent middleware incorrectly triggers 409 on first visit when no version header is sent.
     */
    public function handle(Request $request, Closure $next)
    {
        $recorder = DevTools::recorder($request);

        $recorder?->requestStarted($request);

        Inertia::version(function () use ($request) {
            return $this->version($request);
        });

        $shared = $this->share($request);

        Inertia::share($shared);

        $recorder?->sharedPropsResolved($this, $shared);

        foreach ($this->shareOnce($request) as $key => $value) {
            if ($value instanceof \Inertia\Support\OnceProp) {
                Inertia::share($key, $value);
            } else {
                Inertia::shareOnce($key, $value);
            }
        }

        Inertia::setRootView($this->rootView($request));

        if ($urlResolver = $this->urlResolver()) {
            Inertia::resolveUrlUsing($urlResolver);
        }

        $ssrGateway = app(Gateway::class);

        if (! empty($this->withoutSsr) && $ssrGateway instanceof ExcludesSsrPaths) {
            $ssrGateway->except($this->withoutSsr);
        }

        $response = $next($request);
        $response->headers->set('Vary', Header::INERTIA);

        if ($isRedirect = $response->isRedirect()) {
            $this->reflash($request);
        }

        if (! $request->header(Header::INERTIA)) {
            $recorder?->respondedWith($request, $response);

            return $response;
        }

        // FIX: Only do version check if client actually sent a version header
        // $request->header() returns null when header is not present, not empty string
        $clientVersion = $request->header(Header::VERSION);
        $currentVersion = \Inertia\Inertia::getVersion();

        // DEBUG
        \Log::info('[INERTIA_DEBUG] clientVersion: ' . var_export($clientVersion, true) . ', currentVersion: ' . $currentVersion . ', method: ' . $request->method());

        // FIX: Only check version if client actually sent a version header (not null, not empty string)
        if ($request->method() === 'GET' && $clientVersion !== null && $clientVersion !== '' && $clientVersion !== $currentVersion) {
            \Log::info('[INERTIA_DEBUG] Version mismatch, calling onVersionChange');
            $response = $this->onVersionChange($request, $response);
        }

        if ($response->isOk() && empty($response->getContent())) {
            $response = $this->onEmptyResponse($request, $response);
        }

        if ($response->getStatusCode() === 302 && in_array($request->method(), ['PUT', 'PATCH', 'DELETE'])) {
            $response->setStatusCode(303);
        }

        if ($isRedirect = $response->isRedirect()) {
            if ($this->redirectHasFragment($response) && ! $request->prefetch()) {
                $response = $this->onRedirectWithFragment($request, $response);
            }
        }

        $recorder?->respondedWith($request, $response);

        return $response;
    }

    /**
     * Define the props that are shared by default.
     *
     * @see https://inertiajs.com/shared-data
     */
    public function share(Request $request): array
    {
        return [
            ...parent::share($request),
            'name' => config('app.name'),
            'auth' => [
                'user' => $request->user()
                    ? [
                        ...$request->user()->toArray(),
                        'avatar' => $request->user()->avatarUrl(),
                    ]
                    : null,
            ],
            'sidebarOpen' => ! $request->hasCookie('sidebar_state') || $request->cookie('sidebar_state') === 'true',
        ];
    }
}