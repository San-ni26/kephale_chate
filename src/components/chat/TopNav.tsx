'use client';

import { useState, useEffect } from 'react';
import { Plus, UserCircle, ArrowLeft, Settings, MessageSquare, CheckCircle2, XCircle, ClipboardList, Building2, Handshake, Search, Wallet, Lightbulb, PiggyBank, Car, TrendingUp, Lock, Unlock, LockOpen, FileText, Phone, Video, KeyRound, ShieldOff, Eye, EyeOff, MoreVertical, Crown, Archive, ArchiveRestore, StickyNote, Briefcase, Filter, Send, NotepadText } from 'lucide-react';
import { Button } from '@/src/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/src/components/ui/dialog';
import { Input } from '@/src/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/src/components/ui/avatar';
import { UserSearch } from '@/src/components/chat/UserSearch';
import { useFeedSearch } from '@/src/contexts/FeedSearchContext';
import { useFinances } from '@/src/contexts/FinancesContext';
import { toast } from 'sonner';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { fetchWithAuth } from '@/src/lib/auth-client';
import { cn } from '@/src/lib/utils';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/src/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/src/components/ui/select';
import OrganizationRequestDialog from '@/src/components/organizations/OrganizationRequestDialog';
import { useDiscussionBlurState } from '@/src/contexts/DiscussionBlurContext';
import { PurchaseRightsDialog } from '@/src/components/chat/PurchaseRightsDialog';
import useSWR from 'swr';

const fetcher = (url: string) => fetchWithAuth(url).then((r) => (r.ok ? r.json() : null));

export function TopNav() {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const feedSearch = useFeedSearch();
    const discussionBlurState = useDiscussionBlurState();
    const isNotificationsPage = pathname?.startsWith('/chat/notifications');
    const publicPageMatch = pathname?.match(/^\/chat\/page\/([^/]+)\/?$/);
    const publicPageHandle = publicPageMatch?.[1];
    const isPublicPageView = Boolean(publicPageHandle);
    const publicPageHandleDecoded = publicPageHandle?.includes("%")
        ? (() => { try { return decodeURIComponent(publicPageHandle); } catch { return publicPageHandle; } })()
        : publicPageHandle;
    const { data: publicPageData } = useSWR<{ page: { handle: string; user?: { name: string; avatarUrl?: string | null } } }>(
        isPublicPageView && publicPageHandleDecoded ? `/api/page/${encodeURIComponent(publicPageHandleDecoded)}` : null,
        fetcher
    );
    const publicPage = publicPageData?.page;
    const [user, setUser] = useState<any>(null);
    const [searchEmail, setSearchEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [showOrgRequestDialog, setShowOrgRequestDialog] = useState(false);
    const [showPurchaseRightsDialog, setShowPurchaseRightsDialog] = useState(false);
    const [hideToggleLoading, setHideToggleLoading] = useState(false);
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);

    const isOrganizationsPage = pathname?.startsWith('/chat/organizations');
    const isFinancesPage = pathname?.startsWith('/chat/finances');
    const isGroupsPage = pathname === '/chat/groups';
    const isNotesPage = pathname === '/chat/notes';
    const notesGroupId = searchParams?.get('group') || null;
    const { data: notesGroupsData } = useSWR<{ groups: { id: string; name: string | null }[] }>(
        isNotesPage ? '/api/groups' : null,
        fetcher
    );
    const notesGroups = notesGroupsData?.groups || [];
    // Page Mes candidatures : /chat/jobs/my-applications
    const isMyApplicationsPage = pathname === '/chat/jobs/my-applications';
    // Page détail offre publique : /chat/jobs/[jobId] (exclure my-applications)
    const publicJobMatch = pathname?.match(/^\/chat\/jobs\/([^/]+)\/?$/);
    const publicJobId = publicJobMatch?.[1] && publicJobMatch[1] !== 'my-applications' ? publicJobMatch[1] : null;
    const { data: publicJobData } = useSWR<{ job: { title: string; companyName?: string; deadline?: string } }>(
        publicJobId ? `/api/jobs/${publicJobId}` : null,
        fetcher
    );
    const publicJob = publicJobData?.job;
    const isPublicJobPage = Boolean(publicJobId);
    const isPublicJobExpired = publicJob?.deadline ? new Date(publicJob.deadline) < new Date() : false;
    const { data: myApplicationData } = useSWR<{ application: { id: string } | null }>(
        publicJobId ? `/api/jobs/${publicJobId}/my-application` : null,
        fetcher
    );
    const hasAlreadyApplied = Boolean(myApplicationData?.application);
    const { data: groupsJobsData } = useSWR<{ pagination?: { total: number } }>(
        isGroupsPage ? '/api/jobs?limit=1&page=1' : null,
        fetcher
    );
    const groupsJobsTotal = groupsJobsData?.pagination?.total ?? 0;
    const isSettingsPage = pathname?.startsWith('/chat/settings');
    const isChatListPage = pathname === '/chat';
    const discussionMatch = pathname?.match(/^\/chat\/discussion\/([^/]+)\/?$/);
    const discussionId = discussionMatch?.[1];
    const { data: discussionData, mutate: mutateDiscussion } = useSWR(
        discussionId ? `/api/conversations/${discussionId}` : null,
        fetcher
    );
    const discussion = discussionData?.conversation ?? null;
    const isDiscussionPage = Boolean(discussionId);
    const finances = useFinances();
    // Page événements : /chat/organizations/[id]/events
    const eventsMatch = pathname?.match(/^\/chat\/organizations\/([^/]+)\/events\/?$/);
    const eventsOrgId = eventsMatch?.[1];
    const isEventsPage = Boolean(eventsOrgId);
    const eventsBackUrl = eventsOrgId ? `/chat/organizations/${eventsOrgId}` : '';
    // Page détail organisation : /chat/organizations/[id] (sans /departments)
    const orgDetailMatch = pathname?.match(/^\/chat\/organizations\/([^/]+)$/);
    const orgDetailId = orgDetailMatch?.[1];
    const { data: orgDetailData } = useSWR(
        orgDetailId ? `/api/organizations/${orgDetailId}` : null,
        fetcher
    );
    const orgDetail = orgDetailData?.organization ?? null;
    const isOrgDetailPage = Boolean(orgDetailId && orgDetail);

    // Page paramètres organisation : /chat/organizations/[id]/settings
    const orgSettingsMatch = pathname?.match(/^\/chat\/organizations\/([^/]+)\/settings\/?$/);
    const orgSettingsOrgId = orgSettingsMatch?.[1];
    const { data: orgSettingsData } = useSWR(
        orgSettingsOrgId ? `/api/organizations/${orgSettingsOrgId}` : null,
        fetcher
    );
    const orgSettings = orgSettingsData?.organization ?? null;
    const isOrgSettingsPage = Boolean(orgSettingsOrgId && orgSettings);

    // Page offres d'emploi : /chat/organizations/[id]/jobs
    const jobsListMatch = pathname?.match(/^\/chat\/organizations\/([^/]+)\/jobs\/?$/);
    const jobsOrgId = jobsListMatch?.[1];
    const { data: jobsData } = useSWR<{ jobs: any[]; subscription?: { plan: string; maxJobOffers?: number }; isAdmin?: boolean }>(
        jobsOrgId ? `/api/organizations/${jobsOrgId}/jobs` : null,
        fetcher
    );
    const jobsList = jobsData?.jobs || [];
    const jobsSubscription = jobsData?.subscription;
    const jobsIsAdmin = jobsData?.isAdmin ?? false;
    const isJobsListPage = Boolean(jobsOrgId);
    const planLimits: Record<string, number> = {
        FREE: 0, BASIC: 3, PROFESSIONAL: 10, ENTERPRISE: 50, RECRUITMENT: 999,
    };
    const jobLimit = jobsSubscription ? (planLimits[jobsSubscription.plan] ?? jobsSubscription.maxJobOffers ?? 0) : 0;
    const canCreateJob = jobLimit === 999 || jobsList.filter((j: any) => j.status !== 'CLOSED').length < jobLimit;

    // Page candidatures offre : /chat/organizations/[id]/jobs/[jobId]
    const jobDetailMatch = pathname?.match(/^\/chat\/organizations\/([^/]+)\/jobs\/([^/]+)\/?$/);
    const jobDetailOrgId = jobDetailMatch?.[1];
    const jobDetailId = jobDetailMatch?.[2];
    const jobStatusFilter = searchParams?.get('status') || 'ALL';
    const jobDetailUrl = jobDetailOrgId && jobDetailId
        ? `/api/organizations/${jobDetailOrgId}/jobs/${jobDetailId}/applications${jobStatusFilter !== 'ALL' ? `?status=${jobStatusFilter}` : ''}`
        : null;
    const { data: jobDetailData } = useSWR<{ job: { title: string; companyName?: string }; applications: any[] }>(
        jobDetailUrl,
        fetcher
    );
    const jobDetail = jobDetailData?.job;
    const jobApplications = jobDetailData?.applications || [];
    const isJobDetailPage = Boolean(jobDetailOrgId && jobDetailId);
    const APPLICATION_STATUSES = [
        { value: 'PENDING', label: 'En attente' },
        { value: 'INTERVIEW', label: 'Entretien' },
        { value: 'ACCEPTED', label: 'Accepté' },
        { value: 'REJECTED', label: 'Refusé' },
    ];

    // Page département (détail / chat / rapports) : même top bar avec retour, avatar, nom, membres
    const deptMatch = pathname?.match(
        /^\/chat\/organizations\/([^/]+)\/departments\/([^/]+)(?:\/(chat|reports)\/?)?$/
    );
    const orgId = deptMatch?.[1];
    const deptId = deptMatch?.[2];
    const deptSubPage = deptMatch?.[3]; // 'chat' | 'reports' | undefined
    const { data: deptData } = useSWR(
        orgId && deptId ? `/api/organizations/${orgId}/departments/${deptId}` : null,
        fetcher
    );
    const department = deptData?.department;
    const departmentName = department?.name ?? null;
    const memberCount = department?._count?.members ?? 0;
    const isDeptChatPage = deptSubPage === 'chat';
    const isDeptReportsPage = deptSubPage === 'reports';
    const isDeptDetailPage = Boolean(orgId && deptId && !isDeptChatPage && !isDeptReportsPage);
    const deptUrl = orgId && deptId ? `/chat/organizations/${orgId}/departments/${deptId}` : '';
    const deptChatUrl = orgId && deptId ? `${deptUrl}/chat` : '';

    // Page groupe de collaboration (détail ou chat) : retour, avatar, nom, membres, documents/chat
    const collabGroupMatch = pathname?.match(
        /^\/chat\/organizations\/([^/]+)\/collaborations\/([^/]+)\/groups\/([^/]+)(?:\/chat)?\/?$/
    );
    const collabOrgId = collabGroupMatch?.[1];
    const collabId = collabGroupMatch?.[2];
    const collabGroupId = collabGroupMatch?.[3];
    const isCollabGroupChatPage = pathname?.endsWith('/chat');
    const isCollabGroupDetailPage = Boolean(collabOrgId && collabId && collabGroupId && !isCollabGroupChatPage);
    const { data: collabGroupData } = useSWR<{ group: { name: string; members?: { id: string }[]; _count?: { members: number } } }>(
        collabOrgId && collabId && collabGroupId
            ? `/api/organizations/${collabOrgId}/collaborations/${collabId}/groups/${collabGroupId}`
            : null,
        fetcher
    );
    const collabGroup = collabGroupData?.group;
    const collabGroupName = collabGroup?.name ?? null;
    const collabMemberCount = collabGroup?._count?.members ?? collabGroup?.members?.length ?? 0;
    const isCollabGroupPage = Boolean(collabOrgId && collabId && collabGroupId);
    const collabGroupUrl = collabOrgId && collabId && collabGroupId
        ? `/chat/organizations/${collabOrgId}/collaborations/${collabId}/groups/${collabGroupId}`
        : '';
    const collabChatUrl = collabGroupUrl ? `${collabGroupUrl}/chat` : '';

    // Page détail collaboration (sans groupe) : /chat/organizations/[id]/collaborations/[collabId]
    const collabDetailMatch = pathname?.match(
        /^\/chat\/organizations\/([^/]+)\/collaborations\/([^/]+)\/?$/
    );
    const collabDetailOrgId = collabDetailMatch?.[1];
    const collabDetailId = collabDetailMatch?.[2];
    const isCollabDetailPage = Boolean(collabDetailOrgId && collabDetailId) && !pathname?.includes('/groups');
    const { data: collabDetailData } = useSWR<{ collaboration: { orgA: { id: string; name: string; logo?: string }; orgB: { id: string; name: string; logo?: string }; groups?: { id: string }[] } }>(
        collabDetailOrgId && collabDetailId
            ? `/api/organizations/${collabDetailOrgId}/collaborations/${collabDetailId}`
            : null,
        fetcher
    );
    const collabDetail = collabDetailData?.collaboration;
    const collabDetailOtherOrg = collabDetail
        ? (collabDetail.orgA.id === collabDetailOrgId ? collabDetail.orgB : collabDetail.orgA)
        : null;
    const collabDetailGroupCount = collabDetail?.groups?.length ?? 0;
    const collabDetailUrl = collabDetailOrgId && collabDetailId
        ? `/chat/organizations/${collabDetailOrgId}/collaborations/${collabDetailId}`
        : '';
    const collabDetailOrgUrl = collabDetailOrgId ? `/chat/organizations/${collabDetailOrgId}` : '';

    // Page tâche : titre + statut + actions dans la top bar
    const taskMatch = pathname?.match(/^\/chat\/organizations\/([^/]+)\/departments\/([^/]+)\/tasks\/([^/]+)\/?$/);
    const taskOrgId = taskMatch?.[1];
    const taskDeptId = taskMatch?.[2];
    const taskId = taskMatch?.[3];
    const taskBackUrl = taskOrgId && taskDeptId ? `/chat/organizations/${taskOrgId}/departments/${taskDeptId}` : '';
    const { data: taskData, mutate: mutateTask } = useSWR(
        taskId && taskOrgId && taskDeptId
            ? `/api/organizations/${taskOrgId}/departments/${taskDeptId}/tasks/${taskId}`
            : null,
        fetcher
    );
    const task = taskData?.task;
    const isTaskPage = Boolean(taskId && taskOrgId && taskDeptId);
    const taskCanManage = task && user && (task.assignee?.id === user.id || task.creator?.id === user.id);

    const handleTaskStatusUpdate = async (status: string) => {
        if (!taskId || !taskOrgId || !taskDeptId) return;
        try {
            const res = await fetchWithAuth(
                `/api/organizations/${taskOrgId}/departments/${taskDeptId}/tasks/${taskId}`,
                { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) }
            );
            if (res.ok) {
                toast.success('Statut mis à jour');
                mutateTask();
            } else toast.error('Erreur');
        } catch {
            toast.error('Erreur');
        }
    };

    useEffect(() => {
        let mounted = true;

        // Fetch user profile with authentication
        const fetchProfile = async () => {
            try {
                const response = await fetchWithAuth('/api/users/profile');
                if (mounted && response.ok) {
                    const data = await response.json();
                    if (mounted) setUser(data.profile);
                }
            } catch (error) {
                console.error('Failed to fetch profile', error);
            }
        };

        fetchProfile();

        return () => {
            mounted = false;
        };
    }, []);

    const handleStartChat = async () => {
        if (!searchEmail) return;
        setLoading(true);

        try {
            const response = await fetchWithAuth('/api/conversations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ otherUserEmail: searchEmail }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Erreur lors de la création');
            }

            toast.success(data.message);
            setSearchEmail('');
            // Redirect to the conversation
            if (data.conversation?.id) {
                router.push(`/chat/discussion/${data.conversation.id}`);
            } else if (data.conversationId) {
                router.push(`/chat/discussion/${data.conversationId}`);
            }
        } catch (error: any) {
            toast.error(error.message);
        } finally {
            setLoading(false);
        }
    };

    // Ne pas afficher la top bar quand la page finances est verrouillée
    if (isFinancesPage && finances?.isLocked) {
        return null;
    }

    return (
        <header className={cn(
            'fixed top-0 w-full left-0 z-50 bg-background border-b border-border px-3 md:px-4',
            mounted && isJobDetailPage ? 'flex flex-col min-h-16' : 'h-16 flex items-center justify-between'
        )}>
            {isFinancesPage && finances ? (
                /* Top bar page Finances : titre, portefeuille, icônes recommandations/graphique/entrées/code */
                <div className="flex items-center justify-between w-full gap-2 min-w-0 overflow-hidden">
                    <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
                        <Wallet className="w-5 h-5 text-primary shrink-0" />
                        <div className="min-w-0 flex-1">
                            <h2 className="font-semibold text-foreground truncate">Gestion Financière</h2>
                            <p className="text-xs text-muted-foreground truncate">
                                Portefeuille: <span className="font-medium text-primary">{finances.totalPortfolio.toLocaleString()} FCFA</span>
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                        <Button
                            variant="ghost"
                            size="icon"
                            className={`h-8 w-8 sm:h-9 sm:w-9 ${finances.showRecs ? 'text-warning bg-warning/10' : 'text-muted-foreground hover:text-foreground'}`}
                            onClick={() => finances.setShowRecs(!finances.showRecs)}
                            title="Recommandations"
                        >
                            <Lightbulb className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            className={`h-8 w-8 sm:h-9 sm:w-9 ${finances.showGraph ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-foreground'}`}
                            onClick={() => finances.setShowGraph(!finances.showGraph)}
                            title="Épargne (objectifs d'épargne)"
                        >
                            <PiggyBank className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            className={`h-8 w-8 sm:h-9 sm:w-9 ${finances.showEntries ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-foreground'}`}
                            onClick={() => finances.setShowEntries(!finances.showEntries)}
                            title="Entrées & Dépenses"
                        >
                            <TrendingUp className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            className={`h-8 w-8 sm:h-9 sm:w-9 ${finances.showPurchases ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-foreground'}`}
                            onClick={() => finances.setShowPurchases(!finances.showPurchases)}
                            title="Achat (biens à acheter)"
                        >
                            <Car className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            className={`h-8 w-8 sm:h-9 sm:w-9 ${finances.isLocked ? 'text-destructive' : 'text-muted-foreground hover:text-foreground'}`}
                            onClick={() => window.dispatchEvent(new CustomEvent('finances-toggle-lock'))}
                            title={finances.isLocked ? 'Déverrouiller' : 'Verrouiller'}
                        >
                            {finances.isLocked ? <Lock className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <Unlock className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
                        </Button>
                    </div>
                </div>
            ) : isNotificationsPage ? (
                /* Page Actualités : barre de recherche dans le top bar */
                <div className="flex items-center gap-2 w-full min-w-0 flex-1">
                    <div className="relative flex-1 min-w-0 max-w-xl">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground shrink-0 pointer-events-none" />
                        <Input
                            placeholder="Rechercher des pages (@) ou des publications..."
                            value={feedSearch.searchQ}
                            onChange={(e) => feedSearch.setSearchQ(e.target.value)}
                            onFocus={() => feedSearch.setSearchOpen(true)}
                            className="pl-9 h-9 rounded-full bg-muted/50 border-border w-full"
                        />
                    </div>
                    {feedSearch.searchOpen && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={feedSearch.closeSearch}
                            className="shrink-0"
                        >
                            Annuler
                        </Button>
                    )}
                </div>
            ) : isEventsPage && eventsBackUrl ? (
                /* Top bar page Événements : retour, titre, Nouvel Événement */
                <>
                    <Button variant="ghost" size="icon" onClick={() => router.push(eventsBackUrl)} className="mr-2 shrink-0">
                        <ArrowLeft className="w-5 h-5 text-muted-foreground hover:text-foreground" />
                    </Button>
                    <h2 className="font-semibold text-foreground truncate flex-1 min-w-0">Événements</h2>
                    <Button
                        className="bg-primary text-primary-foreground hover:bg-primary/90 shrink-0"
                        onClick={() => window.dispatchEvent(new CustomEvent('events-open-create'))}
                    >
                        <Plus className="w-4 h-4 mr-2" />
                        Nouvel Événement
                    </Button>
                </>
            ) : isTaskPage && task && taskBackUrl ? (
                /* Top bar page tâche : retour, titre, statut, Terminer/Rouvrir */
                <>
                    <Button variant="ghost" size="icon" onClick={() => router.push(taskBackUrl)} className="mr-2 shrink-0">
                        <ArrowLeft className="w-5 h-5 text-muted-foreground hover:text-foreground" />
                    </Button>
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                        <ClipboardList className="w-5 h-5 text-muted-foreground shrink-0" />
                        <div className="min-w-0">
                            <h2 className="font-semibold text-foreground truncate">{task.title}</h2>
                            <p className="text-xs text-muted-foreground truncate">
                                {task.assignee?.name} • {task.status}
                            </p>
                        </div>
                    </div>
                    {taskCanManage && (
                        <div className="flex gap-1 shrink-0">
                            {task.status !== 'COMPLETED' && (
                                <Button size="sm" className="bg-success hover:bg-success/90 text-white h-8" onClick={() => handleTaskStatusUpdate('COMPLETED')}>
                                    <CheckCircle2 className="w-4 h-4" />
                                </Button>
                            )}
                            {task.status === 'COMPLETED' && task.creator?.id === user?.id && (
                                <Button size="sm" variant="outline" className="h-8" onClick={() => handleTaskStatusUpdate('IN_PROGRESS')}>
                                    <XCircle className="w-4 h-4" />
                                </Button>
                            )}
                        </div>
                    )}
                </>
            ) : isCollabGroupPage && collabGroupUrl ? (
                /* Top bar groupe collaboration (détail ou chat) : retour, avatar, nom, membres, documents, chat/paramètres */
                <>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                            router.push(
                                isCollabGroupChatPage
                                    ? collabGroupUrl
                                    : `/chat/organizations/${collabOrgId}/collaborations/${collabId}`
                            )
                        }
                        className="mr-2 shrink-0"
                        title={isCollabGroupChatPage ? 'Retour au groupe' : 'Retour à la collaboration'}
                    >
                        <ArrowLeft className="w-5 h-5 text-muted-foreground hover:text-foreground" />
                    </Button>
                    <Avatar className="h-10 w-10 border border-border shrink-0">
                        <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(collabGroupName || '')}`} />
                        <AvatarFallback>{(collabGroupName || 'G')[0]}</AvatarFallback>
                    </Avatar>
                    <div className="ml-3 flex-1 min-w-0">
                        <h2 className="font-semibold text-foreground truncate">
                            {collabGroupName || 'Groupe'}
                        </h2>
                        <p className="text-xs text-muted-foreground truncate">
                            {collabMemberCount > 0
                                ? `${collabMemberCount} membre${collabMemberCount > 1 ? 's' : ''} · Collaboration`
                                : 'Collaboration inter-organisations'}
                        </p>
                    </div>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => window.dispatchEvent(new CustomEvent('collaboration-chat-open-documents'))}
                        className="text-muted-foreground hover:text-foreground shrink-0"
                        title="Documents & notes"
                        aria-label="Documents et notes"
                    >
                        <FileText className="w-5 h-5" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                            router.push(isCollabGroupChatPage ? collabGroupUrl : collabChatUrl)
                        }
                        className="text-muted-foreground hover:text-foreground shrink-0"
                        title={
                            isCollabGroupChatPage
                                ? 'Gérer le groupe'
                                : 'Ouvrir le chat'
                        }
                    >
                        {isCollabGroupChatPage ? (
                            <Settings className="w-5 h-5" />
                        ) : (
                            <MessageSquare className="w-5 h-5" />
                        )}
                    </Button>
                </>
            ) : isCollabDetailPage && collabDetailUrl ? (
                /* Top bar détail collaboration : retour, avatar, nom, orgA ↔ orgB */
                <>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => router.push(collabDetailOrgUrl)}
                        className="mr-2 shrink-0"
                        title="Retour à l'organisation"
                    >
                        <ArrowLeft className="w-5 h-5 text-muted-foreground hover:text-foreground" />
                    </Button>
                    <Avatar className="h-10 w-10 border border-border shrink-0">
                        {collabDetailOtherOrg?.logo ? (
                            <AvatarImage src={collabDetailOtherOrg.logo} />
                        ) : null}
                        <AvatarFallback>
                            <Handshake className="w-5 h-5" />
                        </AvatarFallback>
                    </Avatar>
                    <div className="ml-3 flex-1 min-w-0">
                        <h2 className="font-semibold text-foreground truncate">
                            Collaboration avec {collabDetailOtherOrg?.name || '…'}
                        </h2>
                        <p className="text-xs text-muted-foreground truncate">
                            {collabDetail?.orgA?.name} ↔ {collabDetail?.orgB?.name}
                        </p>
                    </div>
                    {collabDetailGroupCount > 0 && (
                        <span className="text-xs text-muted-foreground shrink-0">
                            {collabDetailGroupCount} groupe{collabDetailGroupCount > 1 ? 's' : ''}
                        </span>
                    )}
                </>
            ) : (isDeptChatPage || isDeptDetailPage || isDeptReportsPage) && departmentName && deptUrl ? (
                /* Même top bar que la vue web : retour, avatar, nom + membres ; chat → paramètres, détail/rapports → chat */
                <>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                            router.push(
                                isDeptChatPage || isDeptReportsPage
                                    ? deptUrl
                                    : `/chat/organizations/${orgId}`
                            )
                        }
                        className="mr-2 shrink-0"
                    >
                        <ArrowLeft className="w-5 h-5 text-muted-foreground hover:text-foreground" />
                    </Button>
                    <Avatar className="h-10 w-10 border border-border shrink-0">
                        <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(departmentName)}`} />
                        <AvatarFallback>{departmentName[0]}</AvatarFallback>
                    </Avatar>
                    <div className="ml-3 flex-1 min-w-0">
                        <h2 className="font-semibold text-foreground truncate">
                            {departmentName}
                        </h2>
                        <p className="text-xs text-muted-foreground">
                            {memberCount} membre{memberCount > 1 ? 's' : ''}
                        </p>
                    </div>
                    {isDeptChatPage && (
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => window.dispatchEvent(new CustomEvent('department-chat-open-documents'))}
                            className="text-muted-foreground hover:text-foreground shrink-0"
                            title="Fiches & documents"
                            aria-label="Fiches & documents"
                        >
                            <FileText className="w-5 h-5" />
                        </Button>
                    )}
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                            router.push(isDeptChatPage ? deptUrl : deptChatUrl)
                        }
                        className="text-muted-foreground hover:text-foreground shrink-0"
                        title={
                            isDeptChatPage
                                ? 'Gérer les membres'
                                : 'Ouvrir le chat'
                        }
                    >
                        {isDeptChatPage ? <Settings className="w-5 h-5" /> : <MessageSquare className="w-5 h-5" />}
                    </Button>
                </>
            ) : isJobDetailPage && jobDetailOrgId && jobDetailId ? (
                /* Top bar page candidatures : layout 2 lignes (mounted) ou 1 ligne (!mounted) pour éviter hydration mismatch */
                mounted ? (
                    <div className="flex flex-col w-full flex-1 min-h-0">
                        <div className="flex items-center justify-between gap-2 h-16 shrink-0">
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => router.push(`/chat/organizations/${jobDetailOrgId}/jobs`)}
                                className="mr-2 shrink-0"
                            >
                                <ArrowLeft className="w-5 h-5 text-muted-foreground hover:text-foreground" />
                            </Button>
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                                <Briefcase className="w-5 h-5 text-muted-foreground shrink-0" />
                                <div className="min-w-0 flex-1">
                                    <h2 className="font-semibold text-foreground truncate">{jobDetail?.title || 'Candidatures'}</h2>
                                    <p className="text-xs text-muted-foreground truncate">{jobDetail?.companyName}</p>
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 py-2 border-t border-border shrink-0">
                            <Filter className="w-4 h-4 text-muted-foreground shrink-0" />
                            <Select
                                value={jobStatusFilter}
                                onValueChange={(v) => {
                                    const params = new URLSearchParams(searchParams?.toString() || '');
                                    if (v === 'ALL') params.delete('status');
                                    else params.set('status', v);
                                    router.replace(`${pathname}${params.toString() ? '?' + params.toString() : ''}`);
                                }}
                            >
                                <SelectTrigger className="h-8 w-36 text-xs">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="ALL">Tous les statuts</SelectItem>
                                    {APPLICATION_STATUSES.map(s => (
                                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <span className="text-xs text-muted-foreground whitespace-nowrap">{jobApplications.length} résultat{jobApplications.length !== 1 ? 's' : ''}</span>
                        </div>
                    </div>
                ) : (
                    <div className="flex items-center justify-between w-full gap-2">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => router.push(`/chat/organizations/${jobDetailOrgId}/jobs`)}
                            className="mr-2 shrink-0"
                        >
                            <ArrowLeft className="w-5 h-5 text-muted-foreground hover:text-foreground" />
                        </Button>
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                            <Briefcase className="w-5 h-5 text-muted-foreground shrink-0" />
                            <div className="min-w-0 flex-1">
                                <h2 className="font-semibold text-foreground truncate">{jobDetail?.title || 'Candidatures'}</h2>
                                <p className="text-xs text-muted-foreground truncate">{jobDetail?.companyName}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            <Filter className="w-4 h-4 text-muted-foreground" />
                            <Select
                                value={jobStatusFilter}
                                onValueChange={(v) => {
                                    const params = new URLSearchParams(searchParams?.toString() || '');
                                    if (v === 'ALL') params.delete('status');
                                    else params.set('status', v);
                                    router.replace(`${pathname}${params.toString() ? '?' + params.toString() : ''}`);
                                }}
                            >
                                <SelectTrigger className="h-8 w-36 text-xs">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="ALL">Tous les statuts</SelectItem>
                                    {APPLICATION_STATUSES.map(s => (
                                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <span className="text-xs text-muted-foreground whitespace-nowrap">{jobApplications.length} résultat{jobApplications.length !== 1 ? 's' : ''}</span>
                        </div>
                    </div>
                )
            ) : isJobsListPage && jobsOrgId ? (
                /* Top bar page offres d'emploi : retour, titre, plan, nouvelle offre */
                <div className="flex items-center justify-between w-full gap-3">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => router.push(`/chat/organizations/${jobsOrgId}`)}
                            className="shrink-0"
                        >
                            <ArrowLeft className="w-5 h-5" />
                        </Button>
                        <Briefcase className="w-5 h-5 text-primary shrink-0" />
                        <div className="min-w-0">
                            <h2 className="font-semibold text-foreground truncate">Offres d&apos;emploi</h2>
                            {jobsSubscription && (
                                <p className="text-xs text-muted-foreground truncate">
                                    Plan {jobsSubscription.plan} · {jobLimit === 999 ? 'Illimité' : `${jobsList.filter((j: any) => j.status !== 'CLOSED').length}/${jobLimit} offres`}
                                </p>
                            )}
                        </div>
                    </div>
                    {jobsIsAdmin && (
                        <Button
                            size="sm"
                            className="gap-2 shrink-0"
                            onClick={() => {
                                if (!canCreateJob) {
                                    toast.error('Limite d\'offres atteinte. Mettez à niveau votre abonnement.');
                                    return;
                                }
                                router.push(`/chat/organizations/${jobsOrgId}/jobs/create`);
                            }}
                        >
                            <Plus className="w-4 h-4" />
                        </Button>
                    )}
                </div>
            ) : isOrgSettingsPage && orgSettings ? (
                /* Top bar page paramètres organisation */
                <div className="flex items-center justify-between w-full gap-3">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => router.push(`/chat/organizations/${orgSettingsOrgId}`)}
                        className="hover:bg-muted shrink-0"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </Button>
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                        <Avatar className="h-9 w-9 border border-border shrink-0">
                            {orgSettings.logo ? (
                                <AvatarImage src={orgSettings.logo} />
                            ) : (
                                <AvatarFallback>
                                    <Building2 className="w-5 h-5" />
                                </AvatarFallback>
                            )}
                        </Avatar>
                        <div className="min-w-0">
                            <h2 className="font-semibold text-foreground truncate">
                                {orgSettings.name}
                            </h2>
                            <p className="text-xs text-muted-foreground truncate">
                                Paramètres de l&apos;organisation
                            </p>
                        </div>
                    </div>
                </div>
            ) : isOrgDetailPage && orgDetail ? (
                /* Top bar page organisation : retour, logo/icône, nom, code */
                <div className="flex items-center justify-between gap-3 flex-wrap flex-1 min-w-0">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => router.push('/chat/organizations')}
                            className="hover:bg-muted shrink-0"
                        >
                            <ArrowLeft className="w-5 h-5" />
                        </Button>
                        {orgDetail.logo ? (
                            <img
                                src={orgDetail.logo}
                                alt={orgDetail.name}
                                className="w-10 h-10 rounded-full object-cover shrink-0"
                            />
                        ) : (
                            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                                <Building2 className="w-5 h-5 text-muted-foreground" />
                            </div>
                        )}
                        <div className="min-w-0">
                            <h2 className="font-semibold text-foreground truncate">{orgDetail.name}</h2>
                            <p className="text-xs text-muted-foreground truncate">Code: {orgDetail.code}</p>
                        </div>
                    </div>
                    {orgDetail.subscription && (
                        <span className="px-2 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary shrink-0">
                            {orgDetail.subscription.plan}
                        </span>
                    )}
                </div>
            ) : isGroupsPage ? (
                /* Top bar page Offres d'emploi (/chat/groups) */
                <div className="flex items-center justify-between w-full gap-3">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                        <Briefcase className="w-5 h-5 text-primary shrink-0" />
                        <div className="min-w-0">
                            <h2 className="font-semibold text-foreground truncate">Offres d&apos;emploi</h2>
                            <p className="text-xs text-muted-foreground truncate">
                                Trouvez votre prochaine opportunité parmi {groupsJobsTotal || '...'} offres
                            </p>
                        </div>
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        className="gap-2 shrink-0"
                        onClick={() => router.push('/chat/jobs/my-applications')}
                    >
                        <FileText className="w-4 h-4" /> Mes candidatures
                    </Button>
                </div>
            ) : isNotesPage ? (
                /* Top bar page Notes (/chat/notes) */
                <div className="flex items-center gap-2 flex-1 min-w-0">
                    <div className="flex items-center gap-2 shrink-0">
                        <NotepadText className="w-5 h-5 text-primary shrink-0" />
                        <h2 className="text-base sm:text-lg font-bold text-foreground truncate">Notes</h2>
                    </div>
                    {notesGroups.length > 0 && (
                        <div className="flex items-center gap-0.5">
                            <Select
                                value={notesGroupId ?? ''}
                                onValueChange={(v) => {
                                    const url = v ? `/chat/notes?group=${v}` : '/chat/notes';
                                    router.push(url);
                                }}
                            >
                                <SelectTrigger className="h-8 max-w-[180px] sm:max-w-[220px] text-sm">
                                    <SelectValue placeholder="Choisir un groupe" />
                                </SelectTrigger>
                                <SelectContent>
                                    {notesGroups.map((g) => (
                                        <SelectItem key={g.id} value={g.id}>
                                            {g.name || 'Sans nom'}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                </div>
            ) : isSettingsPage ? (
                /* Top bar page Paramètres */
                <div className="flex items-center gap-2 w-full">
                    <Settings className="w-5 h-5 text-primary shrink-0" />
                    <h2 className="font-semibold text-foreground truncate">Paramètres</h2>
                </div>
            ) : mounted && isDiscussionPage && discussionId ? (
                /* Top bar page Discussion : retour + avatar + nom + statut + icône cadenas (Pro) + appel */
                <>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                            if (searchParams?.get('view') === 'notes') {
                                router.push(`/chat/discussion/${discussionId}`);
                            } else {
                                router.push('/chat');
                            }
                        }}
                        className="mr-2 shrink-0"
                    >
                        <ArrowLeft className="w-5 h-5 text-muted-foreground hover:text-foreground" />
                    </Button>
                    <Avatar className="h-10 w-10 border border-border shrink-0">
                        <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(
                            discussion?.name
                                ? discussion.name
                                : discussion?.isDirect && discussion?.members?.length
                                    ? (discussion.members.find((m: { user: { id: string } }) => m.user.id !== user?.id)?.user?.name || 'Discussion')
                                    : 'Discussion'
                        )}`} />
                        <AvatarFallback>
                            {discussion?.name
                                ? discussion.name[0]
                                : discussion?.isDirect && discussion?.members?.length
                                    ? (discussion.members.find((m: { user: { id: string } }) => m.user.id !== user?.id)?.user?.name?.[0] || 'D')
                                    : 'D'}
                        </AvatarFallback>
                    </Avatar>
                    <div className="ml-3 flex-1 min-w-0 overflow-hidden">
                        <h2 className="font-semibold text-foreground truncate">
                            {discussion?.name
                                ? discussion.name
                                : discussion?.isDirect && discussion?.members?.length
                                    ? discussion.members
                                        .filter((m: { user: { id: string } }) => m.user.id !== user?.id)
                                        .map((m: { user: { name: string } }) => m.user.name)
                                        .join(', ') || 'Discussion'
                                    : 'Discussion'}
                        </h2>
                        {discussion?.isDirect && discussion?.members?.length && (() => {
                            const other = discussion.members.find((m: { user: { id: string } }) => m.user.id !== user?.id)?.user;
                            return other ? (
                                <p className="text-xs text-muted-foreground">
                                    {other.inCall ? (
                                        <span className="text-amber-500 font-medium">En appel</span>
                                    ) : other.isOnline ? (
                                        <span className="text-green-500 font-medium">En ligne</span>
                                    ) : (
                                        'Hors ligne'
                                    )}
                                </p>
                            ) : null;
                        })()}
                    </div>
                    {/* Cadenas + appel + menu trois points (flou, masquer, achat) */}
                    <div className="flex items-center gap-1 shrink-0">
                        {discussion?.isLocked && discussion?.canCurrentUserControl ? (
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        title="Code de verrouillage"
                                        className="hover:bg-primary/10"
                                    >
                                        <LockOpen className="w-5 h-5 text-amber-500" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={() => window.dispatchEvent(new CustomEvent('discussion-lock-disable'))}>
                                        <ShieldOff className="w-4 h-4 mr-2" />
                                        Désactiver
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => window.dispatchEvent(new CustomEvent('discussion-lock-change-code'))}>
                                        <KeyRound className="w-4 h-4 mr-2" />
                                        Modifier le code
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        ) : (
                            <Button
                                variant="ghost"
                                size="icon"
                                disabled={!discussion?.canCurrentUserControl}
                                onClick={() => discussion?.canCurrentUserControl && window.dispatchEvent(new CustomEvent('discussion-lock-click'))}
                                title={discussion?.canCurrentUserControl ? 'Verrouiller la discussion' : discussion?.currentUserIsPro ? 'Verrouiller (droits achetés par l\'autre)' : 'Verrouiller (Compte Pro requis)'}
                                className="hover:bg-primary/10"
                            >
                                <Lock className={cn("w-5 h-5", discussion?.canCurrentUserControl ? "text-muted-foreground hover:text-primary" : "text-muted-foreground/60")} />
                            </Button>
                        )}
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => window.dispatchEvent(new CustomEvent('discussion-call-click', { detail: { callType: 'video' } }))}
                            title="Appel video"
                            className="hover:bg-primary/10"
                        >
                            <Video className="w-5 h-5 text-muted-foreground hover:text-primary" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => window.dispatchEvent(new CustomEvent('discussion-call-click', { detail: { callType: 'audio' } }))}
                            title="Appel audio"
                            className="hover:bg-primary/10"
                        >
                            <Phone className="w-5 h-5 text-muted-foreground hover:text-primary" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => router.push(`${pathname}?view=notes`)}
                            title="Notes"
                            className="hover:bg-primary/10"
                        >
                            <StickyNote className="w-5 h-5 text-muted-foreground hover:text-primary" />
                        </Button>
                        {(discussionBlurState?.showBlurToggle || (discussion?.canCurrentUserControl && discussion?.members?.length === 2) || discussion?.canPurchaseRights) && (
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        title="Plus d'options"
                                        className="hover:bg-primary/10"
                                    >
                                        <MoreVertical className="w-5 h-5 text-muted-foreground hover:text-foreground" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    {discussionBlurState?.showBlurToggle && (
                                        <DropdownMenuItem onClick={discussionBlurState.onToggle}>
                                            {discussionBlurState.blurEnabled ? (
                                                <><EyeOff className="w-4 h-4 mr-2" /> Afficher les anciens messages</>
                                            ) : (
                                                <><Eye className="w-4 h-4 mr-2" /> Flouter les anciens messages</>
                                            )}
                                        </DropdownMenuItem>
                                    )}
                                    {discussion?.canCurrentUserControl && discussion?.members?.length === 2 && (
                                        <DropdownMenuItem
                                            disabled={hideToggleLoading}
                                            onClick={async () => {
                                                if (!discussionId || hideToggleLoading) return;
                                                setHideToggleLoading(true);
                                                try {
                                                    const isHiddenByMe = discussion.hiddenByUserId === user?.id;
                                                    const endpoint = isHiddenByMe ? 'unhide' : 'hide';
                                                    const res = await fetchWithAuth(`/api/conversations/${discussionId}/${endpoint}`, { method: 'POST' });
                                                    const data = await res.json().catch(() => ({}));
                                                    if (res.ok) {
                                                        toast.success(data.message || (isHiddenByMe ? 'Discussion affichée' : 'Discussion masquée'));
                                                        mutateDiscussion();
                                                    } else {
                                                        toast.error(data.error || 'Erreur');
                                                    }
                                                } catch {
                                                    toast.error('Erreur réseau');
                                                } finally {
                                                    setHideToggleLoading(false);
                                                }
                                            }}
                                        >
                                            {discussion.hiddenByUserId === user?.id ? (
                                                <><ArchiveRestore className="w-4 h-4 mr-2" /> Afficher la discussion pour l'autre</>
                                            ) : (
                                                <><Archive className="w-4 h-4 mr-2" /> Masquer la discussion pour l'autre</>
                                            )}
                                        </DropdownMenuItem>
                                    )}
                                    {discussion?.canPurchaseRights && (
                                        <DropdownMenuItem onClick={() => setShowPurchaseRightsDialog(true)}>
                                            <Crown className="w-4 h-4 mr-2 text-amber-500" />
                                            Acheter les droits de la discussion
                                        </DropdownMenuItem>
                                    )}
                                </DropdownMenuContent>
                            </DropdownMenu>
                        )}
                        <PurchaseRightsDialog
                            open={showPurchaseRightsDialog}
                            onOpenChange={setShowPurchaseRightsDialog}
                            discussionId={discussionId!}
                            onSuccess={() => mutateDiscussion()}
                            pendingRightsPayment={discussion?.pendingRightsPayment}
                            pendingRightsOrder={discussion?.pendingRightsOrder}
                        />
                    </div>
                </>
            ) : mounted && isChatListPage ? (
                /* Top bar page liste des chats */
                <div className="flex items-center gap-2 w-full">
                    <MessageSquare className="w-5 h-5 text-primary shrink-0" />
                    <h2 className="font-semibold text-foreground truncate flex-1">Chats</h2>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => router.push('/chat/notes')}
                        title="Notes de groupe"
                        className="text-muted-foreground hover:text-primary shrink-0"
                    >
                        <StickyNote className="w-5 h-5" />
                    </Button>
                </div>
            ) : pathname === '/chat/organizations' ? (
                /* Top bar page Organisations (liste) */
                <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-3">
                        <Building2 className="w-5 h-5 text-primary shrink-0" />
                        <span className="font-semibold text-lg text-foreground">Organisations</span>
                    </div>
                </div>
            ) : isMyApplicationsPage ? (
                /* Top bar page Mes candidatures */
                <div className="flex items-center justify-between w-full gap-3">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => router.push('/chat/groups')}
                        className="shrink-0"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </Button>
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                        <FileText className="w-5 h-5 text-primary shrink-0" />
                        <h2 className="font-semibold text-foreground truncate">Mes candidatures</h2>
                    </div>
                </div>
            ) : isPublicJobPage && publicJobId ? (
                /* Top bar page détail offre publique : retour, titre, bouton Postuler */
                <div className="flex items-center justify-between w-full gap-3">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => router.push('/chat/groups')}
                            className="shrink-0"
                        >
                            <ArrowLeft className="w-5 h-5" />
                        </Button>
                        <div className="min-w-0 flex-1">
                            <h2 className="font-semibold text-foreground truncate">{publicJob?.title || 'Offre'}</h2>
                            <p className="text-xs text-muted-foreground truncate">{publicJob?.companyName}</p>
                        </div>
                    </div>
                    <Button
                        size="sm"
                        className="gap-2 shrink-0"
                        onClick={() => {
                            if (!isPublicJobExpired) {
                                window.dispatchEvent(new CustomEvent('job-apply-open', { detail: { jobId: publicJobId } }));
                            }
                        }}
                        disabled={!!isPublicJobExpired}
                        variant={hasAlreadyApplied ? "outline" : "default"}
                    >
                        {isPublicJobExpired ? 'Offre expirée' : hasAlreadyApplied ? <><FileText className="w-4 h-4" /> Voir ma candidature</> : <><Send className="w-4 h-4" /> Postuler</>}
                    </Button>
                </div>
            ) : mounted && isPublicPageView ? (
                /* Top bar page publique : retour + avatar + nom compact, sans recherche ni plus */
                <div className="flex items-center gap-2 w-full min-w-0">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => router.push('/chat/notifications')}
                        className="shrink-0"
                    >
                        <ArrowLeft className="w-5 h-5 text-muted-foreground hover:text-foreground" />
                    </Button>
                    {publicPage ? (
                        <>
                            <Avatar className="h-9 w-9 border border-border shrink-0">
                                <AvatarImage src={publicPage.user?.avatarUrl ?? undefined} className="object-cover" />
                                <AvatarFallback className="text-xs bg-primary/10 text-primary">
                                    {publicPage.handle?.slice(1, 3).toUpperCase() ?? "?"}
                                </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0 flex-1">
                                <h2 className="font-semibold text-foreground truncate text-sm">
                                    {publicPage.handle}
                                </h2>
                            </div>
                        </>
                    ) : (
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                            <div className="h-9 w-9 rounded-full bg-muted animate-pulse shrink-0" />
                            <div className="h-4 w-24 bg-muted animate-pulse rounded" />
                        </div>
                    )}
                </div>
            ) : (
                // Default Chat Header View
                <div className="flex items-center gap-3">
                    <Avatar className="h-9 w-9 border border-border">
                        <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${user?.name || 'User'}`} />
                        <AvatarFallback><UserCircle className="w-6 h-6" /></AvatarFallback>
                    </Avatar>
                    <span className="font-semibold text-foreground">{user?.name || 'Chargement...'}</span>
                </div>
            )}

            {!isDeptChatPage && !isDeptDetailPage && !isTaskPage && !isOrgDetailPage && !isEventsPage && !isNotificationsPage && !isOrgSettingsPage && !isOrganizationsPage && !isFinancesPage && !isGroupsPage && !isNotesPage && !isSettingsPage && !isJobsListPage && !isJobDetailPage && !isPublicJobPage && !isMyApplicationsPage && !(mounted && isDiscussionPage) && !(mounted && isPublicPageView) && (
                <div className="flex items-center gap-2">
                    {!isOrganizationsPage && <UserSearch />}

                    <Dialog>
                        <DialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground hover:bg-muted">
                                <Plus className="w-5 h-5" />
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="bg-background border-border text-foreground">
                            <DialogHeader>
                                <DialogTitle>{isOrganizationsPage ? 'Nouvelle Organisation' : 'Nouvelle discussion'}</DialogTitle>
                            </DialogHeader>
                            {isOrganizationsPage ? (
                                <div className="py-4">
                                    <p className="mb-4 text-sm text-muted-foreground">Voulez-vous créer une nouvelle organisation ?</p>
                                    <Button onClick={() => setShowOrgRequestDialog(true)} className="w-full">
                                        Créer une organisation
                                    </Button>
                                </div>
                            ) : (
                                <div className="space-y-4 pt-4">
                                    <div className="space-y-2">
                                        <Input
                                            placeholder="Email de l'utilisateur"
                                            value={searchEmail}
                                            onChange={(e) => setSearchEmail(e.target.value)}
                                            className="bg-muted border-border"
                                        />
                                    </div>
                                    <Button
                                        onClick={handleStartChat}
                                        className="w-full"
                                        disabled={loading || !searchEmail}
                                    >
                                        {loading ? 'Recherche...' : 'Démarrer la discussion'}
                                    </Button>
                                </div>
                            )}
                        </DialogContent>
                    </Dialog>

                    {/* Independent Dialog for Org Request to avoid nesting issues if needed, but for now trigger from above */}
                    <OrganizationRequestDialog
                        open={showOrgRequestDialog}
                        onOpenChange={setShowOrgRequestDialog}
                        onSuccess={() => {
                            setShowOrgRequestDialog(false);
                            window.location.reload(); // Simple reload to refresh data
                        }}
                    />
                </div>
            )}
        </header>
    );
}
