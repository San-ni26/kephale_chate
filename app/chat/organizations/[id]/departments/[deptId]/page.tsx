'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Avatar, AvatarFallback, AvatarImage } from '@/src/components/ui/avatar';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/components/ui/card';
import {
    ArrowLeft,
    Loader2,
    UserPlus,
    X,
    MessageSquare,
    Users as UsersIcon
} from 'lucide-react';
import { toast } from 'sonner';
import { fetchWithAuth, getUser } from '@/src/lib/auth-client';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/src/components/ui/dialog';

interface Department {
    id: string;
    name: string;
    publicKey: string;
    members: {
        id: string;
        user: {
            id: string;
            name: string;
            email: string;
            isOnline: boolean;
        };
    }[];
    _count: {
        members: number;
    };
}

export default function DepartmentDetailPage() {
    const params = useParams();
    const router = useRouter();
    const orgId = params?.id as string;
    const deptId = params?.deptId as string;

    const [department, setDepartment] = useState<Department | null>(null);
    const [loading, setLoading] = useState(true);
    const [showAddMemberDialog, setShowAddMemberDialog] = useState(false);
    const [newMemberEmail, setNewMemberEmail] = useState('');
    const [addingMember, setAddingMember] = useState(false);
    const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);

    const currentUser = getUser();

    useEffect(() => {
        if (deptId) {
            loadDepartment();
        }
    }, [deptId]);

    const loadDepartment = async () => {
        try {
            setLoading(true);
            const response = await fetchWithAuth(`/api/organizations/${orgId}/departments/${deptId}`);
            if (response.ok) {
                const data = await response.json();
                setDepartment(data.department);
            } else {
                toast.error('Erreur de chargement du département');
            }
        } catch (error) {
            console.error('Load department error:', error);
            toast.error('Erreur de chargement du département');
        } finally {
            setLoading(false);
        }
    };

    const handleAddMember = async () => {
        if (!newMemberEmail.trim()) return;

        setAddingMember(true);

        try {
            const response = await fetchWithAuth(`/api/organizations/${orgId}/departments/${deptId}/members`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: newMemberEmail.trim() }),
            });

            if (response.ok) {
                toast.success('Membre ajouté avec succès');
                setNewMemberEmail('');
                setShowAddMemberDialog(false);
                loadDepartment();
            } else {
                const error = await response.json();
                toast.error(error.error || 'Erreur lors de l\'ajout du membre');
            }
        } catch (error) {
            console.error('Add member error:', error);
            toast.error('Erreur lors de l\'ajout du membre');
        } finally {
            setAddingMember(false);
        }
    };

    const handleRemoveMember = async (memberId: string, memberName: string) => {
        if (!confirm(`Voulez-vous vraiment retirer ${memberName} du département ?`)) return;

        setRemovingMemberId(memberId);

        try {
            const response = await fetchWithAuth(`/api/organizations/${orgId}/departments/${deptId}/members/${memberId}`, {
                method: 'DELETE',
            });

            if (response.ok) {
                toast.success('Membre retiré avec succès');
                loadDepartment();
            } else {
                const error = await response.json();
                toast.error(error.error || 'Erreur lors du retrait du membre');
            }
        } catch (error) {
            console.error('Remove member error:', error);
            toast.error('Erreur lors du retrait du membre');
        } finally {
            setRemovingMemberId(null);
        }
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center h-screen bg-background">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (!department) {
        return (
            <div className="flex justify-center items-center h-screen bg-background">
                <div className="text-muted-foreground">Département non trouvé</div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background p-4 space-y-6 mt-16">
            {/* Add Member Dialog */}
            <Dialog open={showAddMemberDialog} onOpenChange={setShowAddMemberDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Ajouter un membre</DialogTitle>
                    </DialogHeader>
                    <div className="py-4">
                        <p className="text-sm text-muted-foreground mb-4">
                            Entrez l'adresse email du membre à ajouter au département.
                        </p>
                        <Input
                            type="email"
                            placeholder="email@example.com"
                            value={newMemberEmail}
                            onChange={(e) => setNewMemberEmail(e.target.value)}
                            onKeyPress={(e) => e.key === 'Enter' && handleAddMember()}
                        />
                    </div>
                    <DialogFooter>
                        <Button
                            variant="ghost"
                            onClick={() => setShowAddMemberDialog(false)}
                        >
                            Annuler
                        </Button>
                        <Button
                            onClick={handleAddMember}
                            disabled={addingMember || !newMemberEmail.trim()}
                        >
                            {addingMember ? (
                                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                            ) : null}
                            Ajouter
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => router.push(`/chat/organizations/${orgId}`)}
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </Button>

                    <Avatar className="h-12 w-12 border border-border">
                        <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${department.name}`} />
                        <AvatarFallback>{department.name[0]}</AvatarFallback>
                    </Avatar>

                    <div>
                        <h1 className="text-2xl font-bold text-foreground">{department.name}</h1>
                        <p className="text-sm text-muted-foreground">
                            {department._count.members} membre{department._count.members > 1 ? 's' : ''}
                        </p>
                    </div>
                </div>

                <Button
                    onClick={() => router.push(`/chat/organizations/${orgId}/departments/${deptId}/chat`)}
                    className="bg-primary hover:bg-primary/90 text-primary-foreground"
                >
                    <MessageSquare className="w-4 h-4 mr-2" />
                    Ouvrir le chat
                </Button>
            </div>

            {/* Members Section */}
            <Card className="bg-card border-border">
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle className="text-xl text-foreground flex items-center gap-2">
                            <UsersIcon className="w-5 h-5" />
                            Membres du département
                        </CardTitle>
                        <Button
                            size="sm"
                            onClick={() => setShowAddMemberDialog(true)}
                            className="bg-primary hover:bg-primary/90 text-primary-foreground"
                        >
                            <UserPlus className="w-4 h-4 mr-2" />
                            Ajouter un membre
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    {department.members.length === 0 ? (
                        <div className="text-center py-12 border-2 border-dashed border-border rounded-lg">
                            <UsersIcon className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                            <p className="text-muted-foreground">Aucun membre dans ce département</p>
                            <p className="text-sm text-muted-foreground mb-4">Ajoutez des membres pour commencer</p>
                            <Button
                                size="sm"
                                onClick={() => setShowAddMemberDialog(true)}
                                className="bg-primary hover:bg-primary/90 text-primary-foreground"
                            >
                                <UserPlus className="w-4 h-4 mr-2" />
                                Ajouter un membre
                            </Button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {department.members.map((member) => (
                                <Card
                                    key={member.id}
                                    className="bg-muted/50 border-border hover:border-primary/50 transition"
                                >
                                    <CardContent className="pt-6">
                                        <div className="flex items-start justify-between">
                                            <div className="flex items-center gap-3 flex-1 min-w-0">
                                                <Avatar className="h-12 w-12 border border-border">
                                                    <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${member.user.name || member.user.email}`} />
                                                    <AvatarFallback>
                                                        {(member.user.name || member.user.email)[0].toUpperCase()}
                                                    </AvatarFallback>
                                                </Avatar>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-semibold text-foreground truncate">
                                                        {member.user.name || 'Sans nom'}
                                                    </p>
                                                    <p className="text-xs text-muted-foreground truncate">
                                                        {member.user.email}
                                                    </p>
                                                    <div className="flex items-center gap-2 mt-2">
                                                        <div className={`w-2 h-2 rounded-full ${member.user.isOnline ? 'bg-green-500' : 'bg-gray-400'
                                                            }`} />
                                                        <span className="text-xs text-muted-foreground">
                                                            {member.user.isOnline ? 'En ligne' : 'Hors ligne'}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                            {member.user.id !== currentUser?.id && (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleRemoveMember(member.id, member.user.name || member.user.email)}
                                                    disabled={removingMemberId === member.id}
                                                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                                >
                                                    {removingMemberId === member.id ? (
                                                        <Loader2 className="w-4 h-4 animate-spin" />
                                                    ) : (
                                                        <X className="w-4 h-4" />
                                                    )}
                                                </Button>
                                            )}
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
