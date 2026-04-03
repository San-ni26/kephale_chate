-- Migration: Ajouter storageKey aux champs fichiers de JobApplication
-- Les champs *Data conservent leur type TEXT (désormais URL Supabase au lieu de base64)

ALTER TABLE "JobApplication" ADD COLUMN IF NOT EXISTS "photoStorageKey" TEXT;
ALTER TABLE "JobApplication" ADD COLUMN IF NOT EXISTS "cvStorageKey" TEXT;
ALTER TABLE "JobApplication" ADD COLUMN IF NOT EXISTS "coverLetterStorageKey" TEXT;
ALTER TABLE "JobApplication" ADD COLUMN IF NOT EXISTS "portfolioStorageKey" TEXT;
