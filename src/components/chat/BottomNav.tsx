"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageSquare, Building2, Users, Bell, Settings, Wallet } from "lucide-react";
import { cn } from "@/src/lib/utils";
import useSWR from "swr";
import { fetcher } from "@/src/lib/fetcher";

interface ConversationData {
    id: string;
    isDirect: boolean;
    unreadCount: number;
}

export function BottomNav() {
    const pathname = usePathname();
    const { data: conversationsData } = useSWR('/api/conversations', fetcher, {
        refreshInterval: 30000,
    });

    const conversations: ConversationData[] = conversationsData?.conversations || [];
    const totalUnread = conversations
        .filter(c => c.isDirect)
        .reduce((sum, c) => sum + (c.unreadCount || 0), 0);

    const navItems = [
        { label: "Organisations", icon: Building2, href: "/chat/organizations", badge: 0 },
        { label: "Groupes", icon: Users, href: "/chat/groups", badge: 0 },
        { label: "Chats", icon: MessageSquare, href: "/chat", badge: totalUnread },
        { label: "Finances", icon: Wallet, href: "/chat/finances", badge: 0 },
        { label: "Actu", icon: Bell, href: "/chat/notifications", badge: 0 },
        { label: "Reglages", icon: Settings, href: "/chat/settings", badge: 0 },
    ];

    return (
        <nav className="fixed bottom-0 w-full left-0 bg-background border-t border-border z-50 md:hidden">
            <div className="flex justify-around items-center h-16">
                {navItems.map((item) => {
                    const isActive = pathname === item.href || (item.href !== "/chat" && pathname?.startsWith(item.href));

                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={cn(
                                "relative flex flex-col items-center justify-center w-full h-full text-[10px] space-y-1 transition-colors",
                                isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            <div className="relative">
                                <item.icon size={20} />
                                {item.badge > 0 && (
                                    <span className="absolute -top-2 -right-3 min-w-[16px] h-[16px] bg-primary text-primary-foreground text-[9px] font-bold rounded-full flex items-center justify-center px-1">
                                        {item.badge > 99 ? '99+' : item.badge}
                                    </span>
                                )}
                            </div>
                            <span>{item.label}</span>
                        </Link>
                    );
                })}
            </div>
        </nav>
    );
}
