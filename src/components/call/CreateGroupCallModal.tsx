'use client';

/**
 * Modal de création d'appel groupe
 * Permet de sélectionner plusieurs contacts et générer un lien de partage
 */

import { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/src/components/ui/dialog';
import { Button } from '@/src/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/src/components/ui/tabs';
import { Input } from '@/src/components/ui/input';
import { UserAvatar } from '@/src/components/ui/UserAvatar';
import { Search, Copy, Check, Video, Phone, Users, Link2, QrCode, Share2, Loader2 } from 'lucide-react';
import { fetchWithAuth } from '@/src/lib/auth-client';
import { toast } from 'sonner';
import { cn } from '@/src/lib/utils';

interface Contact {
    id: string;
    name: string;
    email?: string;
    avatarUrl?: string;
    isOnline: boolean;
}

interface CreateGroupCallModalProps {
    isOpen: boolean;
    onClose: () => void;
    onRoomCreated?: (roomId: string, link: string) => void;
}

export function CreateGroupCallModal({ isOpen, onClose, onRoomCreated }: CreateGroupCallModalProps) {
    const [activeTab, setActiveTab] = useState('contacts');
    const [callType, setCallType] = useState<'video' | 'audio'>('video');
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [filteredContacts, setFilteredContacts] = useState<Contact[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(false);
    const [creating, setCreating] = useState(false);
    const [roomData, setRoomData] = useState<{
        roomId: string;
        publicLink: string;
        joinToken: string;
    } | null>(null);
    const [copied, setCopied] = useState(false);

    // Charger les contacts
    useEffect(() => {
        if (!isOpen) return;

        const loadContacts = async () => {
            setLoading(true);
            try {
                const res = await fetchWithAuth('/api/contacts?onlineOnly=true');
                if (res.ok) {
                    const data = await res.json();
                    setContacts(data.contacts || []);
                    setFilteredContacts(data.contacts || []);
                }
            } catch (err) {
                console.error('Failed to load contacts:', err);
            } finally {
                setLoading(false);
            }
        };

        loadContacts();
    }, [isOpen]);

    // Filtrer les contacts
    useEffect(() => {
        if (!searchQuery.trim()) {
            setFilteredContacts(contacts);
            return;
        }

        const query = searchQuery.toLowerCase();
        const filtered = contacts.filter(
            c =>
                c.name.toLowerCase().includes(query) ||
                c.email?.toLowerCase().includes(query)
        );
        setFilteredContacts(filtered);
    }, [searchQuery, contacts]);

    // Sélectionner/désélectionner un contact
    const toggleContact = useCallback((contactId: string) => {
        setSelectedContacts(prev => {
            const next = new Set(prev);
            if (next.has(contactId)) {
                next.delete(contactId);
            } else {
                next.add(contactId);
            }
            return next;
        });
    }, []);

    // Créer la room
    const handleCreateRoom = useCallback(async () => {
        setCreating(true);
        try {
            const res = await fetchWithAuth('/api/call/room/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    callType,
                    initialInvitees: Array.from(selectedContacts),
                }),
            });

            if (res.ok) {
                const data = await res.json();
                setRoomData({
                    roomId: data.roomId,
                    publicLink: data.publicLink,
                    joinToken: data.joinToken,
                });
                setActiveTab('share');
                onRoomCreated?.(data.roomId, data.publicLink);
                toast.success('Appel groupe créé');
            } else {
                const data = await res.json();
                toast.error(data.error || 'Erreur lors de la création');
            }
        } catch (err) {
            toast.error('Erreur réseau');
        } finally {
            setCreating(false);
        }
    }, [callType, selectedContacts, onRoomCreated]);

    // Copier le lien
    const handleCopyLink = useCallback(() => {
        if (!roomData?.publicLink) return;
        navigator.clipboard.writeText(roomData.publicLink);
        setCopied(true);
        toast.success('Lien copié');
        setTimeout(() => setCopied(false), 2000);
    }, [roomData]);

    // Partager natif
    const handleShare = useCallback(async () => {
        if (!roomData?.publicLink) return;
        
        if (navigator.share) {
            try {
                await navigator.share({
                    title: 'Rejoignez mon appel',
                    text: `Rejoignez mon appel ${callType === 'video' ? 'vidéo' : 'audio'}`,
                    url: roomData.publicLink,
                });
            } catch {
                // User cancelled
            }
        } else {
            handleCopyLink();
        }
    }, [roomData, callType, handleCopyLink]);

    // Réinitialiser quand le modal se ferme
    useEffect(() => {
        if (!isOpen) {
            setActiveTab('contacts');
            setSelectedContacts(new Set());
            setRoomData(null);
            setSearchQuery('');
        }
    }, [isOpen]);

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Users className="w-5 h-5" />
                        Nouvel appel groupe
                    </DialogTitle>
                    <DialogDescription>
                        Créez un appel et invitez vos contacts
                    </DialogDescription>
                </DialogHeader>

                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="contacts" disabled={!!roomData}>
                            Participants
                        </TabsTrigger>
                        <TabsTrigger value="share" disabled={!roomData}>
                            Partager
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="contacts" className="space-y-4">
                        {/* Type d'appel */}
                        <div className="flex gap-2">
                            <Button
                                type="button"
                                variant={callType === 'video' ? 'default' : 'outline'}
                                className="flex-1"
                                onClick={() => setCallType('video')}
                            >
                                <Video className="w-4 h-4 mr-2" />
                                Vidéo
                            </Button>
                            <Button
                                type="button"
                                variant={callType === 'audio' ? 'default' : 'outline'}
                                className="flex-1"
                                onClick={() => setCallType('audio')}
                            >
                                <Phone className="w-4 h-4 mr-2" />
                                Audio
                            </Button>
                        </div>

                        {/* Recherche */}
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input
                                placeholder="Rechercher un contact..."
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                className="pl-9"
                            />
                        </div>

                        {/* Liste des contacts */}
                        <div className="max-h-[250px] overflow-y-auto space-y-1 border rounded-lg p-2">
                            {loading ? (
                                <div className="flex items-center justify-center py-8">
                                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                                </div>
                            ) : filteredContacts.length === 0 ? (
                                <div className="text-center py-8 text-muted-foreground">
                                    {searchQuery ? 'Aucun contact trouvé' : 'Aucun contact en ligne'}
                                </div>
                            ) : (
                                filteredContacts.map(contact => (
                                    <button
                                        key={contact.id}
                                        type="button"
                                        onClick={() => toggleContact(contact.id)}
                                        className={cn(
                                            'w-full flex items-center gap-3 p-2 rounded-lg transition-colors text-left',
                                            selectedContacts.has(contact.id)
                                                ? 'bg-primary/10 border border-primary/30'
                                                : 'hover:bg-muted border border-transparent'
                                        )}
                                    >
                                        <div className="relative">
                                            <UserAvatar
                                                avatarUrl={contact.avatarUrl}
                                                name={contact.name}
                                                size="md"
                                            />
                                            {contact.isOnline && (
                                                <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-background" />
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-medium truncate">{contact.name}</p>
                                            <p className="text-xs text-muted-foreground">
                                                {contact.isOnline ? 'En ligne' : 'Hors ligne'}
                                            </p>
                                        </div>
                                        
                                        {selectedContacts.has(contact.id) && (
                                            <Check className="w-5 h-5 text-primary" />
                                        )}
                                    </button>
                                ))
                            )}
                        </div>

                        {/* Sélection */}
                        {selectedContacts.size > 0 && (
                            <p className="text-sm text-muted-foreground">
                                {selectedContacts.size} contact{selectedContacts.size > 1 ? 's' : ''} sélectionné{selectedContacts.size > 1 ? 's' : ''}
                            </p>
                        )}

                        {/* Bouton créer */}
                        <Button
                            className="w-full"
                            size="lg"
                            onClick={handleCreateRoom}
                            disabled={creating}
                        >
                            {creating ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Création...
                                </>
                            ) : (
                                <>
                                    <Users className="w-4 h-4 mr-2" />
                                    Créer l'appel {selectedContacts.size > 0 && `(${selectedContacts.size})`}
                                </>
                            )}
                        </Button>
                    </TabsContent>

                    <TabsContent value="share" className="space-y-4">
                        {roomData && (
                            <>
                                {/* Lien */}
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Lien de partage</label>
                                    <div className="flex gap-2">
                                        <Input
                                            value={roomData.publicLink}
                                            readOnly
                                            className="font-mono text-xs"
                                        />
                                        <Button
                                            variant="outline"
                                            size="icon"
                                            onClick={handleCopyLink}
                                        >
                                            {copied ? (
                                                <Check className="w-4 h-4 text-green-500" />
                                            ) : (
                                                <Copy className="w-4 h-4" />
                                            )}
                                        </Button>
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                        Partagez ce lien pour inviter des participants
                                    </p>
                                </div>

                                {/* Room ID */}
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Room ID</label>
                                    <div className="p-3 bg-muted rounded-lg font-mono text-sm text-center">
                                        {roomData.roomId}
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                        Les participants peuvent aussi rejoindre avec cet ID
                                    </p>
                                </div>

                                {/* QR Code placeholder */}
                                <div className="flex justify-center p-4 bg-muted rounded-lg">
                                    <div className="text-center text-muted-foreground">
                                        <QrCode className="w-12 h-12 mx-auto mb-2 opacity-50" />
                                        <p className="text-sm">QR Code à scanner</p>
                                        <p className="text-xs mt-1">Fonctionnalité à venir</p>
                                    </div>
                                </div>

                                {/* Boutons d'action */}
                                <div className="flex gap-2">
                                    <Button
                                        className="flex-1"
                                        onClick={handleShare}
                                    >
                                        <Share2 className="w-4 h-4 mr-2" />
                                        Partager
                                    </Button>
                                    
                                    <Button
                                        variant="outline"
                                        className="flex-1"
                                        onClick={onClose}
                                    >
                                        Fermer
                                    </Button>
                                </div>
                            </>
                        )}
                    </TabsContent>
                </Tabs>
            </DialogContent>
        </Dialog>
    );
}
