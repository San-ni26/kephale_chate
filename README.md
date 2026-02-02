# Chat Kephale - Application de Messagerie Sécurisée

![Version](https://img.shields.io/badge/version-0.1.0-blue.svg)
![Next.js](https://img.shields.io/badge/Next.js-16.1.6-black.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

## 📖 Description

**Chat Kephale** est une application de messagerie professionnelle avec chiffrement de bout en bout (E2E), conçue pour les organisations exigeantes en matière de sécurité et de confidentialité.

### ✨ Fonctionnalités Principales

- 🔐 **Chiffrement E2E** - Cryptage NaCl (Curve25519) pour tous les messages
- 📍 **Sécurité Géographique** - Vérification automatique de la localisation et contrôle d'accès par pays
- 📱 **Device Fingerprinting** - Verrouillage d'appareil unique par utilisateur
- 🏢 **Organisations & Départements** - Gestion hiérarchique avec cryptage par département
- 👥 **Groupes Privés** - Conversations de groupe avec cryptage symétrique
- 📎 **Fichiers Cryptés** - Support images, PDF, Word avec cryptage Base32
- 🔔 **Annonces 24h** - Système de notifications temporaires
- 🌐 **Temps Réel** - WebSocket pour messagerie instantanée
- 📱 **PWA** - Installation sur mobile comme application native
- 🛡️ **Admin Dashboard** - Interface d'administration avec géolocalisation en temps réel

---

## 🚀 Installation

### Prérequis

- **Node.js** >= 18.x
- **MySQL** >= 8.0 ou **MariaDB** >= 10.6
- **npm** ou **yarn**

### Étapes d'Installation

1. **Cloner le repository**
```bash
git clone https://github.com/votre-username/chat-kephale.git
cd chat-kephale
```

2. **Installer les dépendances**
```bash
npm install
```

3. **Configurer les variables d'environnement**
```bash
cp .env.example .env
```

Éditez `.env` et configurez:
- `DATABASE_URL` - Connexion MySQL
- `JWT_SECRET` - Clé secrète JWT (générez une chaîne aléatoire forte)
- `EMAIL_*` - Configuration SMTP pour les emails
- `ALLOWED_COUNTRIES` - Codes pays autorisés (ex: "FR,BE,CH,CA")

4. **Configurer la base de données**
```bash
npx prisma generate
npx prisma migrate deploy
```

5. **Lancer le serveur de développement**
```bash
npm run dev
```

L'application sera accessible sur [http://localhost:3000](http://localhost:3000)

---

## 🏗️ Architecture

### Stack Technique

- **Framework**: Next.js 16 (App Router)
- **Base de Données**: MySQL + Prisma ORM
- **Cryptage**: TweetNaCl (Curve25519)
- **Temps Réel**: Socket.IO
- **UI**: Tailwind CSS + shadcn/ui
- **Validation**: Zod
- **Email**: Nodemailer
- **PWA**: next-pwa

### Structure du Projet

```
chat-kephale/
├── app/                    # Next.js App Router
│   ├── (auth)/            # Routes d'authentification
│   ├── api/               # API Routes
│   ├── chat/              # Pages de chat
│   └── admin/             # Dashboard admin
├── prisma/                # Schéma et migrations
├── src/
│   ├── components/        # Composants React
│   ├── lib/               # Utilitaires et helpers
│   └── middleware/        # Middleware (auth, rate limit)
└── public/                # Fichiers statiques + PWA
```

---

## 🔐 Sécurité

### Cryptage E2E

- **Algorithme**: NaCl Box (Curve25519 + XSalsa20 + Poly1305)
- **Clés**: Paire de clés asymétriques par utilisateur
- **Messages**: Cryptés avec clé publique du destinataire
- **Fichiers**: Encodage Base32 + cryptage NaCl
- **Groupes**: Clé symétrique unique par groupe/département

### Protection des Données

- ✅ Hachage bcrypt pour mots de passe (12 rounds)
- ✅ JWT avec expiration pour sessions
- ✅ Rate limiting (100 req/15min)
- ✅ Validation Zod sur tous les endpoints
- ✅ Device fingerprinting strict
- ✅ Vérification géographique à l'inscription

---

## 📱 PWA (Progressive Web App)

L'application est installable sur mobile:

1. Ouvrez l'app dans Chrome/Safari mobile
2. Cliquez sur "Ajouter à l'écran d'accueil"
3. L'app s'installe comme une application native

**Fonctionnalités PWA:**
- ✅ Mode hors ligne (cache des assets)
- ✅ Notifications push (à venir)
- ✅ Installation sur écran d'accueil
- ✅ Icônes et splash screens

---

## 🌐 API Endpoints

### Authentification
- `POST /api/auth/register` - Inscription
- `POST /api/auth/login` - Connexion
- `POST /api/auth/verify-otp` - Vérification OTP
- `POST /api/auth/logout` - Déconnexion

### Messages
- `GET /api/messages` - Liste des messages
- `POST /api/messages` - Envoyer un message
- `PATCH /api/messages` - Modifier un message (5 min)
- `DELETE /api/messages` - Supprimer un message

### Organisations
- `GET /api/organizations` - Liste des organisations
- `POST /api/organizations` - Créer/rejoindre une organisation
- `GET /api/organizations/[id]/departments` - Départements
- `POST /api/organizations/[id]/departments` - Créer un département

### Admin
- `GET /api/admin/users` - Liste des utilisateurs
- `PATCH /api/admin/users` - Ban/unban, permissions

---

## 🧪 Tests

```bash
# Tests unitaires (à venir)
npm run test

# Tests E2E (à venir)
npm run test:e2e
```

---

## 🚢 Déploiement

### Production Build

```bash
npm run build
npm start
```

### Variables d'Environnement Production

Assurez-vous de configurer:
- `NODE_ENV=production`
- `DATABASE_URL` - Base de données production
- `JWT_SECRET` - Clé secrète unique et forte
- `NEXT_PUBLIC_APP_URL` - URL de production
- `ALLOWED_COUNTRIES` - Pays autorisés

### Recommandations

- Utilisez HTTPS en production
- Configurez un reverse proxy (Nginx)
- Activez les logs de sécurité
- Mettez en place des backups réguliers
- Surveillez les performances (Sentry, etc.)

---

## 📝 Configuration Email

Pour l'envoi d'OTP, configurez un compte SMTP:

**Gmail:**
```env
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=votre-email@gmail.com
EMAIL_PASSWORD=mot-de-passe-application
```

**SendGrid, Mailgun, etc.** sont également supportés.

---

## 🤝 Contribution

Les contributions sont les bienvenues ! Veuillez:

1. Fork le projet
2. Créer une branche (`git checkout -b feature/AmazingFeature`)
3. Commit vos changements (`git commit -m 'Add AmazingFeature'`)
4. Push vers la branche (`git push origin feature/AmazingFeature`)
5. Ouvrir une Pull Request

---

## 📄 Licence

Ce projet est sous licence MIT. Voir le fichier `LICENSE` pour plus de détails.

---

## 👨‍💻 Auteur

**Kephale Team**

- Website: [chatkephale.com](https://chatkephale.com)
- Email: contact@chatkephale.com

---

## 🙏 Remerciements

- [Next.js](https://nextjs.org/)
- [Prisma](https://www.prisma.io/)
- [TweetNaCl](https://tweetnacl.js.org/)
- [shadcn/ui](https://ui.shadcn.com/)
- [Socket.IO](https://socket.io/)

---

**⚠️ Note de Sécurité**: Cette application gère des données sensibles. Assurez-vous de suivre les meilleures pratiques de sécurité en production et de maintenir toutes les dépendances à jour.
# chate_kephale
