"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { ArrowLeft, UserPlus, UserCheck, Heart, MessageCircle, Link as LinkIcon, Send, X } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/src/components/ui/avatar";
import { Input } from "@/src/components/ui/input";
import { Skeleton } from "@/src/components/ui/skeleton";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import { getAuthHeader, getUser } from "@/src/lib/auth-client";
import useSWR from "swr";
import { fetcher } from "@/src/lib/fetcher";

export default function PublicPageView() {
    const router = useRouter();
    const params = useParams();
    const rawHandle = params?.handle as string;
    const handle = (() => {
        if (!rawHandle) return "";
        try {
            return rawHandle.includes("%") ? decodeURIComponent(rawHandle) : rawHandle;
        } catch {
            return rawHandle;
        }
    })();
    const [user, setUser] = useState<any>(null);
    const [posts, setPosts] = useState<any[]>([]);
    const [loadingPosts, setLoadingPosts] = useState(false);
    const [expandedPostId, setExpandedPostId] = useState<string | null>(null);
    const [commentText, setCommentText] = useState("");
    const [replyToId, setReplyToId] = useState<string | null>(null);
    const [cursor, setCursor] = useState<string | null>(null);
    const [hasMore, setHasMore] = useState(true);
    const observer = useRef<IntersectionObserver | null>(null);

    useEffect(() => {
        setUser(getUser());
    }, []);

    const { data: pageData, error: pageError, mutate: mutatePage } = useSWR(
        handle ? `/api/page/${encodeURIComponent(handle)}` : null,
        fetcher,
        { revalidateOnFocus: false }
    );

    const page = pageData?.page;
    const pageLoading = !pageData && !pageError;

    const fetchMorePosts = useCallback(
        async (currentCursor: string | null, isInitial = false) => {
            if (!handle) return;
            if (!isInitial && (!hasMore || loadingPosts)) return;

            setLoadingPosts(true);
            try {
                const url = new URL(`/api/page/${encodeURIComponent(handle)}/posts`, window.location.origin);
                url.searchParams.set("limit", "10");
                if (currentCursor) url.searchParams.set("cursor", currentCursor);

                const res = await fetch(url.toString(), { headers: getAuthHeader() });
                const data = await res.json();

                if (data.posts) {
                    if (isInitial) {
                        setPosts(data.posts);
                    } else {
                        setPosts((prev) => [...prev, ...data.posts]);
                    }
                    setCursor(data.nextCursor || null);
                    setHasMore(!!data.nextCursor);
                }
            } catch (err) {
                console.error(err);
            } finally {
                setLoadingPosts(false);
            }
        },
        [handle, hasMore, loadingPosts]
    );

    useEffect(() => {
        if (page?.id && posts.length === 0 && !loadingPosts) {
            fetchMorePosts(null, true);
        }
    }, [page?.id]);

    const lastPostRef = useCallback(
        (node: HTMLDivElement) => {
            if (loadingPosts) return;
            if (observer.current) observer.current.disconnect();
            observer.current = new IntersectionObserver(
                (entries) => {
                    if (entries[0]?.isIntersecting && hasMore && page) {
                        fetchMorePosts(cursor);
                    }
                },
                { rootMargin: "200px" }
            );
            if (node) observer.current.observe(node);
        },
        [loadingPosts, hasMore, cursor, page, fetchMorePosts]
    );

    const handleLike = async (postId: string) => {
        if (!user) {
            toast.error("Connectez-vous pour aimer");
            return;
        }
        setPosts((prev) =>
            prev.map((p) => {
                if (p.id !== postId) return p;
                const hasLiked = p.likes?.some((l: { userId: string }) => l.userId === user.id);
                return {
                    ...p,
                    likes: hasLiked
                        ? (p.likes || []).filter((l: { userId: string }) => l.userId !== user.id)
                        : [...(p.likes || []), { userId: user.id }]
                };
            })
        );
        try {
            const res = await fetch(`/api/posts/${postId}/like`, {
                method: "POST",
                headers: getAuthHeader()
            });
            if (!res.ok) fetchMorePosts(null, true);
        } catch {
            fetchMorePosts(null, true);
        }
    };

    const handleComment = async (postId: string) => {
        if (!commentText.trim() || !user) return;
        try {
            const res = await fetch(`/api/posts/${postId}/comment`, {
                method: "POST",
                headers: { "Content-Type": "application/json", ...getAuthHeader() },
                body: JSON.stringify({ content: commentText, parentId: replyToId })
            });
            if (res.ok) {
                setCommentText("");
                setReplyToId(null);
                toast.success("Commentaire ajouté");
                fetchMorePosts(null, true);
            }
        } catch {
            toast.error("Erreur");
        }
    };

    const toggleComments = (postId: string) => {
        if (expandedPostId === postId) {
            setExpandedPostId(null);
            setReplyToId(null);
        } else {
            setExpandedPostId(postId);
        }
    };

    const copyLink = (postId: string) => {
        navigator.clipboard.writeText(
            `${typeof window !== "undefined" ? window.location.origin : ""}/chat/notifications?post=${postId}`
        );
        toast.success("Lien copié");
    };

    const handleFollow = async () => {
        if (!user) {
            router.push("/login");
            return;
        }
        if (!page) return;

        try {
            const res = await fetch("/api/follow", {
                method: "POST",
                headers: { "Content-Type": "application/json", ...getAuthHeader() },
                body: JSON.stringify({ targetUserId: page.userId })
            });
            const data = await res.json();
            if (res.ok) {
                mutatePage();
                toast.success(data.isFollowing ? "Abonnement ajouté" : "Désabonnement");
            } else {
                toast.error(data.error || "Erreur");
            }
        } catch {
            toast.error("Erreur connexion");
        }
    };

    if (pageError || (pageData && !page)) {
        return (
            <div className="min-h-screen pt-16 pb-20 px-4 flex flex-col items-center justify-center">
                <p className="text-muted-foreground mb-4">Page non trouvée</p>
                <Button variant="outline" onClick={() => router.push("/chat/notifications")}>
                    <ArrowLeft className="w-4 h-4 mr-2" /> Retour
                </Button>
            </div>
        );
    }

    if (pageLoading || !page) {
        return (
            <div className="p-4 space-y-6 pt-16 pb-20 max-w-2xl mx-auto">
                <div className="flex items-center gap-3">
                    <Skeleton className="h-12 w-12 rounded-full" />
                    <div className="space-y-2">
                        <Skeleton className="h-6 w-32" />
                        <Skeleton className="h-4 w-24" />
                    </div>
                </div>
                <div className="space-y-4">
                    {[1, 2, 3].map((i) => (
                        <Skeleton key={i} className="h-40 w-full rounded-xl" />
                    ))}
                </div>
            </div>
        );
    }

    const isOwnPage = user && page.userId === user.id;

    function CommentItem({ comment, depth = 0 }: { comment: any; depth?: number }) {
        const [showReplies, setShowReplies] = useState(false);
        const hasReplies = comment.replies && comment.replies.length > 0;
        return (
            <div className={`text-sm group mb-2 ${depth > 0 ? "mt-2" : ""}`}>
                <div className="flex flex-col">
                    <div className="flex items-baseline gap-2">
                        <span className="font-semibold text-xs text-foreground/80">
                            {comment.user?.name || "Utilisateur"}
                        </span>
                        <span className="text-[10px] text-muted-foreground/70">
                            {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true, locale: fr })}
                        </span>
                    </div>
                    <p className="text-foreground/90 py-1 text-[13px]">{comment.content}</p>
                    <div className="flex items-center gap-3">
                        {user && (
                            <button
                                onClick={() => setReplyToId(comment.id)}
                                className="text-[11px] text-muted-foreground hover:text-primary font-medium"
                            >
                                Répondre
                            </button>
                        )}
                        {hasReplies && (
                            <button
                                onClick={() => setShowReplies(!showReplies)}
                                className="text-[11px] text-primary/80 hover:text-primary font-medium flex items-center gap-1"
                            >
                                {showReplies ? "Masquer" : `Réponses (${comment.replies!.length})`}
                            </button>
                        )}
                    </div>
                </div>
                {hasReplies && showReplies && (
                    <div className="pl-3 border-l-2 border-border/30 ml-1">
                        {comment.replies?.map((reply: any) => (
                            <CommentItem key={reply.id} comment={reply} depth={depth + 1} />
                        ))}
                    </div>
                )}
            </div>
        );
    }

    function PostComments({ comments }: { comments: any[] }) {
        const [showAll, setShowAll] = useState(false);
        const visible = showAll ? comments : comments.slice(0, 3);
        const hidden = comments.length - visible.length;
        if (comments.length === 0) {
            return (
                <p className="text-xs text-muted-foreground italic pt-2 text-center">
                    Soyez le premier à commenter
                </p>
            );
        }
        return (
            <div className="space-y-3 pl-2 mt-2">
                {visible.map((c: any) => (
                    <CommentItem key={c.id} comment={c} />
                ))}
                {!showAll && hidden > 0 && (
                    <button
                        onClick={() => setShowAll(true)}
                        className="text-xs text-muted-foreground hover:text-foreground italic w-full text-left pt-1"
                    >
                        Voir {hidden} autres...
                    </button>
                )}
            </div>
        );
    }

    return (
        <div className="p-4 space-y-4 pt-16 pb-20 max-w-2xl mx-auto">
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 text-center sm:text-left">
                <Avatar className="h-16 w-16 border-2 border-background shrink-0">
                    <AvatarImage src={page.user?.avatarUrl ?? undefined} className="object-cover" />
                    <AvatarFallback className="text-lg bg-primary/10 text-primary">
                        {page.handle?.substring(1, 3).toUpperCase() ?? "?"}
                    </AvatarFallback>
                </Avatar>

                <div className="flex-1 min-w-0 space-y-1">
                    <h2 className="text-lg font-bold text-foreground truncate">{page.handle}</h2>
                    <div className="flex justify-center sm:justify-start gap-4 text-xs pt-1">
                        <span><strong>{page.user?._count?.followers ?? 0}</strong> Abonnés</span>
                        <span><strong>{page._count?.posts ?? 0}</strong> Publications</span>
                    </div>
                    {page.bio && <p className="text-xs text-foreground/80 line-clamp-2 mt-1">{page.bio}</p>}
                </div>

                {!isOwnPage && user && (
                    <Button
                        variant={page.isFollowing ? "secondary" : "default"}
                        size="sm"
                        onClick={handleFollow}
                        className="shrink-0"
                    >
                        {page.isFollowing ? (
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

                {!user && (
                    <Button variant="outline" size="sm" onClick={() => router.push("/login")} className="shrink-0">
                        <UserPlus className="w-4 h-4 mr-1.5" /> Suivre
                    </Button>
                )}
            </div>

            <h3 className="font-semibold text-sm py-2 border-b border-border">Publications</h3>

            <div className="space-y-4">
                {posts.length === 0 && !loadingPosts && (
                    <p className="text-muted-foreground text-center py-8">Aucune publication pour le moment.</p>
                )}

                {posts.map((post: any, index: number) => (
                    <article
                        key={post.id}
                        ref={index === posts.length - 1 ? lastPostRef : null}
                        className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow"
                    >
                        <div className="p-4 space-y-3">
                            <div className="flex items-center gap-3">
                                <Avatar className="h-10 w-10">
                                    <AvatarImage src={post.page?.user?.avatarUrl ?? undefined} className="object-cover" />
                                    <AvatarFallback className="bg-primary/10 text-primary">
                                        {post.page?.handle?.substring(1, 3).toUpperCase() ?? "?"}
                                    </AvatarFallback>
                                </Avatar>
                                <div>
                                    <p className="font-semibold text-foreground">{post.page?.handle}</p>
                                    <p className="text-xs text-muted-foreground">
                                        {formatDistanceToNow(new Date(post.createdAt), { addSuffix: true, locale: fr })}
                                    </p>
                                </div>
                            </div>

                            <div className="text-foreground pl-1">
                                {post.type === "TWEET" ? (
                                    <div className="space-y-2">
                                        <p className="text-lg font-serif italic text-center px-4 py-3 border-l-4 border-primary/20 bg-muted/10 rounded-r-lg">
                                            &quot;{post.content}&quot;
                                        </p>
                                        {post.reference && (
                                            <p className="text-xs italic text-muted-foreground/70 text-right">
                                                ~ {post.reference}
                                            </p>
                                        )}
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        <p className="whitespace-pre-wrap">{post.content}</p>
                                        {post.imageUrl && (
                                            <div className="rounded-xl overflow-hidden my-2 border border-border/50">
                                                <img src={post.imageUrl} alt="" className="w-full h-auto object-cover max-h-96" />
                                            </div>
                                        )}
                                        {post.caption && (
                                            <p className="text-sm text-center text-muted-foreground italic bg-muted/20 py-1 rounded-lg">
                                                {post.caption}
                                            </p>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div className="flex items-center gap-2 pt-3 border-t border-border/50">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleLike(post.id)}
                                    className={`flex-1 ${post.likes?.some((l: { userId: string }) => l.userId === user?.id)
                                        ? "text-red-500 hover:text-red-600 bg-red-500/5"
                                        : "text-muted-foreground hover:text-foreground"
                                        }`}
                                >
                                    <Heart
                                        className={`w-4 h-4 mr-1.5 ${post.likes?.some((l: { userId: string }) => l.userId === user?.id) ? "fill-current" : ""}`}
                                    />
                                    {post.likes?.length ?? 0} J&apos;aime
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => toggleComments(post.id)}
                                    className={`flex-1 ${expandedPostId === post.id ? "text-primary bg-primary/5" : "text-muted-foreground hover:text-foreground"}`}
                                >
                                    <MessageCircle className="w-4 h-4 mr-1.5" />
                                    {post.comments?.length ?? 0} Coms
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => copyLink(post.id)}
                                    className="text-muted-foreground hover:text-foreground"
                                >
                                    <LinkIcon className="w-4 h-4" />
                                </Button>
                            </div>

                            {expandedPostId === post.id && (
                                <div className="pt-2 space-y-3 border-t border-border/40 animate-in fade-in">
                                    <div className="pb-2">
                                        {replyToId && (
                                            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1 bg-muted/20 p-1.5 rounded">
                                                <span>Réponse</span>
                                                <button type="button" onClick={() => setReplyToId(null)} className="hover:text-foreground">
                                                    <X className="h-3 w-3" />
                                                </button>
                                            </div>
                                        )}
                                        {user ? (
                                            <div className="flex gap-2 items-center">
                                                <Input
                                                    placeholder={replyToId ? "Votre réponse..." : "Commentaire..."}
                                                    value={commentText}
                                                    onChange={(e) => setCommentText(e.target.value)}
                                                    className="h-9 text-sm bg-muted/50"
                                                    onKeyDown={(e) => e.key === "Enter" && handleComment(post.id)}
                                                />
                                                <Button size="icon" className="h-9 w-9" onClick={() => handleComment(post.id)}>
                                                    <Send className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        ) : (
                                            <p className="text-xs text-muted-foreground italic">Connectez-vous pour commenter</p>
                                        )}
                                    </div>
                                    <PostComments comments={post.comments ?? []} />
                                </div>
                            )}
                        </div>
                    </article>
                ))}

                {loadingPosts && (
                    <div className="flex justify-center py-4">
                        <Skeleton className="h-8 w-8 rounded-full animate-pulse" />
                    </div>
                )}
            </div>
        </div>
    );
}
