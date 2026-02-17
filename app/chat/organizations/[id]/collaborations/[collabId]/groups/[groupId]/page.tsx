'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, MessageSquare, UserPlus, Users, Loader2, Calendar, ChevronRight } from 'lucide-react';
import { CollaborationDocumentsPanel } from '@/src/components/chat/CollaborationDocumentsPanel';
import { EditorialPlanningPanel } from '@/src/components/collaboration/EditorialPlanningPanel';
import { Button } from '@/src/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/src/components/ui/avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/src/components/ui/dialog';
import { Input } from '@/src/components/ui/input';
import { Label } from '@/src/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/src/components/ui/select';
import { toast } from 'sonner';
import { fetchWithAuth, getUser } from '@/src/lib/auth-client';
import useSWR from 'swr';
import { fetcher } from '@/src/lib/fetcher';

interface Group {
    id: string;
    name: string;
    collaboration: {
        orgA: { id: string; name: string };
        orgB: { id: string; name: string };
    };
    members: Array<{
        id: string;
        user: { id: string; name: string | null; email: string };
        organization: { id: string; name: string };
    }>;
    _count: { members: number; tasks: number };
}

export default function CollaborationGroupDetailPage() {
    const router = useRouter();
    const params = useParams();
    const orgId = params?.id as string;
    const collabId = params?.collabId as string;
    const groupId = params?.groupId as string;
    const currentUser = getUser();

    const [showAddMemberDialog, setShowAddMemberDialog] = useState(false);
    const [addMemberEmail, setAddMemberEmail] = useState('');
    const [addMemberOrgId, setAddMemberOrgId] = useState('');
    const [addingMember, setAddingMember] = useState(false);
    const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);
    const [documentsPanelOpen, setDocumentsPanelOpen] = useState(false);
    const [editorialPanelOpen, setEditorialPanelOpen] = useState(false);

    useEffect(() => {
        const openDocs = () => setDocumentsPanelOpen(true);
        window.addEventListener('collaboration-chat-open-documents', openDocs);
        return () => window.removeEventListener('collaboration-chat-open-documents', openDocs);
    }, []);

    const { data: groupData, mutate: mutateGroup } = useSWR<{ group: Group; canManageMembers?: boolean }>(
        orgId && collabId && groupId
            ? `/api/organizations/${orgId}/collaborations/${collabId}/groups/${groupId}`
            : null,
        fetcher
    );

    const group = groupData?.group;
    const canManageMembers = groupData?.canManageMembers ?? false;
    const loading = !groupData && !group;

    const isMember = group?.members?.some((m) => m.user.id === currentUser?.id);
    const orgA = group?.collaboration?.orgA;
    const orgB = group?.collaboration?.orgB;

    const handleAddMember = async () => {
        if (!addMemberEmail.trim() || !addMemberOrgId) {
            toast.error('Email et organisation requis');
            return;
        }
        setAddingMember(true);
        try {
            const res = await fetchWithAuth(
                `/api/organizations/${orgId}/collaborations/${collabId}/groups/${groupId}/members`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        userEmail: addMemberEmail.trim(),
                        memberOrgId: addMemberOrgId,
                    }),
                }
            );
            const data = await res.json();
            if (res.ok) {
                toast.success('Membre ajouté');
                setShowAddMemberDialog(false);
                setAddMemberEmail('');
                setAddMemberOrgId('');
                mutateGroup();
            } else {
                toast.error(data.error || 'Erreur');
            }
        } catch (e) {
            console.error('Add member error:', e);
            toast.error('Erreur serveur');
        } finally {
            setAddingMember(false);
        }
    };

    const handleRemoveMember = async (memberId: string) => {
        if (!confirm('Retirer ce membre du groupe ?')) return;
        setRemovingMemberId(memberId);
        try {
            const res = await fetchWithAuth(
                `/api/organizations/${orgId}/collaborations/${collabId}/groups/${groupId}/members/${memberId}`,
                { method: 'DELETE' }
            );
            if (res.ok) {
                toast.success('Membre retiré');
                mutateGroup();
            } else {
                const err = await res.json();
                toast.error(err.error || 'Erreur');
            }
        } catch (e) {
            console.error('Remove member error:', e);
            toast.error('Erreur serveur');
        } finally {
            setRemovingMemberId(null);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-background">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (!group) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-background gap-4">
                <p className="text-muted-foreground">Groupe non trouvé</p>
                <Button
                    variant="outline"
                    onClick={() =>
                        router.push(`/chat/organizations/${orgId}/collaborations/${collabId}`)
                    }
                >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Retour
                </Button>
            </div>
        );
    }

    if (!isMember) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-background gap-4">
                <p className="text-muted-foreground">
                    Vous n&apos;êtes pas membre de ce groupe. Contactez un administrateur pour être ajouté.
                </p>
                <Button
                    variant="outline"
                    onClick={() =>
                        router.push(`/chat/organizations/${orgId}/collaborations/${collabId}`)
                    }
                >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Retour
                </Button>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background pt-14 md:pt-16 pb-20 md:pb-6">
            <div className="mx-auto w-full max-w-4xl px-4 md:px-6 lg:px-8 py-6 space-y-8">
                {/* Header : masqué sur mobile (TopNav affiche les infos) */}
                <div className="hidden md:flex items-center gap-4">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                            router.push(`/chat/organizations/${orgId}/collaborations/${collabId}`)
                        }
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </Button>
                    <div className="flex-1">
                        <h1 className="text-xl font-semibold text-foreground">{group.name}</h1>
                        <p className="text-sm text-muted-foreground">
                            {orgA?.name} ↔ {orgB?.name}
                        </p>
                    </div>
                    <Button
                        className="bg-primary text-primary-foreground hover:bg-primary/90"
                        onClick={() =>
                            router.push(
                                `/chat/organizations/${orgId}/collaborations/${collabId}/groups/${groupId}/chat`
                            )
                        }
                    >
                        <MessageSquare className="w-4 h-4 mr-2" />
                        Ouvrir le chat
                    </Button>
                </div>

                {/* Planning éditorial */}
                <Card
                    className="bg-card border-border hover:border-primary/50 transition cursor-pointer"
                    onClick={() => setEditorialPanelOpen(true)}
                >
                    <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle className="flex items-center gap-2">
                            <Calendar className="w-5 h-5" />
                            Planning éditorial
                        </CardTitle>
                        <ChevronRight className="w-5 h-5 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm text-muted-foreground">
                            Planifiez vos contenus (articles, posts, vidéos…) et suivez leur avancement.
                        </p>
                    </CardContent>
                </Card>

                {/* Members */}
                <Card className="bg-card border-border">
                    <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle className="flex items-center gap-2">
                            <Users className="w-5 h-5" />
                            Membres ({group._count.members})
                        </CardTitle>
                        {canManageMembers && (
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setShowAddMemberDialog(true)}
                            >
                                <UserPlus className="w-4 h-4 mr-2" />
                                Ajouter un membre
                            </Button>
                        )}
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-3">
                            {group.members.map((member) => (
                                <div
                                    key={member.id}
                                    className="flex items-center justify-between py-2 border-b border-border last:border-0"
                                >
                                    <div className="flex items-center gap-3">
                                        <Avatar className="h-10 w-10">
                                            <AvatarFallback>
                                                {(member.user?.name || member.user?.email || '?')[0]}
                                            </AvatarFallback>
                                        </Avatar>
                                        <div>
                                            <p className="font-medium">
                                                {member.user?.name || member.user?.email}
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                                {member.organization?.name}
                                            </p>
                                        </div>
                                    </div>
                                    {(member.user.id !== currentUser?.id ? canManageMembers : true) && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="text-destructive"
                                            onClick={() => handleRemoveMember(member.id)}
                                            disabled={removingMemberId === member.id}
                                        >
                                            {removingMemberId === member.id ? (
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                            ) : member.user.id === currentUser?.id ? (
                                                'Quitter'
                                            ) : (
                                                'Retirer'
                                            )}
                                        </Button>
                                    )}
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            </div>

            <CollaborationDocumentsPanel
                open={documentsPanelOpen}
                onOpenChange={setDocumentsPanelOpen}
                orgId={orgId}
                collabId={collabId}
                groupId={groupId}
            />

            <EditorialPlanningPanel
                open={editorialPanelOpen}
                onOpenChange={setEditorialPanelOpen}
                baseUrl={`/api/organizations/${orgId}/collaborations/${collabId}/groups/${groupId}`}
                members={group.members}
            />

            {/* Add Member Dialog */}
            <Dialog open={showAddMemberDialog} onOpenChange={setShowAddMemberDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Ajouter un membre</DialogTitle>
                    </DialogHeader>
                    <p className="text-sm text-muted-foreground">
                        L&apos;utilisateur doit être membre de l&apos;organisation sélectionnée.
                    </p>
                    <div className="space-y-4 py-2">
                        <div>
                            <Label>Organisation d&apos;origine</Label>
                            <Select
                                value={addMemberOrgId}
                                onValueChange={setAddMemberOrgId}
                            >
                                <SelectTrigger className="mt-2">
                                    <SelectValue placeholder="Choisir une organisation" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={orgA?.id || ''}>{orgA?.name}</SelectItem>
                                    <SelectItem value={orgB?.id || ''}>{orgB?.name}</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label>Email du membre</Label>
                            <Input
                                type="email"
                                value={addMemberEmail}
                                onChange={(e) => setAddMemberEmail(e.target.value)}
                                placeholder="email@exemple.com"
                                className="mt-2"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setShowAddMemberDialog(false)}>
                            Annuler
                        </Button>
                        <Button
                            onClick={handleAddMember}
                            disabled={addingMember || !addMemberEmail.trim() || !addMemberOrgId}
                        >
                            {addingMember ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                            Ajouter
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
