import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

export function getInitials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) {
        return '?';
    }
    if (parts.length === 1) {
        return parts[0].slice(0, 2).toUpperCase();
    }
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

type UserAvatarProps = {
    name: string;
    src?: string | null;
    className?: string;
    fallbackClassName?: string;
    testId?: string;
};

export function UserAvatar({
    name,
    src,
    className,
    fallbackClassName,
    testId,
}: UserAvatarProps) {
    return (
        <Avatar
            data-test={testId ?? 'user-avatar'}
            className={cn('size-10', className)}
        >
            {src ? (
                <AvatarImage
                    src={src}
                    alt={`${name} profile picture`}
                    className="object-cover"
                />
            ) : null}
            <AvatarFallback
                className={cn(
                    'bg-primary/10 text-primary-strong text-sm font-semibold',
                    fallbackClassName,
                )}
            >
                {getInitials(name)}
            </AvatarFallback>
        </Avatar>
    );
}
