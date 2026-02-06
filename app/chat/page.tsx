'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Avatar, AvatarFallback, AvatarImage } from '@/src/components/ui/avatar';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Loader2, User } from 'lucide-react';
import { toast } from 'sonner';
import useSWR from 'swr';
import { fetcher } from '@/src/lib/fetcher';

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
    const { data: profileData, error: profileError } = useSWR('/api/users/profile', fetcher);
    const { data: conversationsData, error: conversationsError } = useSWR('/api/conversations', fetcher);

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

    const getConversationsList = () => {
        return conversations.filter(c => c.isDirect).map((chat) => {
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
        });
    }

    return (
        <div className="p-4 pt-16 max-w-2xl mx-auto h-full flex flex-col">
            <h2 className="text-2xl font-bold mb-6 px-1 text-foreground">Discussions</h2>

            {conversations.filter(c => c.isDirect).length === 0 ? (
                <div className="flex-1 flex flex-col justify-center items-center text-center text-muted-foreground">
                    <div className="bg-muted/50 p-6 rounded-full mb-4">
                        <User className="w-10 h-10 opacity-50" />
                    </div>
                    <p className="font-medium">Aucune discussion</p>
                    <p className="text-sm mt-1">Commencez une nouvelle conversation.</p>
                </div>
            ) : (
                <div className="flex flex-col gap-3 pb-20">
                    {getConversationsList()}
                </div>
            )}
        </div>
    );
}
