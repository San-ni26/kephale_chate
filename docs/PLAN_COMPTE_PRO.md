# Plan d'implémentation – Compte Pro

## Vue d'ensemble

Le **Compte Pro** est une fonctionnalité payante (1 500 FCFA/mois) qui renforce la sécurité des discussions directes entre utilisateurs. Elle s’applique uniquement aux **conversations directes** (1-à-1), pas aux discussions d’organisations/départements.

---

## 1. Fonctionnalités du mode Pro

| # | Fonctionnalité | Description | Portée |
|---|----------------|-------------|--------|
| 1 | **Flou (opacité)** | Réduire l’opacité des anciennes discussions pour limiter la prise de photo avec un autre téléphone | Paramètres + discussion |
| 2 | **Bloquer capture d’écran** | Empêcher la capture d’écran (screenshot) | Paramètres |
| 3 | **Code de discussion** | Verrouiller une discussion avec un code à 4 chiffres | Discussion |
| 4 | **Règles de suppression** | Contrôler qui peut supprimer la discussion ou les messages | API + discussion |

---

## 2. Règles de suppression (détaillées)

| Utilisateur A | Utilisateur B | Suppression discussion | Suppression messages |
|---------------|---------------|------------------------|----------------------|
| Pro | Pro | Les deux doivent autoriser | Chacun peut supprimer ses propres messages |
| Pro | Standard | Seul le Pro peut supprimer la discussion | Standard : ses messages uniquement. Pro : tous les messages |
| Standard | Standard | Comportement actuel (n’importe quel membre peut supprimer) | Comportement actuel |

---

## 3. Tarification

| Durée | Prix | Réduction |
|-------|------|-----------|
| 1 mois | 1 500 FCFA | — |
| 6 mois | 8 550 FCFA | -5 % (1 425 FCFA/mois) |
| 12 mois | 16 200 FCFA | -10 % (1 350 FCFA/mois) |

**Mode de paiement** : réutilise le système existant (CINETPAY pour Orange Money, Moov, Wave, Carte bancaire, ou MANUAL pour approbation admin).

---

## 4. Modifications de la base de données (Prisma)

### 4.1 Nouveau modèle `UserProSubscription`

```prisma
model UserProSubscription {
  id          String   @id @default(cuid())
  userId      String   @unique
  plan        UserProPlan  @default(MONTHLY)  // MONTHLY | SIX_MONTHS | TWELVE_MONTHS
  startDate   DateTime @default(now())
  endDate     DateTime
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([endDate])
  @@index([isActive])
}

enum UserProPlan {
  MONTHLY
  SIX_MONTHS
  TWELVE_MONTHS
}
```

### 4.2 Nouveau modèle `UserProSettings`

```prisma
model UserProSettings {
  id                    String   @id @default(cuid())
  userId                String   @unique
  blurOldMessages       Boolean  @default(true)   // Option 1: flou anciennes discussions
  preventScreenshot     Boolean  @default(true)   // Option 2: bloquer capture d'écran
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
}
```

### 4.3 Modifications du modèle `Group` (conversation)

```prisma
model Group {
  // ... champs existants ...
  lockCodeHash    String?   @db.VarChar(255)  // Hash du code 4 chiffres (si discussion verrouillée)
  lockSetByUserId String?   // Qui a verrouillé (doit être Pro)
  lockedAt        DateTime? // Date de verrouillage
}
```

### 4.4 Relation User ↔ UserProSubscription et UserProSettings

Ajouter dans le modèle `User` :

```prisma
proSubscription  UserProSubscription?
proSettings       UserProSettings?
```

---

## 5. Architecture des fichiers

```
app/
├── api/
│   ├── user-pro/
│   │   ├── subscribe/route.ts      # POST: souscrire (paiement)
│   │   ├── status/route.ts         # GET: statut abonnement Pro
│   │   ├── settings/route.ts      # GET/PATCH: options Pro (flou, screenshot)
│   │   └── verify-code/route.ts   # POST: vérifier code 4 chiffres
│   ├── conversations/
│   │   └── [id]/
│   │       ├── lock/route.ts      # POST: verrouiller avec code (Pro uniquement)
│   │       ├── unlock/route.ts    # POST: déverrouiller
│   │       └── route.ts           # Modifier DELETE pour règles Pro
│   └── messages/
│       └── [id]/route.ts          # Modifier DELETE pour règles Pro
│
app/chat/
├── settings/
│   └── page.tsx                   # Ajouter section "Compte Pro"
└── discussion/[id]/
    └── page.tsx                   # Ajouter: verrou, flou, icône

src/
├── components/
│   ├── settings/
│   │   └── ProAccountSection.tsx  # Section Pro dans paramètres
│   └── chat/
│       ├── ConversationLockDialog.tsx   # Saisie code 4 chiffres
│       ├── BlurToggle.tsx               # Icône flou on/off
│       └── ScreenshotBlocker.tsx         # Wrapper anti-capture
├── lib/
│   └── user-pro.ts               # Helpers: isUserPro, canDeleteConversation, etc.
└── hooks/
    └── useProStatus.ts            # Hook SWR statut Pro
```

---

## 6. Phases d’implémentation

### Phase 1 : Base de données et abonnement

1. Migration Prisma : `UserProSubscription`, `UserProSettings`, champs `Group` (lock).
2. API `GET /api/user-pro/status` : retourne `{ isPro, endDate, settings }`.
3. API `PATCH /api/user-pro/settings` : mise à jour `blurOldMessages`, `preventScreenshot`.
4. API `POST /api/user-pro/subscribe` : création abonnement (Orange Money, Moov, Wave, etc.).
5. Section **Compte Pro** dans `/chat/settings` :
   - Affichage statut (Pro / Standard).
   - Choix durée (1 / 6 / 12 mois) et paiement.
   - Toggles pour flou et blocage capture d’écran.

### Phase 2 : Verrouillage par code

1. API `POST /api/conversations/[id]/lock` : verrouiller avec code 4 chiffres (hash stocké).
2. API `POST /api/conversations/[id]/unlock` : déverrouiller (vérification code).
3. API `POST /api/user-pro/verify-code` : vérifier le code côté client (déverrouillage).
4. Composant `ConversationLockDialog` : saisie code, activation/désactivation.
5. Page discussion : afficher cadenas si verrouillé, demander le code à l’ouverture.

### Phase 3 : Flou des anciennes discussions

1. Paramètre `blurOldMessages` dans `UserProSettings`.
2. Seuil temporel (ex. messages > 24 h ou > 7 jours).
3. Composant `BlurOverlay` : appliquer `filter: blur()` + `opacity` sur les messages anciens.
4. Icône dans la discussion pour activer/désactiver le flou à la volée.

### Phase 4 : Blocage capture d’écran

1. Sur **Android** : `FLAG_SECURE` (nécessite app native ou WebView custom).
2. Sur **Web / PWA** : limitations :
   - Pas de blocage natif des screenshots côté navigateur.
   - Possibles mesures : overlay, avertissement, `user-select: none`, etc.
3. Composant `ScreenshotBlocker` : wrapper avec styles anti-capture (effet limité sur web).
4. Documenter clairement les limites sur navigateur.

### Phase 5 : Règles de suppression

1. Modifier `DELETE /api/conversations/[id]` :
   - Récupérer statut Pro des deux participants.
   - Appliquer la matrice de règles (Pro/Pro, Pro/Standard, Standard/Standard).
   - Si Pro/Pro : exiger une double confirmation (nouveau flux ou table `ConversationDeletionRequest`).
2. Modifier `DELETE /api/messages/[id]` :
   - Vérifier si l’utilisateur peut supprimer (Pro vs Standard, propriété du message).
3. Adapter `DeleteConversationDialog` pour les cas Pro/Pro (demande de confirmation à l’autre).

### Phase 6 : Intégration UI discussion

1. Barre d’outils discussion :
   - Icône flou (toggle).
   - Icône cadenas (verrouiller/déverrouiller).
2. Écran de déverrouillage au chargement si discussion verrouillée.
3. Appliquer le flou selon `blurOldMessages` et le toggle local.

---

## 7. Points techniques importants

### 7.1 Stockage du code de verrouillage

- Ne jamais stocker le code en clair.
- Utiliser un hash (bcrypt ou argon2) avec un salt.
- Vérifier le code côté serveur uniquement.

### 7.2 Paiement

- Réutiliser le système existant : **CINETPAY** (Orange Money, Moov, Wave, Carte bancaire) ou **MANUAL** (approbation admin).
- Type de paiement : `USER_PRO` dans `PendingSubscriptionPayment` et `PaymentOrder`.
- Après validation paiement : créer ou prolonger `UserProSubscription`.

### 7.3 Double confirmation (Pro/Pro)

Option A : table `ConversationDeletionRequest`  
- User A demande suppression → enregistrement.  
- User B reçoit une notification et peut accepter/refuser.  
- Si accepté, suppression effective.

Option B : suppression “soft”  
- Chaque utilisateur peut “quitter” la discussion (masquage côté client).  
- La discussion n’est physiquement supprimée que lorsque les deux ont quitté.

### 7.4 Capture d’écran (web)

- Sur web, le blocage natif n’est pas possible.
- Mesures possibles : overlay, `user-select: none`, message d’avertissement.
- Pour une vraie protection : envisager une app native (React Native, Capacitor, etc.).

---

## 8. Estimation des délais

| Phase | Durée estimée |
|-------|---------------|
| Phase 1 – Base + abonnement | 2–3 jours |
| Phase 2 – Verrouillage code | 1–2 jours |
| Phase 3 – Flou | 1 jour |
| Phase 4 – Anti-screenshot | 0,5–1 jour (limité sur web) |
| Phase 5 – Règles suppression | 2–3 jours |
| Phase 6 – UI discussion | 1–2 jours |
| **Total** | **8–12 jours** |

---

## 9. Questions à valider

1. **Seuil du flou** : à partir de quel âge les messages sont floutés (24 h, 7 jours, configurable) ?
2. **Double confirmation Pro/Pro** : préférence pour Option A (demande + acceptation) ou Option B (quitter chacun de son côté) ?
3. **Tarification** : 1 500 FCFA/mois, -5 % sur 6 mois, -10 % sur 12 mois.
5. **Capture d’écran** : l’app est-elle uniquement web/PWA ou prévoyez-vous une version native ?

---

## 10. Ordre de priorité suggéré

1. Phase 1 (abonnement + paramètres).
2. Phase 2 (verrouillage par code).
3. Phase 5 (règles de suppression).
4. Phase 3 (flou).
5. Phase 6 (UI discussion).
6. Phase 4 (anti-screenshot, avec limitations documentées).

---

*Document créé pour validation avant implémentation.*
