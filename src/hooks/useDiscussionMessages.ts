/**
 * useDiscussionMessages
 * Gère l'envoi, la modification, la suppression et la réexpédition des messages
 * dans une discussion privée. Extrait de page.tsx pour réduire sa taille (#1).
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

    // Stable refs pour les timestamps des messages optimistes
    const stableMessageKeysRef = useRef<Map<string, string>>(new Map());
    const stableMessageTimestampsRef = useRef<Map<string, string>>(new Map());

    /** Convertit un File en base64 dataURL */
    const fileToBase64 = useCallback(async (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }, []);

    /** Remplace le message temporaire par le vrai message serveur */
    const replaceTempMessage = useCallback(
        (tempId: string, realMessage: DiscussionMessage, optimisticCreatedAt: string) => {
            stableMessageKeysRef.current.set(realMessage.id, tempId);
            stableMessageTimestampsRef.current.set(realMessage.id, optimisticCreatedAt);
            setMessages(prev => prev.map(m => (m.id === tempId ? realMessage : m)));
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
                    if (payload) setFailedMessagePayloads(prev => new Map(prev).set(tempId, payload!));
                } else if (result.ok && result.response) {
                    const data = await result.response.json();
                    if (data.message) replaceTempMessage(tempId, data.message, optimisticCreatedAt);
                } else if (result.response) {
                    const error = await result.response.json();
                    toast.error(error.error || "Erreur d'envoi");
                    if (payload) setFailedMessagePayloads(prev => new Map(prev).set(tempId, payload!));
                }
            } catch (error) {
                console.error('Send message error:', error);
                toast.error("Erreur d'envoi du message");
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
                    if (payload) setFailedMessagePayloads(prev => new Map(prev).set(tempId, payload!));
                } else if (result.ok && result.response) {
                    const data = await result.response.json();
                    if (data.message) replaceTempMessage(tempId, data.message, optimisticCreatedAt);
                    scrollToBottom();
                } else if (result.response) {
                    toast.error("Erreur d'envoi du message vocal");
                    if (payload) setFailedMessagePayloads(prev => new Map(prev).set(tempId, payload!));
                }
            } catch (error) {
                console.error('Send audio error:', error);
                toast.error("Erreur d'envoi du message vocal");
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
                        setMessages(prev => prev.map(m => (m.id === tempId ? data.message : m)));
                        addMessageToCache(
                            `/api/conversations/${conversationId}/messages?limit=30`,
                            data.message
                        );
                        scrollToBottom();
                    }
                } else {
                    toast.error('Échec de la réexpédition');
                    setFailedMessagePayloads(prev => new Map(prev).set(tempId, payload));
                }
            } catch {
                toast.error('Échec de la réexpédition');
                setFailedMessagePayloads(prev => new Map(prev).set(tempId, payload));
            }
        },
        [conversationId, failedMessagePayloads, setMessages, scrollToBottom]
    );

    return {
        sending,
        failedMessagePayloads,
        stableMessageTimestampsRef,
        handleSendMessage,
        sendAudioMessage,
        handleEditMessage,
        handleDeleteMessage,
        handleRetryMessage,
    };
}
