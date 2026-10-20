import { Link } from '@inertiajs/react';
import {
    BusFront,
    ClipboardList,
    Headset,
    LayoutGrid,
    MapPin,
    Route as RouteIcon,
    Users,
} from 'lucide-react';
import BrandMark, { BRAND_SHORT } from '@/components/brand-mark';
import { NavMain } from '@/components/nav-main';
import { NavUser } from '@/components/nav-user';
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarGroupLabel,
    SidebarHeader,
    SidebarMenuButton,
    SidebarSeparator,
} from '@/components/ui/sidebar';
import type { NavItem } from '@/types';

const mainNavItems: NavItem[] = [
    {
        title: 'Dashboard',
        href: '/operator/dashboard',
        icon: LayoutGrid,
    },
    {
        title: 'Bus Operations',
        href: '/operator/buses',
        icon: BusFront,
    },
    {
        title: 'Driver Operations',
        href: '/operator/drivers',
        icon: Users,
    },
    {
        title: 'Route Operations',
        href: '/operator/routes',
        icon: RouteIcon,
    },
    {
        title: 'Dispatch Queue',
        href: '/operator/departure-queue',
        icon: ClipboardList,
    },
    {
        title: 'Live Monitoring',
        href: '/operator/tracking',
        icon: MapPin,
    },
];

export function OperatorSidebar() {
    return (
        <Sidebar collapsible="icon" variant="inset">
            <SidebarHeader className="border-sidebar-primary/40 border-b">
                <SidebarMenuButton
                    size="lg"
                    asChild
                    className="hover:bg-sidebar-primary/50 data-[state=open]:hover:bg-sidebar-primary/50 h-auto gap-3 px-2.5 py-3 text-white group-data-[collapsible=icon]:size-10! group-data-[collapsible=icon]:p-0! hover:text-white"
                >
                    <Link
                        href="/operator/dashboard"
                        prefetch
                        className="flex min-w-0 items-center gap-3"
                    >
                        <BrandMark
                            className="size-9 rounded-lg"
                            iconClassName="size-5"
                        />

                        <div className="grid min-w-0 flex-1 text-left group-data-[collapsible=icon]:hidden">
                            <span className="truncate text-sm leading-tight font-semibold text-white">
                                {BRAND_SHORT}
                            </span>
                            <span className="mt-1 flex items-center gap-1 text-[11px] leading-tight font-medium tracking-wide text-white uppercase">
                                <Headset className="size-3 shrink-0" />
                                Operator
                            </span>
                        </div>
                    </Link>
                </SidebarMenuButton>
            </SidebarHeader>

            <SidebarContent className="py-3">
                {/* 11px label, so AA 4.5:1 applies: solid white, not a tint. */}
                <SidebarGroupLabel className="px-4 pb-1.5 text-[11px] font-semibold tracking-wide text-white uppercase">
                    Operations
                </SidebarGroupLabel>
                <NavMain items={mainNavItems} variant="branded" />
            </SidebarContent>

            <SidebarFooter className="p-2">
                <SidebarSeparator className="bg-sidebar-primary/40 mx-2" />
                <NavUser />
            </SidebarFooter>
        </Sidebar>
    );
}
