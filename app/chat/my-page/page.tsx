"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getUser, getAuthHeader, updateAuthUser, type AuthUser } from "@/src/lib/auth-client";
import { Button } from "@/src/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/src/components/ui/card";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/src/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/src/components/ui/dialog";
import { toast } from "sonner";
import { Trash2, Send, Image as ImageIcon, Pencil, X, Upload, Plus, Users, Heart } from "lucide-react";
import { Textarea } from "@/src/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/src/components/ui/avatar";
import { Skeleton } from "@/src/components/ui/skeleton";

export default function MyPage() {
    const router = useRouter();
    const [user, setUser] = useState<AuthUser | null>(null);
    const [userPage, setUserPage] = useState<any>(null);
    const [posts, setPosts] = useState<any[]>([]);
    const [loadingPage, setLoadingPage] = useState(true);
    const [loadingPosts, setLoadingPosts] = useState(true);

    // Pagination state
    const [cursor, setCursor] = useState<string | null>(null);
    const [hasMore, setHasMore] = useState(true);
    const observer = useRef<IntersectionObserver | null>(null);

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

    // Edit Page State
    const [isEditPageOpen, setIsEditPageOpen] = useState(false);
    const [editPageName, setEditPageName] = useState("");
    const [editPageHandle, setEditPageHandle] = useState("");
    const [editPageBio, setEditPageBio] = useState("");
    const [editPageAvatarUrl, setEditPageAvatarUrl] = useState("");
    const editPageFileInputRef = useRef<HTMLInputElement>(null);

    // Interaction Modal State
    const [isInteractionOpen, setIsInteractionOpen] = useState(false);
    const [selectedPost, setSelectedPost] = useState<any>(null);
    const [interactionTab, setInteractionTab] = useState<"COMMENTS" | "LIKES">("COMMENTS");
    const [replyToId, setReplyToId] = useState<string | null>(null);

    useEffect(() => {
        const u = getUser();
        if (!u) {
            router.push("/login");
            return;
        }
        setUser(u);
        fetchPageInfo();
    }, []);

    const fetchPageInfo = async () => {
        try {
            const res = await fetch("/api/user-page", { headers: getAuthHeader() });
            const data = await res.json();
            if (data.userPage) {
                setUserPage(data.userPage);
                // Initial posts load
                await fetchMorePosts(data.userPage.id, null, true);
            } else {
                router.push("/chat/settings");
            }
        } finally {
            setLoadingPage(false);
        }
    };

    const fetchMorePosts = async (pageId: string, currentCursor: string | null, isInitial = false) => {
        if (!isInitial && (!hasMore || loadingPosts)) return;

        setLoadingPosts(true);
        try {
            const url = new URL("/api/posts", window.location.origin);
            url.searchParams.set("pageId", pageId);
            url.searchParams.set("limit", "10");
            if (currentCursor) url.searchParams.set("cursor", currentCursor);

            const res = await fetch(url.toString(), { headers: getAuthHeader() });
            const data = await res.json();

            if (data.posts) {
                if (isInitial) {
                    setPosts(data.posts);
                } else {
                    setPosts(prev => [...prev, ...data.posts]);
                }
                setCursor(data.nextCursor || null);
                setHasMore(!!data.nextCursor);
            }
        } catch (error) {
            console.error("Error fetching posts:", error);
        } finally {
            setLoadingPosts(false);
        }
    };

    const lastPostElementRef = useCallback((node: HTMLDivElement) => {
        if (loadingPosts) return;
        if (observer.current) observer.current.disconnect();
        observer.current = new IntersectionObserver(entries => {
            if (entries[0].isIntersecting && hasMore && userPage) {
                fetchMorePosts(userPage.id, cursor);
            }
        });
        if (node) observer.current.observe(node);
    }, [loadingPosts, hasMore, cursor, userPage]);

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
                // Refetch posts from scratch
                fetchMorePosts(userPage.id, null, true);
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
                setPosts(posts.filter(p => p.id !== postId));
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
                // Update local state
                setPosts(posts.map(p => p.id === editingPost.id ? { ...p, ...body } : p));
            } else {
                toast.error("Erreur lors de la modification");
            }
        } catch (error) {
            toast.error("Erreur serveur");
        }
    };

    const startPageEdit = () => {
        if (!userPage || !user) return;
        setEditPageName(user.name || "");
        setEditPageHandle(userPage.handle);
        setEditPageBio(userPage.bio || "");
        setEditPageAvatarUrl(user.avatarUrl || "");
        setIsEditPageOpen(true);
    };

    const handleUpdatePage = async () => {
        if (!editPageName || !editPageHandle) return toast.error("Nom et identifiant requis");

        const body = {
            name: editPageName,
            handle: editPageHandle,
            bio: editPageBio,
            avatarUrl: editPageAvatarUrl
        };

        try {
            const res = await fetch("/api/user-page", {
                method: "PATCH",
                headers: { "Content-Type": "application/json", ...getAuthHeader() },
                body: JSON.stringify(body)
            });
            const data = await res.json();

            if (res.ok) {
                toast.success("Profil mis à jour !");
                setIsEditPageOpen(false);
                setUserPage(data.userPage);

                const updatedUser = { name: editPageName, avatarUrl: editPageAvatarUrl };
                updateAuthUser(updatedUser);
                setUser(prev => prev ? { ...prev, ...updatedUser } : null);
            } else {
                toast.error(data.error || "Erreur lors de la mise à jour");
            }
        } catch (error) {
            toast.error("Erreur serveur");
        }
    };

    const openInteractions = (post: any, tab: "COMMENTS" | "LIKES") => {
        setSelectedPost(post);
        setInteractionTab(tab);
        setIsInteractionOpen(true);
    };

    const handleReply = (commentId: string) => {
        setReplyToId(commentId);
        // Focus input logic would go here if we had a ref to the comment input in the modal
        // For now user just knows they are replying due to UI state
    };

    const sendComment = async (postId: string, text: string) => {
        if (!text.trim()) return;

        try {
            const res = await fetch(`/api/posts/${postId}/comment`, {
                method: "POST",
                headers: { "Content-Type": "application/json", ...getAuthHeader() },
                body: JSON.stringify({ content: text, parentId: replyToId })
            });

            const data = await res.json();

            if (res.ok) {
                toast.success("Commentaire envoyé");
                setReplyToId(null);

                // Update local state is tricky with nested comments, usually better to refetch
                // But for now let's try to update locally if simple
                // Actually refetching posts is safer to get the full comment structure with user details
                fetchMorePosts(userPage.id, null, true); // Refresh all posts effectively to get updated comments

                // Also close modal or update selectedPost.comments
                // Since fetchMorePosts updates 'posts', we need to sync 'selectedPost' if it's open
                // This is reactive in the render if we use 'posts.find(p => p.id === selectedPost.id)'

                // Better UX: update selectedPost manually for instant feedback? 
                // Complexity: constructing the full comment object with User which we don't fully have (avatar etc)
                // So fetchMorePosts is acceptable.
            } else {
                toast.error("Erreur envoi commentaire");
            }
        } catch (error) {
            toast.error("Erreur serveur");
        }
    };

    // Helper to render comments recursively
    const renderComments = (comments: any[]) => {
        return comments.map((comment) => (
            <div key={comment.id} className="mb-4">
                <div className="flex gap-3">
                    <Avatar className="h-8 w-8">
                        {comment.user.avatarUrl && <AvatarImage src={comment.user.avatarUrl} />}
                        <AvatarFallback>{comment.user.name?.substring(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                        <div className="bg-muted/50 p-3 rounded-lg">
                            <span className="font-semibold text-sm">{comment.user.name}</span>
                            <p className="text-sm mt-1">{comment.content}</p>
                        </div>
                        <div className="flex gap-4 mt-1 pl-2 text-xs text-muted-foreground">
                            <span>{new Date(comment.createdAt).toLocaleDateString()}</span>
                            <button onClick={() => handleReply(comment.id)} className="hover:text-primary font-medium">Répondre</button>
                        </div>
                    </div>
                </div>
                {/* Replies */}
                {comment.replies && comment.replies.length > 0 && (
                    <div className="pl-11 mt-3 border-l-2 border-border/50">
                        {renderComments(comment.replies)}
                    </div>
                )}
            </div>
        ));
    };

    if (loadingPage) {
        return (
            <div className="p-4 space-y-6 pt-16 pb-20 max-w-2xl mx-auto">
                <div className="flex items-start gap-4">
                    <Skeleton className="h-24 w-24 rounded-full" />
                    <div className="space-y-2 flex-1">
                        <Skeleton className="h-6 w-32" />
                        <Skeleton className="h-4 w-24" />
                        <div className="flex gap-4 pt-2">
                            <Skeleton className="h-4 w-16" />
                            <Skeleton className="h-4 w-16" />
                            <Skeleton className="h-4 w-16" />
                        </div>
                    </div>
                </div>
                <div className="space-y-4">
                    {[1, 2, 3].map(i => (
                        <Skeleton key={i} className="h-40 w-full rounded-xl" />
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="p-4 space-y-6 pt-16 pb-20 max-w-2xl mx-auto">
            {/* Header Profile */}
            <div className="relative">
                <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 text-center sm:text-left">
                    <Avatar className="h-24 w-24 border-4 border-background shadow-lg">
                        {user?.avatarUrl && <AvatarImage src={user.avatarUrl} className="object-cover" />}
                        <AvatarFallback className="text-2xl bg-primary/10 text-primary">
                            {userPage?.handle.substring(1, 3).toUpperCase()}
                        </AvatarFallback>
                    </Avatar>

                    <div className="flex-1 space-y-3">
                        <div>
                            <h2 className="text-2xl font-bold text-foreground">{user?.name}</h2>
                            <p className="text-muted-foreground font-medium">{userPage?.handle}</p>
                        </div>

                        <div className="flex items-center justify-center sm:justify-start gap-6 text-sm">
                            <div className="text-center sm:text-left">
                                <span className="block font-bold text-foreground text-lg">
                                    {userPage?.user?._count?.followers || 0}
                                </span>
                                <span className="text-muted-foreground">Abonnés</span>
                            </div>
                            <div className="text-center sm:text-left">
                                <span className="block font-bold text-foreground text-lg">
                                    {userPage?.user?._count?.following || 0}
                                </span>
                                <span className="text-muted-foreground">Abonnements</span>
                            </div>
                            <div className="text-center sm:text-left">
                                <span className="block font-bold text-foreground text-lg">
                                    {/* Calculated roughly from loaded posts or backend should provide it */}
                                    -
                                </span>
                                <span className="text-muted-foreground">J'aime</span>
                            </div>
                        </div>

                        {userPage?.bio && <p className="text-sm text-foreground/80 max-w-md">{userPage.bio}</p>}
                    </div>

                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={startPageEdit}>
                            <Pencil className="h-4 w-4 mr-2" /> Modifier
                        </Button>
                        <Button variant="destructive" size="icon" className="h-8 w-8" onClick={handleDeletePage}>
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            </div>

            <div className="flex justify-between items-center py-2 border-b border-border">
                <h3 className="font-semibold text-lg">Publications</h3>
                <Button onClick={() => setIsCreateOpen(true)} size="sm" className="bg-primary text-primary-foreground rounded-full">
                    <Plus className="h-4 w-4 mr-1" /> Nouveau
                </Button>
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

            {/* Posts List */}
            <div className="space-y-4">
                {posts.length === 0 && !loadingPosts && <p className="text-muted-foreground text-center py-8">Aucune publication pour le moment.</p>}

                {posts.map((post: any, index: number) => (
                    <div
                        key={post.id}
                        ref={index === posts.length - 1 ? lastPostElementRef : null}
                        className="bg-card border border-border p-4 rounded-xl relative group transition-all hover:border-primary/20"
                    >
                        {/* Actions */}
                        <div className="absolute top-3 right-3 flex gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-muted" onClick={() => startEdit(post)}>
                                <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive" onClick={() => handleDeletePost(post.id)}>
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        </div>

                        <p className="text-foreground whitespace-pre-wrap pr-16 text-lg">{post.content}</p>

                        {post.type === "TWEET" && post.reference && (
                            <p className="text-xs italic text-muted-foreground/70 border-l-2 pl-2 border-primary/20 mt-3">
                                Ref: {post.reference}
                            </p>
                        )}

                        {post.type === "CONTENT" && (
                            <>
                                {post.imageUrl && (
                                    <div className="mt-3 rounded-lg overflow-hidden border border-border/50 bg-black/5">
                                        <img src={post.imageUrl} alt="post" className="max-h-96 w-full object-contain" />
                                    </div>
                                )}
                                {post.caption && <p className="text-sm text-muted-foreground italic mt-2 text-center">{post.caption}</p>}
                            </>
                        )}

                        <div className="flex gap-6 text-xs text-muted-foreground mt-4 pt-3 border-t border-border/40">
                            <span className="flex items-center"><Users className="w-3 h-3 mr-1" /> {new Date(post.createdAt).toLocaleDateString()}</span>
                            <button
                                onClick={() => openInteractions(post, "LIKES")}
                                className="flex items-center hover:text-primary transition-colors"
                            >
                                <Heart className="w-3 h-3 mr-1" /> {post.likes.length} J'aime
                            </button>
                            <button
                                onClick={() => openInteractions(post, "COMMENTS")}
                                className="flex items-center hover:text-primary transition-colors"
                            >
                                <Users className="w-3 h-3 mr-1" />{post.comments.length} Coms
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {loadingPosts && posts.length > 0 && (
                <div className="space-y-4 pt-4">
                    <Skeleton className="h-40 w-full rounded-xl" />
                    <Skeleton className="h-40 w-full rounded-xl" />
                </div>
            )}


            {/* Edit Page Dialog */}
            <Dialog open={isEditPageOpen} onOpenChange={setIsEditPageOpen}>
                <DialogContent className="max-w-md bg-card border-border text-foreground">
                    <DialogHeader>
                        <DialogTitle>Modifier mon profil</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-2">
                        <div>
                            <Label className="block mb-2">Photo de profil</Label>
                            <div className="flex items-center gap-4">
                                <Avatar className="h-16 w-16">
                                    {editPageAvatarUrl && <AvatarImage src={editPageAvatarUrl} className="object-cover" />}
                                    <AvatarFallback>{editPageHandle?.substring(1, 3).toUpperCase()}</AvatarFallback>
                                </Avatar>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => editPageFileInputRef.current?.click()}
                                >
                                    <Upload className="w-4 h-4 mr-2" />
                                    Changer
                                </Button>
                                <input
                                    type="file"
                                    ref={editPageFileInputRef}
                                    className="hidden"
                                    accept="image/*"
                                    onChange={(e) => handleImageUpload(e, setEditPageAvatarUrl)}
                                />
                            </div>
                        </div>

                        <div>
                            <Label>Nom d'affichage</Label>
                            <Input
                                value={editPageName}
                                onChange={e => setEditPageName(e.target.value)}
                                className="bg-muted border-border"
                            />
                        </div>

                        <div>
                            <Label>Identifiant (Handle)</Label>
                            <Input
                                value={editPageHandle}
                                onChange={e => setEditPageHandle(e.target.value)}
                                className="bg-muted border-border"
                            />
                        </div>

                        <div>
                            <Label>Bio</Label>
                            <Textarea
                                value={editPageBio}
                                onChange={e => setEditPageBio(e.target.value)}
                                className="bg-muted border-border resize-none"
                                placeholder="Une petite description..."
                            />
                        </div>

                        <div className="flex justify-end gap-2 mt-4">
                            <Button variant="ghost" onClick={() => setIsEditPageOpen(false)}>Annuler</Button>
                            <Button onClick={handleUpdatePage}>Enregistrer</Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Edit Dialog */}
            <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
                <DialogContent className="max-w-md bg-card border-border text-foreground">
                    <DialogHeader>
                        <DialogTitle>Modifier la publication</DialogTitle>
                    </DialogHeader>
                    {/* Edit Form Content (Same as before) */}
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

            {/* Interaction Details Modal */}
            <Dialog open={isInteractionOpen} onOpenChange={setIsInteractionOpen}>
                <DialogContent className="max-w-2xl bg-card border-border text-foreground h-[80vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle>Détails de la publication</DialogTitle>
                    </DialogHeader>

                    <Tabs value={interactionTab} onValueChange={(v: any) => setInteractionTab(v)} className="flex-1 flex flex-col overflow-hidden">
                        <TabsList className="grid w-full grid-cols-2">
                            <TabsTrigger value="COMMENTS">Commentaires ({selectedPost?.comments.length || 0})</TabsTrigger>
                            <TabsTrigger value="LIKES">J'aime ({selectedPost?.likes.length || 0})</TabsTrigger>
                        </TabsList>

                        <TabsContent value="COMMENTS" className="flex-1 overflow-hidden flex flex-col">
                            <div className="flex-1 overflow-y-auto pr-2 mt-2">
                                {selectedPost?.comments?.length > 0 ? (
                                    renderComments(selectedPost.comments)
                                ) : (
                                    <p className="text-center text-muted-foreground py-8">Aucun commentaire.</p>
                                )}
                            </div>

                            {/* Comment Input */}
                            <div className="pt-4 border-t border-border mt-2">
                                {replyToId && (
                                    <div className="flex items-center justify-between text-xs text-muted-foreground mb-2 bg-muted/20 p-2 rounded">
                                        <span>Répondre à un commentaire</span>
                                        <button onClick={() => setReplyToId(null)}><X className="h-3 w-3" /></button>
                                    </div>
                                )}
                                <div className="flex gap-2">
                                    <Input
                                        placeholder={replyToId ? "Votre réponse..." : "Votre commentaire..."}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter") {
                                                sendComment(selectedPost.id, e.currentTarget.value);
                                                e.currentTarget.value = "";
                                            }
                                        }}
                                        className="bg-muted border-border"
                                    />
                                    <Button size="icon" onClick={() => {
                                        const input = document.querySelector('input[placeholder^="Votre"]') as HTMLInputElement;
                                        if (input) {
                                            sendComment(selectedPost.id, input.value);
                                            input.value = "";
                                        }
                                    }}>
                                        <Send className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        </TabsContent>

                        <TabsContent value="LIKES" className="flex-1 overflow-y-auto mt-2">
                            {selectedPost?.likes?.length > 0 ? (
                                <div className="space-y-3">
                                    {selectedPost.likes.map((like: any) => (
                                        <div key={like.userId} className="flex items-center gap-3 p-2 hover:bg-muted/50 rounded-lg">
                                            <Avatar className="h-8 w-8">
                                                {like.user.avatarUrl ? (
                                                    <AvatarImage src={like.user.avatarUrl} />
                                                ) : (
                                                    <AvatarFallback>{like.user.name?.substring(0, 2).toUpperCase()}</AvatarFallback>
                                                )}
                                            </Avatar>
                                            <span className="font-semibold">{like.user.name}</span>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-center text-muted-foreground py-8">Aucun j'aime pour le moment.</p>
                            )}
                        </TabsContent>
                    </Tabs>
                </DialogContent>
            </Dialog>
        </div>
    );
}

