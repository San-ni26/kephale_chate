# Système d'Encodage Base64 pour les Fichiers

## Vue d'ensemble

Le système utilise maintenant l'encodage Base64 pour stocker tous les fichiers (images, PDF, Word, audio) directement dans la base de données, similaire au système utilisé pour les événements.

## Architecture

### 1. **Page de Discussion** (`/chat/discussion/[id]`)

#### Encodage des Fichiers
- Les fichiers sont convertis en Data URLs Base64 complètes avec le préfixe MIME type
- Format: `data:image/jpeg;base64,/9j/4AAQSkZJRg...`
- Fonction: `fileToBase64()` utilise `FileReader.readAsDataURL()`

#### Types de Fichiers Supportés
- **Images**: JPEG, PNG, GIF, WebP
- **Documents**: PDF, DOCX
- **Audio**: WebM, MP3, OGG, M4A, WAV

#### Envoi des Messages
```typescript
const base64Data = await fileToBase64(file); // Retourne la Data URL complète

attachments.push({
    filename: file.name,
    type: fileType, // 'IMAGE', 'PDF', 'WORD', 'AUDIO'
    data: base64Data // Data URL complète
});
```

### 2. **API Messages** (`/api/conversations/[id]/messages`)

#### Stockage
- Les données Base64 sont stockées **directement** dans la base de données
- Pas de sauvegarde de fichiers sur le disque
- Le champ `data` contient la Data URL complète

```typescript
const processedAttachments = attachments.map((att: any) => ({
    filename: att.filename,
    type: att.type,
    data: att.data // Stockage direct de la Data URL
}));
```

### 3. **Composant d'Affichage** (`EncryptedAttachment.tsx`)

#### Décodage et Affichage
- Détecte automatiquement si les données incluent déjà le préfixe `data:`
- Si non, ajoute le MIME type approprié basé sur l'extension du fichier
- Affiche les fichiers directement depuis la Data URL

#### Fonctionnalités
- **Images**: Affichage inline avec aperçu en plein écran
- **Audio**: Lecteur audio intégré
- **Documents**: Lien de téléchargement avec icône

```typescript
const getDataUrl = () => {
    if (attachment.data.startsWith('data:')) {
        return attachment.data; // Déjà une Data URL
    }
    const mimeType = getMimeType();
    return `data:${mimeType};base64,${attachment.data}`; // Ajoute le préfixe
};
```

### 4. **Système d'Événements** (Référence)

Le même système est utilisé pour les images d'événements:
- `EventCreationDialog.tsx`: Encode l'image en Base64
- API `/api/organizations/[id]/events`: Stocke directement dans `imageUrl`
- Page d'affichage: Utilise `<img src={event.imageUrl} />`

## Avantages

1. **Simplicité**: Pas de gestion de fichiers sur le serveur
2. **Sécurité**: Les données sont chiffrées avec les messages
3. **Portabilité**: Tout est dans la base de données
4. **Cohérence**: Même système pour événements et messages

## Chiffrement des Messages

- Le **contenu texte** des messages est chiffré avec les clés publiques/privées
- Les **fichiers** sont stockés en Base64 (non chiffrés séparément)
- Le chiffrement du texte utilise `encryptMessage()` et `decryptMessage()`

## Flux Complet

### Envoi d'un Fichier
1. Utilisateur sélectionne un fichier
2. `fileToBase64()` convertit en Data URL
3. Envoi via JSON à l'API
4. Stockage direct dans la base de données

### Réception et Affichage
1. API retourne les messages avec attachments
2. `EncryptedAttachment` reçoit les données
3. Vérifie/ajoute le préfixe MIME si nécessaire
4. Affiche directement via `<img>` ou `<audio>` avec la Data URL

## Limites

- **Taille**: Limite de 10MB par fichier (définie côté client)
- **Performance**: Les grandes images peuvent ralentir le chargement
- **Base de données**: Augmentation de la taille de la DB avec les fichiers

## Fichiers Modifiés

1. `/app/chat/discussion/[id]/page.tsx` - Encodage Base64
2. `/app/api/conversations/[id]/messages/route.ts` - Stockage direct
3. `/app/chat/discussion/[id]/EncryptedAttachment.tsx` - Déjà compatible
4. `/src/components/events/EventCreationDialog.tsx` - Système de référence
