"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/src/components/ui/dialog";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { Textarea } from "@/src/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/src/components/ui/select";
import { toast } from "sonner";
import { Loader2, Mail, Users, Building2, UserCheck, MessageSquare } from "lucide-react";
import { fetcher } from "@/src/lib/fetcher";

interface OrgMember {
    id: string;
    name: string | null;
    email: string;
    role: string;
}

interface Department {
    id: string;
    name: string;
    _count?: { members: number };
}

interface EventCreationDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    orgId: string;
    onSuccess: () => void;
}

const EVENT_TYPES = [
    { value: 'PROFESSIONAL', label: 'Professionnel' },
    { value: 'DINNER', label: 'Dîner' },
    { value: 'MEETING', label: 'Réunion' },
    { value: 'PARTY', label: 'Soirée' },
    { value: 'CONFERENCE', label: 'Conférence' },
    { value: 'WORKSHOP', label: 'Atelier' },
    { value: 'OTHER', label: 'Autre' },
];

export default function EventCreationDialog({
    open,
    onOpenChange,
    orgId,
    onSuccess,
}: EventCreationDialogProps) {
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        title: '',
        description: '',
        eventType: 'MEETING',
        eventDate: '',
        maxAttendees: 50,
    });
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string>('');

    // Envoi des invitations par email (système Chat Kephale, au nom de l'organisation)
    const [sendInvitationsByEmail, setSendInvitationsByEmail] = useState(false);
    const [inviteTarget, setInviteTarget] = useState<'all' | 'department' | 'selected'>('all');
    const [selectedDepartmentId, setSelectedDepartmentId] = useState<string>('');
    const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);

    const [members, setMembers] = useState<OrgMember[]>([]);
    const [departments, setDepartments] = useState<Department[]>([]);
    const [loadingTargets, setLoadingTargets] = useState(false);

    // Diffuser l'événement dans les discussions des départements (affiché jusqu'à fin d'événement ou suppression)
    const [broadcastToDiscussions, setBroadcastToDiscussions] = useState(false);
    const [broadcastTarget, setBroadcastTarget] = useState<'all' | 'selected'>('all');
    const [broadcastDepartmentIds, setBroadcastDepartmentIds] = useState<string[]>([]);

    useEffect(() => {
        if (!open || !orgId) return;
        setLoadingTargets(true);
        Promise.all([
            fetcher(`/api/organizations/${orgId}/members`),
            fetcher(`/api/organizations/${orgId}/departments`),
        ])
            .then(([membersRes, deptsRes]) => {
                const list = (membersRes as { members?: OrgMember[] })?.members ?? [];
                const depts = (deptsRes as { departments?: Department[] })?.departments ?? [];
                setMembers(list);
                setDepartments(depts);
                setSelectedDepartmentId((prev) => prev || depts[0]?.id || '');
            })
            .catch(() => {
                toast.error('Impossible de charger les membres et départements');
            })
            .finally(() => setLoadingTargets(false));
    }, [open, orgId]);

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setImageFile(file);
            const reader = new FileReader();
            reader.onloadend = () => {
                setImagePreview(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!formData.title || !formData.eventDate || !formData.maxAttendees) {
            toast.error('Veuillez remplir tous les champs requis');
            return;
        }
        if (sendInvitationsByEmail && inviteTarget === 'department' && !selectedDepartmentId) {
            toast.error('Veuillez choisir un département');
            return;
        }
        if (sendInvitationsByEmail && inviteTarget === 'selected' && selectedUserIds.length === 0) {
            toast.error('Veuillez sélectionner au moins un membre');
            return;
        }
        if (broadcastToDiscussions && broadcastTarget === 'selected' && broadcastDepartmentIds.length === 0) {
            toast.error('Veuillez sélectionner au moins un département');
            return;
        }

        setLoading(true);

        try {
            // Convert image to base64 if provided
            let imageBase64: string | null = null;
            if (imageFile) {
                imageBase64 = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.readAsDataURL(imageFile);
                    reader.onload = () => resolve(reader.result as string);
                    reader.onerror = error => reject(error);
                });
            }

            const body: Record<string, unknown> = {
                title: formData.title,
                description: formData.description,
                eventType: formData.eventType,
                eventDate: formData.eventDate,
                maxAttendees: formData.maxAttendees,
                imageUrl: imageBase64,
            };
            if (sendInvitationsByEmail) {
                body.sendInvitations = {
                    target: inviteTarget,
                    ...(inviteTarget === 'department' && selectedDepartmentId ? { departmentId: selectedDepartmentId } : {}),
                    ...(inviteTarget === 'selected' && selectedUserIds.length ? { userIds: selectedUserIds } : {}),
                };
            }
            if (broadcastToDiscussions) {
                body.broadcastToDepartments =
                    broadcastTarget === 'all' ? 'all' : broadcastDepartmentIds.length > 0 ? broadcastDepartmentIds : undefined;
            }

            const res = await fetch(`/api/organizations/${orgId}/events`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(body),
            });

            const data = await res.json();

            if (!res.ok) {
                toast.error(data.error || 'Erreur lors de la création de l\'événement');
                return;
            }

            toast.success('Événement créé avec succès !');

            if (typeof data.invitationsSent === 'number' && data.invitationsSent > 0) {
                toast.success(`${data.invitationsSent} invitation(s) envoyée(s) par email (au nom de l'organisation).`);
            }

            // Copy invitation link to clipboard
            if (data.invitationLink) {
                navigator.clipboard.writeText(data.invitationLink);
                toast.info('Lien d\'invitation copié dans le presse-papiers');
            }

            // Reset form
            setFormData({
                title: '',
                description: '',
                eventType: 'MEETING',
                eventDate: '',
                maxAttendees: 50,
            });
            setImageFile(null);
            setImagePreview('');

            onSuccess();
        } catch (error) {
            console.error('Error creating event:', error);
            toast.error('Erreur lors de la création de l\'événement');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="bg-card border-border text-foreground max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Créer un Événement</DialogTitle>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4 pt-4">
                    <div className="space-y-2">
                        <Label htmlFor="title">Titre *</Label>
                        <Input
                            id="title"
                            type="text"
                            placeholder="Réunion d'équipe"
                            className="bg-muted border-border text-foreground"
                            value={formData.title}
                            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                            required
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="eventType">Type d'événement *</Label>
                        <Select
                            value={formData.eventType}
                            onValueChange={(value) => setFormData({ ...formData, eventType: value })}
                        >
                            <SelectTrigger className="bg-muted border-border text-foreground">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-card border-border">
                                {EVENT_TYPES.map((type) => (
                                    <SelectItem key={type.value} value={type.value}>
                                        {type.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="eventDate">Date et heure *</Label>
                            <Input
                                id="eventDate"
                                type="datetime-local"
                                className="bg-muted border-border text-foreground"
                                value={formData.eventDate}
                                onChange={(e) => setFormData({ ...formData, eventDate: e.target.value })}
                                required
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="maxAttendees">Nombre max de participants *</Label>
                            <Input
                                id="maxAttendees"
                                type="number"
                                min="1"
                                placeholder="50"
                                className="bg-muted border-border text-foreground"
                                value={formData.maxAttendees}
                                onChange={(e) => setFormData({ ...formData, maxAttendees: parseInt(e.target.value) })}
                                required
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="description">Description</Label>
                        <Textarea
                            id="description"
                            placeholder="Détails de l'événement..."
                            className="bg-muted border-border text-foreground"
                            value={formData.description}
                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                            rows={4}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="image">Image de l'événement</Label>
                        {imagePreview && (
                            <div className="mb-2">
                                <img
                                    src={imagePreview}
                                    alt="Preview"
                                    className="w-full h-40 object-cover rounded-lg border-2 border-border"
                                />
                            </div>
                        )}
                        <Input
                            id="image"
                            type="file"
                            accept="image/*"
                            className="bg-muted border-border text-foreground"
                            onChange={handleImageUpload}
                        />
                    </div>

                    {/* Envoi des invitations par email (système Chat Kephale, au nom de l'organisation) */}
                    <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-4">
                        <div className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                id="sendInvitationsByEmail"
                                checked={sendInvitationsByEmail}
                                onChange={(e) => setSendInvitationsByEmail(e.target.checked)}
                                className="h-4 w-4 rounded border-border"
                            />
                            <Label htmlFor="sendInvitationsByEmail" className="flex items-center gap-2 cursor-pointer font-normal">
                                <Mail className="w-4 h-4 text-muted-foreground" />
                                Envoyer les invitations par email (au nom de l'organisation)
                            </Label>
                        </div>
                        {sendInvitationsByEmail && (
                            <div className="pl-6 space-y-3 border-l-2 border-border">
                                {loadingTargets ? (
                                    <p className="text-sm text-muted-foreground">Chargement des membres...</p>
                                ) : (
                                    <>
                                        <p className="text-sm text-muted-foreground">Envoyer à :</p>
                                        <div className="flex flex-col gap-2">
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <input
                                                    type="radio"
                                                    name="inviteTarget"
                                                    checked={inviteTarget === 'all'}
                                                    onChange={() => setInviteTarget('all')}
                                                    className="h-4 w-4"
                                                />
                                                <Users className="w-4 h-4 text-muted-foreground" />
                                                <span className="text-sm">Tous les membres de l'organisation</span>
                                                {members.length > 0 && (
                                                    <span className="text-xs text-muted-foreground">({members.length})</span>
                                                )}
                                            </label>
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <input
                                                    type="radio"
                                                    name="inviteTarget"
                                                    checked={inviteTarget === 'department'}
                                                    onChange={() => setInviteTarget('department')}
                                                    className="h-4 w-4"
                                                />
                                                <Building2 className="w-4 h-4 text-muted-foreground" />
                                                <span className="text-sm">Un département</span>
                                            </label>
                                            {inviteTarget === 'department' && departments.length > 0 && (
                                                <Select
                                                    value={selectedDepartmentId || departments[0]?.id}
                                                    onValueChange={setSelectedDepartmentId}
                                                >
                                                    <SelectTrigger className="w-full max-w-xs bg-background border-border">
                                                        <SelectValue placeholder="Choisir un département" />
                                                    </SelectTrigger>
                                                    <SelectContent className="bg-card border-border">
                                                        {departments.map((d) => (
                                                            <SelectItem key={d.id} value={d.id}>
                                                                {d.name} {d._count?.members != null ? `(${d._count.members} membres)` : ''}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            )}
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <input
                                                    type="radio"
                                                    name="inviteTarget"
                                                    checked={inviteTarget === 'selected'}
                                                    onChange={() => setInviteTarget('selected')}
                                                    className="h-4 w-4"
                                                />
                                                <UserCheck className="w-4 h-4 text-muted-foreground" />
                                                <span className="text-sm">Sélectionner des membres</span>
                                            </label>
                                            {inviteTarget === 'selected' && members.length > 0 && (
                                                <div className="max-h-40 overflow-y-auto rounded border border-border bg-background p-2 space-y-1">
                                                    {members.map((m) => (
                                                        <label
                                                            key={m.id}
                                                            className="flex items-center gap-2 cursor-pointer py-1.5 px-2 rounded hover:bg-muted/50"
                                                        >
                                                            <input
                                                                type="checkbox"
                                                                checked={selectedUserIds.includes(m.id)}
                                                                onChange={(e) => {
                                                                    setSelectedUserIds((prev) =>
                                                                        e.target.checked
                                                                            ? [...prev, m.id]
                                                                            : prev.filter((id) => id !== m.id)
                                                                    );
                                                                }}
                                                                className="h-4 w-4 rounded border-border"
                                                            />
                                                            <span className="text-sm truncate">
                                                                {m.name || m.email}
                                                                {m.name && m.email ? ` (${m.email})` : ''}
                                                            </span>
                                                        </label>
                                                    ))}
                                                </div>
                                            )}
                                            {inviteTarget === 'selected' && selectedUserIds.length > 0 && (
                                                <p className="text-xs text-muted-foreground">
                                                    {selectedUserIds.length} membre(s) sélectionné(s)
                                                </p>
                                            )}
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                            Les emails sont envoyés par Chat Kephale, au nom de votre organisation.
                                        </p>
                                    </>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Diffuser dans les discussions des départements (affiché jusqu'à fin d'événement ou suppression) */}
                    <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-4">
                        <div className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                id="broadcastToDiscussions"
                                checked={broadcastToDiscussions}
                                onChange={(e) => setBroadcastToDiscussions(e.target.checked)}
                                className="h-4 w-4 rounded border-border"
                            />
                            <Label htmlFor="broadcastToDiscussions" className="flex items-center gap-2 cursor-pointer font-normal">
                                <MessageSquare className="w-4 h-4 text-muted-foreground" />
                                Diffuser l'événement dans les discussions des départements
                            </Label>
                        </div>
                        {broadcastToDiscussions && (
                            <div className="pl-6 space-y-3 border-l-2 border-border">
                                {loadingTargets ? (
                                    <p className="text-sm text-muted-foreground">Chargement...</p>
                                ) : departments.length === 0 ? (
                                    <p className="text-sm text-muted-foreground">Aucun département dans cette organisation.</p>
                                ) : (
                                    <>
                                        <p className="text-sm text-muted-foreground">L'événement sera affiché dans la discussion jusqu'à sa date de fin ou sa suppression.</p>
                                        <div className="flex flex-col gap-2">
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <input
                                                    type="radio"
                                                    name="broadcastTarget"
                                                    checked={broadcastTarget === 'all'}
                                                    onChange={() => setBroadcastTarget('all')}
                                                    className="h-4 w-4"
                                                />
                                                <Building2 className="w-4 h-4 text-muted-foreground" />
                                                <span className="text-sm">Tous les départements</span>
                                                <span className="text-xs text-muted-foreground">({departments.length})</span>
                                            </label>
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <input
                                                    type="radio"
                                                    name="broadcastTarget"
                                                    checked={broadcastTarget === 'selected'}
                                                    onChange={() => setBroadcastTarget('selected')}
                                                    className="h-4 w-4"
                                                />
                                                <span className="text-sm">Sélectionner les départements</span>
                                            </label>
                                            {broadcastTarget === 'selected' && departments.length > 0 && (
                                                <div className="max-h-40 overflow-y-auto rounded border border-border bg-background p-2 space-y-1">
                                                    {departments.map((d) => (
                                                        <label
                                                            key={d.id}
                                                            className="flex items-center gap-2 cursor-pointer py-1.5 px-2 rounded hover:bg-muted/50"
                                                        >
                                                            <input
                                                                type="checkbox"
                                                                checked={broadcastDepartmentIds.includes(d.id)}
                                                                onChange={(e) => {
                                                                    setBroadcastDepartmentIds((prev) =>
                                                                        e.target.checked
                                                                            ? [...prev, d.id]
                                                                            : prev.filter((id) => id !== d.id)
                                                                    );
                                                                }}
                                                                className="h-4 w-4 rounded border-border"
                                                            />
                                                            <span className="text-sm">{d.name}</span>
                                                            {d._count?.members != null && (
                                                                <span className="text-xs text-muted-foreground">({d._count.members} membres)</span>
                                                            )}
                                                        </label>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="flex gap-3 pt-4">
                        <Button
                            type="button"
                            variant="outline"
                            className="flex-1 border-border hover:bg-muted"
                            onClick={() => onOpenChange(false)}
                            disabled={loading}
                        >
                            Annuler
                        </Button>
                        <Button
                            type="submit"
                            className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
                            disabled={loading}
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Création...
                                </>
                            ) : (
                                'Créer l\'\u00c9vénement'
                            )}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
