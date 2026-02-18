'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Handshake, Plus, Building2, Users, MessageSquare, Pencil, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/src/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/src/components/ui/avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/src/components/ui/dialog';
import { Input } from '@/src/components/ui/input';
import { Label } from '@/src/components/ui/label';
import { toast } from 'sonner';
import { fetchWithAuth, getUser } from '@/src/lib/auth-client';
import useSWR from 'swr';
import { fetcher } from '@/src/lib/fetcher';

interface Collaboration {
    id: string;
    status: string;
    orgA: { id: string; name: string; code: string; logo?: string };
    orgB: { id: string; name: string; code: string; logo?: string };
    groups: Array<{
        id: string;
        name: string;
        _count: { members: number };
        members?: Array<{ id: string }>;
    }>;
}

export default function CollaborationDetailPage() {
    const router = useRouter();
    const params = useParams();
    const orgId = params?.id as string;
    const collabId = params?.collabId as string;
    const currentUser = getUser();

    const [showCreateGroupDialog, setShowCreateGroupDialog] = useState(false);
    const [newGroupName, setNewGroupName] = useState('');
    const [creatingGroup, setCreatingGroup] = useState(false);
    const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
    const [editGroupName, setEditGroupName] = useState('');
    const [updatingGroup, setUpdatingGroup] = useState(false);
    const [deletingGroupId, setDeletingGroupId] = useState<string | null>(null);

    const { data: collabData, mutate: mutateCollab } = useSWR<{ collaboration: Collaboration; canManageGroups?: boolean }>(
        orgId && collabId ? `/api/organizations/${orgId}/collaborations/${collabId}` : null,
        fetcher
    );

    const collaboration = collabData?.collaboration;
    const canManageGroups = collabData?.canManageGroups ?? false;
    const loading = !collabData && !collaboration;

    const otherOrg = collaboration
        ? (collaboration.orgA.id === orgId ? collaboration.orgB : collaboration.orgA)
        : null;

    const handleCreateGroup = async () => {
        if (!newGroupName.trim()) {
            toast.error('Nom du groupe requis');
            return;
        }
        setCreatingGroup(true);
        try {
            const res = await fetchWithAuth(`/api/organizations/${orgId}/collaborations/${collabId}/groups`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newGroupName.trim() }),
            });
            const data = await res.json();
            if (res.ok) {
                toast.success('Groupe créé avec succès');
                setShowCreateGroupDialog(false);
                setNewGroupName('');
                mutateCollab();
            } else {
                toast.error(data.error || 'Erreur');
            }
        } catch (e) {
            console.error('Create group error:', e);
            toast.error('Erreur serveur');
        } finally {
            setCreatingGroup(false);
        }
    };

    const handleUpdateGroup = async () => {
        if (!editingGroupId || !editGroupName.trim()) return;
        setUpdatingGroup(true);
        try {
            const res = await fetchWithAuth(
                `/api/organizations/${orgId}/collaborations/${collabId}/groups/${editingGroupId}`,
                {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: editGroupName.trim() }),
                }
            );
            if (res.ok) {
                toast.success('Groupe modifié');
                setEditingGroupId(null);
                mutateCollab();
            } else {
                const err = await res.json();
                toast.error(err.error || 'Erreur');
            }
        } catch (e) {
            console.error('Update group error:', e);
            toast.error('Erreur serveur');
        } finally {
            setUpdatingGroup(false);
        }
    };

    const handleDeleteGroup = async (groupId: string) => {
        if (!confirm('Supprimer ce groupe ? Toutes les discussions, tâches et documents seront supprimés.')) return;
        setDeletingGroupId(groupId);
        try {
            const res = await fetchWithAuth(
                `/api/organizations/${orgId}/collaborations/${collabId}/groups/${groupId}`,
                { method: 'DELETE' }
            );
            if (res.ok) {
                toast.success('Groupe supprimé');
                mutateCollab();
            } else {
                const err = await res.json();
                toast.error(err.error || 'Erreur');
            }
        } catch (e) {
            console.error('Delete group error:', e);
            toast.error('Erreur serveur');
        } finally {
            setDeletingGroupId(null);
        }
    };

    const openEditGroup = (group: { id: string; name: string }) => {
        setEditingGroupId(group.id);
        setEditGroupName(group.name);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-background">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (!collaboration) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-background gap-4">
                <p className="text-muted-foreground">Collaboration non trouvée</p>
                <Button variant="outline" onClick={() => router.push(`/chat/organizations/${orgId}`)}>
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Retour
                </Button>
            </div>
        );
    }

    if (collaboration.status !== 'ACTIVE') {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-background gap-4">
                <p className="text-muted-foreground">
                    Cette collaboration n&apos;est pas encore active. En attente d&apos;acceptation.
                </p>
                <Button variant="outline" onClick={() => router.push(`/chat/organizations/${orgId}`)}>
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Retour
                </Button>
            </div>
        );
    }

    const groups = collaboration.groups || [];
    const userGroupIds = groups
        .filter((g) => g.members?.some((m) => m.id === currentUser?.id))
        .map((g) => g.id);
    const isMemberOfGroup = (groupId: string) => userGroupIds.includes(groupId);

    return (
        <div className="min-h-screen bg-background pt-14 md:pt-16 pb-20 md:pb-6">
            <div className="mx-auto w-full max-w-6xl px-4 md:px-6 lg:px-8 py-6 space-y-8">
                {/* Header : masqué sur mobile (TopNav affiche les infos) */}
                <div className="hidden md:flex items-center gap-4">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => router.push(`/chat/organizations/${orgId}`)}
                        aria-label="Retour"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </Button>
                    <div className="flex items-center gap-3 flex-1">
                        <div className="flex items-center gap-2">
                            <Avatar className="h-12 w-12 border border-border">
                                <AvatarImage src={otherOrg?.logo} />
                                <AvatarFallback>
                                    <Handshake className="w-6 h-6" />
                                </AvatarFallback>
                            </Avatar>
                            <div>
                                <h1 className="text-xl font-semibold text-foreground">
                                    Collaboration avec {otherOrg?.name}
                                </h1>
                                <p className="text-sm text-muted-foreground">
                                    {collaboration.orgA.name} ↔ {collaboration.orgB.name}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Groups Section */}
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                            <Building2 className="w-5 h-5" />
                            Groupes
                        </h2>
                        {canManageGroups && (
                            <Button
                                size="sm"
                                className="bg-primary text-primary-foreground hover:bg-primary/90"
                                onClick={() => setShowCreateGroupDialog(true)}
                            >
                                <Plus className="w-4 h-4 mr-2" />
                                Nouveau groupe
                            </Button>
                        )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                        Liste des groupes de collaboration.
                    </p>

                    {groups.length === 0 ? (
                        <div className="text-center py-12 border-2 border-dashed border-border rounded-xl">
                            <Building2 className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                            <p className="text-muted-foreground">Aucun groupe</p>
                            <p className="text-sm text-muted-foreground mb-4">
                                Créez un groupe pour commencer à collaborer
                            </p>
                            {canManageGroups && (
                                <Button
                                    size="sm"
                                    className="bg-primary text-primary-foreground hover:bg-primary/90"
                                    onClick={() => setShowCreateGroupDialog(true)}
                                >
                                    <Plus className="w-4 h-4 mr-2" />
                                    Créer un groupe
                                </Button>
                            )}
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {groups.map((group) => {
                                const isMember = group.members?.some(
                                    (m) => (m as { user?: { id: string } }).user?.id === currentUser?.id
                                );
                                const memberCount = group._count?.members ?? 0;

                                return (
                                    <Card
                                        key={group.id}
                                        className="bg-card border-border hover:border-primary/50 transition cursor-pointer group"
                                        onClick={() =>
                                            router.push(
                                                `/chat/organizations/${orgId}/collaborations/${collabId}/groups/${group.id}`
                                            )
                                        }
                                    >
                                        <CardHeader className="relative pb-2">
                                            <CardTitle className="text-lg pr-16">{group.name}</CardTitle>
                                            {canManageGroups && (
                                                <div
                                                    className="absolute top-4 right-4 flex gap-1"
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    <Button
                                                        variant="outline"
                                                        size="icon"
                                                        className="h-8 w-8"
                                                        onClick={() => openEditGroup(group)}
                                                    >
                                                        <Pencil className="h-4 w-4" />
                                                    </Button>
                                                    <Button
                                                        variant="outline"
                                                        size="icon"
                                                        className="h-8 w-8 text-destructive"
                                                        onClick={() => handleDeleteGroup(group.id)}
                                                        disabled={deletingGroupId === group.id}
                                                    >
                                                        {deletingGroupId === group.id ? (
                                                            <Loader2 className="h-4 w-4 animate-spin" />
                                                        ) : (
                                                            <Trash2 className="h-4 w-4" />
                                                        )}
                                                    </Button>
                                                </div>
                                            )}
                                        </CardHeader>
                                        <CardContent className="space-y-3">
                                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                                <Users className="w-4 h-4" />
                                                <span>{memberCount} membre{memberCount > 1 ? 's' : ''}</span>
                                            </div>
                                            <div className="flex gap-2">
                                                <Button
                                                    size="sm"
                                                    className="flex-1"
                                                    variant="secondary"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        router.push(
                                                            `/chat/organizations/${orgId}/collaborations/${collabId}/groups/${group.id}`
                                                        );
                                                    }}
                                                >
                                                    <MessageSquare className="w-4 h-4 mr-2" />
                                                    Ouvrir
                                                </Button>
                                            </div>
                                        </CardContent>
                                    </Card>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* Create Group Dialog */}
            <Dialog open={showCreateGroupDialog} onOpenChange={setShowCreateGroupDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Nouveau groupe</DialogTitle>
                    </DialogHeader>
                    <div className="py-2">
                        <Label>Nom du groupe</Label>
                        <Input
                            value={newGroupName}
                            onChange={(e) => setNewGroupName(e.target.value)}
                            placeholder="Ex: Projet commun, Équipe marketing..."
                            className="mt-2"
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setShowCreateGroupDialog(false)}>
                            Annuler
                        </Button>
                        <Button onClick={handleCreateGroup} disabled={creatingGroup || !newGroupName.trim()}>
                            {creatingGroup ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                            Créer
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Edit Group Dialog */}
            <Dialog open={!!editingGroupId} onOpenChange={(open) => !open && setEditingGroupId(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Modifier le groupe</DialogTitle>
                    </DialogHeader>
                    <div className="py-2">
                        <Label>Nom du groupe</Label>
                        <Input
                            value={editGroupName}
                            onChange={(e) => setEditGroupName(e.target.value)}
                            className="mt-2"
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setEditingGroupId(null)}>
                            Annuler
                        </Button>
                        <Button onClick={handleUpdateGroup} disabled={updatingGroup || !editGroupName.trim()}>
                            {updatingGroup ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                            Enregistrer
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
