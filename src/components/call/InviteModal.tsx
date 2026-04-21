'use client';

/**
 * Modal d'invitation pour ajouter des participants à un appel
 * Permet d'inviter des contacts connectés ou de partager un lien/roomId
 */

import { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/src/components/ui/dialog';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/src/components/ui/tabs';
import { UserAvatar } from '@/src/components/ui/UserAvatar';
import { Search, Copy, Link2, Users, Check, Loader2 } from 'lucide-react';
import { fetchWithAuth } from '@/src/lib/auth-client';
import { toast } from 'sonner';
import { cn } from '@/src/lib/utils';

interface Contact {
  id: string;
  name: string;
  email?: string;
  avatarUrl?: string;
  isOnline: boolean;
  isInCall?: boolean;
}

interface InviteModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomId: string;
  currentParticipants: string[];
}

export function InviteModal({ isOpen, onClose, roomId, currentParticipants }: InviteModalProps) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [filteredContacts, setFilteredContacts] = useState<Contact[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [invitingIds, setInvitingIds] = useState<Set<string>>(new Set());
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
          // Filtrer les contacts déjà dans l'appel
          const available = data.contacts?.filter(
            (c: Contact) => !currentParticipants.includes(c.id)
          ) || [];
          setContacts(available);
          setFilteredContacts(available);
        }
      } catch (err) {
        console.error('Failed to load contacts:', err);
      } finally {
        setLoading(false);
      }
    };

    loadContacts();
  }, [isOpen, currentParticipants]);

  // Filtrer par recherche
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

  // Inviter un contact
  const handleInvite = useCallback(async (contactId: string) => {
    if (invitingIds.has(contactId)) return;

    setInvitingIds(prev => new Set(prev).add(contactId));

    try {
      const res = await fetchWithAuth('/api/call/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId, inviteeId: contactId }),
      });

      if (res.ok) {
        toast.success('Invitation envoyée');
        // Retirer le contact de la liste
        setContacts(prev => prev.filter(c => c.id !== contactId));
        setFilteredContacts(prev => prev.filter(c => c.id !== contactId));
      } else {
        const data = await res.json();
        toast.error(data.error || 'Erreur lors de l\'invitation');
      }
    } catch (err) {
      toast.error('Erreur réseau');
    } finally {
      setInvitingIds(prev => {
        const next = new Set(prev);
        next.delete(contactId);
        return next;
      });
    }
  }, [roomId, invitingIds]);

  // Copier le roomId
  const handleCopyRoomId = useCallback(() => {
    navigator.clipboard.writeText(roomId);
    setCopied(true);
    toast.success('Room ID copié');
    setTimeout(() => setCopied(false), 2000);
  }, [roomId]);

  // Générer un lien d'invitation
  const handleGenerateLink = useCallback(async () => {
    try {
      // Générer un token d'invitation
      const res = await fetchWithAuth('/api/call/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId, inviteeId: 'public' }),
      });

      if (res.ok) {
        const data = await res.json();
        const link = `${window.location.origin}/call/join?room=${roomId}&token=${data.joinToken}`;
        navigator.clipboard.writeText(link);
        toast.success('Lien d\'invitation copié');
      }
    } catch (err) {
      toast.error('Erreur lors de la génération du lien');
    }
  }, [roomId]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Inviter des participants
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="contacts" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="contacts">Contacts</TabsTrigger>
            <TabsTrigger value="link">Lien</TabsTrigger>
          </TabsList>

          <TabsContent value="contacts" className="space-y-4">
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
            <div className="max-h-[300px] overflow-y-auto space-y-2">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : filteredContacts.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  {searchQuery ? 'Aucun contact trouvé' : 'Aucun contact disponible'}
                </div>
              ) : (
                filteredContacts.map(contact => (
                  <div
                    key={contact.id}
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted transition-colors"
                  >
                    <UserAvatar
                      avatarUrl={contact.avatarUrl}
                      name={contact.name}
                      size="md"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{contact.name}</p>
                      <p className="text-sm text-muted-foreground truncate">
                        {contact.isOnline ? (
                          <span className="text-green-500">● En ligne</span>
                        ) : (
                          'Hors ligne'
                        )}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => handleInvite(contact.id)}
                      disabled={invitingIds.has(contact.id) || !contact.isOnline}
                    >
                      {invitingIds.has(contact.id) ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        'Inviter'
                      )}
                    </Button>
                  </div>
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="link" className="space-y-4">
            <div className="space-y-4">
              {/* Room ID */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Room ID</label>
                <div className="flex gap-2">
                  <Input
                    value={roomId}
                    readOnly
                    className="font-mono text-sm"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleCopyRoomId}
                  >
                    {copied ? (
                      <Check className="w-4 h-4 text-green-500" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Partagez cet ID pour permettre à quelqu&apos;un de rejoindre
                </p>
              </div>

              {/* Lien d'invitation */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Lien d&apos;invitation</label>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={handleGenerateLink}
                >
                  <Link2 className="w-4 h-4 mr-2" />
                  Générer et copier un lien
                </Button>
                <p className="text-xs text-muted-foreground">
                  Le lien expire après 10 minutes
                </p>
              </div>

              {/* QR Code placeholder */}
              <div className="flex justify-center p-4 bg-muted rounded-lg">
                <div className="text-center text-muted-foreground">
                  <p className="text-sm">QR Code à scanner</p>
                  <p className="text-xs mt-1">Fonctionnalité à venir</p>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
