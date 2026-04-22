'use client';

/**
 * Page de jointure d'appel par lien
 * URL: /call/join?room=xxx&token=yyy
 */

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useCallContext } from '@/src/contexts/CallContext';
import { getUser } from '@/src/lib/auth-client';
import { Button } from '@/src/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/src/components/ui/card';
import { Loader2, Phone, Users, Shield, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { fetchWithAuth } from '@/src/lib/auth-client';

function JoinCallContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const [user, setUser] = useState<ReturnType<typeof getUser>>(null);
    const ctx = useCallContext();
    const joinRoom = ctx?.joinRoom;
    const isInCall = ctx?.isInCall ?? false;

    const roomId = searchParams?.get('room') ?? null;
    const token = searchParams?.get('token') ?? null;

    const [isLoading, setIsLoading] = useState(true);
    const [isJoining, setIsJoining] = useState(false);
    const [roomInfo, setRoomInfo] = useState<{
        exists: boolean;
        hostName?: string;
        participantCount?: number;
        callType?: 'video' | 'audio';
    } | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Charger l'utilisateur
    useEffect(() => {
        setUser(getUser());
    }, []);

    // Vérifier la validité de la room
    useEffect(() => {
        if (!roomId) {
            setError('Lien invalide - Room ID manquant');
            setIsLoading(false);
            return;
        }

        const validateRoom = async () => {
            try {
                const res = await fetchWithAuth(
                    `/api/call/join?roomId=${roomId}${token ? `&token=${token}` : ''}`
                );

                if (res.ok) {
                    const data = await res.json();
                    if (data.canJoin) {
                        setRoomInfo({
                            exists: true,
                            hostName: data.hostName,
                            participantCount: data.room?.participantCount,
                            callType: data.room?.callType,
                        });
                    } else {
                        setError('Cet appel n\'est plus accessible');
                    }
                } else {
                    const data = await res.json();
                    setError(data.error || 'Impossible de rejoindre cet appel');
                }
            } catch (err) {
                setError('Erreur de connexion');
            } finally {
                setIsLoading(false);
            }
        };

        validateRoom();
    }, [roomId, token]);

    // Rediriger si déjà en appel
    useEffect(() => {
        if (isInCall && roomId) {
            toast.info('Vous êtes déjà dans un appel');
            router.push('/');
        }
    }, [isInCall, roomId, router]);

    const handleJoin = async () => {
        if (!roomId || !joinRoom) return;

        setIsJoining(true);
        try {
            await joinRoom(roomId, token || undefined);
            toast.success('Vous avez rejoint l\'appel');
            // La redirection se fait automatiquement via le CallContext
        } catch (err) {
            toast.error('Erreur lors de la connexion');
            setIsJoining(false);
        }
    };

    if (!user) {
        return (
            <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-b from-gray-900 to-gray-950">
                <Card className="w-full max-w-md">
                    <CardHeader className="text-center">
                        <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
                            <Shield className="w-8 h-8 text-primary" />
                        </div>
                        <CardTitle>Connexion requise</CardTitle>
                        <CardDescription>
                            Vous devez être connecté pour rejoindre un appel
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Button 
                            className="w-full" 
                            onClick={() => router.push(`/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`)}
                        >
                            Se connecter
                        </Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-gray-900 to-gray-950">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="w-10 h-10 animate-spin text-primary" />
                    <p className="text-white/70">Vérification du lien...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-b from-gray-900 to-gray-950">
                <Card className="w-full max-w-md">
                    <CardHeader className="text-center">
                        <div className="mx-auto w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mb-4">
                            <AlertCircle className="w-8 h-8 text-red-500" />
                        </div>
                        <CardTitle>Lien invalide</CardTitle>
                        <CardDescription>{error}</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Button className="w-full" onClick={() => router.push('/')} variant="outline">
                            Retour à l'accueil
                        </Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-b from-gray-900 to-gray-950">
            <Card className="w-full max-w-md">
                <CardHeader className="text-center">
                    <div className="mx-auto w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mb-4">
                        <Phone className="w-8 h-8 text-green-500" />
                    </div>
                    <CardTitle>Appel {roomInfo?.callType === 'video' ? 'vidéo' : 'audio'}</CardTitle>
                    <CardDescription className="space-y-1">
                        <p>Vous êtes invité à rejoindre un appel</p>
                        {roomInfo?.hostName && (
                            <p className="text-sm text-muted-foreground">
                                Organisé par {roomInfo.hostName}
                            </p>
                        )}
                        {roomInfo?.participantCount && roomInfo.participantCount > 0 && (
                            <div className="flex items-center justify-center gap-1 text-sm text-muted-foreground">
                                <Users className="w-4 h-4" />
                                <span>{roomInfo.participantCount} participant{roomInfo.participantCount > 1 ? 's' : ''} en ligne</span>
                            </div>
                        )}
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                    <Button 
                        className="w-full" 
                        size="lg"
                        onClick={handleJoin}
                        disabled={isJoining}
                    >
                        {isJoining ? (
                            <>
                                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                                Connexion...
                            </>
                        ) : (
                            <>
                                <Phone className="w-5 h-5 mr-2" />
                                Rejoindre l'appel
                            </>
                        )}
                    </Button>
                    
                    <Button 
                        className="w-full" 
                        variant="outline"
                        onClick={() => router.push('/')}
                        disabled={isJoining}
                    >
                        Ignorer
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
}

export default function JoinCallPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-gray-900 to-gray-950">
                <Loader2 className="w-10 h-10 animate-spin text-primary" />
            </div>
        }>
            <JoinCallContent />
        </Suspense>
    );
}
