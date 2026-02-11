import { BottomNav } from "@/src/components/chat/BottomNav";
import { TopNav } from "@/src/components/chat/TopNav";
import { PWAInstaller } from "@/src/components/PWAInstaller";
import { NotificationListener } from "@/src/components/chat/NotificationListener";
import { PresenceHeartbeat } from "@/src/components/chat/PresenceHeartbeat";
import { ConversationSidebar } from "@/src/components/chat/ConversationSidebar";
import { FeedSearchProvider } from "@/src/contexts/FeedSearchContext";
import { FinancesProvider } from "@/src/contexts/FinancesContext";

export default function ChatLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <FinancesProvider>
            <FeedSearchProvider>
                <div className="h-screen flex flex-col bg-background text-foreground overflow-hidden">
                    {/* Top Bar : visible sur mobile et desktop */}
                    <TopNav />

                    <div className="flex-1 flex overflow-hidden">
                        {/* Desktop Sidebar (Conversation List) */}
                        <div className="hidden md:flex h-full flex-col shrink-0">
                            <ConversationSidebar />
                        </div>

                        {/* Main Content Area */}
                        <main className="flex-1 flex flex-col relative h-full w-full overflow-y-auto overflow-x-hidden">
                            {children}
                        </main>
                    </div>

                    {/* Mobile Bottom Nav */}
                    <div className="md:hidden">
                        <BottomNav />
                    </div>

                    <PWAInstaller />
                    <NotificationListener />
                    <PresenceHeartbeat />
                </div>
            </FeedSearchProvider>
        </FinancesProvider>
    );
}
