"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { getUser, getAuthHeader, type AuthUser } from "@/src/lib/auth-client";
import { Button } from "@/src/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/src/components/ui/card";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/src/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/src/components/ui/dialog";
import { toast } from "sonner";
import { Trash2, Send, Image as ImageIcon, Pencil, X, Upload, Plus } from "lucide-react";
import { Textarea } from "@/src/components/ui/textarea";

export default function MyPage() {
    const router = useRouter();
    const [user, setUser] = useState<AuthUser | null>(null);
    const [userPage, setUserPage] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    // Create Form state
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [postType, setPostType] = useState<"TWEET" | "CONTENT">("TWEET");
    const [content, setContent] = useState("");
    const [reference, setReference] = useState("");
    const [imageUrl, setImageUrl] = useState("");
    const [caption, setCaption] = useState("");
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Edit State
    const [editingPost, setEditingPost] = useState<any>(null);
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [editContent, setEditContent] = useState("");
    const [editReference, setEditReference] = useState("");
    const [editImageUrl, setEditImageUrl] = useState("");
    const [editCaption, setEditCaption] = useState("");
    const editFileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const u = getUser();
        if (!u) {
            router.push("/login");
            return;
        }
        setUser(u);
        fetchPage();
    }, []);

    const fetchPage = async () => {
        try {
            const res = await fetch("/api/user-page", { headers: getAuthHeader() });
            const data = await res.json();
            if (data.userPage) {
                setUserPage(data.userPage);
            } else {
                router.push("/chat/settings");
            }
        } finally {
            setLoading(false);
        }
    };

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, setUrl: (url: string) => void) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (file.size > 5 * 1024 * 1024) { // 5MB limit
            toast.error("L'image est trop volumineuse (max 5MB)");
            return;
        }

        const reader = new FileReader();
        reader.onloadend = () => {
            setUrl(reader.result as string);
        };
        reader.readAsDataURL(file);
    };

    const handleCreatePost = async () => {
        if (!content) return toast.error("Le contenu est requis");

        const body = {
            type: postType,
            content,
            reference: postType === "TWEET" ? reference : undefined,
            imageUrl: postType === "CONTENT" ? imageUrl : undefined,
            caption: postType === "CONTENT" ? caption : undefined,
        };

        try {
            const res = await fetch("/api/posts", {
                method: "POST",
                headers: { "Content-Type": "application/json", ...getAuthHeader() },
                body: JSON.stringify(body)
            });

            if (res.ok) {
                toast.success("Publié !");
                setContent("");
                setReference("");
                setImageUrl("");
                setCaption("");
                if (fileInputRef.current) fileInputRef.current.value = "";
                setIsCreateOpen(false);
                fetchPage(); // Refresh posts
            } else {
                toast.error("Erreur lors de la publication");
            }
        } catch (error) {
            toast.error("Erreur serveur");
        }
    };

    const handleDeletePage = async () => {
        if (!confirm("Êtes-vous sûr de vouloir supprimer votre page ? Tous les posts seront effacés.")) return;

        try {
            const res = await fetch("/api/user-page", {
                method: "DELETE",
                headers: getAuthHeader()
            });
            if (res.ok) {
                toast.success("Page supprimée");
                router.push("/chat/settings");
            }
        } catch (error) {
            toast.error("Erreur");
        }
    };

    const handleDeletePost = async (postId: string) => {
        if (!confirm("Supprimer ce post ?")) return;
        try {
            const res = await fetch(`/api/posts/${postId}`, {
                method: "DELETE",
                headers: getAuthHeader()
            });
            if (res.ok) {
                toast.success("Post supprimé");
                fetchPage();;
            } else {
                toast.error("Erreur suppression");
            }
        } catch (error) {
            toast.error("Erreur serveur");
        }
    }

    const startEdit = (post: any) => {
        setEditingPost(post);
        setEditContent(post.content);
        setEditReference(post.reference || "");
        setEditImageUrl(post.imageUrl || "");
        setEditCaption(post.caption || "");
        setIsEditOpen(true);
    };

    const handleUpdatePost = async () => {
        if (!editingPost) return;

        const body = {
            content: editContent,
            reference: editingPost.type === "TWEET" ? editReference : undefined,
            imageUrl: editingPost.type === "CONTENT" ? editImageUrl : undefined,
            caption: editingPost.type === "CONTENT" ? editCaption : undefined,
        };

        try {
            const res = await fetch(`/api/posts/${editingPost.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json", ...getAuthHeader() },
                body: JSON.stringify(body)
            });

            if (res.ok) {
                toast.success("Post modifié !");
                setIsEditOpen(false);
                setEditingPost(null);
                fetchPage();
            } else {
                toast.error("Erreur lors de la modification");
            }
        } catch (error) {
            toast.error("Erreur serveur");
        }
    };

    if (loading) return <div className="p-8 text-center pt-24">Chargement...</div>;

    return (
        <div className="p-4 space-y-6 pt-16 pb-20">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-bold text-foreground">Ma Page Publique</h2>
                    <p className="text-muted-foreground">{userPage?.handle}</p>
                </div>
                <div className="flex gap-2">
                    <Button onClick={() => setIsCreateOpen(true)} className="bg-primary text-primary-foreground">
                        <Plus className="h-4 w-4 mr-2" /> Nouveau
                    </Button>
                    <Button variant="destructive" size="icon" onClick={handleDeletePage}>
                        <Trash2 className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            {/* Create Post Dialog */}
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                <DialogContent className="max-w-md bg-card border-border text-foreground">
                    <DialogHeader>
                        <DialogTitle>Nouvelle Publication</DialogTitle>
                    </DialogHeader>
                    <Tabs defaultValue="TWEET" onValueChange={(v: any) => setPostType(v)} className="mt-2">
                        <TabsList className="grid w-full grid-cols-2 mb-4">
                            <TabsTrigger value="TWEET">Tuite (Texte)</TabsTrigger>
                            <TabsTrigger value="CONTENT">Contenu (Image)</TabsTrigger>
                        </TabsList>

                        <div className="space-y-4">
                            <Textarea
                                className="w-full bg-muted border border-border resize-none"
                                placeholder="Quoi de neuf ?"
                                value={content}
                                onChange={(e) => setContent(e.target.value)}
                            />

                            <TabsContent value="TWEET" className="mt-0">
                                <Label className="text-xs text-muted-foreground">Référence (optionnel, affiché en petit)</Label>
                                <Input
                                    className="bg-muted border-border mt-1"
                                    placeholder="Source, contexte..."
                                    value={reference}
                                    onChange={(e) => setReference(e.target.value)}
                                />
                            </TabsContent>

                            <TabsContent value="CONTENT" className="mt-0 space-y-3">
                                <div>
                                    <Label className="text-xs text-muted-foreground block mb-2">Image</Label>
                                    <div className="flex items-center gap-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="w-full border-dashed border-2"
                                            onClick={() => fileInputRef.current?.click()}
                                        >
                                            <Upload className="w-4 h-4 mr-2" />
                                            {imageUrl ? "Changer l'image" : "Choisir une image"}
                                        </Button>
                                        <input
                                            type="file"
                                            ref={fileInputRef}
                                            className="hidden"
                                            accept="image/*"
                                            onChange={(e) => handleImageUpload(e, setImageUrl)}
                                        />
                                    </div>
                                    {imageUrl && (
                                        <div className="relative mt-2 rounded-lg overflow-hidden border border-border">
                                            <img src={imageUrl} alt="preview" className="max-h-32 object-contain bg-black/50 w-full" />
                                            <Button
                                                variant="destructive"
                                                size="icon"
                                                className="absolute top-1 right-1 h-6 w-6"
                                                onClick={() => {
                                                    setImageUrl("");
                                                    if (fileInputRef.current) fileInputRef.current.value = "";
                                                }}
                                            >
                                                <X className="h-3 w-3" />
                                            </Button>
                                        </div>
                                    )}
                                </div>
                                <div>
                                    <Label className="text-xs text-muted-foreground">Légende</Label>
                                    <Input
                                        className="bg-muted border-border"
                                        placeholder="Une petite légende..."
                                        value={caption}
                                        onChange={(e) => setCaption(e.target.value)}
                                    />
                                </div>
                            </TabsContent>

                            <Button onClick={handleCreatePost} disabled={!content} className="w-full">
                                <Send className="w-4 h-4 mr-2" /> Publier
                            </Button>
                        </div>
                    </Tabs>
                </DialogContent>
            </Dialog>

            {/* List of my posts */}
            <div className="space-y-4">
                <h3 className="font-semibold text-lg">Mes Publications</h3>
                {userPage?.posts?.length === 0 && <p className="text-muted-foreground text-sm">Aucune publication.</p>}
                {userPage?.posts?.map((post: any) => (
                    <div key={post.id} className="bg-card border border-border p-4 rounded-xl relative group">
                        {/* Actions */}
                        <div className="absolute top-2 right-2 flex gap-1 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button variant="secondary" size="icon" className="h-7 w-7" onClick={() => startEdit(post)}>
                                <Pencil className="h-3 w-3" />
                            </Button>
                            <Button variant="destructive" size="icon" className="h-7 w-7" onClick={() => handleDeletePost(post.id)}>
                                <Trash2 className="h-3 w-3" />
                            </Button>
                        </div>

                        <p className="text-foreground whitespace-pre-wrap pr-16">{post.content}</p>

                        {post.type === "TWEET" && post.reference && (
                            <p className="text-xs italic text-muted-foreground/70 border-l-2 pl-2 border-primary/20 mt-2">
                                Ref: {post.reference}
                            </p>
                        )}

                        {post.type === "CONTENT" && (
                            <>
                                {post.imageUrl && <img src={post.imageUrl} alt="post" className="mt-2 rounded-lg max-h-48 object-cover w-full" />}
                                {post.caption && <p className="text-xs text-muted-foreground italic mt-1 text-center">{post.caption}</p>}
                            </>
                        )}

                        <div className="flex gap-4 text-xs text-muted-foreground mt-3 pt-3 border-t border-border/50">
                            <span>{new Date(post.createdAt).toLocaleDateString()}</span>
                            <span>{post.likes.length} J'aime</span>
                            <span>{post.comments.length} Coms</span>
                        </div>
                    </div>
                ))}
            </div>

            {/* Edit Dialog */}
            <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
                <DialogContent className="max-w-md bg-card border-border text-foreground">
                    <DialogHeader>
                        <DialogTitle>Modifier la publication</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-2">
                        <div>
                            <Label>Contenu</Label>
                            <Textarea
                                value={editContent}
                                onChange={e => setEditContent(e.target.value)}
                                className="bg-muted border-border resize-none"
                            />
                        </div>

                        {editingPost?.type === "TWEET" && (
                            <div>
                                <Label>Référence</Label>
                                <Input
                                    className="bg-muted border-border"
                                    value={editReference}
                                    onChange={e => setEditReference(e.target.value)}
                                />
                            </div>
                        )}

                        {editingPost?.type === "CONTENT" && (
                            <div className="space-y-3">
                                <div>
                                    <Label className="block mb-2">Image</Label>
                                    <div className="flex items-center gap-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="w-full border-dashed"
                                            onClick={() => editFileInputRef.current?.click()}
                                        >
                                            <Upload className="w-4 h-4 mr-2" />
                                            {editImageUrl ? "Changer l'image" : "Ajouter une image"}
                                        </Button>
                                        <input
                                            type="file"
                                            ref={editFileInputRef}
                                            className="hidden"
                                            accept="image/*"
                                            onChange={(e) => handleImageUpload(e, setEditImageUrl)}
                                        />
                                    </div>
                                    {editImageUrl && (
                                        <div className="relative mt-2 rounded-lg overflow-hidden border border-border">
                                            <img src={editImageUrl} alt="preview" className="max-h-32 object-contain bg-black/50 w-full" />
                                            <Button
                                                variant="destructive"
                                                size="icon"
                                                className="absolute top-1 right-1 h-6 w-6"
                                                onClick={() => {
                                                    setEditImageUrl("");
                                                    if (editFileInputRef.current) editFileInputRef.current.value = "";
                                                }}
                                            >
                                                <X className="h-3 w-3" />
                                            </Button>
                                        </div>
                                    )}
                                </div>
                                <div>
                                    <Label>Légende</Label>
                                    <Input
                                        className="bg-muted border-border"
                                        value={editCaption}
                                        onChange={e => setEditCaption(e.target.value)}
                                    />
                                </div>
                            </div>
                        )}

                        <div className="flex justify-end gap-2 mt-4">
                            <Button variant="ghost" onClick={() => setIsEditOpen(false)}>Annuler</Button>
                            <Button onClick={handleUpdatePost}>Enregistrer</Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
