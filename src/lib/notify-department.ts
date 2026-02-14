/**
 * Notifications pour les événements au niveau département (organisation).
 * - Nouveau message dans la discussion du département
 * - Nouvelle tâche assignée à un membre
 * - Nouvelle réunion créée dans le département
 *
 * Chaque notification : DB + Pusher (temps réel) + Web Push (app fermée).
 */

import { prisma } from '@/src/lib/prisma';
import { emitToUser } from '@/src/lib/pusher-server';
import { sendPushNotification } from '@/src/lib/push';

function buildDeptChatUrl(orgId: string, deptId: string) {
    return `/chat/organizations/${orgId}/departments/${deptId}/chat`;
}

function buildDeptTaskUrl(orgId: string, deptId: string, taskId: string) {
    return `/chat/organizations/${orgId}/departments/${deptId}/tasks/${taskId}`;
}

function buildDeptUrl(orgId: string, deptId: string) {
    return `/chat/organizations/${orgId}/departments/${deptId}`;
}

async function sendToUser(
    userId: string,
    content: string,
    payload: { title: string; body: string; url: string; type: string; data: Record<string, unknown> }
) {
    try {
        const notification = await prisma.notification.create({
            data: { userId, content, isRead: false },
        });

        try {
            await emitToUser(userId, 'notification:new', {
                id: notification.id,
                content,
                type: payload.type,
                ...payload.data,
                createdAt: notification.createdAt,
            });
        } catch (e) {
            console.error('[NotifyDepartment] Pusher error for user', userId, e);
        }

        try {
            const subscriptions = await prisma.pushSubscription.findMany({
                where: { userId },
            });
            if (subscriptions.length > 0) {
                const pushPayload = {
                    title: payload.title,
                    body: payload.body,
                    icon: '/icons/icon-192x192.png',
                    url: payload.url,
                    type: payload.type,
                    data: payload.data,
                };
                await Promise.allSettled(
                    subscriptions.map(async (sub) => {
                        try {
                            await sendPushNotification(
                                { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
                                pushPayload
                            );
                        } catch (err: any) {
                            if (err?.statusCode === 410 || err?.statusCode === 404) {
                                await prisma.pushSubscription.delete({ where: { endpoint: sub.endpoint } }).catch(() => {});
                            }
                            throw err;
                        }
                    })
                );
            }
        } catch (e) {
            console.error('[NotifyDepartment] Web Push error for user', userId, e);
        }
    } catch (e) {
        console.error('[NotifyDepartment] Create notification error for user', userId, e);
    }
}

/**
 * Notifie tous les membres du département (sauf l'expéditeur) d'un nouveau message dans la discussion.
 */
export async function notifyDepartmentNewMessage(params: {
    orgId: string;
    deptId: string;
    messageId: string;
    senderId: string;
    senderName: string;
    departmentName?: string;
}) {
    const { orgId, deptId, messageId, senderId, senderName, departmentName } = params;
    const url = buildDeptChatUrl(orgId, deptId);

    const members = await prisma.departmentMember.findMany({
        where: { deptId, userId: { not: senderId } },
        select: { userId: true },
    });

    const content = `Nouveau message dans la discussion${departmentName ? ` (${departmentName})` : ''} : ${senderName}`;

    await Promise.all(
        members.map((m) =>
            sendToUser(m.userId, content, {
                title: senderName,
                body: 'Nouveau message dans la discussion du département',
                url,
                type: 'department_message',
                data: { orgId, deptId, messageId, senderId },
            })
        )
    );
}

/**
 * Notifie le membre assigné d'une nouvelle tâche.
 */
export async function notifyDepartmentTaskAssigned(params: {
    orgId: string;
    deptId: string;
    taskId: string;
    taskTitle: string;
    assigneeId: string;
    creatorName: string;
}) {
    const { orgId, deptId, taskId, taskTitle, assigneeId, creatorName } = params;
    const url = buildDeptTaskUrl(orgId, deptId, taskId);
    const content = `${creatorName} vous a assigné une tâche : ${taskTitle}`;

    await sendToUser(assigneeId, content, {
        title: 'Nouvelle tâche assignée',
        body: taskTitle,
        url,
        type: 'department_task',
        data: { orgId, deptId, taskId, taskTitle, creatorName },
    });
}

/**
 * Notifie tous les membres du département (sauf le créateur) d'une nouvelle réunion.
 */
export async function notifyDepartmentNewMeeting(params: {
    orgId: string;
    deptId: string;
    meetingId: string;
    meetingTitle: string;
    meetingDate: Date;
    createdBy: string;
    creatorName?: string;
}) {
    const { orgId, deptId, meetingId, meetingTitle, meetingDate, createdBy, creatorName } = params;
    const url = buildDeptUrl(orgId, deptId);

    const members = await prisma.departmentMember.findMany({
        where: { deptId, userId: { not: createdBy } },
        select: { userId: true },
    });

    const dateStr = meetingDate.toLocaleDateString('fr-FR', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
    const content = `Nouvelle réunion : ${meetingTitle} — ${dateStr}${creatorName ? ` (créée par ${creatorName})` : ''}`;

    await Promise.all(
        members.map((m) =>
            sendToUser(m.userId, content, {
                title: 'Nouvelle réunion',
                body: `${meetingTitle} — ${dateStr}`,
                url,
                type: 'department_meeting',
                data: { orgId, deptId, meetingId, meetingTitle, meetingDate: meetingDate.toISOString() },
            })
        )
    );
}
