import type { SVGAttributes } from 'react';
import { BrandGlyph } from '@/components/brand-mark';

/**
 * Application logo glyph.
 *
 * Renders the project's bus mark rather than the default Laravel glyph.
 * Kept as a thin wrapper so existing imports keep working; new code should
 * prefer `BrandMark` / `BrandGlyph` from `@/components/brand-mark`.
 */
export default function AppLogoIcon(props: SVGAttributes<SVGElement>) {
    return <BrandGlyph {...props} />;
}
