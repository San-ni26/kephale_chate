"use client";

import { useState, useEffect } from "react";
import { Heart, MessageCircle, Link as LinkIcon, Send, UserPlus, UserCheck, X } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/src/components/ui/avatar";
import { Skeleton } from "@/src/components/ui/skeleton";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { getAuthHeader, getUser, type AuthUser } from "@/src/lib/auth-client";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import useSWR from "swr";
import { fetcher } from "@/src/lib/fetcher";

interface Comment {
    id: string;
    content: string;
    createdAt: string;
    user: {
        id: string;
        name: string | null;
        avatarUrl?: string | null;
    };
    replies?: Comment[];
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
        userId: string;
        handle: string;
        user: {
            avatarUrl: string | null;
        }
    };
    likes: { userId: string }[];
    comments: Comment[];
    isFollowing?: boolean;
}



// ... (interfaces stay same)

export default function FeedPage() {
    const [user, setUser] = useState<AuthUser | null>(null);
    const [expandedPostId, setExpandedPostId] = useState<string | null>(null);
    const [commentText, setCommentText] = useState("");
    const [replyToId, setReplyToId] = useState<string | null>(null);

    useEffect(() => {
        setUser(getUser());
    }, []);

    const { data: postsData, error: postsError, mutate: mutatePosts } = useSWR(
        '/api/posts',
        fetcher
    );

    const posts: Post[] = postsData?.posts || [];
    const loading = !postsData && !postsError;

    // Helper to refresh posts (replaces fetchPosts)
    const refreshPosts = () => mutatePosts();

    const handleLike = async (postId: string) => {
        if (!user) return;

        const newPosts = posts.map(p => {
            if (p.id === postId) {
                const hasLiked = p.likes.some(l => l.userId === user.id);
                if (hasLiked) return { ...p, likes: p.likes.filter(l => l.userId !== user.id) };
                return { ...p, likes: [...p.likes, { userId: user.id }] };
            }
            return p;
        });

        mutatePosts({ posts: newPosts }, false);

        try {
            const res = await fetch(`/api/posts/${postId}/like`, { method: "POST", headers: getAuthHeader() });
            if (!res.ok) {
                mutatePosts();
            }
        } catch (error) {
            toast.error("Erreur action");
            mutatePosts();
        }
    };

    const handleFollow = async (targetUserId: string, isFollowing: boolean) => {
        const newPosts = posts.map(p => p.page.userId === targetUserId ? { ...p, isFollowing: !isFollowing } : p);
        mutatePosts({ posts: newPosts }, false);

        try {
            const res = await fetch("/api/follow", {
                method: "POST",
                headers: { "Content-Type": "application/json", ...getAuthHeader() },
                body: JSON.stringify({ targetUserId })
            });

            if (!res.ok) {
                mutatePosts();
                toast.error("Erreur lors de l'action");
            } else {
                const data = await res.json();
                const finalPosts = posts.map(p => p.page.userId === targetUserId ? { ...p, isFollowing: data.isFollowing } : p);
                mutatePosts({ posts: finalPosts }, false);
                toast.success(data.isFollowing ? "Abonnement réussi" : "Désabonnement réussi");
            }
        } catch (error) {
            mutatePosts();
            toast.error("Erreur connexion");
        }
    };

    const handleComment = async (postId: string) => {
        if (!commentText.trim()) return;

        try {
            const res = await fetch(`/api/posts/${postId}/comment`, {
                method: "POST",
                headers: { "Content-Type": "application/json", ...getAuthHeader() },
                body: JSON.stringify({ content: commentText, parentId: replyToId })
            });

            if (res.ok) {
                setCommentText("");
                setReplyToId(null);
                mutatePosts();
                toast.success("Commentaire ajouté");
            }
        } catch (error) {
            toast.error("Erreur action");
        }
    };

    const toggleComments = (postId: string) => {
        if (expandedPostId === postId) {
            setExpandedPostId(null);
            setReplyToId(null);
        } else {
            setExpandedPostId(postId);
            setCommentText("");
            setReplyToId(null);
        }
    };

    const copyLink = (postId: string) => {
        navigator.clipboard.writeText(`${window.location.origin}/chat/notifications?post=${postId}`);
        toast.success("Lien copié !");
    };

    const CommentItem = ({ comment, depth = 0 }: { comment: Comment, depth?: number }) => {
        const [showReplies, setShowReplies] = useState(false);
        const hasReplies = comment.replies && comment.replies.length > 0;

        return (
            <div className={`text-sm group mb-2 ${depth > 0 ? "mt-2" : ""}`}>
                <div className="flex flex-col">
                    <div className="flex items-baseline gap-2">
                        <span className="font-semibold text-xs text-foreground/80">{comment.user?.name || "Utilisateur"}</span>
                        <span className="text-[10px] text-muted-foreground/70">
                            {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true, locale: fr })}
                        </span>
                    </div>

                    <p className="text-foreground/90 py-1 transition-colors text-[13px]">
                        {comment.content}
                    </p>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setReplyToId(comment.id)}
                            className="text-[11px] text-muted-foreground hover:text-primary font-medium transition-colors"
                        >
                            Répondre
                        </button>

                        {hasReplies && (
                            <button
                                onClick={() => setShowReplies(!showReplies)}
                                className="text-[11px] text-primary/80 hover:text-primary font-medium transition-colors flex items-center gap-1"
                            >
                                <div className="w-4 h-[1px] bg-current opacity-50"></div>
                                {showReplies ? "Masquer les réponses" : `Voir les réponses (${comment.replies!.length})`}
                            </button>
                        )}
                    </div>
                </div>

                {/* Replies */}
                {hasReplies && showReplies && (
                    <div className="pl-3 border-l-2 border-border/30 ml-1">
                        {comment.replies?.map(reply => (
                            <CommentItem key={reply.id} comment={reply} depth={depth + 1} />
                        ))}
                    </div>
                )}
            </div>
        );
    };

    const PostComments = ({ comments }: { comments: Comment[] }) => {
        const [showAll, setShowAll] = useState(false);
        const visibleComments = showAll ? comments : comments.slice(0, 3);
        const hiddenCount = comments.length - visibleComments.length;

        if (comments.length === 0) {
            return <p className="text-xs text-muted-foreground italic pt-2 text-center">Soyez le premier à commenter !</p>;
        }

        return (
            <div className="space-y-3 pl-2 mt-2">
                {visibleComments.map(comment => (
                    <CommentItem key={comment.id} comment={comment} />
                ))}

                {!showAll && hiddenCount > 0 && (
                    <button
                        onClick={() => setShowAll(true)}
                        className="text-xs text-muted-foreground hover:text-foreground italic w-full text-left pt-1 pl-1"
                    >
                        Voir {hiddenCount} autres commentaires...
                    </button>
                )}
            </div>
        );
    };

    if (loading) {
        return (
            <div className="p-4 space-y-6 pt-16 pb-20 max-w-2xl mx-auto">
                <h2 className="text-xl font-bold px-2 text-foreground">Actualité</h2>
                <div className="space-y-4">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="bg-card border border-border p-4 rounded-xl space-y-3 shadow-sm">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-3">
                                    <Skeleton className="h-10 w-10 rounded-full" />
                                    <div className="space-y-2">
                                        <Skeleton className="h-4 w-32" />
                                        <Skeleton className="h-3 w-24" />
                                    </div>
                                </div>
                                <Skeleton className="h-8 w-20" />
                            </div>
                            <div className="space-y-2 pl-1">
                                <Skeleton className="h-4 w-full" />
                                <Skeleton className="h-4 w-3/4" />
                            </div>
                            <div className="flex items-center space-x-4 pt-3 border-t border-border/50">
                                <Skeleton className="h-8 flex-1" />
                                <Skeleton className="h-8 flex-1" />
                                <Skeleton className="h-8 w-10" />
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="p-4 space-y-6 pt-16 pb-20 max-w-2xl mx-auto">
            <h2 className="text-xl font-bold px-2 text-foreground">Actualité</h2>
            <div className="space-y-4">
                {posts.length === 0 && <p className="text-muted-foreground text-center">Aucune actualité pour le moment.</p>}

                {posts.map(post => (
                    <div key={post.id} className="bg-card border border-border p-4 rounded-xl space-y-3 shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-3">
                                <Avatar className="h-10 w-10">
                                    {post.page.user.avatarUrl && <AvatarImage src={post.page.user.avatarUrl} className="object-cover" />}
                                    <AvatarFallback className="bg-primary/10 text-primary">{post.page.handle.substring(1, 3).toUpperCase()}</AvatarFallback>
                                </Avatar>
                                <div>
                                    <p className="font-semibold text-foreground flex items-center gap-2">
                                        {post.page.handle}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        {formatDistanceToNow(new Date(post.createdAt), { addSuffix: true, locale: fr })}
                                    </p>
                                </div>
                            </div>

                            {user && post.page.userId !== user.id && (
                                <Button
                                    variant={post.isFollowing ? "secondary" : "default"}
                                    size="sm"
                                    onClick={() => handleFollow(post.page.userId, !!post.isFollowing)}
                                    className={`h-8 font-medium ${post.isFollowing ? 'text-muted-foreground' : ''}`}
                                >
                                    {post.isFollowing ? (
                                        <>
                                            <UserCheck className="w-4 h-4 mr-1.5" /> Suivi
                                        </>
                                    ) : (
                                        <>
                                            <UserPlus className="w-4 h-4 mr-1.5" /> Suivre
                                        </>
                                    )}
                                </Button>
                            )}
                        </div>

                        {/* Content */}
                        <div className="text-foreground pl-1">
                            {post.type === "TWEET" ? (
                                <div className="space-y-2">
                                    <p className="text-xl font-serif italic text-center px-6 py-4 border-l-4 border-primary/20 bg-muted/10 rounded-r-lg">
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
                                        <div className="rounded-lg overflow-hidden my-2 border border-border/50">
                                            <img src={post.imageUrl} alt="Post content" className="w-full h-auto object-cover max-h-96" />
                                        </div>
                                    )}
                                    {post.caption && <p className="text-sm text-center text-muted-foreground italic bg-muted/20 py-1 rounded-md">{post.caption}</p>}
                                </div>
                            )}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center space-x-4 pt-3 border-t border-border/50">
                            <Button variant="ghost" size="sm" onClick={() => handleLike(post.id)}
                                className={`flex-1 ${post.likes.some(l => l.userId === user?.id) ? "text-red-500 hover:text-red-600 bg-red-500/5 hover:bg-red-500/10" : "text-muted-foreground hover:text-foreground"}`}>
                                <Heart className={`w-4 h-4 mr-1.5 ${post.likes.some(l => l.userId === user?.id) ? "fill-current" : ""}`} />
                                {post.likes.length} <span className="sr-only sm:not-sr-only sm:ml-1">J'aime</span>
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => toggleComments(post.id)}
                                className={`flex-1 ${expandedPostId === post.id ? "text-primary bg-primary/5" : "text-muted-foreground hover:text-foreground"}`}>
                                <MessageCircle className="w-4 h-4 mr-1.5" />
                                {post.comments.length} <span className="sr-only sm:not-sr-only sm:ml-1">Coms</span>
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => copyLink(post.id)} className="flex-0 text-muted-foreground hover:text-foreground">
                                <LinkIcon className="w-4 h-4" />
                            </Button>
                        </div>

                        {/* Comments Section */}
                        {expandedPostId === post.id && (
                            <div className="pt-2 space-y-3 animate-in fade-in slide-in-from-top-2">
                                {/* Comment Input */}
                                <div className="pb-2 border-b border-border/40">
                                    {replyToId && (
                                        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1 bg-muted/20 p-1.5 rounded">
                                            <span>Réponse à un commentaire</span>
                                            <button onClick={() => setReplyToId(null)} className="hover:text-foreground"><X className="h-3 w-3" /></button>
                                        </div>
                                    )}
                                    <div className="flex gap-2 items-center">
                                        <Input
                                            placeholder={replyToId ? "Votre réponse..." : "Votre commentaire..."}
                                            value={commentText}
                                            onChange={(e) => setCommentText(e.target.value)}
                                            className="h-9 text-sm bg-muted/50 text-foreground"
                                            onKeyDown={(e) => e.key === "Enter" && handleComment(post.id)}
                                        />
                                        <Button size="icon" className="h-9 w-9" onClick={() => handleComment(post.id)}>
                                            <Send className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>

                                {/* Comments List */}
                                <PostComments comments={posts.find(p => p.id === post.id)?.comments || []} />
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
