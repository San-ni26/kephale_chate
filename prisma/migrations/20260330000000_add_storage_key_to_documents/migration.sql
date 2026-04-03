-- Migration: Ajouter storageKey aux tables DepartmentDocument et CollaborationDocument
-- Ce champ stocke le chemin du fichier dans Supabase Storage pour permettre la suppression

ALTER TABLE "DepartmentDocument" ADD COLUMN "storageKey" TEXT;
ALTER TABLE "CollaborationDocument" ADD COLUMN "storageKey" TEXT;
