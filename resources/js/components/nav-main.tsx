import { Link } from '@inertiajs/react';
import type { NavItem } from '@/types';
import {
    SidebarGroup,
    SidebarGroupLabel,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
} from '@/components/ui/sidebar';
import { useCurrentUrl } from '@/hooks/use-current-url';

export function NavMain({
    items,
    className,
    variant = 'default',
    label,
}: {
    items: NavItem[];
    className?: string;
    /**
     * `default` keeps the stock shadcn sidebar item styling.
     * `branded` applies the shared red-shell treatment used by the
     * Admin and Operator sidebars. Driver keeps `default`.
     */
    variant?: 'default' | 'branded';
    label?: string;
}) {
    const { isCurrentOrParentUrl } = useCurrentUrl();
    const isBranded = variant === 'branded';

    return (
        <SidebarGroup className={className ?? 'px-2 py-0'}>
            {!isBranded && (
                <SidebarGroupLabel>{label ?? 'Navigation'}</SidebarGroupLabel>
            )}

            <SidebarMenu className={isBranded ? 'gap-1' : undefined}>
                {items.map((item) => {
                    const active = isCurrentOrParentUrl(item.href);

                    return (
                        <SidebarMenuItem key={item.title}>
                            <SidebarMenuButton
                                asChild
                                isActive={active}
                                tooltip={{ children: item.title }}
                                aria-current={
                                    isBranded && active ? 'page' : undefined
                                }
                                className={
                                    isBranded
                                        ? 'hover:bg-sidebar-primary/50 data-[active=true]:bg-sidebar-primary-foreground data-[active=true]:text-primary-strong h-10 gap-3 px-3 text-white transition-colors duration-150 hover:text-white data-[active=true]:font-semibold data-[active=true]:shadow-sm [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-current'
                                        : undefined
                                }
                            >
                                <Link href={item.href} prefetch>
                                    {item.icon && <item.icon />}

                                    <span>{item.title}</span>
                                </Link>
                            </SidebarMenuButton>
                        </SidebarMenuItem>
                    );
                })}
            </SidebarMenu>
        </SidebarGroup>
    );
}
