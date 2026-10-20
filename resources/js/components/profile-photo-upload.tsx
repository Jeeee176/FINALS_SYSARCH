import { ImagePlus, Trash2, Undo2 } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import { Button } from '@/components/ui/button';
import InputError from '@/components/input-error';
import { UserAvatar } from '@/components/user-avatar';

type ProfilePhotoUploadProps = {
    id?: string;
    name: string;
    currentUrl: string | null;
    file: File | null;
    removeRequested: boolean;
    onFileChange: (file: File | null) => void;
    onRemoveRequestedChange: (requested: boolean) => void;
    error?: string;
    disabled?: boolean;
};

export function ProfilePhotoUpload({
    id = 'profile-photo',
    name,
    currentUrl,
    file,
    removeRequested,
    onFileChange,
    onRemoveRequestedChange,
    error,
    disabled = false,
}: ProfilePhotoUploadProps) {
    const inputRef = useRef<HTMLInputElement | null>(null);
    const previewUrl = useMemo(
        () => (file ? URL.createObjectURL(file) : null),
        [file],
    );

    useEffect(() => {
        return () => {
            if (previewUrl) {
                URL.revokeObjectURL(previewUrl);
            }
        };
    }, [previewUrl]);

    const effectiveUrl = previewUrl ?? (removeRequested ? null : currentUrl);
    const hasPhoto = effectiveUrl !== null;

    const openPicker = () => {
        inputRef.current?.click();
    };

    const handleFileSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
        const selected = event.target.files?.[0] ?? null;
        // Allow picking the same file again on a later attempt.
        event.target.value = '';

        if (selected) {
            onFileChange(selected);
            onRemoveRequestedChange(false);
        }
    };

    const handleRemove = () => {
        onFileChange(null);
        onRemoveRequestedChange(true);
    };

    return (
        <div data-test="profile-photo-upload" className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-4">
                <UserAvatar
                    name={name || 'User'}
                    src={effectiveUrl}
                    className="size-16 border"
                    fallbackClassName="text-lg"
                />
                <div className="flex flex-wrap items-center gap-2">
                    <input
                        ref={inputRef}
                        id={id}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        aria-label="Profile picture"
                        className="sr-only"
                        data-test="profile-photo-input"
                        onChange={handleFileSelected}
                        disabled={disabled}
                    />
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={openPicker}
                        disabled={disabled}
                        data-test="profile-photo-choose"
                    >
                        <ImagePlus className="h-4 w-4" />
                        {hasPhoto ? 'Change Image' : 'Choose Image'}
                    </Button>
                    {hasPhoto && !removeRequested && (
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-destructive-strong hover:bg-destructive/10"
                            onClick={handleRemove}
                            disabled={disabled}
                            data-test="profile-photo-remove"
                        >
                            <Trash2 className="h-4 w-4" />
                            Remove
                        </Button>
                    )}
                    {removeRequested && (
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => onRemoveRequestedChange(false)}
                            disabled={disabled}
                            data-test="profile-photo-undo"
                        >
                            <Undo2 className="h-4 w-4" />
                            Undo Remove
                        </Button>
                    )}
                </div>
            </div>

            {removeRequested && (
                <p className="text-muted-foreground text-xs">
                    The current picture will be removed when you save. Use Undo
                    Remove to keep it.
                </p>
            )}

            <p className="text-muted-foreground text-xs">
                JPEG, PNG or WebP. Maximum size 2 MB.
            </p>

            <InputError message={error} />
        </div>
    );
}
