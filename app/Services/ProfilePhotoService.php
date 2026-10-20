<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use RuntimeException;

/**
 * Handles profile photo storage for users (drivers and operators).
 *
 * Photos live on the "public" filesystem disk (storage/app/public/avatars)
 * and are exposed to the browser through the /storage symlink. Only the
 * generated relative path is stored on users.avatar_path — the client
 * supplied filename is never used as a storage path.
 */
class ProfilePhotoService
{
    public const DISK = 'public';

    public const DIRECTORY = 'avatars';

    /**
     * Store a validated upload under a random, collision-safe filename.
     */
    public function store(UploadedFile $file): string
    {
        return $file->store(self::DIRECTORY, self::DISK);
    }

    /**
     * Persist a new photo for the user and clean up the previous one.
     *
     * The old file is only removed after the database update succeeded and
     * only when no other user still references it. If persisting fails, the
     * freshly stored file is deleted so no orphan is left behind.
     */
    public function attachPhoto(User $user, UploadedFile $file): string
    {
        $oldPath = $user->avatar_path;
        $path = $this->store($file);

        try {
            $updated = $user->update(['avatar_path' => $path]);
        } catch (\Throwable $e) {
            Storage::disk(self::DISK)->delete($path);
            throw $e;
        }

        if ($updated === false) {
            Storage::disk(self::DISK)->delete($path);
            throw new RuntimeException('Failed to persist the profile photo.');
        }

        $this->deleteIfUnreferenced($oldPath, $user->id);

        return $path;
    }

    /**
     * Remove the user's photo and delete the file once unreferenced.
     */
    public function removePhoto(User $user): bool
    {
        $oldPath = $user->avatar_path;

        if ($oldPath === null) {
            return false;
        }

        $user->update(['avatar_path' => null]);
        $this->deleteIfUnreferenced($oldPath, $user->id);

        return true;
    }

    /**
     * Delete a stored avatar file only when it is safe to do so.
     *
     * Refuses paths that could escape the avatars directory and files that
     * are still referenced by any user row (shared-file protection).
     */
    public function deleteIfUnreferenced(?string $path, ?int $exceptUserId = null): bool
    {
        if ($path === null || $path === '') {
            return false;
        }

        if (! $this->isSafePath($path)) {
            return false;
        }

        $stillReferenced = User::query()
            ->where('avatar_path', $path)
            ->when(
                $exceptUserId !== null,
                fn ($query) => $query->where('id', '!=', $exceptUserId),
            )
            ->exists();

        if ($stillReferenced) {
            return false;
        }

        return Storage::disk(self::DISK)->delete($path);
    }

    /**
     * Reject anything that is not a plain relative path inside avatars/.
     */
    public function isSafePath(string $path): bool
    {
        if (str_contains($path, '..') || str_contains($path, '\\')) {
            return false;
        }

        if (str_starts_with($path, '/')) {
            return false;
        }

        return str_starts_with($path, self::DIRECTORY.'/');
    }

    /**
     * Public URL for a stored avatar path (relative, host agnostic).
     */
    public function avatarUrl(?string $path): ?string
    {
        if ($path === null || $path === '') {
            return null;
        }

        return '/storage/'.ltrim($path, '/');
    }
}
