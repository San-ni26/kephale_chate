-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NULL,
    `password` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NULL,
    `publicKey` TEXT NOT NULL,
    `encryptedPrivateKey` TEXT NOT NULL,
    `otpCode` VARCHAR(191) NULL,
    `otpExpiry` DATETIME(3) NULL,
    `isVerified` BOOLEAN NOT NULL DEFAULT false,
    `deviceId` VARCHAR(191) NULL,
    `deviceInfo` JSON NULL,
    `location` JSON NULL,
    `allowedCountry` VARCHAR(191) NULL,
    `isBanned` BOOLEAN NOT NULL DEFAULT false,
    `isFirstLogin` BOOLEAN NOT NULL DEFAULT true,
    `currentLocation` JSON NULL,
    `lastSeen` DATETIME(3) NULL,
    `isOnline` BOOLEAN NOT NULL DEFAULT false,
    `role` ENUM('USER', 'ADMIN', 'SUPER_ADMIN') NOT NULL DEFAULT 'USER',
    `canPublishNotifications` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `User_email_key`(`email`),
    INDEX `User_email_idx`(`email`),
    INDEX `User_isOnline_idx`(`isOnline`),
    INDEX `User_allowedCountry_idx`(`allowedCountry`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Organization` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `logo` TEXT NULL,
    `address` TEXT NULL,
    `isSuspended` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `ownerId` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `Organization_code_key`(`code`),
    INDEX `Organization_code_idx`(`code`),
    INDEX `Organization_isSuspended_idx`(`isSuspended`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OrganizationMember` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `orgId` VARCHAR(191) NOT NULL,
    `role` ENUM('OWNER', 'ADMIN', 'MEMBER') NOT NULL DEFAULT 'MEMBER',
    `joinedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `OrganizationMember_orgId_fkey`(`orgId`),
    UNIQUE INDEX `OrganizationMember_userId_orgId_key`(`userId`, `orgId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Department` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `orgId` VARCHAR(191) NOT NULL,
    `publicKey` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Department_orgId_fkey`(`orgId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DepartmentMember` (
    `id` VARCHAR(191) NOT NULL,
    `deptId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `encryptedDeptKey` TEXT NOT NULL,

    INDEX `DepartmentMember_userId_fkey`(`userId`),
    UNIQUE INDEX `DepartmentMember_deptId_userId_key`(`deptId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Group` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NULL,
    `isDirect` BOOLEAN NOT NULL DEFAULT false,
    `deptId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Group_deptId_fkey`(`deptId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `GroupMember` (
    `id` VARCHAR(191) NOT NULL,
    `groupId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `joinedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `GroupMember_userId_fkey`(`userId`),
    UNIQUE INDEX `GroupMember_groupId_userId_key`(`groupId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Message` (
    `id` VARCHAR(191) NOT NULL,
    `content` LONGTEXT NOT NULL,
    `senderId` VARCHAR(191) NOT NULL,
    `groupId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Message_groupId_createdAt_idx`(`groupId`, `createdAt`),
    INDEX `Message_senderId_idx`(`senderId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Attachment` (
    `id` VARCHAR(191) NOT NULL,
    `messageId` VARCHAR(191) NOT NULL,
    `type` ENUM('IMAGE', 'PDF', 'WORD', 'AUDIO', 'OTHER') NOT NULL,
    `filename` VARCHAR(191) NOT NULL,
    `data` LONGTEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Attachment_messageId_idx`(`messageId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Notification` (
    `id` VARCHAR(191) NOT NULL,
    `content` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `expiresAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `isRead` BOOLEAN NOT NULL DEFAULT false,

    INDEX `Notification_userId_idx`(`userId`),
    INDEX `Notification_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Announcement` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `content` TEXT NOT NULL,
    `publisherId` VARCHAR(191) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `isActive` BOOLEAN NOT NULL DEFAULT true,

    INDEX `Announcement_expiresAt_idx`(`expiresAt`),
    INDEX `Announcement_isActive_idx`(`isActive`),
    INDEX `Announcement_publisherId_fkey`(`publisherId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AnnouncementRead` (
    `id` VARCHAR(191) NOT NULL,
    `announcementId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `readAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AnnouncementRead_userId_idx`(`userId`),
    UNIQUE INDEX `AnnouncementRead_announcementId_userId_key`(`announcementId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OrganizationRequest` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `cardCode` VARCHAR(191) NOT NULL,
    `status` ENUM('PENDING', 'APPROVED', 'REJECTED', 'COMPLETED') NOT NULL DEFAULT 'PENDING',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `reviewedBy` VARCHAR(191) NULL,
    `reviewedAt` DATETIME(3) NULL,
    `orgId` VARCHAR(191) NULL,

    UNIQUE INDEX `OrganizationRequest_orgId_key`(`orgId`),
    INDEX `OrganizationRequest_userId_idx`(`userId`),
    INDEX `OrganizationRequest_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Subscription` (
    `id` VARCHAR(191) NOT NULL,
    `orgId` VARCHAR(191) NOT NULL,
    `plan` ENUM('FREE', 'BASIC', 'PROFESSIONAL', 'ENTERPRISE') NOT NULL DEFAULT 'FREE',
    `startDate` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `endDate` DATETIME(3) NULL,
    `maxDepartments` INTEGER NOT NULL DEFAULT 2,
    `maxMembersPerDept` INTEGER NOT NULL DEFAULT 5,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Subscription_orgId_key`(`orgId`),
    INDEX `Subscription_orgId_idx`(`orgId`),
    INDEX `Subscription_isActive_idx`(`isActive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EventInvitation` (
    `id` VARCHAR(191) NOT NULL,
    `orgId` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `eventType` ENUM('PROFESSIONAL', 'DINNER', 'MEETING', 'PARTY', 'CONFERENCE', 'WORKSHOP', 'OTHER') NOT NULL DEFAULT 'OTHER',
    `eventDate` DATETIME(3) NOT NULL,
    `maxAttendees` INTEGER NOT NULL,
    `imageUrl` TEXT NULL,
    `token` VARCHAR(191) NOT NULL,
    `createdBy` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `EventInvitation_token_key`(`token`),
    INDEX `EventInvitation_orgId_idx`(`orgId`),
    INDEX `EventInvitation_token_idx`(`token`),
    INDEX `EventInvitation_eventDate_idx`(`eventDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `InvitationRSVP` (
    `id` VARCHAR(191) NOT NULL,
    `eventId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `InvitationRSVP_eventId_idx`(`eventId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `OrganizationMember` ADD CONSTRAINT `OrganizationMember_orgId_fkey` FOREIGN KEY (`orgId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrganizationMember` ADD CONSTRAINT `OrganizationMember_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Department` ADD CONSTRAINT `Department_orgId_fkey` FOREIGN KEY (`orgId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DepartmentMember` ADD CONSTRAINT `DepartmentMember_deptId_fkey` FOREIGN KEY (`deptId`) REFERENCES `Department`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DepartmentMember` ADD CONSTRAINT `DepartmentMember_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Group` ADD CONSTRAINT `Group_deptId_fkey` FOREIGN KEY (`deptId`) REFERENCES `Department`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GroupMember` ADD CONSTRAINT `GroupMember_groupId_fkey` FOREIGN KEY (`groupId`) REFERENCES `Group`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GroupMember` ADD CONSTRAINT `GroupMember_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Message` ADD CONSTRAINT `Message_groupId_fkey` FOREIGN KEY (`groupId`) REFERENCES `Group`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Message` ADD CONSTRAINT `Message_senderId_fkey` FOREIGN KEY (`senderId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Attachment` ADD CONSTRAINT `Attachment_messageId_fkey` FOREIGN KEY (`messageId`) REFERENCES `Message`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Notification` ADD CONSTRAINT `Notification_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Announcement` ADD CONSTRAINT `Announcement_publisherId_fkey` FOREIGN KEY (`publisherId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AnnouncementRead` ADD CONSTRAINT `AnnouncementRead_announcementId_fkey` FOREIGN KEY (`announcementId`) REFERENCES `Announcement`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Subscription` ADD CONSTRAINT `Subscription_orgId_fkey` FOREIGN KEY (`orgId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EventInvitation` ADD CONSTRAINT `EventInvitation_orgId_fkey` FOREIGN KEY (`orgId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InvitationRSVP` ADD CONSTRAINT `InvitationRSVP_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `EventInvitation`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
