'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Avatar, AvatarFallback, AvatarImage } from '@/src/components/ui/avatar';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Loader2, User } from 'lucide-react';
import { toast } from 'sonner';
import { fetchWithAuth } from '@/src/lib/auth-client';

interface Conversation {
    id: string;
    name?: string; // Derived name
    isDirect: boolean;
    updatedAt: string;
    department?: {
        name: string;
    };
    members: {
        user: {
            id: string;
            name: string;
            email: string;
            isOnline: boolean;
        };
    }[];
    messages: {
        content: string; // This is encrypted, we might need to show "Message chiffré" or decrypt it if possible (hard for list view without loading all keys)
        sender: {
            id: string;
            name: string;
        };
        createdAt: string;
    }[];
    _count?: {
        messages: number;
    };
}

export default function ChatListPage() {
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);

    useEffect(() => {
        const init = async () => {
            try {
                // Get current user ID from local storage or profile fetch
                const profileRes = await fetchWithAuth('/api/users/profile');
                if (profileRes.ok) {
                    const data = await profileRes.json();
                    setCurrentUserId(data.profile.id);
                }

                const response = await fetchWithAuth('/api/conversations');
                if (!response.ok) throw new Error('Impossible de charger les discussions');
                const data = await response.json();
                setConversations(data.conversations);
            } catch (error) {
                console.error(error);
                toast.error('Erreur de chargement');
            } finally {
                setLoading(false);
            }
        };
        init();
    }, []);

    const getConversationName = (chat: Conversation) => {
        if (!chat.isDirect && chat.department) {
            return `${chat.name}`; // Group or Dept name
        }
        if (chat.isDirect) {
            // Find other user
            const otherMember = chat.members.find(m => m.user.id !== currentUserId);
            return otherMember ? otherMember.user.name : 'Unknown';
        }
        return chat.name || 'Discussion';
    };

    const getAvatarSeed = (chat: Conversation) => {
        return getConversationName(chat);
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="p-4 pt-16 max-w-2xl mx-auto h-full flex flex-col">
            <h2 className="text-2xl font-bold mb-6 px-1 text-foreground">Discussions</h2>

            {conversations.length === 0 ? (
                <div className="flex-1 flex flex-col justify-center items-center text-center text-muted-foreground">
                    <div className="bg-muted/50 p-6 rounded-full mb-4">
                        <User className="w-10 h-10 opacity-50" />
                    </div>
                    <p className="font-medium">Aucune discussion</p>
                    <p className="text-sm mt-1">Commencez une nouvelle conversation.</p>
                </div>
            ) : (
                <div className="flex flex-col gap-3 pb-20">
                    {conversations.map((chat) => {
                        const chatName = getConversationName(chat);
                        const lastMessage = chat.messages[0];

                        return (
                            <Link href={`/chat/discussion/${chat.id}`} key={chat.id}>
                                <div className="flex items-center p-4 rounded-xl border border-border bg-card shadow-sm hover:shadow-md hover:border-primary/20 transition-all duration-200 cursor-pointer">
                                    <Avatar className="h-12 w-12 border border-border/50 shadow-sm shrink-0">
                                        <AvatarImage src="https://github.com/shadcn.png" />
                                        <AvatarFallback className="bg-muted">
                                            <User className="w-6 h-6 text-muted-foreground" />
                                        </AvatarFallback>
                                    </Avatar>

                                    <div className="ml-4 flex-1 min-w-0">
                                        <div className="flex justify-between items-center mb-1">
                                            <h3 className="font-semibold text-foreground truncate text-base">{chatName}</h3>
                                            <span className="text-xs font-medium text-muted-foreground shrink-0 ml-2">
                                                {lastMessage ? formatDistanceToNow(new Date(lastMessage.createdAt), { addSuffix: true, locale: fr }) : ''}
                                            </span>
                                        </div>
                                        <p className="text-sm text-muted-foreground truncate pr-2">
                                            {lastMessage ? (
                                                <span className="text-foreground/80">
                                                    {lastMessage.sender.id === currentUserId && "Vous: "}
                                                    Message chiffré
                                                </span>
                                            ) : (
                                                <span className="italic opacity-50">Aucun message</span>
                                            )}
                                        </p>
                                    </div>
                                </div>
                            </Link>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
