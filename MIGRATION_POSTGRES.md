# Guide de Migration MySQL → PostgreSQL

## ✅ Étape 1 : Modifications du Schema (TERMINÉ)
Le schema Prisma a été mis à jour pour PostgreSQL :
- Provider changé de `mysql` à `postgresql`
- `@db.LongText` remplacé par `@db.Text`
- Contraintes de clés étrangères renommées pour éviter les conflits

## 📋 Étape 2 : Installer PostgreSQL

### Option A : Installation locale (macOS)
```bash
# Installer PostgreSQL via Homebrew
brew install postgresql@15

# Démarrer PostgreSQL
brew services start postgresql@15

# Créer une base de données
createdb kephale_chat
```

### Option B : Utiliser un service cloud (Recommandé)
Choisissez l'une de ces options :
- **Supabase** : https://supabase.com (Gratuit, facile)
- **Neon** : https://neon.tech (Serverless PostgreSQL)
- **Railway** : https://railway.app (Comme votre MySQL actuel)
- **Render** : https://render.com

## 🔧 Étape 3 : Mettre à jour la DATABASE_URL

### Pour PostgreSQL local :
```env
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/kephale_chat"
```

### Pour Supabase (exemple) :
```env
DATABASE_URL="postgresql://postgres:[YOUR-PASSWORD]@db.[YOUR-PROJECT-REF].supabase.co:5432/postgres"
```

### Pour Railway/Neon/Render :
Copiez l'URL de connexion fournie par le service.

## 📦 Étape 4 : Exporter les données MySQL (IMPORTANT!)

### Option 1 : Export SQL puis conversion
```bash
# 1. Exporter depuis MySQL
mysqldump -h switchback.proxy.rlwy.net -P 31795 -u root -p railway > backup_mysql.sql

# 2. Utiliser pgloader pour convertir (à installer)
brew install pgloader

# 3. Créer un fichier de configuration pgloader.load :
# LOAD DATABASE
#      FROM mysql://root:PASSWORD@switchback.proxy.rlwy.net:31795/railway
#      INTO postgresql://USER:PASSWORD@localhost:5432/kephale_chat
# WITH include drop, create tables, create indexes, reset sequences
# SET maintenance_work_mem to '128MB', work_mem to '12MB';
```

### Option 2 : Export/Import manuel via Prisma Studio
1. Ouvrir Prisma Studio sur MySQL : `npx prisma studio`
2. Exporter manuellement les données importantes
3. Après migration, les réimporter

### Option 3 : Script de migration personnalisé
Si vous avez beaucoup de données, je peux créer un script Node.js pour migrer les données.

## 🚀 Étape 5 : Créer le nouveau schema PostgreSQL

```bash
# 1. Mettre à jour .env avec la nouvelle DATABASE_URL PostgreSQL

# 2. Générer le client Prisma
npx prisma generate

# 3. Créer les tables dans PostgreSQL
npx prisma db push

# OU créer une migration
npx prisma migrate dev --name init_postgres
```

## ⚠️ Étape 6 : Tester l'application

```bash
# Démarrer l'application
npm run dev

# Vérifier que tout fonctionne
# - Inscription
# - Connexion
# - Envoi de messages
# - Upload de fichiers
```

## 🔄 Étape 7 : Migration des données (si nécessaire)

Si vous avez des données importantes dans MySQL, voici un script de migration :

```typescript
// scripts/migrate-data.ts
import { PrismaClient as MySQLClient } from '@prisma/client'
import { PrismaClient as PostgresClient } from './src/prisma/client'

const mysql = new MySQLClient({
  datasources: { db: { url: 'mysql://...' } }
})

const postgres = new PostgresClient()

async function migrate() {
  // Migrer les utilisateurs
  const users = await mysql.user.findMany()
  for (const user of users) {
    await postgres.user.create({ data: user })
  }
  
  // Migrer les organisations
  const orgs = await mysql.organization.findMany()
  for (const org of orgs) {
    await postgres.organization.create({ data: org })
  }
  
  // ... continuer pour chaque table
}

migrate()
```

## 📝 Checklist finale

- [ ] PostgreSQL installé ou service cloud configuré
- [ ] DATABASE_URL mise à jour dans .env
- [ ] `npx prisma generate` exécuté
- [ ] `npx prisma db push` ou `npx prisma migrate dev` exécuté
- [ ] Données migrées (si applicable)
- [ ] Application testée
- [ ] Ancien MySQL sauvegardé avant suppression

## 🆘 En cas de problème

Si vous rencontrez des erreurs :
1. Vérifiez que PostgreSQL est bien démarré
2. Vérifiez la DATABASE_URL (format, port, credentials)
3. Vérifiez les logs : `npx prisma db push --accept-data-loss`
4. Consultez les logs PostgreSQL

## 💡 Avantages de PostgreSQL

- Meilleure gestion des types JSON
- Support natif des tableaux
- Transactions plus robustes
- Meilleure performance pour les requêtes complexes
- Support de fonctionnalités avancées (full-text search, etc.)
