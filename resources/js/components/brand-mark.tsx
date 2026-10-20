import type { SVGAttributes } from 'react';
import { Bus } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Full system identity, used where there is room for it. */
export const BRAND_FULL = 'Bus Tracking and Fleet Management System';

/** Compact identity for constrained spaces such as the sidebar header. */
export const BRAND_SHORT = 'Bus Tracking & Fleet Management';

/**
 * The bare bus glyph, without the surrounding tile.
 *
 * Rendered with currentColor so it inherits whatever text colour its
 * container provides.
 */
export function BrandGlyph({
    className,
    strokeWidth,
    ...props
}: SVGAttributes<SVGElement>) {
    return (
        <Bus
            className={cn('shrink-0', className)}
            strokeWidth={strokeWidth}
            aria-hidden="true"
            {...props}
        />
    );
}

/**
 * Brand mark for the Bus Tracking and Fleet Management System.
 *
 * A white tile with the bus glyph in the system red, so it reads
 * cleanly on both the red branding panel and light form surfaces.
 */
export default function BrandMark({
    className,
    iconClassName = 'size-6',
}: {
    className?: string;
    iconClassName?: string;
}) {
    return (
        <div
            className={cn(
                'border-border text-primary flex size-11 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm',
                className,
            )}
        >
            <BrandGlyph className={iconClassName} />
        </div>
    );
}
