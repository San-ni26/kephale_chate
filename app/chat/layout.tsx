import { BottomNav } from "@/src/components/chat/BottomNav";
import { TopNav } from "@/src/components/chat/TopNav";
import { PWAInstaller } from "@/src/components/PWAInstaller";
import { NotificationListener } from "@/src/components/chat/NotificationListener";

export default function ChatLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="min-h-screen bg-background text-foreground pb-16">
            {children}
            <TopNav />
            <BottomNav />
            <PWAInstaller />
            <NotificationListener />
        </div>
    );
}
