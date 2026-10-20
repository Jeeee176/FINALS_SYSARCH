<?php

declare(strict_types=1);

require __DIR__ . '/../../vendor/autoload.php';

// ── DATABASE SAFETY BARRIER ───────────────────────────────────────────────
// Read .env directly (before Laravel bootstrap) to check DB_DATABASE.
$envFile = __DIR__ . '/../../.env';
$appDb = null;
if (file_exists($envFile)) {
    $envLines = file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($envLines as $line) {
        if (str_starts_with(trim($line), 'DB_DATABASE=')) {
            $appDb = trim(substr($line, strlen('DB_DATABASE=')));
            break;
        }
    }
}

// When .env points at bus_tracking, run against the dedicated test database
// (mysql_test → bus_tracking_test) instead. Never touch production data.
$useTestConnection = ($appDb === 'bus_tracking');

// ── END SAFETY BARRIER ────────────────────────────────────────────────────

$app = require_once __DIR__ . '/../../bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

if ($useTestConnection) {
    $app->make('config')->set('database.default', 'mysql_test');
    echo "  [Info] Using dedicated test connection (mysql_test → bus_tracking_test)\n\n";
} else {
    echo '  [Info] Using .env database: ' . env('DB_DATABASE') . "\n\n";
}

use App\Enums\Role;
use App\Models\Driver;
use App\Models\Operator;
use App\Models\User;
use App\Services\OperatorPresenceService;
use App\Services\ProfilePhotoService;
use Illuminate\Auth\Events\Logout;
use Illuminate\Database\Events\QueryExecuted;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Validator;

echo "=== Profile Photos (Driver + Operator) & Operator Presence — Verification ===\n\n";

$GLOBALS['CREATED_BUSES'] = [];
$GLOBALS['CREATED_DRIVERS'] = [];
$GLOBALS['CREATED_OPERATORS'] = [];
$GLOBALS['CREATED_USERS'] = [];
$GLOBALS['TEMP_FILES'] = [];
$results = [];
$pass = 0;
$fail = 0;

function T(string $label, callable $check): void
{
    global $results, $pass, $fail;
    try {
        $result = $check();
        if ($result === true) {
            $pass++;
            echo "  ✓ {$label}\n";
        } else {
            $fail++;
            echo "  ✗ {$label}" . (is_string($result) ? " — {$result}" : '') . "\n";
        }
        $results[$label] = ($result === true);
    } catch (\Throwable $e) {
        $fail++;
        echo "  ✗ {$label} — {$e->getMessage()}\n";
        $results[$label] = false;
    }
}

function mkUser(string $suffix, Role $role = Role::DRIVER): User
{
    $user = User::create([
        'name' => "Photo Test {$suffix}",
        'email' => "photo-{$suffix}-" . substr(md5((string) mt_rand()), 0, 6) . '@example.com',
        'password' => bcrypt('password'),
        'role' => $role,
    ]);
    $GLOBALS['CREATED_USERS'][] = $user;
    return $user;
}

function mkDriver(string $suffix, string $status = 'inactive'): Driver
{
    $user = mkUser($suffix);
    $driver = Driver::create([
        'user_id' => $user->id,
        'license_number' => "PP-LIC-{$suffix}-" . substr(md5((string) mt_rand()), 0, 6),
        'license_expiry' => now()->addYear()->toDateString(),
        'phone' => '555-0000',
        'address' => 'Test Addr',
        'status' => $status,
    ]);
    $GLOBALS['CREATED_DRIVERS'][] = $driver->fresh();
    return $driver->fresh();
}

function mkOperator(string $suffix, string $status = 'inactive'): Operator
{
    $user = mkUser($suffix, Role::OPERATOR);
    $operator = Operator::create([
        'user_id' => $user->id,
        'phone' => '555-1111',
        'address' => 'Op Addr',
        'status' => $status,
    ]);
    $GLOBALS['CREATED_OPERATORS'][] = $operator;
    return $operator->fresh();
}

function sessionTable(): string
{
    return (string) config('session.table', 'sessions');
}

// Store::setId() only accepts exactly 40 alphanumeric characters; anything
// else is silently replaced with a freshly generated id.
function newSessionId(): string
{
    return bin2hex(random_bytes(20));
}

function mkSession(string $id, int $userId, int $lastActivity): void
{
    DB::table(sessionTable())->insert([
        'id' => $id,
        'user_id' => $userId,
        'ip_address' => '127.0.0.1',
        'user_agent' => 'verify-profile-photos',
        'payload' => base64_encode(serialize([])),
        'last_activity' => $lastActivity,
    ]);
}

function clearSessionsFor(int $userId): void
{
    DB::table(sessionTable())->where('user_id', $userId)->delete();
}

function withLogoutRequest(string $currentSessionId, callable $dispatch): void
{
    $original = app('request');

    try {
        $session = app('session')->driver();
        $session->setId($currentSessionId);
        $request = Request::create('/logout', 'POST');
        $request->setLaravelSession($session);
        app()->instance('request', $request);
        $dispatch();
    } finally {
        app()->instance('request', $original);
    }
}

// ── Real 1×1 image bytes (GD is unavailable; validation uses fileinfo) ────

function imageBytes(string $ext): string
{
    return match ($ext) {
        'png' => base64_decode(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
        ),
        'jpg' => base64_decode(
            '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q=='
        ),
        'webp' => base64_decode(
            'UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA'
        ),
        default => throw new InvalidArgumentException("unsupported ext {$ext}"),
    };
}

function writeTempFile(string $ext, string $bytes): string
{
    $path = sys_get_temp_dir() . DIRECTORY_SEPARATOR
        . 'pp-verify-' . bin2hex(random_bytes(6)) . '.' . $ext;
    file_put_contents($path, $bytes);
    $GLOBALS['TEMP_FILES'][] = $path;
    return $path;
}

function mkUpload(string $ext, ?string $bytes = null): UploadedFile
{
    $bytes ??= imageBytes($ext);
    $path = writeTempFile($ext, $bytes);
    return new UploadedFile($path, "photo.{$ext}", null, null, true);
}

const PHOTO_RULES = ['nullable', 'image', 'mimes:jpeg,png,webp', 'max:2048'];

// ── Snapshot pre-existing data to prove nothing is mass-changed ──────────
$initialBuses = DB::table('buses')->get(['id', 'status', 'driver_id'])->keyBy('id');
$initialDrivers = DB::table('drivers')->get(['id', 'status', 'bus_id'])->keyBy('id');
$initialOperators = DB::table('operators')->get(['id', 'user_id', 'status'])->keyBy('id');
$initialPreExistingUsers = DB::table('users')->get(['id', 'role', 'avatar_path'])->keyBy('id');
$initialUserCount = DB::table('users')->count();

$suffix = substr(md5((string) time()), 0, 6);
$GLOBALS['suffix'] = $suffix;

$photos = new ProfilePhotoService();
$operatorPresence = $app->make(OperatorPresenceService::class);

// ── 1-4. Schema + storage wiring ─────────────────────────────────────────

T('1. users.avatar_path column exists (shared field for drivers + operators)', function () {
    return Schema::hasColumn('users', 'avatar_path') ? true : 'column missing';
});

T('2. public/storage link exists and is a directory', function () {
    return is_dir(public_path('storage')) ? true : 'public/storage missing';
});

T('3. storage/app/public directory exists', function () {
    return is_dir(storage_path('app/public')) ? true : 'storage/app/public missing';
});

T('4. files written via the public disk are reachable through /storage link', function () {
    $path = 'avatars/probe-' . bin2hex(random_bytes(6)) . '.png';
    Storage::disk('public')->put($path, 'probe');
    $linked = file_exists(public_path('storage/' . $path));
    Storage::disk('public')->delete($path);
    return $linked ? true : 'file not reachable via public/storage';
});

// ── 5-9. Validation rules ────────────────────────────────────────────────

T('5. valid PNG upload passes validation', function () {
    $v = Validator::make(['photo' => mkUpload('png')], ['photo' => PHOTO_RULES]);
    return $v->passes() ? true : $v->errors()->first('photo');
});

T('6. valid JPEG upload passes validation', function () {
    $v = Validator::make(['photo' => mkUpload('jpg')], ['photo' => PHOTO_RULES]);
    return $v->passes() ? true : $v->errors()->first('photo');
});

T('7. valid WebP upload passes validation', function () {
    $v = Validator::make(['photo' => mkUpload('webp')], ['photo' => PHOTO_RULES]);
    return $v->passes() ? true : $v->errors()->first('photo');
});

T('8. non-image file disguised as .png is rejected', function () {
    $v = Validator::make(
        ['photo' => mkUpload('png', 'this is definitely not an image')],
        ['photo' => PHOTO_RULES],
    );
    return $v->fails() ? true : 'invalid file accepted';
});

T('9. oversized image (>2 MB) is rejected', function () {
    $v = Validator::make(
        ['photo' => mkUpload('png', imageBytes('png') . str_repeat('0', 3 * 1024 * 1024))],
        ['photo' => PHOTO_RULES],
    );
    return $v->fails() ? true : 'oversized file accepted';
});

// ── 10-16. ProfilePhotoService behavior ──────────────────────────────────

T('10. store() writes a random avatars/ path that exists on the public disk', function () use ($photos) {
    $path = $photos->store(mkUpload('png'));
    if (!str_starts_with($path, 'avatars/')) {
        return "unexpected path {$path}";
    }
    if (basename($path) === 'photo.png') {
        return 'client filename was reused';
    }
    return Storage::disk('public')->exists($path) ? true : 'file missing after store';
});

T('11. avatarUrl() returns a relative /storage URL and null when unset', function () {
    $user = mkUser("{$GLOBALS['suffix']}-url");
    $user->update(['avatar_path' => 'avatars/x.png']);
    $ok = $user->avatarUrl() === '/storage/avatars/x.png';
    $user->update(['avatar_path' => null]);
    $okNull = $user->avatarUrl() === null;
    return $ok && $okNull ? true : 'unexpected avatarUrl output';
});

T('12. attachPhoto sets avatar_path and keeps the new file', function () use ($photos) {
    $user = mkUser("{$GLOBALS['suffix']}-attach");
    $path = $photos->attachPhoto($user, mkUpload('png'));
    return $user->fresh()->avatar_path === $path && Storage::disk('public')->exists($path)
        ? true
        : 'photo not persisted';
});

T('13. replacing a photo deletes the old file only after the update succeeds', function () use ($photos) {
    $user = mkUser("{$GLOBALS['suffix']}-replace");
    $first = $photos->attachPhoto($user, mkUpload('png'));
    $second = $photos->attachPhoto($user->fresh(), mkUpload('jpg'));

    if ($user->fresh()->avatar_path !== $second) {
        return 'new path not persisted';
    }
    if (Storage::disk('public')->exists($first)) {
        return 'old file still present';
    }
    return Storage::disk('public')->exists($second) ? true : 'new file missing';
});

T('14. failed database update removes the freshly stored file (no orphan)', function () use ($photos) {
    $user = mkUser("{$GLOBALS['suffix']}-fail");

    // Force a deterministic database failure: any UPDATE throws while armed.
    $armed = true;
    Event::listen(QueryExecuted::class, function () use (&$armed) {
        if ($armed) {
            throw new RuntimeException('forced database failure');
        }
    });

    $before = count(Storage::disk('public')->files('avatars'));

    try {
        $photos->attachPhoto($user, mkUpload('png'));
    } catch (\Throwable $e) {
        // expected
    } finally {
        $armed = false;
    }

    $after = count(Storage::disk('public')->files('avatars'));

    return $after === $before
        ? true
        : 'orphaned file left behind (before=' . $before . ', after=' . $after . ')';
});

T('15. removePhoto clears the column and deletes the file', function () use ($photos) {
    $user = mkUser("{$GLOBALS['suffix']}-remove");
    $path = $photos->attachPhoto($user, mkUpload('png'));

    $removed = $photos->removePhoto($user->fresh());

    if ($removed !== true) {
        return 'removePhoto returned false';
    }
    if ($user->fresh()->avatar_path !== null) {
        return 'column not cleared';
    }
    return Storage::disk('public')->exists($path) ? 'file still present' : true;
});

T('16. removePhoto is a safe no-op when no photo is set', function () use ($photos) {
    $user = mkUser("{$GLOBALS['suffix']}-noremove");
    return $photos->removePhoto($user) === false ? true : 'unexpected true';
});

// ── 17-20. File safety guards ────────────────────────────────────────────

T('17. shared file is NOT deleted while another user references it', function () use ($photos) {
    $path = 'avatars/shared-' . bin2hex(random_bytes(6)) . '.png';
    Storage::disk('public')->put($path, 'shared');
    $userA = mkUser("{$GLOBALS['suffix']}-shareA");
    $userB = mkUser("{$GLOBALS['suffix']}-shareB");
    $userA->update(['avatar_path' => $path]);
    $userB->update(['avatar_path' => $path]);

    $deleted = $photos->deleteIfUnreferenced($path, $userA->id);
    $stillThere = Storage::disk('public')->exists($path);

    $userB->update(['avatar_path' => null]);
    $deletedAfter = $photos->deleteIfUnreferenced($path, $userA->id);

    if ($deleted !== false || ! $stillThere) {
        return 'shared file was deleted too early';
    }
    return $deletedAfter === true ? true : 'file not deleted after last reference removed';
});

T('18. deleteIfUnreferenced refuses path traversal and absolute paths', function () use ($photos) {
    $paths = ['../.env', 'avatars/../../.env', '/etc/passwd', 'C:\\Windows\\win.ini', 'other-dir/x.png'];
    foreach ($paths as $path) {
        if ($photos->deleteIfUnreferenced($path) !== false) {
            return "unsafe path accepted: {$path}";
        }
        if ($photos->isSafePath($path)) {
            return "isSafePath accepted: {$path}";
        }
    }
    return true;
});

T('19. deleteIfUnreferenced deletes a genuinely unreferenced file', function () use ($photos) {
    $path = 'avatars/orphan-' . bin2hex(random_bytes(6)) . '.png';
    Storage::disk('public')->put($path, 'orphan');
    $result = $photos->deleteIfUnreferenced($path);
    return $result === true && ! Storage::disk('public')->exists($path)
        ? true
        : 'orphan not deleted';
});

T('20. store() never reuses the client-supplied filename', function () use ($photos) {
    $path = $photos->store(new UploadedFile(
        writeTempFile('png', imageBytes('png')),
        '../../evil name.png',
        null,
        null,
        true,
    ));
    return !str_contains($path, 'evil') && !str_contains($path, '..')
        ? true
        : "unsafe stored name: {$path}";
});

// ── 21-27. Operator presence service ─────────────────────────────────────

T('21. markOperatorActive flips operator inactive → active', function () use ($operatorPresence) {
    $operator = mkOperator("{$GLOBALS['suffix']}-opact", 'inactive');
    $result = $operatorPresence->markOperatorActive($operator->user);

    return $result === true && $operator->fresh()->status === 'active'
        ? true
        : 'service did not activate operator';
});

T('22. markOperatorActive no-ops for admin and driver users', function () use ($operatorPresence) {
    $admin = mkUser("{$GLOBALS['suffix']}-opadm", Role::ADMIN);
    $driver = mkDriver("{$GLOBALS['suffix']}-opdrv", 'inactive');

    $adminResult = $operatorPresence->markOperatorActive($admin);
    $driverResult = $operatorPresence->markOperatorActive($driver->user);

    return $adminResult === false && $driverResult === false && $driver->fresh()->status === 'inactive'
        ? true
        : 'non-operator presence was touched';
});

T('23. operator last logout marks the operator inactive', function () use ($operatorPresence) {
    $operator = mkOperator("{$GLOBALS['suffix']}-oplo1", 'active');
    clearSessionsFor($operator->user_id);

    $result = $operatorPresence->markOperatorInactiveOnLastLogout($operator->user);

    return $result === true && $operator->fresh()->status === 'inactive'
        ? true
        : 'operator not deactivated';
});

T('24. operator logout with another live session keeps them active', function () use ($operatorPresence) {
    $operator = mkOperator("{$GLOBALS['suffix']}-oplo2", 'active');
    clearSessionsFor($operator->user_id);
    mkSession(newSessionId(), $operator->user_id, now()->getTimestamp());

    $result = $operatorPresence->markOperatorInactiveOnLastLogout($operator->user);

    return $result === false && $operator->fresh()->status === 'active'
        ? true
        : 'multi-session logout deactivated operator';
});

T('25. operator Logout event excludes the dying session (current session id)', function () {
    $operator = mkOperator("{$GLOBALS['suffix']}-opev1", 'active');
    clearSessionsFor($operator->user_id);

    $currentId = newSessionId();
    mkSession($currentId, $operator->user_id, now()->getTimestamp());

    withLogoutRequest($currentId, function () use ($operator) {
        event(new Logout('web', $operator->user));
    });

    return $operator->fresh()->status === 'inactive'
        ? true
        : 'current session was not excluded';
});

T('26. operator login does not touch other operators (no mass update)', function () use ($operatorPresence) {
    $target = mkOperator("{$GLOBALS['suffix']}-opm1", 'inactive');
    $other = mkOperator("{$GLOBALS['suffix']}-opm2", 'inactive');

    $operatorPresence->markOperatorActive($target->user);

    return $target->fresh()->status === 'active' && $other->fresh()->status === 'inactive'
        ? true
        : 'other operators were affected';
});

T('27. failed operator login leaves presence unchanged (event only on success)', function () {
    $operator = mkOperator("{$GLOBALS['suffix']}-opfail", 'inactive');
    clearSessionsFor($operator->user_id);

    $attempted = Auth::attempt([
        'email' => $operator->user->email,
        'password' => 'definitely-wrong-password',
    ]);

    Auth::logout();

    return $attempted === false && $operator->fresh()->status === 'inactive'
        ? true
        : 'failed login changed operator presence';
});

// ── 28-30. Event wiring through the real auth lifecycle ──────────────────

T('28. real operator login event (Auth::attempt) activates the operator', function () {
    $operator = mkOperator("{$GLOBALS['suffix']}-opreal", 'inactive');
    clearSessionsFor($operator->user_id);

    $attempted = Auth::attempt([
        'email' => $operator->user->email,
        'password' => 'password',
    ]);

    $status = $operator->fresh()->status;
    Auth::logout();

    return $attempted === true && $status === 'active'
        ? true
        : "attempt={$attempted} status={$status}";
});

T('29. operator authentication does not touch driver presence (regression)', function () {
    $driver = mkDriver("{$GLOBALS['suffix']}-regdrv", 'inactive');
    $operator = mkOperator("{$GLOBALS['suffix']}-regop", 'inactive');
    clearSessionsFor($driver->user_id);
    clearSessionsFor($operator->user_id);

    Auth::attempt(['email' => $operator->user->email, 'password' => 'password']);
    Auth::logout();

    return $driver->fresh()->status === 'inactive'
        ? true
        : 'driver presence was changed by operator auth';
});

T('30. driver login/logout still works after operator listener registration', function () {
    $driver = mkDriver("{$GLOBALS['suffix']}-regdrv2", 'inactive');
    clearSessionsFor($driver->user_id);

    Auth::attempt(['email' => $driver->user->email, 'password' => 'password']);
    $afterLogin = $driver->fresh()->status;

    Auth::logout();
    $afterLogout = $driver->fresh()->status;

    return $afterLogin === 'active' && $afterLogout === 'inactive'
        ? true
        : "login={$afterLogin} logout={$afterLogout}";
});

// ── 31-32. Account deletion + route wiring ───────────────────────────────

T('31. deleting a driver keeps the retained user account photo intact', function () use ($photos) {
    $driver = mkDriver("{$GLOBALS['suffix']}-deldrv", 'inactive');
    $user = $driver->user;
    $path = $photos->attachPhoto($user, mkUpload('png'));

    $driver->delete();

    $userFresh = User::find($user->id);
    $ok = $userFresh !== null
        && $userFresh->avatar_path === $path
        && Storage::disk('public')->exists($path);

    return $ok ? true : 'photo was lost or wrongly deleted';
});

T('32. admin.operators routes keep auth+verified+role:admin middleware', function () use ($app) {
    $router = $app->make('router');
    $routesByName = [];
    foreach ($router->getRoutes() as $registered) {
        if ($registered->getName()) {
            $routesByName[$registered->getName()] = $registered;
        }
    }

    foreach (['admin.operators.index', 'admin.operators.create', 'admin.operators.store', 'admin.operators.edit', 'admin.operators.update', 'admin.operators.destroy'] as $name) {
        $route = $routesByName[$name] ?? null;
        if ($route === null) {
            return "{$name} missing";
        }
        $mw = $route->gatherMiddleware();
        if (! in_array('auth', $mw, true) || ! in_array('verified', $mw, true) || ! in_array('role:admin', $mw, true)) {
            return "{$name} middleware changed";
        }
    }
    return true;
});

// ── Snapshot guard: pre-existing rows untouched ──────────────────────────

T('33. pre-existing drivers/operators/buses rows are unchanged', function () use ($initialDrivers, $initialOperators, $initialBuses) {
    foreach ($initialDrivers as $id => $row) {
        $now = DB::table('drivers')->where('id', $id)->first(['status', 'bus_id']);
        if ($now === null || $now->status !== $row->status || $now->bus_id !== $row->bus_id) {
            return "driver {$id} changed";
        }
    }
    foreach ($initialOperators as $id => $row) {
        $now = DB::table('operators')->where('id', $id)->first(['user_id', 'status']);
        if ($now === null || $now->status !== $row->status || $now->user_id !== $row->user_id) {
            return "operator {$id} changed";
        }
    }
    foreach ($initialBuses as $id => $row) {
        $now = DB::table('buses')->where('id', $id)->first(['status', 'driver_id']);
        if ($now === null || $now->status !== $row->status || $now->driver_id !== $row->driver_id) {
            return "bus {$id} changed";
        }
    }
    return true;
});

T('34. pre-existing user rows are unchanged (avatar_path untouched)', function () use ($initialPreExistingUsers) {
    foreach ($initialPreExistingUsers as $id => $row) {
        $now = DB::table('users')->where('id', $id)->first(['role', 'avatar_path']);
        if ($now === null) {
            return "user {$id} missing";
        }
        if ($now->role !== $row->role) {
            return "user {$id} role changed";
        }
        if ((string) $now->avatar_path !== (string) $row->avatar_path) {
            return "user {$id} avatar changed";
        }
    }
    return true;
});

// ── Cleanup ──────────────────────────────────────────────────────────────

echo "\n=== Cleanup ===\n";

$cleanedFiles = 0;
foreach ($GLOBALS['CREATED_DRIVERS'] as $driver) {
    DB::table('drivers')->where('id', $driver->id)->delete();
}
foreach ($GLOBALS['CREATED_OPERATORS'] as $operator) {
    DB::table('operators')->where('id', $operator->id)->delete();
}
foreach ($GLOBALS['CREATED_USERS'] as $user) {
    $fresh = User::find($user->id);
    if ($fresh !== null && $fresh->avatar_path !== null) {
        if ($photos->deleteIfUnreferenced($fresh->avatar_path, $fresh->id)) {
            $cleanedFiles++;
        }
    }
    clearSessionsFor($user->id);
    DB::table('users')->where('id', $user->id)->delete();
}
foreach ($GLOBALS['TEMP_FILES'] as $file) {
    if (file_exists($file)) {
        @unlink($file);
    }
}

// Remove any avatar files left unreferenced by failed test flows.
$leftoverFiles = 0;
foreach (Storage::disk('public')->files('avatars') as $file) {
    $referenced = DB::table('users')->where('avatar_path', $file)->exists();
    if (! $referenced) {
        Storage::disk('public')->delete($file);
        $leftoverFiles++;
    }
}

$finalUserCount = DB::table('users')->count();
$finalDriverCount = DB::table('drivers')->count();
$finalOperatorCount = DB::table('operators')->count();

echo "  cleaned {$cleanedFiles} referenced files, {$leftoverFiles} orphan files\n";
echo "  users: {$finalUserCount} (initial {$initialUserCount}), drivers: {$finalDriverCount}, operators: {$finalOperatorCount}\n";

if ($finalUserCount !== $initialUserCount) {
    $fail++;
    echo "  ✗ user count not restored to initial value\n";
} else {
    $pass++;
    echo "  ✓ user count restored to initial value\n";
}

echo "\n=== RESULT: {$pass} passed, {$fail} failed ===\n";
if ($fail > 0) {
    exit(1);
}
exit(0);
