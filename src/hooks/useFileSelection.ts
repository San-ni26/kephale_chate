/**
 * useFileSelection
 * Gère la sélection de fichiers avec Object URLs pour preview légère.
 * Extrait de page.tsx pour réduire sa taille (#1 / #14).
 */
'use client';

import { useState, useCallback, useEffect } from 'react';
import { toast } from 'sonner';

export interface SelectedFile {
    file: File;
    previewUrl: string;
}

const VALID_TYPES = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

export function useFileSelection(conversationId: string) {
    const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([]);

    const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        const validFiles = files.filter(file => {
            if (!VALID_TYPES.includes(file.type)) {
                toast.error(`Type de fichier non autorisé : ${file.name}`);
                return false;
            }
            if (file.size > 10 * 1024 * 1024) {
                toast.error(`Fichier trop volumineux : ${file.name} (max 10 MB)`);
                return false;
            }
            return true;
        });
        const withUrls = validFiles.map(file => ({
            file,
            previewUrl: URL.createObjectURL(file),
        }));
        setSelectedFiles(prev => [...prev, ...withUrls]);
        // Réinitialiser l'input pour permettre la re-sélection du même fichier
        e.target.value = '';
    }, []);

    const removeFile = useCallback((index: number) => {
        setSelectedFiles(prev => {
            URL.revokeObjectURL(prev[index].previewUrl);
            return prev.filter((_, i) => i !== index);
        });
    }, []);

    const revokeAllFileUrls = useCallback(() => {
        setSelectedFiles(prev => {
            prev.forEach(f => URL.revokeObjectURL(f.previewUrl));
            return [];
        });
    }, []);

    // Nettoyer les Object URLs au changement de conversation ou démontage
    useEffect(() => {
        return () => {
            setSelectedFiles(prev => {
                prev.forEach(f => URL.revokeObjectURL(f.previewUrl));
                return [];
            });
        };
    }, [conversationId]);

    return {
        selectedFiles,
        handleFileSelect,
        removeFile,
        revokeAllFileUrls,
    };
}
