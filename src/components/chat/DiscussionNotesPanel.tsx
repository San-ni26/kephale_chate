'use client';

import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/src/components/ui/avatar';
import { UserAvatar } from '@/src/components/ui/UserAvatar';
import { Shield, User as UserIcon, Clock, Loader2 } from 'lucide-react';
import { getUser } from '@/src/lib/auth-client';
import useSWR from 'swr';
import { fetchWithAuth } from '@/src/lib/auth-client';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/src/components/ui/dialog';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';

function stripHtml(html: string): string {
    if (!html) return '';
    return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
}

type SharedNote = {
    id: string;
    title: string;
    content: string;
    updatedAt: string;
    creator: { id: string; name: string | null };
    canEdit: boolean;
    sharedWith: { id: string; name: string | null };
    group?: { id: string; name: string | null };
};

const fetcher = (url: string) => fetchWithAuth(url).then((r) => (r.ok ? r.json() : { notes: [] }));

export function DiscussionNotesPanel({ conversation }: { conversation: any }) {
    const currentUser = useMemo(() => getUser(), []);
    const [viewNote, setViewNote] = useState<SharedNote | null>(null);

    const otherMember = useMemo(() => {
        if (!conversation?.members || !conversation.isDirect) return null;
        return conversation.members.find((m: any) => m.user.id !== currentUser?.id)?.user;
    }, [conversation, currentUser]);

    const { data, isLoading } = useSWR<{ notes: SharedNote[] }>(
        conversation?.id && conversation?.isDirect ? `/api/conversations/${conversation.id}/shared-notes` : null,
        fetcher
    );
    const sharedNotes = data?.notes ?? [];

    return (
        <div className="flex-1 w-full bg-background overflow-y-auto p-4 pt-20 md:pt-6">
            <div className="max-w-xl mx-auto space-y-6">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-xl">
                            {conversation?.isDirect ? 'Informations Contact' : 'Détails du Groupe'}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        {conversation?.isDirect && otherMember ? (
                            <div className="flex flex-col items-center p-4 border rounded-xl bg-muted/30">
                                <UserAvatar 
                                    avatarUrl={otherMember.avatarUrl} 
                                    name={otherMember.name}
                                    size="xl"
                                    className="mb-4"
                                />
                                <h3 className="text-xl font-semibold">{otherMember.name}</h3>

                                <div className="grid grid-cols-2 gap-4 w-full mt-4">
                                    <div className="p-3 bg-background rounded-lg border text-center">
                                        <p className="text-xs text-muted-foreground mb-1">Statut</p>
                                        <p className="font-medium text-sm">
                                            {otherMember.isOnline ? (
                                                <span className="text-green-500">En ligne</span>
                                            ) : (
                                                <span className="text-muted-foreground">Hors ligne</span>
                                            )}
                                        </p>
                                    </div>
                                    <div className="p-3 bg-background rounded-lg border text-center">
                                        <p className="text-xs text-muted-foreground mb-1">Chiffrement</p>
                                        <p className="font-medium text-sm flex items-center justify-center gap-1">
                                            <Shield className="w-3 h-3 text-primary" />
                                            Actif
                                        </p>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="flex items-center gap-4 p-4 border rounded-xl bg-muted/30">
                                    <UserAvatar 
                                        avatarUrl={conversation?.avatarUrl} 
                                        name={conversation?.name}
                                        size="lg"
                                    />
                                    <div>
                                        <h3 className="text-xl font-semibold">{conversation?.name || 'Discussion de groupe'}</h3>
                                        <p className="text-sm text-muted-foreground">
                                            {conversation?.members?.length || 0} membres respectifs
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Notes partagées */}
                        <div className="pt-4">
                            <h4 className="font-semibold mb-3">Notes partagées</h4>
                            {isLoading ? (
                                <div className="flex justify-center py-8">
                                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                                </div>
                            ) : sharedNotes.length === 0 ? (
                                <div className="p-8 text-center border-2 border-dashed rounded-xl bg-muted/10">
                                    <p className="text-sm text-muted-foreground">
                                        Aucune note partagée pour le moment. Partagez des notes depuis la page Notes.
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {sharedNotes.map((note) => {
                                        const preview = stripHtml(note.content);
                                        const isFromCreator = note.creator?.id === currentUser?.id;
                                        return (
                                            <div
                                                key={note.id}
                                                onClick={() => setViewNote(note)}
                                                className="group flex flex-col p-3 rounded-xl border border-border bg-card hover:bg-muted/50 active:bg-muted/70 transition-colors cursor-pointer touch-manipulation"
                                            >
                                                <div className="flex items-center gap-1.5 pr-4">
                                                    <h3 className="font-semibold text-foreground text-sm line-clamp-1 flex-1 min-w-0">
                                                        {note.title}
                                                    </h3>
                                                    <span className="shrink-0 bg-primary/10 text-primary px-1.5 py-0.5 rounded text-[10px]">
                                                        Partagée
                                                    </span>
                                                </div>
                                                {preview && (
                                                    <p className="mt-1.5 text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                                                        {preview}
                                                    </p>
                                                )}
                                                <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                                    <Clock className="w-3 h-3 shrink-0" />
                                                    <span>
                                                        {formatDistanceToNow(new Date(note.updatedAt), { addSuffix: true, locale: fr })}
                                                        {isFromCreator ? ' · par vous' : ` · par ${note.creator?.name || 'Contact'}`}
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Dialog : aperçu note */}
            <Dialog open={!!viewNote} onOpenChange={() => setViewNote(null)}>
                <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>{viewNote?.title}</DialogTitle>
                    </DialogHeader>
                    {viewNote && (
                        <div className="prose prose-sm dark:prose-invert max-w-none">
                            <div
                                className="text-sm text-foreground"
                                dangerouslySetInnerHTML={{ __html: viewNote.content }}
                            />
                            <p className="mt-4 text-xs text-muted-foreground">
                                {viewNote.creator?.id === currentUser?.id
                                    ? 'Partagée par vous'
                                    : `Partagée par ${viewNote.creator?.name || 'Contact'}`}
                                {' · '}
                                {formatDistanceToNow(new Date(viewNote.updatedAt), { addSuffix: true, locale: fr })}
                            </p>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
