# Déploiement sur Vercel : Guide Complet

Ce guide vous explique comment déployer votre application **Kephale Chat** sur Vercel et les considérations importantes concernant les WebSockets et les notifications.

## 1. Pré-requis

- Un compte [Vercel](https://vercel.com).
- Un dépôt GitHub/GitLab/Bitbucket connecté à votre projet.
- Une base de données PostgreSQL accessible depuis internet (ex: Neon.tech, Supabase, Vercel Postgres).

## 2. Configuration du Projet sur Vercel

1.  **Importer le projet** : Connectez votre dépôt Git sur Vercel.
2.  **Framework Preset** : Vercel détecte automatiquement `Next.js`. Laissez les paramètres de build par défaut (`next build`).
3.  **Variables d'environnement** : C'est l'étape la plus critique. Vous devez configurer les variables suivantes dans l'onglet **Settings > Environment Variables** :

| Variable | Description |
| :--- | :--- |
| `DATABASE_URL` | L'URL de connexion à votre base de données PostgreSQL (ex: `postgres://...`). |
| `NEXT_PUBLIC_APP_URL` | L'URL de votre application en production (ex: `https://chat-kephale.vercel.app`). |
| `VAPID_PRIVATE_KEY` | Votre clé privée VAPID pour les notifications Push. |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Votre clé publique VAPID. |
| `VAPID_SUBJECT` | L'email de contact pour les notifications (ex: `mailto:admin@votre-domaine.com`). |
| `JWT_SECRET` | Une chaîne secrète longue et aléatoire pour signer les tokens (si utilisé). |
| `NEXTAUTH_SECRET` | Si vous utilisez NextAuth, idem. |
| `NEXTAUTH_URL` | L'URL canonique de votre site. |

## 3. Limitations WebSockets & Solutions

### Le Problème
Vercel est une plateforme **Serverless**. Cela signifie que vos fonctions (API) ne tournent pas en continu. Elles s'allument à la demande et s'éteignent ensuite.
**Conséquence** : Le serveur WebSocket (`server.ts` et `socket.io`) ne **peut pas fonctionner** directement sur Vercel, car il nécessite un serveur Node.js qui tourne en permanence.

### L'Impact sur l'Application
- **Notifications Push** : ✅ **Fonctionnent**. Nous avons modifié le code pour que les notifications Push soient envoyées via les routes API standards (`POST /api/...`). Vercel gère cela parfaitement.
- **Messages en direct** : ⚠️ **Mode Dégradé**. Le chat fonctionnera grâce au système de **Polling** (vérification automatique toutes les 3 secondes) que nous avons, mais l'affichage ne sera pas instantané comme avec les WebSockets.
- **Indicateurs de frappe / Statut En ligne** : ❌ **Ne fonctionneront pas** sur Vercel seul.

### La Solution Recommandée
Si vous avez besoin du temps réel parfait (WebSockets) :
1.  **Héberger le serveur WebSocket ailleurs** : Déployez uniquement le `server.ts` (ou un serveur dédié socket.io) sur une plateforme comme **Render** ou **Heroku** ($5-7/mois).
2.  **Utiliser un service géré** : Migrer vers Pusher ou Ably (nécessite des modifications de code).

**Pour l'instant, votre application fonctionnera sur Vercel en mode "HTTP/Polling". Les messages et les notifications Push seront opérationnels.**

## 4. Base de Données (Important)

Assurez-vous que votre base de données (PostgreSQL) accepte les connexions venant de Vercel.
Si vous utilisez **Vercel Postgres**, tout est configuré automatiquement.
Si vous utilisez un fournisseur externe, assurez-vous de ne pas être bloqué par une whitelist IP (Vercel utilise des IPs dynamiques).

## 5. Déploiement

Une fois les variables configurées, cliquez sur **Deploy**.
Vercel va :
1.  Installer les dépendances (`npm install`).
2.  Générer le client Prisma (`prisma generate` via le script `postinstall` que nous avons ajouté).
3.  Builder l'application (`next build`).

Si tout est vert, votre application est en ligne !
