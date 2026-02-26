-- Migration: Ajout emailHash et encryptedPhone pour le chiffrement des données personnelles
-- emailHash : HMAC-SHA256 pour les recherches d'utilisateurs sans déchiffrer l'email
-- encryptedPhone : téléphone chiffré AES-256-GCM côté serveur

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailHash" VARCHAR(64);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "encryptedPhone" TEXT;

-- Index sur emailHash pour les recherches rapides
CREATE INDEX IF NOT EXISTS "User_emailHash_idx" ON "User"("emailHash");
