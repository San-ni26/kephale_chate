-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN', 'SUPER_ADMIN');

-- CreateEnum
CREATE TYPE "OrgRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "FileType" AS ENUM ('IMAGE', 'PDF', 'WORD', 'AUDIO', 'OTHER');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "SubscriptionPlan" AS ENUM ('FREE', 'BASIC', 'PROFESSIONAL', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('PROFESSIONAL', 'DINNER', 'MEETING', 'PARTY', 'CONFERENCE', 'WORKSHOP', 'OTHER');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "password" TEXT NOT NULL,
    "phone" TEXT,
    "publicKey" TEXT NOT NULL,
    "encryptedPrivateKey" TEXT NOT NULL,
    "otpCode" TEXT,
    "otpExpiry" TIMESTAMP(3),
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "deviceId" TEXT,
    "deviceInfo" JSONB,
    "location" JSONB,
    "allowedCountry" TEXT,
    "isBanned" BOOLEAN NOT NULL DEFAULT false,
    "isFirstLogin" BOOLEAN NOT NULL DEFAULT true,
    "currentLocation" JSONB,
    "lastSeen" TIMESTAMP(3),
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "canPublishNotifications" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "logo" TEXT,
    "address" TEXT,
    "isSuspended" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ownerId" TEXT NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationMember" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "role" "OrgRole" NOT NULL DEFAULT 'MEMBER',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrganizationMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Department" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepartmentMember" (
    "id" TEXT NOT NULL,
    "deptId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "encryptedDeptKey" TEXT NOT NULL,

    CONSTRAINT "DepartmentMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Group" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "isDirect" BOOLEAN NOT NULL DEFAULT false,
    "deptId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupMember" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "type" "FileType" NOT NULL,
    "filename" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "userId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isRead" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Announcement" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "publisherId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnnouncementRead" (
    "id" TEXT NOT NULL,
    "announcementId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnnouncementRead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cardCode" TEXT NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "orgId" TEXT,

    CONSTRAINT "OrganizationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "plan" "SubscriptionPlan" NOT NULL DEFAULT 'FREE',
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endDate" TIMESTAMP(3),
    "maxDepartments" INTEGER NOT NULL DEFAULT 2,
    "maxMembersPerDept" INTEGER NOT NULL DEFAULT 5,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventInvitation" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "eventType" "EventType" NOT NULL DEFAULT 'OTHER',
    "eventDate" TIMESTAMP(3) NOT NULL,
    "maxAttendees" INTEGER NOT NULL,
    "imageUrl" TEXT,
    "token" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvitationRSVP" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvitationRSVP_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_isOnline_idx" ON "User"("isOnline");

-- CreateIndex
CREATE INDEX "User_allowedCountry_idx" ON "User"("allowedCountry");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_code_key" ON "Organization"("code");

-- CreateIndex
CREATE INDEX "Organization_code_idx" ON "Organization"("code");

-- CreateIndex
CREATE INDEX "Organization_isSuspended_idx" ON "Organization"("isSuspended");

-- CreateIndex
CREATE INDEX "OrganizationMember_orgId_idx" ON "OrganizationMember"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationMember_userId_orgId_key" ON "OrganizationMember"("userId", "orgId");

-- CreateIndex
CREATE INDEX "Department_orgId_idx" ON "Department"("orgId");

-- CreateIndex
CREATE INDEX "DepartmentMember_userId_idx" ON "DepartmentMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "DepartmentMember_deptId_userId_key" ON "DepartmentMember"("deptId", "userId");

-- CreateIndex
CREATE INDEX "Group_deptId_idx" ON "Group"("deptId");

-- CreateIndex
CREATE INDEX "GroupMember_userId_idx" ON "GroupMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "GroupMember_groupId_userId_key" ON "GroupMember"("groupId", "userId");

-- CreateIndex
CREATE INDEX "Message_groupId_createdAt_idx" ON "Message"("groupId", "createdAt");

-- CreateIndex
CREATE INDEX "Message_senderId_idx" ON "Message"("senderId");

-- CreateIndex
CREATE INDEX "Attachment_messageId_idx" ON "Attachment"("messageId");

-- CreateIndex
CREATE INDEX "Notification_userId_idx" ON "Notification"("userId");

-- CreateIndex
CREATE INDEX "Notification_expiresAt_idx" ON "Notification"("expiresAt");

-- CreateIndex
CREATE INDEX "Announcement_expiresAt_idx" ON "Announcement"("expiresAt");

-- CreateIndex
CREATE INDEX "Announcement_isActive_idx" ON "Announcement"("isActive");

-- CreateIndex
CREATE INDEX "Announcement_publisherId_idx" ON "Announcement"("publisherId");

-- CreateIndex
CREATE INDEX "AnnouncementRead_userId_idx" ON "AnnouncementRead"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AnnouncementRead_announcementId_userId_key" ON "AnnouncementRead"("announcementId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationRequest_orgId_key" ON "OrganizationRequest"("orgId");

-- CreateIndex
CREATE INDEX "OrganizationRequest_userId_idx" ON "OrganizationRequest"("userId");

-- CreateIndex
CREATE INDEX "OrganizationRequest_status_idx" ON "OrganizationRequest"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_orgId_key" ON "Subscription"("orgId");

-- CreateIndex
CREATE INDEX "Subscription_orgId_idx" ON "Subscription"("orgId");

-- CreateIndex
CREATE INDEX "Subscription_isActive_idx" ON "Subscription"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "EventInvitation_token_key" ON "EventInvitation"("token");

-- CreateIndex
CREATE INDEX "EventInvitation_orgId_idx" ON "EventInvitation"("orgId");

-- CreateIndex
CREATE INDEX "EventInvitation_token_idx" ON "EventInvitation"("token");

-- CreateIndex
CREATE INDEX "EventInvitation_eventDate_idx" ON "EventInvitation"("eventDate");

-- CreateIndex
CREATE INDEX "InvitationRSVP_eventId_idx" ON "InvitationRSVP"("eventId");

-- AddForeignKey
ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_orgId_fk" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_orgId_fk" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentMember" ADD CONSTRAINT "DepartmentMember_deptId_fkey" FOREIGN KEY ("deptId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentMember" ADD CONSTRAINT "DepartmentMember_userId_fk" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Group" ADD CONSTRAINT "Group_deptId_fk" FOREIGN KEY ("deptId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupMember" ADD CONSTRAINT "GroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupMember" ADD CONSTRAINT "GroupMember_userId_fk" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_publisherId_fkey" FOREIGN KEY ("publisherId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnouncementRead" ADD CONSTRAINT "AnnouncementRead_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "Announcement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventInvitation" ADD CONSTRAINT "EventInvitation_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvitationRSVP" ADD CONSTRAINT "InvitationRSVP_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "EventInvitation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
