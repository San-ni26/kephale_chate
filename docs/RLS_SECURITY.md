# Row Level Security (RLS) - Supabase

## Contexte

Le Security Advisor de Supabase a détecté que les tables du schéma `public` étaient exposées via PostgREST **sans Row Level Security (RLS)**. Cela représente un risque de sécurité car :

- Les tables sont accessibles via l’API REST Supabase (PostgREST)
- Sans RLS, les rôles `anon` et `authenticated` peuvent accéder à toutes les données
- Les colonnes sensibles (`User.password`, `EventInvitation.token`, `UserInvitation.token`) sont exposées

## Solution appliquée

La migration `20260218120000_enable_rls_on_all_tables` :

1. **Active RLS** sur toutes les tables du schéma `public`
2. **Ajoute un trigger** pour activer automatiquement RLS sur les futures tables créées par Prisma

## Impact sur votre application

### ✅ Aucun impact sur Prisma

Votre application utilise **Prisma** avec une connexion directe PostgreSQL (`DATABASE_URL`). Cette connexion utilise le rôle `postgres`, qui **contourne RLS** par défaut. Les requêtes Prisma continuent donc à fonctionner normalement.

### 🔒 Blocage de l’accès via PostgREST

Une fois RLS activé **sans politiques** :

- Les rôles `anon` et `authenticated` n’ont **aucun accès** aux tables
- L’API REST Supabase (clé `anon` ou `authenticated`) ne peut plus lire ni modifier les données
- Les colonnes sensibles ne sont plus exposées via l’API

## Appliquer la migration

```bash
npx prisma migrate deploy
```

Ou en développement :

```bash
npx prisma migrate dev
```

## Si vous utilisez le client Supabase

Si vous ajoutez plus tard le client Supabase (`@supabase/supabase-js`) pour accéder aux données côté client, vous devrez créer des **politiques RLS** pour autoriser l’accès. Sans politiques, les requêtes via le client Supabase retourneront des résultats vides.

Exemple de politique pour la table `User` :

```sql
-- Exemple : les utilisateurs ne voient que leur propre profil
CREATE POLICY "Users can view own profile"
ON "User" FOR SELECT
TO authenticated
USING ((SELECT auth.uid()::text) = id);
```

## Références

- [Supabase RLS](https://supabase.com/docs/guides/auth/row-level-security)
- [Linter 0013 - RLS disabled in public](https://supabase.com/docs/guides/database/database-linter?lint=0013_rls_disabled_in_public)
- [Linter 0023 - Sensitive columns exposed](https://supabase.com/docs/guides/database/database-linter?lint=0023_sensitive_columns_exposed)
