"use client";

import { useState, useEffect } from "react";
import { MoreVertical, Edit2, Trash2, Download } from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { toast } from "sonner";
import { decryptFile, downloadFile } from "@/src/lib/file-encryption";

interface Message {
    id: string;
    content: string;
    senderId: string;
    createdAt: Date;
    updatedAt: Date;
    attachments?: Array<{
        id: string;
        type: string;
        filename: string;
        data: string;
    }>;
}

interface MessageItemProps {
    message: Message;
    currentUserId: string;
    myPrivateKey: string;
    theirPublicKey: string;
    onEdit?: (messageId: string, newContent: string) => void;
    onDelete?: (messageId: string) => void;
}

export function MessageItem({
    message,
    currentUserId,
    myPrivateKey,
    theirPublicKey,
    onEdit,
    onDelete,
}: MessageItemProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [editedContent, setEditedContent] = useState(message.content);
    const [canEdit, setCanEdit] = useState(false);

    const isOwnMessage = message.senderId === currentUserId;

    useEffect(() => {
        // Check if message can still be edited (within 5 minutes)
        const messageAge = Date.now() - new Date(message.createdAt).getTime();
        const fiveMinutes = 5 * 60 * 1000;
        setCanEdit(isOwnMessage && messageAge < fiveMinutes);
    }, [message.createdAt, isOwnMessage]);

    const handleEdit = () => {
        if (editedContent.trim() && editedContent !== message.content) {
            onEdit?.(message.id, editedContent);
            setIsEditing(false);
        }
    };

    const handleDownload = async (attachment: any) => {
        try {
            const blob = decryptFile(
                {
                    filename: attachment.filename,
                    type: attachment.type,
                    encryptedData: attachment.data,
                    mimeType: getMimeType(attachment.filename),
                },
                myPrivateKey,
                theirPublicKey
            );

            if (blob) {
                downloadFile(blob, attachment.filename);
                toast.success("Téléchargement réussi");
            } else {
                toast.error("Erreur de décryptage");
            }
        } catch (error) {
            toast.error("Erreur lors du téléchargement");
        }
    };

    return (
        <div
            className={`flex ${isOwnMessage ? "justify-end" : "justify-start"} mb-4`}
        >
            <div
                className={`max-w-[70%] rounded-2xl px-4 py-2 ${isOwnMessage
                        ? "bg-blue-600 text-white"
                        : "bg-slate-800 text-slate-100"
                    }`}
            >
                <div className="flex items-start justify-between gap-2">
                    {isEditing ? (
                        <div className="flex-1 space-y-2">
                            <Input
                                value={editedContent}
                                onChange={(e) => setEditedContent(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") handleEdit();
                                    if (e.key === "Escape") setIsEditing(false);
                                }}
                                className="bg-slate-700 border-slate-600"
                                autoFocus
                            />
                            <div className="flex gap-2">
                                <Button size="sm" onClick={handleEdit}>
                                    Enregistrer
                                </Button>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setIsEditing(false)}
                                >
                                    Annuler
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <>
                            <div className="flex-1">
                                <p className="text-sm break-words">{message.content}</p>

                                {/* Attachments */}
                                {message.attachments && message.attachments.length > 0 && (
                                    <div className="mt-2 space-y-2">
                                        {message.attachments.map((attachment) => (
                                            <div
                                                key={attachment.id}
                                                className="flex items-center gap-2 p-2 bg-slate-700/50 rounded-lg"
                                            >
                                                <span className="text-xs flex-1 truncate">
                                                    {attachment.filename}
                                                </span>
                                                {(attachment.type === "PDF" || attachment.type === "WORD") && (
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        onClick={() => handleDownload(attachment)}
                                                        className="h-6 px-2"
                                                    >
                                                        <Download className="h-3 w-3" />
                                                    </Button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}

                                <span className="text-xs opacity-70 mt-1 block">
                                    {new Date(message.createdAt).toLocaleTimeString("fr-FR", {
                                        hour: "2-digit",
                                        minute: "2-digit",
                                    })}
                                    {message.updatedAt !== message.createdAt && " (modifié)"}
                                </span>
                            </div>

                            {isOwnMessage && (
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button
                                            size="icon"
                                            variant="ghost"
                                            className="h-6 w-6 opacity-0 group-hover:opacity-100"
                                        >
                                            <MoreVertical className="h-4 w-4" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent className="bg-slate-800 border-slate-700">
                                        {canEdit && (
                                            <DropdownMenuItem
                                                onClick={() => setIsEditing(true)}
                                                className="hover:bg-slate-700"
                                            >
                                                <Edit2 className="mr-2 h-4 w-4" />
                                                Modifier
                                            </DropdownMenuItem>
                                        )}
                                        <DropdownMenuItem
                                            onClick={() => onDelete?.(message.id)}
                                            className="hover:bg-slate-700 text-red-400"
                                        >
                                            <Trash2 className="mr-2 h-4 w-4" />
                                            Supprimer
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

function getMimeType(filename: string): string {
    const ext = filename.split(".").pop()?.toLowerCase();
    const mimeTypes: Record<string, string> = {
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        png: "image/png",
        gif: "image/gif",
        webp: "image/webp",
        pdf: "application/pdf",
        doc: "application/msword",
        docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    };
    return mimeTypes[ext || ""] || "application/octet-stream";
}
