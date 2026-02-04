"use client";

import { useState, useEffect } from "react";
import { Heart, MessageCircle, Link as LinkIcon, Send } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/src/components/ui/avatar";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { getAuthHeader, getUser, type AuthUser } from "@/src/lib/auth-client";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";

interface Comment {
    id: string;
    content: string;
    createdAt: string;
    user: {
        id: string;
        name: string | null;
    };
}

interface Post {
    id: string;
    type: "TWEET" | "CONTENT";
    content: string;
    imageUrl?: string;
    caption?: string;
    reference?: string;
    createdAt: string;
    page: {
        handle: string;
    };
    likes: { userId: string }[];
    comments: Comment[];
}

export default function FeedPage() {
    const [posts, setPosts] = useState<Post[]>([]);
    const [user, setUser] = useState<AuthUser | null>(null);
    const [expandedPostId, setExpandedPostId] = useState<string | null>(null);
    const [commentText, setCommentText] = useState("");

    useEffect(() => {
        setUser(getUser());
        fetchPosts();
    }, []);

    const fetchPosts = async () => {
        try {
            const res = await fetch("/api/posts", { headers: getAuthHeader() });
            const data = await res.json();
            if (data.posts) setPosts(data.posts);
        } catch (error) {
            console.error(error);
        }
    };

    const handleLike = async (postId: string) => {
        try {
            const res = await fetch(`/api/posts/${postId}/like`, { method: "POST", headers: getAuthHeader() });
            if (res.ok) {
                fetchPosts();
            }
        } catch (error) {
            toast.error("Erreur action");
        }
    };

    const handleComment = async (postId: string) => {
        if (!commentText.trim()) return;

        try {
            const res = await fetch(`/api/posts/${postId}/comment`, {
                method: "POST",
                headers: { "Content-Type": "application/json", ...getAuthHeader() },
                body: JSON.stringify({ content: commentText })
            });

            if (res.ok) {
                setCommentText("");
                fetchPosts();
                toast.success("Commentaire ajouté");
            }
        } catch (error) {
            toast.error("Erreur action");
        }
    };

    const toggleComments = (postId: string) => {
        if (expandedPostId === postId) {
            setExpandedPostId(null);
        } else {
            setExpandedPostId(postId);
            setCommentText("");
        }
    };

    const copyLink = (postId: string) => {
        navigator.clipboard.writeText(`${window.location.origin}/chat/notifications?post=${postId}`);
        toast.success("Lien copié !");
    };

    return (
        <div className="p-4 space-y-6 pt-16 pb-20">
            <h2 className="text-xl font-bold px-2 text-foreground">Actualité</h2>
            <div className="space-y-4">
                {posts.length === 0 && <p className="text-muted-foreground text-center">Aucune actualité pour le moment.</p>}

                {posts.map(post => (
                    <div key={post.id} className="bg-card border border-border p-4 rounded-xl space-y-3">
                        <div className="flex items-center space-x-3">
                            <Avatar className="h-10 w-10">
                                <AvatarFallback>{post.page.handle.substring(1, 3).toUpperCase()}</AvatarFallback>
                            </Avatar>
                            <div>
                                <p className="font-semibold text-foreground">{post.page.handle}</p>
                                <p className="text-xs text-muted-foreground">
                                    {formatDistanceToNow(new Date(post.createdAt), { addSuffix: true, locale: fr })}
                                </p>
                            </div>
                        </div>

                        {/* Content */}
                        <div className="text-foreground">
                            {post.type === "TWEET" ? (
                                <div className="space-y-2">
                                    <p className="text-xl font-serif italic text-center px-4 py-2 border-l-4 border-primary/20 bg-muted/10 rounded-r-lg">
                                        "{post.content}"
                                    </p>
                                    {post.reference && (
                                        <p className="text-xs italic text-muted-foreground/70 text-right pr-2">
                                            ~ {post.reference}
                                        </p>
                                    )}
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    <p>{post.content}</p>
                                    {post.imageUrl && (
                                        <div className="rounded-lg overflow-hidden my-2">
                                            <img src={post.imageUrl} alt="Post content" className="w-full h-auto object-cover max-h-96" />
                                        </div>
                                    )}
                                    {post.caption && <p className="text-sm text-center text-muted-foreground italic">{post.caption}</p>}
                                </div>
                            )}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center space-x-4 pt-2 border-t border-border/50">
                            <Button variant="ghost" size="sm" onClick={() => handleLike(post.id)}
                                className={post.likes.some(l => l.userId === user?.id) ? "text-red-500 hover:text-red-600" : "text-muted-foreground hover:text-foreground"}>
                                <Heart className={`w-4 h-4 mr-1 ${post.likes.some(l => l.userId === user?.id) ? "fill-current" : ""}`} />
                                {post.likes.length}
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => toggleComments(post.id)}
                                className={expandedPostId === post.id ? "text-primary" : "text-muted-foreground hover:text-foreground"}>
                                <MessageCircle className="w-4 h-4 mr-1" />
                                {post.comments.length}
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => copyLink(post.id)} className="text-muted-foreground hover:text-foreground ml-auto">
                                <LinkIcon className="w-4 h-4" />
                            </Button>
                        </div>

                        {/* Comments Section */}
                        {/* Comments Section */}
                        {expandedPostId === post.id && (
                            <div className="pt-2 space-y-3 animate-in fade-in slide-in-from-top-2">
                                {/* Comment Input at Top */}
                                <div className="flex gap-2 items-center pb-2 border-b border-border/40">
                                    <Input
                                        placeholder="Votre commentaire..."
                                        value={commentText}
                                        onChange={(e) => setCommentText(e.target.value)}
                                        className="h-9 text-sm bg-muted/50 text-foreground"
                                        onKeyDown={(e) => e.key === "Enter" && handleComment(post.id)}
                                    />
                                    <Button size="icon" className="h-9 w-9" onClick={() => handleComment(post.id)}>
                                        <Send className="h-4 w-4" />
                                    </Button>
                                </div>

                                {/* Comments List (Newest first) */}
                                <div className="space-y-3 pl-2 border-l-2 border-border/50 max-h-60 overflow-y-auto">
                                    {[...post.comments].reverse().map(comment => (
                                        <div key={comment.id} className="text-sm">
                                            <div className="flex items-baseline justify-between">
                                                <span className="font-semibold text-foreground mr-2">{comment.user?.name || "Utilisateur"}</span>
                                                <span className="text-[10px] text-muted-foreground">
                                                    {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true, locale: fr })}
                                                </span>
                                            </div>
                                            <p className="text-foreground/90">{comment.content}</p>
                                        </div>
                                    ))}
                                    {post.comments.length === 0 && <p className="text-xs text-muted-foreground italic pt-2">Aucun commentaire.</p>}
                                </div>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
