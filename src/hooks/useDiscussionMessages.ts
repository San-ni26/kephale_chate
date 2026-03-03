/**
 * useDiscussionMessages
 * Gère l'envoi, la modification, la suppression et la réexpédition des messages
 * dans une discussion privée. Extrait de page.tsx pour réduire sa taille (#1).
 *
 * ── Gestion de la race condition Pusher vs HTTP ──────────────────────────────
 * Scénario problème (avant fix) :
 *   1. POST envoyé → message optimiste temp-xxx ajouté
 *   2. Serveur traite → broadcast Pusher du vrai message (realId)
 *   3. Pusher arrive AVANT la réponse HTTP → stableMessageKeysRef vide
 *      → realId ajouté en plus de temp-xxx → [temp-xxx, realId]
 *   4. HTTP arrive → replaceTempMessage → temp-xxx remplacé par realId
 *      → [realId, realId] → flash puis déduplication
 *
 * Solution : `pendingTempIdsRef` = Set des tempId actuellement en transit.
 *   - Peuplé AVANT le POST (synchrone, aucune latence)
 *   - Vidé dans replaceTempMessage (soit par HTTP, soit marqué par Pusher)
 *   - onNewMessage dans page.tsx consulte ce Set pour savoir si un temp attend
 * ─────────────────────────────────────────────────────────────────────────────
 */
'use client';

import { useState, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import { fetchWithAuth } from '@/src/lib/auth-client';
import { sendWithOfflineQueue } from '@/src/lib/offline-queue';
import { addMessageToCache, removeMessageFromCache } from '@/src/lib/api-cache';
import { encryptMessage } from '@/src/lib/crypto';

export interface MessageAttachment {
    filename: string;
    type: string;
    data: string;
}

export interface MessagePayload {
    encryptedContent: string;
    attachments?: MessageAttachment[];
}

export interface DiscussionMessage {
    id: string;
    content: string;
    senderId: string;
    createdAt: string;
    updatedAt: string;
    isEdited: boolean;
    attachments?: MessageAttachment[];
    sender: {
        id: string;
        name: string;
        email: string;
        publicKey: string;
    };
}

interface UseDiscussionMessagesOptions {
    conversationId: string;
    currentUser: { id: string; name: string | null; email: string; publicKey: string } | null;
    otherUser: { id: string; name: string | null; email: string; publicKey: string } | undefined;
    privateKey: string | null;
    setMessages: React.Dispatch<React.SetStateAction<DiscussionMessage[]>>;
    scrollToBottom: () => void;
    setShowPasswordDialog: (v: boolean) => void;
    stopTyping: (id: string) => void;
}

export function useDiscussionMessages({
    conversationId,
    currentUser,
    otherUser,
    privateKey,
    setMessages,
    scrollToBottom,
    setShowPasswordDialog,
    stopTyping,
}: UseDiscussionMessagesOptions) {
    const [sending, setSending] = useState(false);
    const [failedMessagePayloads, setFailedMessagePayloads] = useState<
        Map<string, MessagePayload>
    >(new Map());

    // Map realId → tempId : utilisé pour les clés React stables et la dédup Pusher après HTTP
    const stableMessageKeysRef = useRef<Map<string, string>>(new Map());
    // Map realId → timestamp optimiste : garde l'heure d'affichage stable visuellement
    const stableMessageTimestampsRef = useRef<Map<string, string>>(new Map());

    /**
     * Set des tempId actuellement "en vol" (POST envoyé, réponse HTTP pas encore reçue).
     * CLEF DE LA FIX : peuplé synchroniquement AVANT le POST, donc disponible
     * immédiatement quand Pusher arrive. onNewMessage le consulte pour savoir
     * si un vrai message doit remplacer un temp plutôt que s'ajouter à la liste.
     */
    const pendingTempIdsRef = useRef<Set<string>>(new Set());

    /** Convertit un File en base64 dataURL */
    const fileToBase64 = useCallback(async (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }, []);

    /**
     * Remplace le message temporaire par le vrai message serveur.
     * Gère le cas "Pusher déjà arrivé" : si tempId n'est plus en liste
     * mais realId y est déjà (Pusher l'a ajouté avant nous), on n'écrase rien.
     */
    const replaceTempMessage = useCallback(
        (tempId: string, realMessage: DiscussionMessage, optimisticCreatedAt: string) => {
            // Marquer dans les refs stables AVANT le setState
            stableMessageKeysRef.current.set(realMessage.id, tempId);
            stableMessageTimestampsRef.current.set(realMessage.id, optimisticCreatedAt);
            // Retirer du Set "en vol"
            pendingTempIdsRef.current.delete(tempId);

            setMessages(prev => {
                const hasTempInList = prev.some(m => m.id === tempId);
                const hasRealAlready = prev.some(m => m.id === realMessage.id);

                if (!hasTempInList && hasRealAlready) {
                    // Pusher est arrivé en premier et a déjà ajouté realId à la place de temp
                    // → rien à faire, la liste est déjà correcte
                    return prev;
                }
                if (!hasTempInList && !hasRealAlready) {
                    // Cas improbable : temp disparu pour une autre raison
                    return [...prev, realMessage];
                }
                // Cas normal : remplacer temp par real
                return prev.map(m => (m.id === tempId ? realMessage : m));
            });

            addMessageToCache(
                `/api/conversations/${conversationId}/messages?limit=30`,
                realMessage
            );
        },
        [conversationId, setMessages]
    );

    /** Envoie un message texte + pièces jointes */
    const handleSendMessage = useCallback(
        async (
            messageText: string,
            selectedFiles: { file: File; previewUrl: string }[],
            revokeAllFileUrls: () => void
        ) => {
            if (!messageText.trim() && selectedFiles.length === 0) return;
            if (!currentUser || !otherUser || !privateKey) {
                if (!privateKey) setShowPasswordDialog(true);
                return;
            }

            setSending(true);
            const currentFiles = [...selectedFiles];
            revokeAllFileUrls();
            if (conversationId) stopTyping(conversationId);

            const tempId = `temp-${Date.now()}`;
            // ← Ajouter dans le Set AVANT le POST (synchrone, atomique)
            pendingTempIdsRef.current.add(tempId);
            let payload: MessagePayload | null = null;

            try {
                const attachments: MessageAttachment[] = [];
                for (const { file } of currentFiles) {
                    const ext = file.name.split('.').pop()?.toLowerCase() || '';
                    let fileType = 'IMAGE';
                    if (['pdf'].includes(ext)) fileType = 'PDF';
                    else if (['doc', 'docx'].includes(ext)) fileType = 'WORD';
                    else if (['webm', 'mp3', 'ogg', 'm4a', 'wav'].includes(ext)) fileType = 'AUDIO';
                    const base64Data = await fileToBase64(file);
                    attachments.push({ filename: file.name, type: fileType, data: base64Data });
                }

                const cipherText = encryptMessage(
                    messageText.trim() || '',
                    privateKey,
                    otherUser.publicKey
                );
                payload = {
                    encryptedContent: cipherText,
                    attachments: attachments.length > 0 ? attachments : undefined,
                };

                const optimisticCreatedAt = new Date().toISOString();
                const optimisticMessage: DiscussionMessage = {
                    id: tempId,
                    content: cipherText,
                    senderId: currentUser.id,
                    createdAt: optimisticCreatedAt,
                    updatedAt: optimisticCreatedAt,
                    isEdited: false,
                    attachments,
                    sender: {
                        id: currentUser.id,
                        name: currentUser.name || '',
                        email: currentUser.email || '',
                        publicKey: currentUser.publicKey || '',
                    },
                };

                setMessages(prev => [...prev, optimisticMessage]);
                scrollToBottom();

                const url = `/api/conversations/${conversationId}/messages`;
                const bodyStr = JSON.stringify({
                    content: cipherText,
                    attachments: attachments.length > 0 ? attachments : undefined,
                });
                const result = await sendWithOfflineQueue(url, { method: 'POST', body: bodyStr }, tempId, (u, opts) =>
                    fetchWithAuth(u, opts as RequestInit)
                );

                if (result.queued) {
                    toast.info('Message en attente (hors ligne)');
                    pendingTempIdsRef.current.delete(tempId); // Plus en vol, en queue
                    if (payload) setFailedMessagePayloads(prev => new Map(prev).set(tempId, payload!));
                } else if (result.ok && result.response) {
                    const data = await result.response.json();
                    if (data.message) replaceTempMessage(tempId, data.message, optimisticCreatedAt);
                    else pendingTempIdsRef.current.delete(tempId);
                } else if (result.response) {
                    const error = await result.response.json();
                    toast.error(error.error || "Erreur d'envoi");
                    pendingTempIdsRef.current.delete(tempId);
                    if (payload) setFailedMessagePayloads(prev => new Map(prev).set(tempId, payload!));
                }
            } catch (error) {
                console.error('Send message error:', error);
                toast.error("Erreur d'envoi du message");
                pendingTempIdsRef.current.delete(tempId);
                if (payload) setFailedMessagePayloads(prev => new Map(prev).set(tempId, payload!));
            } finally {
                setSending(false);
            }
        },
        [conversationId, currentUser, otherUser, privateKey, setMessages, scrollToBottom, setShowPasswordDialog, stopTyping, fileToBase64, replaceTempMessage]
    );

    /** Envoie un message audio */
    const sendAudioMessage = useCallback(
        async (audioFile: File) => {
            if (!currentUser || !otherUser || !privateKey) {
                toast.error('Clé de chiffrement manquante');
                return;
            }
            setSending(true);
            const tempId = `temp-${Date.now()}`;
            // ← Ajouter dans le Set AVANT le POST
            pendingTempIdsRef.current.add(tempId);
            let payload: MessagePayload | null = null;

            try {
                const base64Data = await fileToBase64(audioFile);
                const attachment: MessageAttachment = { filename: audioFile.name, type: 'AUDIO', data: base64Data };
                const encryptedContent = encryptMessage('', privateKey, otherUser.publicKey);
                payload = { encryptedContent, attachments: [attachment] };

                const optimisticCreatedAt = new Date().toISOString();
                const optimisticMessage: DiscussionMessage = {
                    id: tempId,
                    content: encryptedContent,
                    senderId: currentUser.id,
                    createdAt: optimisticCreatedAt,
                    updatedAt: optimisticCreatedAt,
                    isEdited: false,
                    attachments: [attachment],
                    sender: {
                        id: currentUser.id,
                        name: currentUser.name || '',
                        email: currentUser.email || '',
                        publicKey: currentUser.publicKey || '',
                    },
                };

                setMessages(prev => [...prev, optimisticMessage]);

                const url = `/api/conversations/${conversationId}/messages`;
                const bodyStr = JSON.stringify({ content: encryptedContent, attachments: [attachment] });
                const result = await sendWithOfflineQueue(url, { method: 'POST', body: bodyStr }, tempId, (u, opts) =>
                    fetchWithAuth(u, opts as RequestInit)
                );

                if (result.queued) {
                    toast.info('Message vocal en attente (hors ligne)');
                    pendingTempIdsRef.current.delete(tempId);
                    if (payload) setFailedMessagePayloads(prev => new Map(prev).set(tempId, payload!));
                } else if (result.ok && result.response) {
                    const data = await result.response.json();
                    if (data.message) replaceTempMessage(tempId, data.message, optimisticCreatedAt);
                    else pendingTempIdsRef.current.delete(tempId);
                    scrollToBottom();
                } else if (result.response) {
                    toast.error("Erreur d'envoi du message vocal");
                    pendingTempIdsRef.current.delete(tempId);
                    if (payload) setFailedMessagePayloads(prev => new Map(prev).set(tempId, payload!));
                }
            } catch (error) {
                console.error('Send audio error:', error);
                toast.error("Erreur d'envoi du message vocal");
                pendingTempIdsRef.current.delete(tempId);
                if (payload) setFailedMessagePayloads(prev => new Map(prev).set(tempId, payload!));
            } finally {
                setSending(false);
            }
        },
        [conversationId, currentUser, otherUser, privateKey, setMessages, scrollToBottom, fileToBase64, replaceTempMessage]
    );

    /** Modifie un message existant */
    const handleEditMessage = useCallback(
        async (messageId: string, editContent: string, onEditCancel: () => void) => {
            if (!currentUser || !otherUser || !privateKey || !editContent.trim()) return;
            try {
                const encryptedEdit = encryptMessage(editContent.trim(), privateKey, otherUser.publicKey);
                setMessages(prev =>
                    prev.map(m =>
                        m.id === messageId ? { ...m, content: encryptedEdit, isEdited: true } : m
                    )
                );
                onEditCancel();

                const res = await fetchWithAuth(`/api/messages/${messageId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ content: encryptedEdit }),
                });
                if (!res.ok) {
                    toast.error('Erreur lors de la modification');
                }
            } catch {
                toast.error('Erreur lors de la modification');
            }
        },
        [currentUser, otherUser, privateKey, setMessages]
    );

    /** Supprime un message */
    const handleDeleteMessage = useCallback(
        async (messageId: string) => {
            try {
                setMessages(prev => prev.filter(m => m.id !== messageId));
                removeMessageFromCache(
                    `/api/conversations/${conversationId}/messages?limit=30`,
                    messageId
                );
                const res = await fetchWithAuth(`/api/messages/${messageId}`, { method: 'DELETE' });
                if (!res.ok) {
                    toast.error('Erreur lors de la suppression');
                }
            } catch {
                toast.error('Erreur lors de la suppression');
            }
        },
        [conversationId, setMessages]
    );

    /** Réexpédie un message échoué */
    const handleRetryMessage = useCallback(
        async (tempId: string) => {
            const payload = failedMessagePayloads.get(tempId);
            if (!payload) return;

            setFailedMessagePayloads(prev => {
                const next = new Map(prev);
                next.delete(tempId);
                return next;
            });

            pendingTempIdsRef.current.add(tempId);

            try {
                const url = `/api/conversations/${conversationId}/messages`;
                const bodyStr = JSON.stringify({
                    content: payload.encryptedContent,
                    attachments: payload.attachments,
                });
                const res = await fetchWithAuth(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: bodyStr,
                });
                if (res.ok) {
                    const data = await res.json();
                    if (data.message) {
                        replaceTempMessage(tempId, data.message, new Date().toISOString());
                        scrollToBottom();
                    } else {
                        pendingTempIdsRef.current.delete(tempId);
                    }
                } else {
                    toast.error('Échec de la réexpédition');
                    pendingTempIdsRef.current.delete(tempId);
                    setFailedMessagePayloads(prev => new Map(prev).set(tempId, payload));
                }
            } catch {
                toast.error('Échec de la réexpédition');
                pendingTempIdsRef.current.delete(tempId);
                setFailedMessagePayloads(prev => new Map(prev).set(tempId, payload));
            }
        },
        [conversationId, failedMessagePayloads, setMessages, scrollToBottom, replaceTempMessage]
    );

    return {
        sending,
        failedMessagePayloads,
        // Refs exposés pour page.tsx :
        //  - stableMessageKeysRef   : realId → tempId (clés React stables + dédup post-HTTP)
        //  - stableMessageTimestampsRef : realId → timestamp optimiste
        //  - pendingTempIdsRef      : tempIds en vol (dédup AVANT réponse HTTP)
        stableMessageKeysRef,
        stableMessageTimestampsRef,
        pendingTempIdsRef,
        handleSendMessage,
        sendAudioMessage,
        handleEditMessage,
        handleDeleteMessage,
        handleRetryMessage,
    };
}
