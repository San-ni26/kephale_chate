"use client";

import { useState, useRef } from "react";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Paperclip, Send, X, FileText, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { encryptFile, isFileTypeAllowed, isFileSizeAllowed } from "@/src/lib/file-encryption";

interface FileUploadProps {
    onSend: (message: string, files?: File[]) => void;
    myPrivateKey: string;
    theirPublicKey: string;
    disabled?: boolean;
}

export function FileUpload({ onSend, myPrivateKey, theirPublicKey, disabled }: FileUploadProps) {
    const [message, setMessage] = useState("");
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);

        // Validate files
        const validFiles = files.filter((file) => {
            if (!isFileTypeAllowed(file)) {
                toast.error(`Type de fichier non autorisé: ${file.name}`);
                return false;
            }
            if (!isFileSizeAllowed(file, 10)) {
                toast.error(`Fichier trop volumineux: ${file.name} (max 10MB)`);
                return false;
            }
            return true;
        });

        setSelectedFiles((prev) => [...prev, ...validFiles]);
    };

    const removeFile = (index: number) => {
        setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
    };

    const handleSend = async () => {
        if (!message.trim() && selectedFiles.length === 0) {
            toast.error("Veuillez saisir un message ou sélectionner un fichier");
            return;
        }

        setUploading(true);
        try {
            // Encrypt files if any
            const encryptedFiles = await Promise.all(
                selectedFiles.map((file) => encryptFile(file, myPrivateKey, theirPublicKey))
            );

            // Send message with encrypted files
            onSend(message, selectedFiles);

            // Reset form
            setMessage("");
            setSelectedFiles([]);
            if (fileInputRef.current) {
                fileInputRef.current.value = "";
            }
        } catch (error) {
            toast.error("Erreur lors de l'envoi du fichier");
        } finally {
            setUploading(false);
        }
    };

    return (
        <div className="space-y-2">
            {/* Selected Files Preview */}
            {selectedFiles.length > 0 && (
                <div className="flex flex-wrap gap-2 p-2 bg-slate-800/50 rounded-lg">
                    {selectedFiles.map((file, index) => (
                        <div
                            key={index}
                            className="flex items-center gap-2 bg-slate-700 px-3 py-2 rounded-lg text-sm"
                        >
                            {file.type.startsWith("image/") ? (
                                <ImageIcon className="h-4 w-4 text-blue-400" />
                            ) : (
                                <FileText className="h-4 w-4 text-green-400" />
                            )}
                            <span className="text-slate-200 max-w-[150px] truncate">
                                {file.name}
                            </span>
                            <button
                                onClick={() => removeFile(index)}
                                className="text-slate-400 hover:text-red-400"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {/* Input Area */}
            <div className="flex items-center gap-2">
                <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/*,.pdf,.doc,.docx"
                    onChange={handleFileSelect}
                    className="hidden"
                />
                <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={disabled || uploading}
                    className="border-slate-700 hover:bg-slate-800"
                >
                    <Paperclip className="h-5 w-5" />
                </Button>
                <Input
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            handleSend();
                        }
                    }}
                    placeholder="Tapez votre message..."
                    disabled={disabled || uploading}
                    className="flex-1 bg-slate-800 border-slate-700"
                />
                <Button
                    onClick={handleSend}
                    disabled={disabled || uploading || (!message.trim() && selectedFiles.length === 0)}
                    className="bg-blue-600 hover:bg-blue-700"
                >
                    {uploading ? "Envoi..." : <Send className="h-5 w-5" />}
                </Button>
            </div>
        </div>
    );
}
