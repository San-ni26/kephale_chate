-- Migration : Chiffrement du téléphone en clair → champ phone = AES-256-GCM
-- Stratégie : copie encryptedPhone → phone si encryptedPhone existe, puis supprime encryptedPhone

-- Étape 1 : Si encryptedPhone existe et phone est en clair, remplacer phone par encryptedPhone
UPDATE "User"
SET phone = "encryptedPhone"
WHERE "encryptedPhone" IS NOT NULL
  AND phone IS NOT NULL;

-- Étape 2 : Supprimer la colonne encryptedPhone (devenue redondante)
ALTER TABLE "User" DROP COLUMN IF EXISTS "encryptedPhone";

-- Note : Les anciens enregistrements avec phone en clair (sans encryptedPhone)
-- seront migrés automatiquement à la prochaine mise à jour de profil (PATCH /api/users/profile).
-- decryptPII() retourne la valeur brute si elle n'est pas au format chiffré (rétrocompatibilité).
