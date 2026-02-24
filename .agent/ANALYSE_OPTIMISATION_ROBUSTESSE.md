# Analyse et Proposition : Performance, Robustesse et Hors Ligne

## 📋 Résumé de l'analyse

Votre application **Chat Mango** est une PWA de messagerie avec :
- Next.js 16, SWR, Pusher (temps réel), Prisma
- Service Worker custom pour les push notifications
- Auth JWT + localStorage chiffré

---

## 🔍 Problèmes identifiés

### 1. **Système hors ligne incomplet**

| Élément | État actuel | Problème |
|---------|-------------|----------|
| Service Worker | `sw.js` = push + notification click uniquement | **Aucun cache** : pas de precache, pas de stratégies réseau |
| Page `/offline` | Existe | Jamais servie par le SW (pas de fetch handler) |
| Requêtes API | Pas de cache | Hors ligne = erreur immédiate |
| Messages | Pas de file d'attente | Envoi impossible hors ligne |

**Conséquence** : Dès que l'utilisateur perd le réseau, l'app affiche des erreurs et ne peut plus rien faire.

### 2. **Performance et robustesse des données**

| Élément | État actuel | Problème |
|---------|-------------|----------|
| SWR | Pas de config globale | Pas de retry, pas de dedup optimisé, pas de fallback offline |
| Fetcher | Simple fetch | Pas de retry, pas de timeout, pas de gestion offline |
| refreshInterval | 15s, 30s selon les composants | Incohérent, peut surcharger l'API |
| Cache navigateur | Aucun | Chaque refresh = requêtes complètes |

### 3. **Architecture PWA**

| Élément | État actuel | Problème |
|---------|-------------|----------|
| next-pwa | Installé mais non configuré | Dépendance inutile |
| Double enregistrement SW | `ServiceWorkerRegistration` + `PWAInstaller` | Risque de conflit, code dupliqué |
| Documentation | PWA_CONFIGURATION.md décrit cache strategies | Non implémenté dans `sw.js` |

### 4. **Connexion temps réel (Pusher)**

- Pas de détection explicite online/offline pour adapter l'UI
- Pas de fallback quand Pusher est déconnecté (réseau instable)

---

## ✅ Proposition de solution robuste

### Phase 1 : SWR et Fetcher optimisés (impact immédiat)

#### 1.1 SWRConfig global avec retry et offline

```tsx
// src/providers/SWRProvider.tsx
'use client';

import { SWRConfig } from 'swr';
import { fetcher } from '@/src/lib/fetcher';

export function SWRProvider({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig
      value={{
        fetcher,
        revalidateOnFocus: false,
        revalidateOnReconnect: true,
        dedupingInterval: 5000,
        errorRetryCount: 3,
        errorRetryInterval: 5000,
        shouldRetryOnError: (error) => {
          const status = (error as any)?.status;
          return status !== 401 && status !== 403;
        },
        onErrorRetry: (error, _key, _config, revalidate, { retryCount }) => {
          if (retryCount >= 3) return;
          setTimeout(() => revalidate({ retryCount }), 5000);
        },
      }}
    >
      {children}
    </SWRConfig>
  );
}
```

#### 1.2 Fetcher avec retry, timeout et détection offline

```ts
// src/lib/fetcher.ts - amélioré
export const fetcher: BareFetcher<any> = async (url) => {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new OfflineError('Hors ligne');
  }
  const res = await fetchWithAuth(url, { signal: AbortSignal.timeout(15000) });
  // ... reste
};
```

### Phase 2 : Service Worker enrichi (hors ligne)

#### 2.1 Stratégie recommandée : SW hybride

Garder le SW actuel pour **push** et **notification click**, et ajouter :

1. **Precache des pages critiques** : `/`, `/login`, `/chat`, `/offline`
2. **Network-first pour les API** : réseau d'abord, cache en fallback si offline
3. **Stale-while-revalidate pour les assets** : JS/CSS/images
4. **Redirection vers `/offline`** quand une navigation échoue et qu'on est offline

#### 2.2 Structure proposée pour `sw.js`

```
sw.js
├── Handlers push (existant) ✅
├── Handlers notification click (existant) ✅
├── fetch handler
│   ├── /api/* → Network-first, cache fallback
│   ├── /_next/static/* → Cache-first
│   ├── /icons/* → Cache-first
│   └── Navigation → Network-first, fallback /offline si offline
└── install/activate (existant + precache)
```

### Phase 3 : File d'attente des messages (offline queue) ✅ IMPLÉMENTÉ

Pour les messages envoyés hors ligne :

1. **IndexedDB** : stocker les messages en attente (conversationId, contenu chiffré, timestamp)
2. **Background Sync** (si supporté) ou **sync au retour online** : envoyer les messages quand le réseau revient
3. **UI** : afficher les messages "en attente" avec indicateur, permettre retry manuel

**Fichiers créés :** `src/lib/offline-queue.ts`, `src/components/chat/OfflineQueueSync.tsx`

### Phase 4 : Détection réseau et UX ✅ IMPLÉMENTÉ

1. **Hook `useOnlineStatus`** : `navigator.onLine` + écoute `online`/`offline`
2. **Bandeau "Vous êtes hors ligne"** : affiché quand offline
3. **Désactiver les actions sensibles** (envoi message) ou les mettre en file d'attente

---

## Cache API ✅ IMPLÉMENTÉ

- **GET /api/*** : network-first, cache fallback (5 min) pour consultation hors ligne
- Cache stocké dans `mango-v1-api` (vidé au logout)

---

## 📁 Fichiers à créer/modifier

| Fichier | Action |
|---------|--------|
| `src/providers/SWRProvider.tsx` | Créer |
| `src/lib/fetcher.ts` | Modifier (retry, timeout, offline) |
| `src/lib/offline-queue.ts` | Créer (file messages offline) |
| `src/hooks/useOnlineStatus.ts` | Créer |
| `src/components/OfflineBanner.tsx` | Créer |
| `public/sw.js` | Modifier (ajouter fetch + precache) |
| `app/layout.tsx` | Modifier (ajouter SWRProvider) |
| `next.config.js` | Vérifier (supprimer next-pwa si inutilisé) |

---

## 🎯 Priorisation recommandée

1. **Court terme (1–2 jours)**  
   - SWRProvider + fetcher amélioré  
   - Hook `useOnlineStatus` + bandeau offline  
   - Enrichir `sw.js` avec precache + fetch handler  

2. **Moyen terme (3–5 jours)**  
   - File d'attente des messages (IndexedDB + sync)  
   - Page offline plus riche (accès aux conversations en cache)  

3. **Long terme**  
   - Background Sync API pour envoi automatique  
   - Cache des conversations récentes pour consultation offline  

---

## ⚠️ Points d'attention

1. **Conflit SW** : Un seul point d'enregistrement (`ServiceWorkerRegistration`), retirer la logique dupliquée dans `PWAInstaller`.
2. **Cache API** : Les réponses API contiennent des données sensibles. Utiliser un cache dédié avec expiration courte (ex. 5 min) et invalidation au logout.
3. **Chiffrement** : Les messages en file d'attente doivent rester chiffrés (ne pas stocker en clair dans IndexedDB).
