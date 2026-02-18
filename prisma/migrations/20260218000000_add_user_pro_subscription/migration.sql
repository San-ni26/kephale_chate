-- CreateEnum (idempotent: skip if already exists)
DO $$ BEGIN
  CREATE TYPE "UserProPlan" AS ENUM ('MONTHLY', 'SIX_MONTHS', 'TWELVE_MONTHS');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "UserProSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "plan" "UserProPlan" NOT NULL DEFAULT 'MONTHLY',
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endDate" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserProSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "UserProSettings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "blurOldMessages" BOOLEAN NOT NULL DEFAULT true,
    "preventScreenshot" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserProSettings_pkey" PRIMARY KEY ("id")
);

-- AlterTable (idempotent)
ALTER TABLE "Group" ADD COLUMN IF NOT EXISTS "lockCodeHash" VARCHAR(255);
ALTER TABLE "Group" ADD COLUMN IF NOT EXISTS "lockSetByUserId" TEXT;
ALTER TABLE "Group" ADD COLUMN IF NOT EXISTS "lockedAt" TIMESTAMP(3);

-- CreateIndex (idempotent)
CREATE UNIQUE INDEX IF NOT EXISTS "UserProSubscription_userId_key" ON "UserProSubscription"("userId");
CREATE INDEX IF NOT EXISTS "UserProSubscription_userId_idx" ON "UserProSubscription"("userId");
CREATE INDEX IF NOT EXISTS "UserProSubscription_endDate_idx" ON "UserProSubscription"("endDate");
CREATE INDEX IF NOT EXISTS "UserProSubscription_isActive_idx" ON "UserProSubscription"("isActive");
CREATE UNIQUE INDEX IF NOT EXISTS "UserProSettings_userId_key" ON "UserProSettings"("userId");
CREATE INDEX IF NOT EXISTS "UserProSettings_userId_idx" ON "UserProSettings"("userId");

-- AddForeignKey (idempotent)
DO $$ BEGIN
  ALTER TABLE "UserProSubscription" ADD CONSTRAINT "UserProSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "UserProSettings" ADD CONSTRAINT "UserProSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
