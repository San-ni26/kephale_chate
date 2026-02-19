import { BottomNav } from "@/src/components/chat/BottomNav";
import { TopNav } from "@/src/components/chat/TopNav";
import { NotificationPermissionModal } from "@/src/components/chat/NotificationPermissionModal";
import { PWAInstaller } from "@/src/components/PWAInstaller";
import { PresenceHeartbeat } from "@/src/components/chat/PresenceHeartbeat";
import { CallStatusChecker } from "@/src/components/chat/CallStatusChecker";
import { ConversationSidebar } from "@/src/components/chat/ConversationSidebar";
import { FeedSearchProvider } from "@/src/contexts/FeedSearchContext";
import { FinancesProvider } from "@/src/contexts/FinancesContext";
import { DiscussionBlurProvider } from "@/src/contexts/DiscussionBlurContext";

export default function ChatLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <FinancesProvider>
            <FeedSearchProvider>
                <DiscussionBlurProvider>
                    <div className="h-screen flex flex-col bg-background text-foreground overflow-hidden">
                        {/* Top Bar : visible sur mobile et desktop */}
                        <TopNav />

                        <div className="flex-1 flex overflow-hidden min-h-0">
                            {/* Desktop Sidebar (Conversation List) */}
                            <aside className="hidden md:flex h-full flex-col shrink-0 min-h-0">
                                <ConversationSidebar />
                            </aside>

                            {/* Main Content Area */}
                            <main className="flex-1 flex flex-col relative min-h-0 min-w-0 w-full overflow-y-auto overflow-x-hidden">
                                {children}
                            </main>
                        </div>

                        {/* Mobile Bottom Nav */}
                        <div className="md:hidden">
                            <BottomNav />
                        </div>

                        <PWAInstaller />
                        <NotificationPermissionModal />
                        <PresenceHeartbeat />
                        <CallStatusChecker />
                    </div>
                </DiscussionBlurProvider>
            </FeedSearchProvider>
        </FinancesProvider>
    );
}
