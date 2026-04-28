/**
 * useDiscussionMessages
 * Gère l'envoi, la modification, la suppression et la réexpédition des messages
 * dans une discussion privée.
 * 
 * Approche : utilisation de localStorage pour persister les messages temporaires
 * entre les sessions. Quand on envoie un message, il est sauvegardé localement.
 * Quand le serveur répond, le message temporaire est remplacé par le vrai.
 */
'use client';

import { useState, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { fetchWithAuth, getAuthHeader } from '@/src/lib/auth-client';
import { sendWithOfflineQueue } from '@/src/lib/offline-queue';
import { addMessageToCache, removeMessageFromCache } from '@/src/lib/api-cache';
import { encryptMessage } from '@/src/lib/crypto';
import { compressAudioBlob } from '@/src/lib/audio-utils';
import { compressImage, needsCompression } from '@/src/lib/image-compression';

export interface MessageAttachment {
    id?: string;
    filename: string;
    type: string;
    data?: string;
    url?: string;
    storageKey?: string;
}

// URL extraction regex
const URL_REGEX = /(https?:\/\/[^\s<]+[^\s<.,:;!?])/gi;

// Clé localStorage pour les messages temporaires
const TEMP_MESSAGES_KEY = 'chat_temp_messages';

// Sauvegarder les messages temporaires dans localStorage
function saveTempMessages(conversationId: string, messages: DiscussionMessage[]) {
    try {
        const allTemps = JSON.parse(localStorage.getItem(TEMP_MESSAGES_KEY) || '{}');
        const tempsForConv = messages.filter(m => m.id.startsWith('temp-'));
        allTemps[conversationId] = tempsForConv;
        localStorage.setItem(TEMP_MESSAGES_KEY, JSON.stringify(allTemps));
    } catch {
        // Ignorer les erreurs localStorage
    }
}

// Récupérer les messages temporaires depuis localStorage
function getTempMessages(conversationId: string): DiscussionMessage[] {
    try {
        const allTemps = JSON.parse(localStorage.getItem(TEMP_MESSAGES_KEY) || '{}');
        return allTemps[conversationId] || [];
    } catch {
        return [];
    }
}

// Supprimer un message temporaire du localStorage
function removeTempMessage(conversationId: string, tempId: string) {
    try {
        const allTemps = JSON.parse(localStorage.getItem(TEMP_MESSAGES_KEY) || '{}');
        if (allTemps[conversationId]) {
            allTemps[conversationId] = allTemps[conversationId].filter((m: DiscussionMessage) => m.id !== tempId);
            localStorage.setItem(TEMP_MESSAGES_KEY, JSON.stringify(allTemps));
        }
    } catch {
        // Ignorer les erreurs localStorage
    }
}

function extractUrls(text: string): string[] {
    const matches = text.match(URL_REGEX);
    return matches ? [...new Set(matches)] : [];
}

export interface MessagePayload {
    encryptedContent: string;
    attachments?: MessageAttachment[];
    replyToId?: string;
}

export interface DiscussionMessage {
    id: string;
    content: string;
    senderId: string;
    createdAt: string;
    updatedAt: string;
    isEdited: boolean;
    isRead?: boolean;
    replyTo?: {
        id: string;
        content: string;
        senderName: string;
    } | null;
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
    // Utiliser un Set pour tracker les messages en cours d'envoi (permet l'envoi multiple)
    const [sendingIds, setSendingIds] = useState<Set<string>>(new Set());
    const [failedMessagePayloads, setFailedMessagePayloads] = useState<
        Map<string, MessagePayload>
    >(new Map());

    // Charger les messages temporaires sauvegardés au démarrage
    useEffect(() => {
        if (!conversationId) return;
        
        const savedTemps = getTempMessages(conversationId);
        if (savedTemps.length > 0) {
            // Fusionner avec les messages existants sans doublons
            setMessages(prev => {
                const existingIds = new Set(prev.map(m => m.id));
                const newTemps = savedTemps.filter(m => !existingIds.has(m.id));
                return [...prev, ...newTemps];
            });
        }
    }, [conversationId, setMessages]);

    // Helper pour marquer un message comme "en cours d'envoi"
    const markSending = useCallback((tempId: string, isSending: boolean) => {
        setSendingIds(prev => {
            const next = new Set(prev);
            if (isSending) {
                next.add(tempId);
            } else {
                next.delete(tempId);
            }
            return next;
        });
    }, []);

    // Vérifier si un message spécifique est en cours d'envoi
    const isSending = useCallback((tempId: string) => {
        return sendingIds.has(tempId);
    }, [sendingIds]);

    // Vérifier si au moins un message est en cours d'envoi (pour l'UI globale)
    const sending = sendingIds.size > 0;

    /** Upload un fichier vers Supabase et retourne l'URL publique */
    const uploadFileToSupabase = useCallback(async (file: File, context: string, contextId: string): Promise<{ url: string; storageKey?: string }> => {
        const isAudio = file.type.startsWith('audio/') || file.type.startsWith('video/webm') || file.type.startsWith('video/mp4');
        const isImage = file.type.startsWith('image/');
        const endpoint = isImage ? '/api/upload/image' : '/api/upload/document';
        const formData = new FormData();
        formData.append('file', file);
        formData.append('context', context);
        formData.append('contextId', contextId);
        const res = await fetch(endpoint, { method: 'POST', headers: getAuthHeader(), body: formData });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || `Erreur upload (${res.status})`);
        }
        return res.json();
    }, []);

    /** Envoie un message texte + pièces jointes */
    const handleSendMessage = useCallback(
        async (
            messageText: string,
            selectedFiles: { file: File; previewUrl: string }[],
            revokeAllFileUrls: () => void,
            replyToId?: string
        ) => {
            if (!messageText.trim() && selectedFiles.length === 0) return;
            if (!currentUser || !otherUser || !privateKey) {
                if (!privateKey) setShowPasswordDialog(true);
                return;
            }

            const currentFiles = [...selectedFiles];
            revokeAllFileUrls();
            if (conversationId) stopTyping(conversationId);

            const tempId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            markSending(tempId, true);
            let payload: MessagePayload | null = null;

            try {
                const attachments: MessageAttachment[] = [];
                
                // Compresser les images avant upload
                for (const { file } of currentFiles) {
                    const ext = file.name.split('.').pop()?.toLowerCase() || '';
                    let fileType = 'IMAGE';
                    if (['pdf'].includes(ext)) fileType = 'PDF';
                    else if (['doc', 'docx'].includes(ext)) fileType = 'WORD';
                    else if (['webm', 'mp3', 'ogg', 'm4a', 'wav', 'aac'].includes(ext)) fileType = 'AUDIO';
                    
                    // Compresser si c'est une image et qu'elle est trop grande
                    let fileToUpload = file;
                    if (fileType === 'IMAGE' && needsCompression(file, 2)) {
                        try {
                            fileToUpload = await compressImage(file, {
                                maxSizeMB: 2,
                                maxWidthOrHeight: 1920,
                            });
                            console.log(`Image compressée: ${(file.size / 1024 / 1024).toFixed(2)}MB → ${(fileToUpload.size / 1024 / 1024).toFixed(2)}MB`);
                        } catch (err) {
                            console.warn('Compression failed, using original file', err);
                        }
                    }
                    
                    const uploaded = await uploadFileToSupabase(fileToUpload, 'discussions', conversationId || 'unknown');
                    attachments.push({ filename: file.name, type: fileType, data: uploaded.url });
                }

                // Detect URLs in message and create LINK attachments if no file attachments
                const urls = extractUrls(messageText);
                if (urls.length > 0 && attachments.length === 0) {
                    // Add first URL as a LINK attachment
                    attachments.push({
                        filename: new URL(urls[0]).hostname,
                        type: 'LINK',
                        data: urls[0]
                    });
                }

                const cipherText = encryptMessage(
                    messageText.trim() || '',
                    privateKey,
                    otherUser.publicKey
                );
                payload = {
                    encryptedContent: cipherText,
                    attachments: attachments.length > 0 ? attachments : undefined,
                    replyToId,
                };

                const optimisticCreatedAt = new Date().toISOString();
                const optimisticMessage: DiscussionMessage = {
                    id: tempId,
                    content: cipherText,
                    senderId: currentUser.id,
                    createdAt: optimisticCreatedAt,
                    updatedAt: optimisticCreatedAt,
                    isEdited: false,
                    replyTo: replyToId ? { id: replyToId, content: '', senderName: '' } : undefined,
                    attachments,
                    sender: {
                        id: currentUser.id,
                        name: currentUser.name || '',
                        email: currentUser.email || '',
                        publicKey: currentUser.publicKey || '',
                    },
                };

                // Ajouter au cache SWR immédiatement (persiste après navigation)
                addMessageToCache(
                    `/api/conversations/${conversationId}/messages?limit=50`,
                    optimisticMessage
                );
                // Mettre à jour l'état local aussi pour l'affichage instantané
                setMessages(prev => {
                    const newMessages = [...prev, optimisticMessage];
                    // Sauvegarder dans localStorage pour persistance entre sessions
                    saveTempMessages(conversationId, newMessages);
                    return newMessages;
                });
                scrollToBottom();

                const url = `/api/conversations/${conversationId}/messages`;
                const bodyStr = JSON.stringify({
                    content: cipherText,
                    attachments: attachments.length > 0 ? attachments : undefined,
                    replyToId,
                });
                const result = await sendWithOfflineQueue(url, { method: 'POST', body: bodyStr }, tempId, (u, opts) =>
                    fetchWithAuth(u, opts as RequestInit)
                );

                if (result.queued) {
                    toast.info('Message en attente (hors ligne)');
                    if (payload) setFailedMessagePayloads(prev => new Map(prev).set(tempId, payload as MessagePayload));
                } else if (result.ok && result.response) {
                    const data = await result.response.json();
                    if (data.message) {
                        // Remplacer le message temporaire par le vrai message serveur
                        // dans le cache et dans l'état local
                        setMessages(prev => {
                            const hasRealAlready = prev.some(m => m.id === data.message.id);
                            if (hasRealAlready) return prev;
                            const newMessages = prev.map(m => m.id === tempId ? data.message : m);
                            // Mettre à jour localStorage (supprimer le temp, garder le vrai)
                            saveTempMessages(conversationId, newMessages);
                            return newMessages;
                        });
                        // Supprimer le message temporaire du localStorage
                        removeTempMessage(conversationId, tempId);
                        // Mettre à jour le cache aussi
                        addMessageToCache(
                            `/api/conversations/${conversationId}/messages?limit=50`,
                            data.message
                        );
                    }
                } else if (result.response) {
                    const error = await result.response.json();
                    toast.error(error.error || "Erreur d'envoi");
                    if (payload) setFailedMessagePayloads(prev => new Map(prev).set(tempId, payload as MessagePayload));
                }
            } catch (error) {
                console.error('Send message error:', error);
                toast.error("Erreur d'envoi du message");
                if (payload) setFailedMessagePayloads(prev => new Map(prev).set(tempId, payload as MessagePayload));
            } finally {
                markSending(tempId, false);
            }
        },
        [conversationId, currentUser, otherUser, privateKey, setMessages, scrollToBottom, setShowPasswordDialog, stopTyping, uploadFileToSupabase, markSending]
    );

    /** Envoie un message audio */
    const sendAudioMessage = useCallback(
        async (audioFile: File, replyToId?: string) => {
            if (!currentUser || !otherUser || !privateKey) {
                toast.error('Clé de chiffrement manquante');
                return;
            }
            const tempId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            markSending(tempId, true);
            let payload: MessagePayload | null = null;

            try {
                // Compress audio before upload (22kHz mono WAV for voice)
                const compressedBlob = await compressAudioBlob(audioFile);
                const compressedFile = new File([compressedBlob], audioFile.name.replace(/\.\w+$/, '.wav'), { type: 'audio/wav' });
                const uploaded = await uploadFileToSupabase(compressedFile, 'audio', conversationId || 'unknown');
                const attachment: MessageAttachment = { filename: audioFile.name, type: 'AUDIO', data: uploaded.url };
                const encryptedContent = encryptMessage('', privateKey, otherUser.publicKey);
                payload = { encryptedContent, attachments: [attachment], replyToId };

                const optimisticCreatedAt = new Date().toISOString();
                const optimisticMessage: DiscussionMessage = {
                    id: tempId,
                    content: encryptedContent,
                    senderId: currentUser.id,
                    createdAt: optimisticCreatedAt,
                    updatedAt: optimisticCreatedAt,
                    isEdited: false,
                    replyTo: replyToId ? { id: replyToId, content: '', senderName: '' } : undefined,
                    attachments: [attachment],
                    sender: {
                        id: currentUser.id,
                        name: currentUser.name || '',
                        email: currentUser.email || '',
                        publicKey: currentUser.publicKey || '',
                    },
                };

                // Ajouter au cache SWR immédiatement (persiste après navigation)
                addMessageToCache(
                    `/api/conversations/${conversationId}/messages?limit=50`,
                    optimisticMessage
                );
                // Mettre à jour l'état local aussi pour l'affichage instantané
                setMessages(prev => {
                    const newMessages = [...prev, optimisticMessage];
                    // Sauvegarder dans localStorage pour persistance entre sessions
                    saveTempMessages(conversationId, newMessages);
                    return newMessages;
                });
                scrollToBottom();

                const url = `/api/conversations/${conversationId}/messages`;
                const bodyStr = JSON.stringify({ content: encryptedContent, attachments: [attachment], replyToId });
                const result = await sendWithOfflineQueue(url, { method: 'POST', body: bodyStr }, tempId, (u, opts) =>
                    fetchWithAuth(u, opts as RequestInit)
                );

                if (result.queued) {
                    toast.info('Message vocal en attente (hors ligne)');
                    if (payload) setFailedMessagePayloads(prev => new Map(prev).set(tempId, payload as MessagePayload));
                } else if (result.ok && result.response) {
                    const data = await result.response.json();
                    if (data.message) {
                        // Remplacer le message temporaire par le vrai message serveur
                        setMessages(prev => {
                            const hasRealAlready = prev.some(m => m.id === data.message.id);
                            if (hasRealAlready) return prev;
                            const newMessages = prev.map(m => m.id === tempId ? data.message : m);
                            // Mettre à jour localStorage (supprimer le temp, garder le vrai)
                            saveTempMessages(conversationId, newMessages);
                            return newMessages;
                        });
                        // Supprimer le message temporaire du localStorage
                        removeTempMessage(conversationId, tempId);
                        // Mettre à jour le cache aussi
                        addMessageToCache(
                            `/api/conversations/${conversationId}/messages?limit=50`,
                            data.message
                        );
                        scrollToBottom();
                    }
                } else if (result.response) {
                    toast.error("Erreur d'envoi du message vocal");
                    if (payload) setFailedMessagePayloads(prev => new Map(prev).set(tempId, payload as MessagePayload));
                }
            } catch (error) {
                console.error('Send audio error:', error);
                toast.error("Erreur d'envoi du message vocal");
                if (payload) setFailedMessagePayloads(prev => new Map(prev).set(tempId, payload as MessagePayload));
            } finally {
                markSending(tempId, false);
            }
        },
        [conversationId, currentUser, otherUser, privateKey, setMessages, scrollToBottom, uploadFileToSupabase, markSending]
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
                // Supprimer immédiatement de l'état local
                setMessages(prev => prev.filter(m => m.id !== messageId));
                
                // Supprimer du cache API
                removeMessageFromCache(
                    `/api/conversations/${conversationId}/messages?limit=50`,
                    messageId
                );
                
                // Supprimer aussi du localStorage des messages temporaires
                try {
                    const allTemps = JSON.parse(localStorage.getItem('chat_temp_messages') || '{}');
                    if (allTemps[conversationId]) {
                        allTemps[conversationId] = allTemps[conversationId].filter((m: DiscussionMessage) => m.id !== messageId);
                        localStorage.setItem('chat_temp_messages', JSON.stringify(allTemps));
                    }
                } catch {
                    // Ignorer les erreurs localStorage
                }
                
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
                    replyToId: payload.replyToId,
                });
                const res = await fetchWithAuth(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: bodyStr,
                });
                if (res.ok) {
                    const data = await res.json();
                    if (data.message) {
                        // Remplacer le message temporaire par le vrai message serveur
                        setMessages(prev => {
                            const hasRealAlready = prev.some(m => m.id === data.message.id);
                            if (hasRealAlready) return prev;
                            return prev.map(m => m.id === tempId ? data.message : m);
                        });
                        addMessageToCache(
                            `/api/conversations/${conversationId}/messages?limit=50`,
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
        handleSendMessage,
        sendAudioMessage,
        handleEditMessage,
        handleDeleteMessage,
        handleRetryMessage,
    };
}
