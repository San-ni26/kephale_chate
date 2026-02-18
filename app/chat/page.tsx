'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Avatar, AvatarFallback, AvatarImage } from '@/src/components/ui/avatar';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import { User, MessageSquarePlus, Lock, Trash2, Crown } from 'lucide-react';
import useSWR from 'swr';
import { fetcher } from '@/src/lib/fetcher';
import { fetchWithAuth } from '@/src/lib/auth-client';
import { toast } from 'sonner';
import { useWebSocket } from '@/src/hooks/useWebSocket';
import { DeleteConversationDialog } from '@/src/components/chat/DeleteConversationDialog';

interface Conversation {
    id: string;
    name?: string;
    isDirect: boolean;
    updatedAt: string;
    unreadCount: number;
    department?: {
        name: string;
    };
    members: {
        user: {
            id: string;
            name: string;
            email: string;
            isOnline: boolean;
            isPro?: boolean;
        };
    }[];
    messages: {
        content: string;
        sender: {
            id: string;
            name: string;
        };
        createdAt: string;
    }[];
}

export default function ChatListPage() {
    const { data: profileData, error: profileError } = useSWR('/api/users/profile', fetcher);
    const { data: conversationsData, error: conversationsError, mutate: mutateConversations } = useSWR('/api/conversations', fetcher, {
        refreshInterval: 30000,
    });

    const { userChannel, isConnected } = useWebSocket();
    const [conversationToDelete, setConversationToDelete] = useState<string | null>(null);
    const [deleteLoading, setDeleteLoading] = useState(false);

    function openDeleteDialog(e: React.MouseEvent, conversationId: string) {
        e.preventDefault();
        e.stopPropagation();
        setConversationToDelete(conversationId);
    }

    async function confirmDeleteConversation() {
        if (!conversationToDelete) return;
        setDeleteLoading(true);
        try {
            const res = await fetchWithAuth(`/api/conversations/${conversationToDelete}`, { method: 'DELETE' });
            const data = await res.json().catch(() => ({}));
            if (res.ok) {
                if (data.requestSent) {
                    toast.success('Demande de suppression envoyée. L\'autre utilisateur doit accepter.');
                } else {
                    toast.success('Discussion supprimée');
                }
                setConversationToDelete(null);
                mutateConversations();
            } else {
                toast.error(data.error || 'Impossible de supprimer');
            }
        } catch {
            toast.error('Erreur réseau');
        } finally {
            setDeleteLoading(false);
        }
    }

    // Refresh when new notification arrives
    useEffect(() => {
        if (!userChannel || !isConnected) return;

        const handleNewNotification = () => {
            mutateConversations();
        };

        userChannel.bind('notification:new', handleNewNotification);
        return () => {
            userChannel.unbind('notification:new', handleNewNotification);
        };
    }, [userChannel, isConnected, mutateConversations]);

    const conversations: Conversation[] = conversationsData?.conversations || [];
    const currentUserId = profileData?.profile?.id;
    const isLoading = (!profileData && !profileError) || (!conversationsData && !conversationsError);

    if (isLoading) {
        return (
            <div className="flex justify-center items-center h-screen bg-background pt-16">
                <div className="flex flex-col space-y-3 w-full max-w-2xl px-4">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="flex items-center space-x-4">
                            <div className="h-12 w-12 rounded-full bg-muted animate-pulse" />
                            <div className="space-y-2 flex-1">
                                <div className="h-4 w-[200px] bg-muted animate-pulse rounded" />
                                <div className="h-4 w-[150px] bg-muted animate-pulse rounded" />
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    const getConversationName = (chat: Conversation) => {
        if (!chat.isDirect && chat.department) {
            return `${chat.name}`;
        }
        if (chat.isDirect) {
            const otherMember = chat.members.find(m => m.user.id !== currentUserId);
            return otherMember ? otherMember.user.name : 'Unknown';
        }
        return chat.name || 'Discussion';
    };

    const getOtherMember = (chat: Conversation) => {
        return chat.members.find(m => m.user.id !== currentUserId)?.user;
    };

    const directConversations = conversations.filter(c => c.isDirect);

    return (
        <div className="h-full w-full flex flex-col">
            {/* Mobile View: Conversation List (WhatsApp style) */}
            <div className="md:hidden p-4 pt-4 pb-20 max-w-2xl  h-full flex flex-col overflow-y-auto">
                <h2 className="text-2xl font-bold mb-4 px-1 text-foreground">Discussions</h2>

                {directConversations.length === 0 ? (
                    <div className="flex-1 flex flex-col justify-center items-center text-center text-muted-foreground">
                        <div className="bg-muted/50 p-6 rounded-full mb-4">
                            <User className="w-10 h-10 opacity-50" />
                        </div>
                        <p className="font-medium">Aucune discussion</p>
                        <p className="text-sm mt-1">Commencez une nouvelle conversation.</p>
                    </div>
                ) : (
                    <div className="flex flex-col">
                        {directConversations.map((chat) => {
                            const chatName = getConversationName(chat);
                            const lastMessage = chat.messages[0];
                            const unread = chat.unreadCount || 0;
                            const otherMember = getOtherMember(chat);

                            return (
                                <Link href={`/chat/discussion/${chat.id}`} key={chat.id}>
                                    <div className="flex items-center py-3 px-2 border-b border-border/50 hover:bg-muted/30 transition-colors cursor-pointer group">
                                        {/* Avatar with online indicator */}
                                        <div className="relative flex-shrink-0">
                                            <Avatar className="h-12 w-12 border border-border/50">
                                                <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${chatName}`} />
                                                <AvatarFallback className="bg-muted">
                                                    <User className="w-6 h-6 text-muted-foreground" />
                                                </AvatarFallback>
                                            </Avatar>
                                            {otherMember?.isOnline && (
                                                <span className="absolute bottom-0 right-0 w-3 h-3 bg-success border-2 border-background rounded-full" />
                                            )}
                                        </div>

                                        {/* Content */}
                                        <div className="ml-3 flex-1 min-w-0">
                                            <div className="flex justify-between items-baseline mb-0.5">
                                                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                                    <h3 className={`truncate text-[15px] ${unread > 0 ? 'font-bold text-foreground' : 'font-semibold text-foreground'}`}>
                                                        {chatName}
                                                    </h3>
                                                    {otherMember?.isPro && (
                                                        <span className="shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/20 text-amber-600 dark:text-amber-400">
                                                            <Crown className="w-3 h-3" /> Pro
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-1 shrink-0 ml-2">
                                                    <span className={`text-xs ${unread > 0 ? 'text-primary font-semibold' : 'text-muted-foreground'}`}>
                                                        {lastMessage ? formatDistanceToNow(new Date(lastMessage.createdAt), { addSuffix: false, locale: fr }) : ''}
                                                    </span>
                                                    {!(
                                                        otherMember?.isPro &&
                                                        !chat.members.find(m => m.user.id === currentUserId)?.user?.isPro
                                                    ) && (
                                                        <button
                                                            type="button"
                                                            onClick={(e) => openDeleteDialog(e, chat.id)}
                                                            className="p-1.5 rounded-full hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors"
                                                            title="Supprimer la discussion"
                                                            aria-label="Supprimer la discussion"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <p className={`text-sm truncate pr-2 ${unread > 0 ? 'text-foreground/90 font-medium' : 'text-muted-foreground'}`}>
                                                    {lastMessage ? (
                                                        <span>
                                                            {lastMessage.sender.id === currentUserId && "Vous: "}
                                                            Message chiffre
                                                        </span>
                                                    ) : (
                                                        <span className="italic opacity-50">Aucun message</span>
                                                    )}
                                                </p>
                                                {/* Unread badge */}
                                                {unread > 0 && (
                                                    <span className="min-w-[22px] h-[22px] bg-primary text-primary-foreground text-xs font-bold rounded-full flex items-center justify-center px-1.5 shrink-0">
                                                        {unread > 99 ? '99+' : unread}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </Link>
                            );
                        })}
                    </div>
                )}
            </div>

            <DeleteConversationDialog
                open={conversationToDelete !== null}
                onOpenChange={(open) => !open && setConversationToDelete(null)}
                onConfirm={confirmDeleteConversation}
                loading={deleteLoading}
            />

            {/* Desktop View: Placeholder */}
            <div className="hidden md:flex flex-1 flex-col items-center justify-center bg-muted/20 text-center p-8 h-full">
                <div className="bg-background p-8 rounded-2xl shadow-sm border border-border/50 max-w-md">
                    <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
                        <MessageSquarePlus className="w-10 h-10 text-primary" />
                    </div>
                    <h2 className="text-2xl font-bold text-foreground mb-3">Kephale Chat Web</h2>
                    <p className="text-muted-foreground mb-8">
                        Envoyez et recevez des messages sans garder votre telephone connecte.
                        Utilisez Kephale sur plusieurs appareils en meme temps.
                    </p>
                    <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground/70">
                        <Lock className="w-3 h-3" />
                        <span>Vos messages personnels sont chiffres de bout en bout</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
