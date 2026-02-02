'use client';

import { useState, useEffect } from 'react';
import { Plus, UserCircle } from 'lucide-react';
import { Button } from '@/src/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/src/components/ui/dialog';
import { Input } from '@/src/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/src/components/ui/avatar';
import { UserSearch } from '@/src/components/chat/UserSearch';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { fetchWithAuth } from '@/src/lib/auth-client';

export function TopNav() {
    const router = useRouter();
    const [user, setUser] = useState<any>(null);
    const [searchEmail, setSearchEmail] = useState('');
    const [loading, setLoading] = useState(false);

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
        <header className="fixed top-0 w-full left-0 bg-slate-900 border-b border-slate-800 z-50 h-16 flex items-center justify-between px-4">
            <div className="flex items-center gap-3">
                <Avatar className="h-9 w-9 border border-slate-700">
                    <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${user?.name || 'User'}`} />
                    <AvatarFallback><UserCircle className="w-6 h-6" /></AvatarFallback>
                </Avatar>
                <span className="font-semibold text-slate-100">{user?.name || 'Chargement...'}</span>
            </div>

            <div className="flex items-center gap-2">
                <UserSearch />

                <Dialog>
                    <DialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="text-slate-400 hover:text-white">
                            <Plus className="w-5 h-5" />
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="bg-slate-900 border-slate-800 text-slate-100">
                        <DialogHeader>
                            <DialogTitle>Nouvelle discussion</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 pt-4">
                            <div className="space-y-2">
                                <Input
                                    placeholder="Email de l'utilisateur"
                                    value={searchEmail}
                                    onChange={(e) => setSearchEmail(e.target.value)}
                                    className="bg-slate-800 border-slate-700"
                                />
                            </div>
                            <Button
                                onClick={handleStartChat}
                                className="w-full bg-blue-600 hover:bg-blue-700"
                                disabled={loading || !searchEmail}
                            >
                                {loading ? 'Recherche...' : 'Démarrer la discussion'}
                            </Button>
                        </div>
                    </DialogContent>
                </Dialog>
            </div>
        </header>
    );
}
