# Migration Base64 → Supabase Storage pour les Fiches/Documents

## Description

Actuellement, les fichiers (fiches, documents) sont encodés en **base64 côté client**, envoyés en JSON au serveur, et stockés directement dans la colonne `data TEXT` de PostgreSQL. Cela cause :
- Surcharge de ~33% sur la taille des fichiers
- Saturation de la base de données avec des blobs binaires
- Lenteur au chargement (tout le fichier transité en JSON)

La migration remplacera ce flux par un **upload direct vers Supabase Storage**, en stockant uniquement l'**URL publique** dans `data`.

---

## Changements proposés

### 1. Supabase Storage

- Créer un bucket Supabase Storage : `documents`
  - Politique : accessible en lecture publique (ou signed URLs si sécurité renforcée)
- Ajouter la clé `SUPABASE_SERVICE_ROLE_KEY` au `.env` pour les uploads server-side

---

### 2. Client Supabase (`src/lib/supabase.ts`) — [NEW]

Créer un client Supabase serveur (avec `service_role_key`) et un client public.

---

### 3. Nouvelle route API d'upload (`app/api/upload/document/route.ts`) — [MODIFY]

Remplacer la logique base64 actuelle par :
- Réception d'un `FormData` avec le fichier binaire
- Upload vers Supabase Storage (`documents/dept-{deptId}/` ou `documents/collab-{groupId}/`)
- Retour de l'URL publique du fichier

---

### 4. Routes API documents — [MODIFY]

#### `app/api/organizations/[id]/departments/[deptId]/documents/route.ts`
- `POST` : recevoir `{ filename, type, storageUrl }` au lieu de `{ filename, type, data: base64 }`
- `GET` : retourner les docs avec `storageUrl` dans le champ `data`

#### `app/api/organizations/[id]/collaborations/[collab]/groups/[groupId]/documents/route.ts`
- Même changement

#### Routes `[docId]/route.ts` (DELETE) — [MODIFY]
- Lors de la suppression : supprimer aussi le fichier dans Supabase Storage

---

### 5. Schéma Prisma — [MODIFY]

Changer la signification du champ `data` dans les modèles `DepartmentDocument` et `CollaborationDocument` :
- Ce champ contiendra désormais une **URL Supabase Storage** au lieu de base64
- Pas de changement de type (reste `String @db.Text`)
- Ajouter un champ optionnel `storageKey String?` pour pouvoir supprimer le fichier du storage

```diff
model DepartmentDocument {
  id         String   @id @default(cuid())
  deptId     String
  filename   String
  type       FileType
  data       String   @db.Text  // Désormais : URL Supabase Storage
+ storageKey String?            // Chemin dans le bucket pour suppression
  uploadedBy String
  createdAt  DateTime @default(now())
  ...
}
```

---

### 6. Composants Frontend — [MODIFY]

#### `src/components/chat/DepartmentDocumentsPanel.tsx`
- Remplacer `handleFileSelect` : utiliser `FormData` + `fetch` vers `/api/upload/document` au lieu de `FileReader.readAsDataURL()`
- Remplacer toutes les références `doc.data.startsWith('data:')` par `doc.data` (URL directe)
- Download : utiliser l'URL directe au lieu de `data:application/octet-stream;base64,...`
- Preview PDF : utiliser l'URL directe dans l'iframe (plus besoin de blob URL)
- Preview Image : `<img src={doc.data} />` (URL directe)

#### `src/components/chat/CollaborationDocumentsPanel.tsx`
- Même changements

---

## Flux simplifié

```
Avant :
  Client → FileReader → base64 → JSON → API (JSON body) → DB (TEXT base64)
  Affichage : DB (TEXT base64) → API → Client → data: URL → img/iframe

Après :
  Client → FormData → /api/upload/document → Supabase Storage → URL → DB (TEXT)
  Affichage : DB (URL) → API → Client → URL directe → img/iframe
```

---

## Questions ouvertes

> [!IMPORTANT]
> **Bucket Supabase Storage :** Le bucket `documents` doit-il être accessible **publiquement** (URL directe sans auth) ou via des **Signed URLs** (URLs temporaires avec expiration) ? Les URLs signées sont plus sécurisées mais expirent.

> [!WARNING]
> **Documents existants :** Il y a des documents actuels en base64 dans la DB. Stratégie : maintenir la **rétrocompatibilité** — si `doc.data` commence par `http`, c'est une URL Supabase ; sinon c'est de l'ancien base64. Cela évite une migration de données.

---

## Plan de vérification

1. Upload d'un PDF, image, et Word → vérifier que le fichier apparaît dans Supabase Storage
2. Prévisualisation fonctionne (iframe PDF, image, Word via mammoth)
3. Téléchargement direct depuis l'URL
4. Suppression → le fichier est bien supprimé du storage ET de la DB
5. Anciens documents base64 toujours affichables (rétrocompatibilité)
