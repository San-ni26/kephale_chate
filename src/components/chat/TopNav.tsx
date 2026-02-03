'use client';

import { useState, useEffect } from 'react';
import { Plus, UserCircle, Menu } from 'lucide-react';
import { Button } from '@/src/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/src/components/ui/dialog';
import { Input } from '@/src/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/src/components/ui/avatar';
import { UserSearch } from '@/src/components/chat/UserSearch';
import { toast } from 'sonner';
import { useRouter, usePathname } from 'next/navigation';
import { fetchWithAuth } from '@/src/lib/auth-client';
import OrganizationRequestDialog from '@/src/components/organizations/OrganizationRequestDialog';

export function TopNav() {
    const router = useRouter();
    const pathname = usePathname();
    const [user, setUser] = useState<any>(null);
    const [searchEmail, setSearchEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [showOrgRequestDialog, setShowOrgRequestDialog] = useState(false);

    const isOrganizationsPage = pathname?.startsWith('/chat/organizations');

    useEffect(() => {
        // Fetch user profile with authentication
        const fetchProfile = async () => {
            try {
                const response = await fetchWithAuth('/api/users/profile');
                if (response.ok) {
                    const data = await response.json();
                    setUser(data.profile);
                }
            } catch (error) {
                console.error('Failed to fetch profile', error);
            }
        };
        fetchProfile();
    }, []);

    const handleStartChat = async () => {
        if (!searchEmail) return;
        setLoading(true);

        try {
            const response = await fetchWithAuth('/api/conversations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ otherUserEmail: searchEmail }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Erreur lors de la création');
            }

            toast.success(data.message);
            setSearchEmail('');
            // Redirect to the conversation
            if (data.conversation?.id) {
                router.push(`/chat/discussion/${data.conversation.id}`);
            } else if (data.conversationId) {
                router.push(`/chat/discussion/${data.conversationId}`);
            }
        } catch (error: any) {
            toast.error(error.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <header className="fixed top-0 w-full left-0 bg-background border-b border-border z-50 h-16 flex items-center justify-between px-4">
            {isOrganizationsPage ? (
                // Organizations Header View
                <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-3">
                        <span className="font-semibold text-lg text-foreground">Organisations</span>
                    </div>
                </div>
            ) : (
                // Default Chat Header View
                <div className="flex items-center gap-3">
                    <Avatar className="h-9 w-9 border border-border">
                        <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${user?.name || 'User'}`} />
                        <AvatarFallback><UserCircle className="w-6 h-6" /></AvatarFallback>
                    </Avatar>
                    <span className="font-semibold text-foreground">{user?.name || 'Chargement...'}</span>
                </div>
            )}

            <div className="flex items-center gap-2">
                {!isOrganizationsPage && <UserSearch />}

                <Dialog>
                    <DialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground hover:bg-muted">
                            <Plus className="w-5 h-5" />
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="bg-background border-border text-foreground">
                        <DialogHeader>
                            <DialogTitle>{isOrganizationsPage ? 'Nouvelle Organisation' : 'Nouvelle discussion'}</DialogTitle>
                        </DialogHeader>
                        {isOrganizationsPage ? (
                            <div className="py-4">
                                <p className="mb-4 text-sm text-muted-foreground">Voulez-vous créer une nouvelle organisation ?</p>
                                <Button onClick={() => setShowOrgRequestDialog(true)} className="w-full">
                                    Créer une organisation
                                </Button>
                            </div>
                        ) : (
                            <div className="space-y-4 pt-4">
                                <div className="space-y-2">
                                    <Input
                                        placeholder="Email de l'utilisateur"
                                        value={searchEmail}
                                        onChange={(e) => setSearchEmail(e.target.value)}
                                        className="bg-muted border-border"
                                    />
                                </div>
                                <Button
                                    onClick={handleStartChat}
                                    className="w-full"
                                    disabled={loading || !searchEmail}
                                >
                                    {loading ? 'Recherche...' : 'Démarrer la discussion'}
                                </Button>
                            </div>
                        )}
                    </DialogContent>
                </Dialog>

                {/* Independent Dialog for Org Request to avoid nesting issues if needed, but for now trigger from above */}
                <OrganizationRequestDialog
                    open={showOrgRequestDialog}
                    onOpenChange={setShowOrgRequestDialog}
                    onSuccess={() => {
                        setShowOrgRequestDialog(false);
                        window.location.reload(); // Simple reload to refresh data
                    }}
                />
            </div>
        </header>
    );
}
