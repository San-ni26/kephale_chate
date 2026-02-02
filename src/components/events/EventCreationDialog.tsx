"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/src/components/ui/dialog";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { Textarea } from "@/src/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/src/components/ui/select";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

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

            const res = await fetch(`/api/organizations/${orgId}/events`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    title: formData.title,
                    description: formData.description,
                    eventType: formData.eventType,
                    eventDate: formData.eventDate,
                    maxAttendees: formData.maxAttendees,
                    imageUrl: imageBase64,
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                toast.error(data.error || 'Erreur lors de la création de l\'événement');
                return;
            }

            toast.success('Événement créé avec succès !');

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
            <DialogContent className="bg-slate-900 border-slate-800 text-slate-100 max-w-2xl max-h-[90vh] overflow-y-auto">
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
                            className="bg-slate-800 border-slate-700 text-white"
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
                            <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-slate-800 border-slate-700">
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
                                className="bg-slate-800 border-slate-700 text-white"
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
                                className="bg-slate-800 border-slate-700 text-white"
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
                            className="bg-slate-800 border-slate-700 text-white"
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
                                    className="w-full h-40 object-cover rounded-lg border-2 border-slate-700"
                                />
                            </div>
                        )}
                        <Input
                            id="image"
                            type="file"
                            accept="image/*"
                            className="bg-slate-800 border-slate-700 text-white"
                            onChange={handleImageUpload}
                        />
                    </div>

                    <div className="flex gap-3 pt-4">
                        <Button
                            type="button"
                            variant="outline"
                            className="flex-1 border-slate-700 hover:bg-slate-800"
                            onClick={() => onOpenChange(false)}
                            disabled={loading}
                        >
                            Annuler
                        </Button>
                        <Button
                            type="submit"
                            className="flex-1 bg-purple-600 hover:bg-purple-700"
                            disabled={loading}
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Création...
                                </>
                            ) : (
                                'Créer l\'Événement'
                            )}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
