'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, FileText, Loader2, User, UserX } from 'lucide-react';
import { Button } from '@/src/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/components/ui/card';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import useSWR from 'swr';
import { fetcher } from '@/src/lib/fetcher';

interface ReportEntry {
    userId: string;
    userName: string | null;
    userEmail: string;
    content: string;
    createdAt: string;
    updatedAt: string;
}

interface MemberWithoutReport {
    id: string;
    name: string | null;
    email: string;
}

export default function DepartmentReportsPage() {
    const params = useParams();
    const router = useRouter();
    const orgId = params?.id as string;
    const deptId = params?.deptId as string;
    const [selectedMonth, setSelectedMonth] = useState<string | null>(null);

    const { data: monthsData, error: monthsError } = useSWR<{ months: string[] }>(
        orgId && deptId ? `/api/organizations/${orgId}/departments/${deptId}/reports?listMonths=1` : null,
        fetcher
    );
    const months = monthsData?.months ?? [];

    const { data: monthData, isLoading: loadingMonth } = useSWR<{
        reports: ReportEntry[];
        membersWithoutReport: MemberWithoutReport[];
        canEdit: boolean;
    }>(
        orgId && deptId && selectedMonth
            ? `/api/organizations/${orgId}/departments/${deptId}/reports?month=${selectedMonth}`
            : null,
        fetcher
    );

    const reports = monthData?.reports ?? [];
    const membersWithoutReport = monthData?.membersWithoutReport ?? [];

    const monthLabel = selectedMonth
        ? format(new Date(selectedMonth + '-01'), 'MMMM yyyy', { locale: fr })
        : '';

    return (
        <div className="min-h-screen bg-background p-4 md:p-6 space-y-6 mt-16 md:mt-16 pb-20 md:pb-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <FileText className="w-4 h-4" />
                <span>Rapports du département par mois</span>
            </div>

            {monthsError && (
                <Card className="bg-card border-border border-destructive/50">
                    <CardContent className="pt-6">
                        <p className="text-sm text-destructive">Accès réservé au propriétaire et aux admins de l&apos;organisation.</p>
                        <Button variant="outline" className="mt-2" onClick={() => router.back()}>
                            Retour
                        </Button>
                    </CardContent>
                </Card>
            )}

            {!monthsError && (
                <Card className="bg-card border-border">
                    <CardHeader>
                        <CardTitle className="text-lg">Choisir un mois</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {months.length === 0 ? (
                            <p className="text-muted-foreground text-sm">Aucun rapport enregistré pour ce département.</p>
                        ) : (
                            <div className="flex flex-wrap gap-2">
                                {months.map((m) => (
                                    <Button
                                        key={m}
                                        variant={selectedMonth === m ? 'default' : 'outline'}
                                        size="sm"
                                        onClick={() => setSelectedMonth(m)}
                                    >
                                        {format(new Date(m + '-01'), 'MMMM yyyy', { locale: fr })}
                                    </Button>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            {selectedMonth && !monthsError && (
                <Card className="bg-card border-border">
                    <CardHeader>
                        <CardTitle className="text-lg">
                            Rapports — {monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        {loadingMonth ? (
                            <div className="flex justify-center py-8">
                                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                            </div>
                        ) : (
                            <>
                                <div>
                                    <h3 className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
                                        <User className="w-4 h-4" />
                                        Rapports déposés ({reports.length})
                                    </h3>
                                    {reports.length === 0 ? (
                                        <p className="text-sm text-muted-foreground">Aucun rapport pour ce mois.</p>
                                    ) : (
                                        <div className="space-y-4">
                                            {reports.map((r) => (
                                                <div
                                                    key={r.userId}
                                                    className="rounded-lg border border-border p-4 bg-muted/30"
                                                >
                                                    <p className="text-sm font-medium text-foreground">
                                                        {r.userName || r.userEmail}
                                                    </p>
                                                    <p className="text-xs text-muted-foreground mb-2">{r.userEmail}</p>
                                                    <p className="text-sm text-foreground whitespace-pre-wrap">{r.content || '—'}</p>
                                                    <p className="text-xs text-muted-foreground mt-2">
                                                        Dernière mise à jour :{' '}
                                                        {format(new Date(r.updatedAt), 'd MMM yyyy à HH:mm', { locale: fr })}
                                                    </p>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                <div>
                                    <h3 className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
                                        <UserX className="w-4 h-4" />
                                        Membres sans rapport ({membersWithoutReport.length})
                                    </h3>
                                    {membersWithoutReport.length === 0 ? (
                                        <p className="text-sm text-muted-foreground">Tous les membres ont déposé un rapport.</p>
                                    ) : (
                                        <ul className="space-y-1">
                                            {membersWithoutReport.map((u) => (
                                                <li key={u.id} className="text-sm text-muted-foreground">
                                                    {u.name || u.email} ({u.email})
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            </>
                        )}
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
