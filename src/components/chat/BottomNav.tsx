"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageSquare, Building2, Users, Bell, Settings } from "lucide-react";
import { cn } from "@/src/lib/utils";

export function BottomNav() {
    const pathname = usePathname();

    const navItems = [
        { label: "Orgs", icon: Building2, href: "/chat/organizations" },
        { label: "Groupes", icon: Users, href: "/chat/groups" },
        { label: "Chats", icon: MessageSquare, href: "/chat" },
        { label: "Notifs", icon: Bell, href: "/chat/notifications" },
        { label: "Réglages", icon: Settings, href: "/chat/settings" },
    ];

    return (
        <nav className="fixed bottom-0 w-full left-0 bg-slate-900 border-t border-slate-800 z-50 md:hidden">
            <div className="flex justify-around items-center h-16">
                {navItems.map((item) => {
                    const isActive = pathname === item.href || (item.href !== "/chat" && pathname.startsWith(item.href));

                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={cn(
                                "flex flex-col items-center justify-center w-full h-full text-[10px] space-y-1 transition-colors",
                                isActive ? "text-blue-500" : "text-slate-400 hover:text-slate-200"
                            )}
                        >
                            <item.icon size={20} />
                            <span>{item.label}</span>
                        </Link>
                    );
                })}
            </div>
        </nav>
    );
}
