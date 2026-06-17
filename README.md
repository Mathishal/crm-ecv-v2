# CRM El Camino V2

## Démarrage

1. Crée un projet sur https://supabase.com
2. Dans l'éditeur SQL Supabase, exécute le contenu de `schema.sql` en entier
3. Copie `.env.example` en `.env` et renseigne ton URL Supabase + clé anon
   (Project Settings > API dans Supabase)
4. `npm install`
5. `npm run dev`

## Créer le premier compte admin

1. Dans Supabase > Authentication > Users, crée un utilisateur (email + mot de passe)
2. Dans Supabase > Table Editor > profiles, insère une ligne :
   - id = l'UUID de l'utilisateur créé à l'étape 1
   - full_name = ton nom
   - email = le même email
   - role = 'admin'

## Créer les commerciaux ensuite

Même procédure, avec role = 'commercial'. Une fois connectés, ils ne verront
que leurs propres clients/devis/factures (RLS), et n'auront pas accès aux
onglets Commerciaux / Sociétés / Rapports (réservés admin).

## Déploiement

Le projet est un Vite/React standard, déployable sur Vercel comme tes autres
projets (connecter le repo, ajouter les variables d'environnement
VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY dans les settings Vercel).

## Logique métier clé à retenir

- **TVA** : chaque produit a un taux fixe (20%/10%/5.5%). La société
  El Camino Verde (FR) applique ce taux. La société Atlas Group Kft (HU)
  applique 0% mais nécessite un client avec TVA intracommunautaire vérifiée
  (case à cocher sur la fiche client) — sinon avertissement non-bloquant,
  un admin peut forcer (tracé via `vat_rule_overridden`).
- **Commission** : par ligne vendue, `commission = max(commission_base,
  prix_vente - prix_base)`, 0 si vendu sous le prix de base. Visible
  uniquement en interne, jamais sur le PDF/document envoyé au client.
- **Stock** : un devis (même brouillon) réserve le stock. Refus/expiration
  libère la réservation. Le stock physique n'est réellement déduit que
  lorsque la facture passe au statut "payée" — moment où la commission due
  est aussi automatiquement créée dans la table `commissions`.

## Ce qui reste à construire / améliorer

- Génération de PDF pour devis/factures (export client)
- Vérification automatique VIES pour la TVA intracommunautaire (actuellement
  manuelle par design, sur ta demande)
- Historique détaillé des mouvements de stock dans une UI dédiée (la table
  `stock_movements` existe et trace déjà tout, il manque l'écran de
  consultation)
- Export comptable (CSV/Excel) des factures par société pour ARENDAS Consulting
