'use client';

import { useState, useRef } from 'react';
import { Send, Paperclip, X, File } from 'lucide-react';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { toast } from 'sonner';
import { getAuthHeader } from '@/src/lib/auth-client';

interface MessageInputProps {
    onSendMessage: (content: string, type: 'TEXT' | 'IMAGE' | 'PDF' | 'WORD', fileUrl?: string, fileName?: string, storageKey?: string) => Promise<void>;
    disabled?: boolean;
    groupId?: string;
}

export function MessageInput({ onSendMessage, disabled, groupId }: MessageInputProps) {
    const [message, setMessage] = useState('');
    const [selectedFile, setSelectedFile] = useState<{ file: File; preview?: string } | null>(null);
    const [loading, setLoading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
            if (!validTypes.includes(file.type)) {
                toast.error('Type de fichier non supporté. (Images, PDF, Word uniquement)');
                return;
            }
            if (file.size > 10 * 1024 * 1024) {
                toast.error('Fichier trop volumineux (Max 10 Mo)');
                return;
            }
            const preview = file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined;
            setSelectedFile({ file, preview });
        }
    };

    const clearFile = () => {
        if (selectedFile?.preview) URL.revokeObjectURL(selectedFile.preview);
        setSelectedFile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if ((!message.trim() && !selectedFile) || loading) return;

        setLoading(true);
        try {
            let type: 'TEXT' | 'IMAGE' | 'PDF' | 'WORD' = 'TEXT';
            let fileUrl: string | undefined;
            let fileName: string | undefined;
            let storageKey: string | undefined;

            if (selectedFile) {
                const isImage = selectedFile.file.type.startsWith('image/');
                const endpoint = isImage ? '/api/upload/image' : '/api/upload/document';
                const formData = new FormData();
                formData.append('file', selectedFile.file);
                formData.append('context', 'messages');
                formData.append('contextId', groupId || 'unknown');

                const res = await fetch(endpoint, {
                    method: 'POST',
                    headers: getAuthHeader(),
                    body: formData,
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Erreur upload');

                fileUrl = data.url;
                storageKey = data.storageKey;
                fileName = selectedFile.file.name;

                if (isImage) type = 'IMAGE';
                else if (selectedFile.file.type === 'application/pdf') type = 'PDF';
                else type = 'WORD';
            }

            await onSendMessage(message, type, fileUrl, fileName, storageKey);
            setMessage('');
            clearFile();
        } catch (error) {
            console.error('Send error:', error);
            toast.error('Erreur lors de l\'envoi');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="p-4 bg-card border-t border-border">
            {selectedFile && (
                <div className="flex items-center gap-2 mb-2 p-2 bg-muted rounded-lg">
                    {selectedFile.preview ? (
                        <img src={selectedFile.preview} alt="Preview" className="h-12 w-12 object-cover rounded border border-border" />
                    ) : (
                        <div className="h-12 w-12 bg-muted flex items-center justify-center rounded border border-border">
                            <File className="w-6 h-6 text-muted-foreground" />
                        </div>
                    )}
                    <div className="flex-1 overflow-hidden">
                        <p className="text-sm text-foreground truncate">{selectedFile.file.name}</p>
                        <p className="text-xs text-muted-foreground">{(selectedFile.file.size / 1024).toFixed(1)} KB</p>
                    </div>
                    <Button variant="ghost" size="icon" onClick={clearFile} className="text-muted-foreground hover:text-destructive">
                        <X className="w-5 h-5" />
                    </Button>
                </div>
            )}

            <form onSubmit={handleSubmit} className="flex gap-2">
                <input type="file" ref={fileInputRef} onChange={handleFileSelect} className="hidden" accept="image/*,.pdf,.doc,.docx" />
                <Button type="button" variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground shrink-0"
                    onClick={() => fileInputRef.current?.click()} disabled={disabled || loading}>
                    <Paperclip className="w-5 h-5" />
                </Button>
                <Input value={message} onChange={(e) => setMessage(e.target.value)}
                    placeholder="Écrivez votre message..." className="bg-muted border-border text-foreground"
                    disabled={disabled || loading} />
                <Button type="submit" className="bg-primary text-primary-foreground hover:bg-primary/90 shrink-0"
                    disabled={disabled || loading || (!message.trim() && !selectedFile)}>
                    <Send className="w-5 h-5" />
                </Button>
            </form>
        </div>
    );
}
