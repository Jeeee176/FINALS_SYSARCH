import { Link } from '@inertiajs/react';
import { Bus, MapPin, Radar } from 'lucide-react';
import BrandMark from '@/components/brand-mark';
import { home } from '@/routes';
import type { AuthLayoutProps } from '@/types';

const BRAND_SHORT = 'Bus Tracking & Fleet Management';
const BRAND_FULL = 'Bus Tracking and Fleet Management System';

const FEATURES = [
    {
        icon: Radar,
        label: 'Live GPS tracking',
    },
    {
        icon: Bus,
        label: 'Fleet & dispatch management',
    },
    {
        icon: MapPin,
        label: 'Route & ETA monitoring',
    },
];

export default function AuthSplitLayout({
    children,
    title,
    description,
}: AuthLayoutProps) {
    return (
        <div className="grid min-h-svh lg:grid-cols-2">
            {/* Branding panel (desktop) */}
            <div className="bg-primary text-primary-foreground relative hidden flex-col overflow-hidden p-10 lg:flex">
                <Bus
                    className="text-primary-foreground/10 pointer-events-none absolute -right-16 -bottom-16 size-80"
                    strokeWidth={1.2}
                />

                <Link
                    href={home()}
                    className="relative flex items-center gap-3"
                >
                    <BrandMark />
                    <span className="text-lg leading-tight font-semibold">
                        {BRAND_FULL}
                    </span>
                </Link>

                <div className="relative flex flex-1 flex-col justify-center">
                    <div className="max-w-md">
                        <h2 className="text-2xl leading-snug font-semibold">
                            Real-time bus tracking for terminals and fleets.
                        </h2>
                        <p className="text-primary-foreground/85 mt-3 text-sm leading-relaxed">
                            Terminal-based bus tracking and fleet management
                            system for monitoring vehicles, dispatches, routes,
                            and estimated arrival times in one place.
                        </p>
                        <ul className="mt-8 space-y-3">
                            {FEATURES.map(({ icon: Icon, label }) => (
                                <li
                                    key={label}
                                    className="flex items-center gap-3"
                                >
                                    <span className="bg-primary-foreground/15 flex size-9 items-center justify-center rounded-lg">
                                        <Icon
                                            className="size-5"
                                            strokeWidth={2}
                                        />
                                    </span>
                                    <span className="text-sm font-medium">
                                        {label}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            </div>

            {/* Form panel */}
            <div className="bg-background flex min-h-svh items-center justify-center p-6 sm:p-8">
                <div className="w-full max-w-md">
                    <Link
                        href={home()}
                        className="mb-8 flex items-center justify-center gap-3 lg:hidden"
                    >
                        <BrandMark iconClassName="size-6" />
                        <span className="text-foreground text-sm font-semibold">
                            {BRAND_SHORT}
                        </span>
                    </Link>

                    <div className="mb-6 text-center lg:text-left">
                        <h1 className="text-foreground text-xl font-semibold sm:text-2xl">
                            {title}
                        </h1>
                        <p className="text-muted-foreground mt-1.5 text-sm">
                            {description}
                        </p>
                    </div>

                    <div className="bg-card rounded-xl border p-6 shadow-sm sm:p-8">
                        {children}
                    </div>
                </div>
            </div>
        </div>
    );
}
