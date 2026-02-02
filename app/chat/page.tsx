'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Avatar, AvatarFallback, AvatarImage } from '@/src/components/ui/avatar';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Loader2 } from 'lucide-react';
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
                <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            </div>
        );
    }

    return (
        <div className="p-4 space-y-2">
            <h2 className="text-xl font-bold mb-4 px-2 text-slate-100">Discussions</h2>

            {conversations.length === 0 ? (
                <div className="text-center text-slate-500 py-10">
                    <p>Aucune discussion.</p>
                    <p className="text-sm">Cliquez sur + en haut pour commencer.</p>
                </div>
            ) : (
                <div className="space-y-1">
                    {conversations.map((chat) => {
                        const chatName = getConversationName(chat);
                        const lastMessage = chat.messages[0];

                        return (
                            <Link href={`/chat/discussion/${chat.id}`} key={chat.id}>
                                <div className="flex items-center p-3 rounded-xl hover:bg-slate-900 active:bg-slate-800 transition cursor-pointer">
                                    <Avatar className="h-12 w-12 border border-slate-700">
                                        <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${chatName}`} />
                                        <AvatarFallback>{chatName[0]}</AvatarFallback>
                                    </Avatar>

                                    <div className="ml-4 flex-1 min-w-0">
                                        <div className="flex justify-between items-baseline">
                                            <h3 className="font-semibold text-slate-100 truncate">{chatName}</h3>
                                            <span className="text-xs text-slate-500">
                                                {lastMessage ? formatDistanceToNow(new Date(lastMessage.createdAt), { addSuffix: true, locale: fr }) : ''}
                                            </span>
                                        </div>
                                        <p className="text-sm text-slate-400 truncate pr-4">
                                            {lastMessage ? (
                                                // In a real list view, decrypting every last message is expensive.
                                                // Usually we show "Message chiffré" or we cache decrypted previews.
                                                // For now:
                                                "Message chiffré"
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
