"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
    Heart,
    MessageCircle,
    Link as LinkIcon,
    Send,
    UserPlus,
    UserCheck,
    X,
    Loader2,
    Plus
} from "lucide-react";
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
import { useFeedSearch } from "@/src/contexts/FeedSearchContext";
import { useRouter } from "next/navigation";

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
        user: { avatarUrl: string | null; name?: string | null };
    };
    likes: { userId: string }[];
    comments: Comment[];
    isFollowing?: boolean;
    isRead?: boolean;
}

interface FollowedPage {
    pageId: string;
    userId: string;
    handle: string;
    avatarUrl: string | null;
    name: string | null;
    unreadCount: number;
    firstUnreadPostId?: string | null;
    latestPostImageUrl?: string | null;
}

export default function FeedPage() {
    const router = useRouter();
    const { searchQ, setSearchQ, searchOpen, setSearchOpen, closeSearch } = useFeedSearch();
    const [user, setUser] = useState<AuthUser | null>(() => (typeof window !== "undefined" ? getUser() : null));
    const [expandedPostId, setExpandedPostId] = useState<string | null>(null);
    const [commentText, setCommentText] = useState("");
    const [replyToId, setReplyToId] = useState<string | null>(null);
    const [feedOffset, setFeedOffset] = useState(0);
    const loadMoreRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setUser(getUser());
    }, []);

    const { data: followedData, mutate: mutateFollowed } = useSWR<{ pages: FollowedPage[] }>(
        "/api/feed/followed-pages",
        fetcher
    );
    const { data: userPageData } = useSWR(user ? "/api/user-page" : null, fetcher);
    const userPage = userPageData?.userPage;
    const allFollowedPages: FollowedPage[] = followedData?.pages ?? [];
    const followedPagesWithNewPosts = allFollowedPages.filter((p) => p.unreadCount > 0);

    const feedKey = `/api/feed?limit=12&offset=${feedOffset}`;
    const { data: feedData, error: feedError, mutate: mutateFeed } = useSWR<{
        posts: Post[];
        nextCursor?: string;
    }>(searchOpen ? null : feedKey, fetcher);

    const [accumulatedPosts, setAccumulatedPosts] = useState<Post[]>([]);
    useEffect(() => {
        if (!feedData?.posts) return;
        if (feedOffset === 0) {
            setAccumulatedPosts(feedData.posts);
        } else {
            setAccumulatedPosts((prev) => {
                const ids = new Set(prev.map((p) => p.id));
                const newOnes = feedData.posts.filter((p) => !ids.has(p.id));
                return [...prev, ...newOnes];
            });
        }
    }, [feedData?.posts, feedOffset]);

    const posts = accumulatedPosts;
    const nextCursor = feedData?.nextCursor;
    const feedLoading = !feedData && !feedError && !searchOpen;

    const searchUrl =
        searchQ.trim().length >= 2
            ? `/api/feed/search?q=${encodeURIComponent(searchQ.trim())}`
            : null;
    const { data: searchData } = useSWR<{ pages: FollowedPage[]; posts: Post[] }>(
        searchOpen && searchUrl ? searchUrl : null,
        fetcher
    );
    const searchResults = searchData;

    const markPostRead = useCallback(
        async (postId: string) => {
            try {
                await fetch(`/api/posts/${postId}/read`, {
                    method: "POST",
                    headers: getAuthHeader()
                });
                mutateFollowed();
                mutateFeed();
            } catch (_) { }
        },
        [mutateFollowed, mutateFeed]
    );

    const loadMore = useCallback(() => {
        if (nextCursor) setFeedOffset(parseInt(nextCursor, 10));
    }, [nextCursor]);

    useEffect(() => {
        if (!loadMoreRef.current || !nextCursor) return;
        const el = loadMoreRef.current;
        const obs = new IntersectionObserver(
            (entries) => {
                if (entries[0]?.isIntersecting) loadMore();
            },
            { rootMargin: "200px" }
        );
        obs.observe(el);
        return () => obs.disconnect();
    }, [nextCursor, loadMore]);

    const handleLike = async (postId: string) => {
        if (!user) return;
        setAccumulatedPosts((prev) =>
            prev.map((p) => {
                if (p.id !== postId) return p;
                const hasLiked = p.likes.some((l) => l.userId === user.id);
                return {
                    ...p,
                    likes: hasLiked
                        ? p.likes.filter((l) => l.userId !== user.id)
                        : [...p.likes, { userId: user.id }]
                };
            })
        );
        try {
            const res = await fetch(`/api/posts/${postId}/like`, {
                method: "POST",
                headers: getAuthHeader()
            });
            if (!res.ok) mutateFeed();
        } catch {
            mutateFeed();
        }
    };

    const handleFollow = async (targetUserId: string, isFollowing: boolean) => {
        setAccumulatedPosts((prev) =>
            prev.map((p) =>
                p.page.userId === targetUserId ? { ...p, isFollowing: !isFollowing } : p
            )
        );
        try {
            const res = await fetch("/api/follow", {
                method: "POST",
                headers: { "Content-Type": "application/json", ...getAuthHeader() },
                body: JSON.stringify({ targetUserId })
            });
            if (!res.ok) {
                mutateFeed();
                toast.error("Erreur lors de l'action");
            } else {
                const data = await res.json();
                setAccumulatedPosts((prev) =>
                    prev.map((p) =>
                        p.page.userId === targetUserId ? { ...p, isFollowing: data.isFollowing } : p
                    )
                );
                mutateFollowed();
                toast.success(data.isFollowing ? "Abonnement ajouté" : "Désabonnement");
            }
        } catch {
            mutateFeed();
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
                mutateFeed();
                setAccumulatedPosts((prev) =>
                    prev.map((p) => {
                        if (p.id !== postId) return p;
                        const newComment = {
                            id: "",
                            content: commentText,
                            createdAt: new Date().toISOString(),
                            user: { id: user!.id, name: user?.name ?? null, avatarUrl: null },
                            replies: []
                        };
                        return { ...p, comments: [newComment, ...(p.comments || [])] };
                    })
                );
                toast.success("Commentaire ajouté");
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
            setCommentText("");
            setReplyToId(null);
            markPostRead(postId);
        }
    };

    const copyLink = (postId: string) => {
        navigator.clipboard.writeText(
            `${typeof window !== "undefined" ? window.location.origin : ""}/chat/notifications?post=${postId}`
        );
        toast.success("Lien copié");
    };

    const scrollToPost = useCallback(
        async (postId: string) => {
            const inFeed = posts.some((p) => p.id === postId);
            if (!inFeed) {
                try {
                    const res = await fetch(`/api/posts/${postId}`, { headers: getAuthHeader() });
                    if (res.ok) {
                        const { post } = await res.json();
                        setAccumulatedPosts((prev) => {
                            if (prev.some((p) => p.id === post.id)) return prev;
                            return [post, ...prev];
                        });
                        mutateFeed(
                            (current: { posts: Post[]; nextCursor?: string } | undefined) =>
                                current
                                    ? { ...current, posts: [post, ...(current.posts || [])] }
                                    : { posts: [post], nextCursor: undefined },
                            false
                        );
                    }
                } catch (_) { }
            }
            requestAnimationFrame(() => {
                const el = document.getElementById(`post-${postId}`);
                el?.scrollIntoView({ behavior: "smooth", block: "center" });
            });
            markPostRead(postId);
        },
        [posts, mutateFeed, markPostRead]
    );

    function CommentItem({
        comment,
        depth = 0
    }: {
        comment: Comment;
        depth?: number;
    }) {
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
                            {formatDistanceToNow(new Date(comment.createdAt), {
                                addSuffix: true,
                                locale: fr
                            })}
                        </span>
                    </div>
                    <p className="text-foreground/90 py-1 text-[13px]">{comment.content}</p>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setReplyToId(comment.id)}
                            className="text-[11px] text-muted-foreground hover:text-primary font-medium"
                        >
                            Répondre
                        </button>
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
                        {comment.replies?.map((reply) => (
                            <CommentItem key={reply.id} comment={reply} depth={depth + 1} />
                        ))}
                    </div>
                )}
            </div>
        );
    }

    function PostComments({ comments }: { comments: Comment[] }) {
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
                {visible.map((c) => (
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

    const displayPosts = searchOpen && searchResults ? searchResults.posts : posts;
    const showFeed = !searchOpen || (searchQ.trim().length >= 2 && searchResults);

    return (
        <div className="min-h-screen pb-24 mb-25 pt-14 max-w-2xl mx-auto">
            {/* Résultats de recherche (la barre de recherche est dans le top bar) */}
            {searchOpen && searchQ.trim().length >= 2 && (
                <div className="px-3 pt-2 pb-3 border-b border-border bg-background">
                    <div className="max-h-64 overflow-y-auto rounded-lg border border-border bg-card p-2">
                        {!searchResults ? (
                            <div className="flex items-center justify-center py-6">
                                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                            </div>
                        ) : (
                            <>
                                {searchResults.pages?.length > 0 && (
                                    <p className="text-xs font-medium text-muted-foreground px-2 py-1">
                                        {searchQ.trim().startsWith("@") ? "Pages (cliquez pour voir les posts)" : "Pages"}
                                    </p>
                                )}
                                <div className="flex gap-2 overflow-x-auto pb-2">
                                    {searchResults.pages?.map((p: { id?: string; pageId?: string; userId: string; handle: string; avatarUrl?: string | null; user?: { avatarUrl?: string | null }; unreadCount?: number }) => (
                                        <button
                                            key={p.pageId ?? p.id ?? p.userId}
                                            type="button"
                                            onClick={() => {
                                                const target = `/chat/page/${encodeURIComponent(p.handle)}`;
                                                router.push(target);
                                                setTimeout(() => closeSearch(), 0);
                                            }}
                                            className="flex flex-col items-center shrink-0 gap-1 p-2 rounded-lg hover:bg-muted/50 transition-colors"
                                        >
                                            <div className="relative">
                                                <Avatar className="h-12 w-12 ring-2 ring-background">
                                                    <AvatarImage src={(p.avatarUrl ?? p.user?.avatarUrl) ?? undefined} className="object-cover" />
                                                    <AvatarFallback className="bg-primary/10 text-primary text-sm">
                                                        {p.handle?.slice(1, 3).toUpperCase() ?? "?"}
                                                    </AvatarFallback>
                                                </Avatar>
                                                {"unreadCount" in p && Number((p as { unreadCount?: number }).unreadCount) > 0 && (
                                                    <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-primary ring-2 ring-background" />
                                                )}
                                            </div>
                                            <span className="text-xs font-medium truncate max-w-[72px]">
                                                {p.handle}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                                {searchResults.posts?.length > 0 && (
                                    <p className="text-xs font-medium text-muted-foreground px-2 py-1 mt-2">
                                        Publications
                                    </p>
                                )}
                                <div className="space-y-2">
                                    {searchResults.posts?.slice(0, 5).map((post) => (
                                        <button
                                            key={post.id}
                                            type="button"
                                            onClick={() => {
                                                closeSearch();
                                                scrollToPost(post.id);
                                            }}
                                            className="w-full text-left p-2 rounded-lg hover:bg-muted/50 border border-transparent hover:border-border"
                                        >
                                            <p className="text-sm text-foreground line-clamp-2">
                                                {post.content}
                                            </p>
                                            <p className="text-xs text-muted-foreground mt-1">
                                                {post.page?.handle} ·{" "}
                                                {formatDistanceToNow(new Date(post.createdAt), {
                                                    addSuffix: true,
                                                    locale: fr
                                                })}
                                            </p>
                                        </button>
                                    ))}
                                </div>
                                {(!searchResults.pages?.length && !searchResults.posts?.length) && (
                                    <p className="text-sm text-muted-foreground py-4 text-center">
                                        Aucun résultat
                                    </p>
                                )}
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* Bandeau style stories : Ajouter un poste + pages avec nouveau post */}
            {!searchOpen && (userPage || followedPagesWithNewPosts.length > 0) && (
                <div className="border-b border-border/50 bg-background/80 py-3 px-2">
                    <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide">
                        {userPage && (
                            <button
                                type="button"
                                onClick={() => router.push("/chat/my-page?create=1")}
                                className="flex flex-col items-center shrink-0 gap-2 min-w-[100px] w-[100px]"
                            >
                                <div className="relative h-24 w-[100px] rounded-xl overflow-hidden bg-muted flex items-center justify-center border border-border">
                                    <Avatar className="h-14 w-14 ring-2 ring-background">
                                        <AvatarImage src={user?.avatarUrl ?? undefined} className="object-cover" />
                                        <AvatarFallback className="bg-primary/10 text-primary text-sm">
                                            {user?.name?.substring(0, 2).toUpperCase() ?? "?"}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div className="absolute bottom-1 right-1 h-10 w-10 rounded-full bg-primary flex items-center justify-center ring-2 ring-background">
                                        <Plus className="h-5 w-5 text-primary-foreground" />
                                    </div>
                                </div>
                                <span className="text-xs font-medium text-foreground text-center leading-tight">
                                    Ajouter{" "}
                                    <br />
                                    un poste
                                </span>
                            </button>
                        )}
                        {followedPagesWithNewPosts.map((page) => (
                            <button
                                key={page.pageId}
                                type="button"
                                onClick={() => {
                                    const postId = page.firstUnreadPostId ?? posts.find(
                                        (p) => p.page.userId === page.userId && !p.isRead
                                    )?.id;
                                    if (postId) scrollToPost(postId);
                                }}
                                className="flex flex-col items-center shrink-0 gap-2 min-w-[100px] w-[100px]"
                            >
                                <div className="relative h-24 w-[100px] rounded-xl overflow-hidden border border-border">
                                    {page.latestPostImageUrl ? (
                                        <img
                                            src={page.latestPostImageUrl}
                                            alt=""
                                            className="absolute inset-0 w-full h-full object-cover blur-sm scale-110"
                                        />
                                    ) : (
                                        <div className="absolute inset-0 bg-muted" />
                                    )}
                                    <div className="absolute inset-0 bg-muted/40" />
                                    <div className="absolute inset-0 flex items-center justify-center pt-2">
                                        <Avatar
                                            className={`h-12 w-12 ring-2 ring-background shrink-0 ${page.unreadCount > 0
                                                ? "ring-green-500 ring-offset-2 ring-offset-background"
                                                : "ring-border"
                                                }`}
                                        >
                                            <AvatarImage src={page.avatarUrl ?? undefined} className="object-cover" />
                                            <AvatarFallback className="bg-primary/10 text-primary text-sm">
                                                {page.handle.slice(1, 3).toUpperCase()}
                                            </AvatarFallback>
                                        </Avatar>
                                    </div>
                                </div>
                                <span className="text-xs font-medium text-foreground truncate max-w-[100px] text-center">
                                    {page.name || page.handle}
                                </span>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Fil */}
            <div className=" py-4 space-y-4 pb-20 w-90">
                {feedLoading && !searchOpen && (
                    <div className="space-y-4">
                        {[1, 2, 3].map((i) => (
                            <div
                                key={i}
                                className="bg-card border border-border p-4 rounded-2xl space-y-3"
                            >
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <Skeleton className="h-10 w-10 rounded-full" />
                                        <div className="space-y-2">
                                            <Skeleton className="h-4 w-32" />
                                            <Skeleton className="h-3 w-24" />
                                        </div>
                                    </div>
                                </div>
                                <Skeleton className="h-4 w-full" />
                                <Skeleton className="h-4 w-3/4" />
                            </div>
                        ))}
                    </div>
                )}

                {showFeed && !feedLoading && displayPosts.length === 0 && (
                    <p className="text-muted-foreground text-center py-8">
                        {searchOpen
                            ? "Aucun résultat pour cette recherche."
                            : "Aucune publication pour le moment. Suivez des pages ou découvrez du contenu."}
                    </p>
                )}

                {showFeed &&
                    displayPosts.map((post) => (
                        <article
                            key={post.id}
                            id={`post-${post.id}`}
                            className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow"
                        >
                            <div className="p-4 space-y-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <Avatar className="h-10 w-10">
                                            <AvatarImage
                                                src={post.page.user?.avatarUrl ?? undefined}
                                                className="object-cover"
                                            />
                                            <AvatarFallback className="bg-primary/10 text-primary">
                                                {post.page.handle.substring(1, 3).toUpperCase()}
                                            </AvatarFallback>
                                        </Avatar>
                                        <div>
                                            <p className="font-semibold text-foreground">
                                                {post.page.handle}
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                                {formatDistanceToNow(new Date(post.createdAt), {
                                                    addSuffix: true,
                                                    locale: fr
                                                })}
                                            </p>
                                        </div>
                                    </div>
                                    {user && post.page.userId !== user.id && (
                                        <Button
                                            variant={post.isFollowing ? "secondary" : "default"}
                                            size="sm"
                                            onClick={() =>
                                                handleFollow(post.page.userId, !!post.isFollowing)
                                            }
                                            className={`h-8 font-medium ${post.isFollowing ? "text-muted-foreground" : ""
                                                }`}
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
                                                    <img
                                                        src={post.imageUrl}
                                                        alt=""
                                                        className="w-full h-auto object-cover max-h-96"
                                                    />
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
                                        className={`flex-1 ${post.likes.some((l) => l.userId === user?.id)
                                            ? "text-red-500 hover:text-red-600 bg-red-500/5"
                                            : "text-muted-foreground hover:text-foreground"
                                            }`}
                                    >
                                        <Heart
                                            className={`w-4 h-4 mr-1.5 ${post.likes.some((l) => l.userId === user?.id)
                                                ? "fill-current"
                                                : ""
                                                }`}
                                        />
                                        {post.likes.length} J&apos;aime
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => toggleComments(post.id)}
                                        className={`flex-1 ${expandedPostId === post.id
                                            ? "text-primary bg-primary/5"
                                            : "text-muted-foreground hover:text-foreground"
                                            }`}
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
                                                    <button
                                                        type="button"
                                                        onClick={() => setReplyToId(null)}
                                                        className="hover:text-foreground"
                                                    >
                                                        <X className="h-3 w-3" />
                                                    </button>
                                                </div>
                                            )}
                                            <div className="flex gap-2 items-center">
                                                <Input
                                                    placeholder={
                                                        replyToId ? "Votre réponse..." : "Commentaire..."
                                                    }
                                                    value={commentText}
                                                    onChange={(e) => setCommentText(e.target.value)}
                                                    className="h-9 text-sm bg-muted/50"
                                                    onKeyDown={(e) =>
                                                        e.key === "Enter" && handleComment(post.id)
                                                    }
                                                />
                                                <Button
                                                    size="icon"
                                                    className="h-9 w-9"
                                                    onClick={() => handleComment(post.id)}
                                                >
                                                    <Send className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </div>
                                        <PostComments
                                            comments={
                                                (searchOpen ? (searchResults?.posts ?? []) : posts).find(
                                                    (p) => p.id === post.id
                                                )?.comments ?? []
                                            }
                                        />
                                    </div>
                                )}
                            </div>
                        </article>
                    ))}

                <div ref={loadMoreRef} className="h-4" />
                {nextCursor && feedData?.posts?.length && !searchOpen && (
                    <div className="flex justify-center py-4">
                        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                    </div>
                )}
            </div>
        </div>
    );
}
