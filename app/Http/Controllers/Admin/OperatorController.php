<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Operator;
use App\Models\User;
use App\Enums\Role;
use App\Services\ProfilePhotoService;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Inertia\Inertia;

class OperatorController extends Controller
{
    public function __construct(
        private readonly ProfilePhotoService $photos,
    ) {}

    /**
     * Display a listing of the resource.
     */
    public function index()
    {
        $operators = Operator::with('user')
            ->get()
            ->sortBy(fn (Operator $operator) => strtolower($operator->user?->name ?? ''))
            ->values()
            ->map(fn (Operator $operator) => [
                'id' => $operator->id,
                'user_id' => $operator->user_id,
                'phone' => $operator->phone,
                'address' => $operator->address,
                'status' => $operator->status,
                'user' => $operator->user ? [
                    'id' => $operator->user->id,
                    'name' => $operator->user->name,
                    'email' => $operator->user->email,
                    'avatar' => $operator->user->avatarUrl(),
                ] : null,
            ]);

        return Inertia::render('admin/operators/index', [
            'operators' => $operators,
        ]);
    }

    /**
     * Show the form for creating a new resource.
     */
    public function create()
    {
        return Inertia::render('admin/operators/create');
    }

    /**
     * Store a newly created resource in storage.
     */
    public function store(Request $request)
    {
        $validated = $request->validate([
            'name' => [
                'required',
                'string',
                'max:255',
            ],
            'email' => [
                'required',
                'email',
                'max:255',
                Rule::unique('users', 'email'),
            ],
            'password' => [
                'required',
                'string',
                'min:8',
                'confirmed',
            ],
            'phone' => [
                'nullable',
                'string',
                'max:255',
            ],
            'address' => [
                'nullable',
                'string',
            ],
            'status' => [
                'required',
                'in:active,inactive',
            ],
            'photo' => [
                'nullable',
                'image',
                'mimes:jpeg,png,webp',
                'max:2048',
            ],
        ]);

        $photoPath = $request->hasFile('photo')
            ? $this->photos->store($request->file('photo'))
            : null;

        try {
            DB::transaction(function () use ($validated, $photoPath) {
                $user = User::create([
                    'name' => $validated['name'],
                    'email' => $validated['email'],
                    'password' => $validated['password'],
                    'role' => Role::OPERATOR,
                    'avatar_path' => $photoPath,
                ]);

                Operator::create([
                    'user_id' => $user->id,
                    'phone' => $validated['phone'] ?? null,
                    'address' => $validated['address'] ?? null,
                    'status' => $validated['status'],
                ]);
            });
        } catch (\Throwable $e) {
            if ($photoPath !== null) {
                Storage::disk(ProfilePhotoService::DISK)->delete($photoPath);
            }
            throw $e;
        }

        return redirect()->route('admin.operators.index')
            ->with('success', 'Operator created successfully.');
    }

    /**
     * Show the form for editing the specified resource.
     */
    public function edit(Operator $operator)
    {
        $operator->load('user');

        $availableUsers = User::where('role', Role::OPERATOR->value)
            ->whereDoesntHave('operator')
            ->orWhereHas('operator', function ($query) use ($operator) {
                $query->where('id', '!=', $operator->id);
            })
            ->get();

        return Inertia::render('admin/operators/edit', [
            'operator' => [
                'id' => $operator->id,
                'user_id' => $operator->user_id,
                'phone' => $operator->phone,
                'address' => $operator->address,
                'status' => $operator->status,
                'user' => $operator->user ? [
                    'id' => $operator->user->id,
                    'name' => $operator->user->name,
                    'email' => $operator->user->email,
                    'avatar' => $operator->user->avatarUrl(),
                ] : null,
            ],
            'availableUsers' => $availableUsers,
        ]);
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(Request $request, Operator $operator)
    {
        $validated = $request->validate([
            'user_id' => [
                'required',
                'exists:users,id',
                Rule::unique('operators', 'user_id')->ignore($operator->id),
                function ($attribute, $value, $fail) {
                    $user = User::find($value);
                    if ($user && $user->role !== Role::OPERATOR) {
                        $fail('The selected user must have an operator role.');
                    }
                },
            ],
            'phone' => [
                'nullable',
                'string',
                'max:255',
            ],
            'address' => [
                'nullable',
                'string',
            ],
            'status' => [
                'required',
                'in:active,inactive',
            ],
            'photo' => [
                'nullable',
                'image',
                'mimes:jpeg,png,webp',
                'max:2048',
            ],
            'remove_photo' => [
                'nullable',
                'boolean',
            ],
        ]);

        $newPhotoPath = $request->hasFile('photo')
            ? $this->photos->store($request->file('photo'))
            : null;
        $removeRequested = $request->boolean('remove_photo');
        $oldPhotoPath = $operator->user?->avatar_path;

        try {
            DB::transaction(function () use ($operator, $validated, $newPhotoPath, $removeRequested) {
                $operator->update(Arr::except($validated, ['photo', 'remove_photo']));

                // Photo operations always apply to the currently linked user
                // (the account selected in this form).
                if ($newPhotoPath !== null) {
                    $operator->user->update(['avatar_path' => $newPhotoPath]);
                } elseif ($removeRequested) {
                    $operator->user->update(['avatar_path' => null]);
                }
            });
        } catch (\Throwable $e) {
            if ($newPhotoPath !== null) {
                Storage::disk(ProfilePhotoService::DISK)->delete($newPhotoPath);
            }
            throw $e;
        }

        // Only after the database commit may the previous file be deleted,
        // and only when no other user still references it.
        if ($newPhotoPath !== null || $removeRequested) {
            $this->photos->deleteIfUnreferenced($oldPhotoPath, $operator->user_id);
        }

        return redirect()->route('admin.operators.index')
            ->with('success', 'Operator updated successfully.');
    }

    /**
     * Remove the specified resource from storage.
     */
    public function destroy(Operator $operator)
    {
        $operator->delete();

        return redirect()->route('admin.operators.index')
            ->with('success', 'Operator deleted successfully.');
    }
}
