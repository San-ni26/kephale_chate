'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Avatar, AvatarFallback, AvatarImage } from '@/src/components/ui/avatar';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import { User, Search, MessageSquarePlus, Building2, Users, Bell, Settings, MessageSquare, ChevronLeft, ChevronRight, Wallet } from 'lucide-react';
import useSWR from 'swr';
import { fetcher } from '@/src/lib/fetcher';
import { Input } from '@/src/components/ui/input';
import { Button } from '@/src/components/ui/button';
import { useWebSocket } from '@/src/hooks/useWebSocket';

interface Conversation {
    id: string;
    name?: string;
    isDirect: boolean;
    updatedAt: string;
    unreadCount: number;
    members: {
        user: {
            id: string;
            name: string;
            email: string;
            isOnline?: boolean;
        };
    }[];
    messages: {
        content: string;
        sender: {
            id: string;
            name?: string;
        };
        createdAt: string;
    }[];
}

export function ConversationSidebar() {
    const pathname = usePathname();
    const { data: profileData } = useSWR('/api/users/profile', fetcher);
    const { data: conversationsData, mutate: mutateConversations } = useSWR('/api/conversations', fetcher, {
        refreshInterval: 30000, // Refresh every 30s as fallback
    });
    const [searchQuery, setSearchQuery] = useState('');
    const [isCollapsed, setIsCollapsed] = useState(false);

    const conversations: Conversation[] = conversationsData?.conversations || [];
    const currentUserId = profileData?.profile?.id;

    // Listen for real-time new messages to refresh unread counts
    const { userChannel, isConnected } = useWebSocket();

    useEffect(() => {
        if (!userChannel || !isConnected) return;

        const handleNewNotification = () => {
            // Refresh conversation list when a notification arrives (new message in another conversation)
            mutateConversations();
        };

        userChannel.bind('notification:new', handleNewNotification);

        return () => {
            userChannel.unbind('notification:new', handleNewNotification);
        };
    }, [userChannel, isConnected, mutateConversations]);

    // Also refresh when navigating to a conversation (mark-as-read will update counts)
    useEffect(() => {
        mutateConversations();
    }, [pathname, mutateConversations]);

    const filteredConversations = conversations
        .filter(c => c.isDirect)
        .filter(c => {
            const name = getConversationName(c).toLowerCase();
            return name.includes(searchQuery.toLowerCase());
        });

    // Total unread across all conversations
    const totalUnread = conversations
        .filter(c => c.isDirect)
        .reduce((sum, c) => sum + (c.unreadCount || 0), 0);

    function getConversationName(chat: Conversation) {
        if (!chat.isDirect) return chat.name || 'Discussion';
        const otherMember = chat.members.find(m => m.user.id !== currentUserId);
        return otherMember ? otherMember.user.name : 'Utilisateur inconnu';
    }

    function getOtherMember(chat: Conversation) {
        return chat.members.find(m => m.user.id !== currentUserId)?.user;
    }

    return (
        <div className={`flex flex-col h-full border-r border-border bg-card w-full transition-all duration-300 ease-in-out ${isCollapsed ? 'md:w-[80px]' : 'md:w-[350px] lg:w-[400px]'
            }`}>
            {/* Header */}
            <div className={`p-4 border-b border-border bg-background/50 backdrop-blur sticky top-0 z-10 flex flex-col gap-4 ${isCollapsed ? 'items-center' : ''
                }`}>
                <div className={`flex items-center ${isCollapsed ? 'justify-center w-full' : 'justify-between w-full'}`}>
                    {!isCollapsed && <h2 className="text-xl font-bold">Discussions</h2>}

                    <div className="flex items-center gap-1">
                        {!isCollapsed && (
                            <Link href="/chat/contacts">
                                <Button size="icon" variant="ghost" title="Nouvelle discussion">
                                    <MessageSquarePlus className="w-5 h-5" />
                                </Button>
                            </Link>
                        )}
                        <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => setIsCollapsed(!isCollapsed)}
                            className="hidden md:flex text-muted-foreground hover:text-foreground"
                            title={isCollapsed ? "Agrandir" : "Réduire"}
                        >
                            {isCollapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
                        </Button>
                    </div>
                </div>

                {!isCollapsed && (
                    <div className="relative w-full">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                            placeholder="Rechercher..."
                            className="pl-9 bg-muted/50 border-none w-full"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                )}
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent">
                {filteredConversations.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-40 text-muted-foreground text-sm">
                        {!isCollapsed && <p>Aucune conversation</p>}
                        {isCollapsed && <MessageSquare className="w-6 h-6 opacity-20" />}
                    </div>
                ) : (
                    <div className="space-y-1">
                        {filteredConversations.map((chat) => {
                            const chatName = getConversationName(chat);
                            const lastMessage = chat.messages[0];
                            const isActive = pathname === `/chat/discussion/${chat.id}`;
                            const unread = chat.unreadCount || 0;
                            const otherMember = getOtherMember(chat);

                            return (
                                <Link href={`/chat/discussion/${chat.id}`} key={chat.id}>
                                    <div className={`flex items-center p-3 rounded-lg transition-colors cursor-pointer group ${isActive
                                        ? 'bg-primary/10 hover:bg-primary/15'
                                        : 'hover:bg-muted/50'
                                        } ${isCollapsed ? 'justify-center' : ''}`}>

                                        <div className="relative flex-shrink-0">
                                            <Avatar className={`border border-border ${isCollapsed ? 'h-10 w-10' : 'h-12 w-12'}`}>
                                                <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${chatName}`} />
                                                <AvatarFallback>
                                                    <User className="w-5 h-5" />
                                                </AvatarFallback>
                                            </Avatar>
                                            {/* Online indicator */}
                                            {otherMember?.isOnline && (
                                                <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-card rounded-full" />
                                            )}
                                            {/* Collapsed mode unread badge */}
                                            {isCollapsed && unread > 0 && (
                                                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-primary text-primary-foreground text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                                                    {unread > 99 ? '99+' : unread}
                                                </span>
                                            )}
                                        </div>

                                        {!isCollapsed && (
                                            <div className="ml-3 flex-1 min-w-0 transition-opacity duration-200">
                                                <div className="flex justify-between items-baseline mb-1">
                                                    <h3 className={`text-sm truncate ${unread > 0 ? 'font-bold text-foreground' : 'font-semibold text-foreground'}`}>
                                                        {chatName}
                                                    </h3>
                                                    <div className="flex items-center gap-2 shrink-0 ml-2">
                                                        {lastMessage && (
                                                            <span className={`text-[10px] ${unread > 0 ? 'text-primary font-semibold' : 'text-muted-foreground'}`}>
                                                                {formatDistanceToNow(new Date(lastMessage.createdAt), { addSuffix: false, locale: fr })}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="flex items-center justify-between">
                                                    <p className={`text-xs truncate pr-2 ${unread > 0 ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
                                                        {lastMessage ? (
                                                            <span>
                                                                {lastMessage.sender.id === currentUserId && "Vous: "}
                                                                {lastMessage.content ? "Message chiffre" : "Fichier"}
                                                            </span>
                                                        ) : (
                                                            <span className="italic opacity-50">Aucun message</span>
                                                        )}
                                                    </p>
                                                    {/* Unread badge */}
                                                    {unread > 0 && (
                                                        <span className="min-w-[20px] h-[20px] bg-primary text-primary-foreground text-[11px] font-bold rounded-full flex items-center justify-center px-1.5 shrink-0">
                                                            {unread > 99 ? '99+' : unread}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </Link>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Desktop Navigation */}
            <div className="p-2 border-t border-border bg-muted/20">
                <div className={`flex items-center ${isCollapsed ? 'flex-col gap-4 py-2' : 'justify-around'}`}>
                    <Link href="/chat/organizations" className={`p-2 rounded-lg transition-colors ${pathname?.startsWith('/chat/organizations') ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:bg-muted'}`} title="Organisations">
                        <Building2 className="w-5 h-5" />
                    </Link>
                    <Link href="/chat/groups" className={`p-2 rounded-lg transition-colors ${pathname?.startsWith('/chat/groups') ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:bg-muted'}`} title="Groupes">
                        <Users className="w-5 h-5" />
                    </Link>
                    <Link href="/chat" className={`relative p-2 rounded-lg transition-colors ${pathname === '/chat' || pathname?.startsWith('/chat/discussion') ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:bg-muted'}`} title="Chats">
                        <MessageSquare className="w-5 h-5" />
                        {totalUnread > 0 && (
                            <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] bg-primary text-primary-foreground text-[9px] font-bold rounded-full flex items-center justify-center px-1">
                                {totalUnread > 99 ? '99+' : totalUnread}
                            </span>
                        )}
                    </Link>
                    <Link href="/chat/notifications" className={`p-2 rounded-lg transition-colors ${pathname?.startsWith('/chat/notifications') ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:bg-muted'}`} title="Actualites">
                        <Bell className="w-5 h-5" />
                    </Link>
                    <Link href="/chat/finances" className={`p-2 rounded-lg transition-colors ${pathname?.startsWith('/chat/finances') ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:bg-muted'}`} title="Finances">
                        <Wallet className="w-5 h-5" />
                    </Link>
                    <Link href="/chat/settings" className={`p-2 rounded-lg transition-colors ${pathname?.startsWith('/chat/settings') ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:bg-muted'}`} title="Reglages">
                        <Settings className="w-5 h-5" />
                    </Link>
                </div>
            </div>
        </div>
    );
}
