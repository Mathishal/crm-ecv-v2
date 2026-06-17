-- ============================================================
-- CRM El Camino V2 — Schéma Supabase (PostgreSQL)
-- ============================================================

-- ---------- EXTENSIONS ----------
create extension if not exists "pgcrypto";

-- ---------- ENUM TYPES ----------
create type user_role as enum ('admin', 'commercial');
create type devis_status as enum ('draft', 'sent', 'accepted', 'refused', 'expired');
create type facture_status as enum ('draft', 'sent', 'paid', 'overdue', 'cancelled');
create type shipping_status as enum ('to_ship', 'shipped', 'delivered');
create type stock_movement_type as enum ('in', 'out', 'adjustment', 'sale', 'reservation', 'release');

-- ============================================================
-- PROFILES (commerciaux / admins) — étend auth.users de Supabase
-- ============================================================
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null unique,
  role user_role not null default 'commercial',
  commission_rate_override numeric(10,2), -- override ponctuel si besoin, sinon on prend celui du produit
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ============================================================
-- SOCIÉTÉS ÉMETTRICES (multi-entité : FR + HU)
-- ============================================================
create table companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,                       -- "El Camino Verde", "Atlas Group Kft"
  country_code text not null,               -- 'FR', 'HU'
  is_default boolean not null default false,
  logo_url text,                            -- URL du logo (Supabase Storage), imprimé sur devis/factures
  address_line text,
  postal_code text,
  city text,
  vat_number text,                          -- numéro de TVA intraco DE LA SOCIÉTÉ émettrice
  siren_or_reg_number text,
  email text,
  phone text,
  iban text,
  bic text,
  bank_name text,
  -- Règle métier clé : cette société nécessite-t-elle un n° TVA intraco vérifié côté client
  -- pour pouvoir être sélectionnée (cas Atlas Hongrie = true)
  requires_client_intra_vat boolean not null default false,
  legal_footer_text text,                   -- mentions légales par défaut sur les PDF
  created_at timestamptz not null default now()
);

-- ============================================================
-- CLIENTS
-- ============================================================
create table clients (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references profiles(id) on delete set null, -- commercial assigné (pour le scoping RLS)
  name text not null,
  company_name text,
  email text,
  phone text,
  billing_address text,
  shipping_address text,
  -- TVA intracommunautaire
  intra_vat_number text,
  intra_vat_verified boolean not null default false,        -- coché manuellement par admin/commercial
  intra_vat_verified_at timestamptz,
  intra_vat_verified_by uuid references profiles(id),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_clients_owner on clients(owner_id);

-- ============================================================
-- PRODUITS
-- ============================================================
create table products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sale_unit text not null default 'kg',        -- kg, unité, g, etc.
  min_price_per_unit numeric(10,2) not null,
  base_commission_per_unit numeric(10,2) not null default 0,
  vat_rate numeric(5,2) not null default 20.00, -- taux FR par défaut: 20.00 ou 5.50
  stock_quantity numeric(12,3) not null default 0,   -- stock physique réel
  reserved_quantity numeric(12,3) not null default 0, -- réservé par devis actifs (brouillon/envoyé/accepté)
  low_stock_threshold numeric(12,3) not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_products_active on products(active);

-- Vue pratique : stock réellement disponible à la vente
create view products_with_availability as
select
  p.*,
  (p.stock_quantity - p.reserved_quantity) as available_quantity
from products p;

-- Historique des mouvements de stock (traçabilité — amélioration vs V1)
create table stock_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  movement_type stock_movement_type not null,
  quantity numeric(12,3) not null,             -- toujours positif, le type indique le sens
  reference_type text,                          -- 'facture', 'manual', etc.
  reference_id uuid,                            -- id facture si applicable
  note text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create index idx_stock_movements_product on stock_movements(product_id);

-- ============================================================
-- DEVIS
-- ============================================================
create table devis (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,                 -- DEV-2026-196
  client_id uuid not null references clients(id) on delete restrict,
  company_id uuid not null references companies(id) on delete restrict,
  owner_id uuid references profiles(id) on delete set null,
  status devis_status not null default 'draft',
  global_discount numeric(10,2) not null default 0,
  shipping_fee numeric(10,2) not null default 0,
  notes text,
  -- Champs calculés/cachés au moment de la création (snapshot) pour ne jamais
  -- changer une fois le devis envoyé même si la fiche produit/société change après
  vat_rate_applied numeric(5,2),               -- 0 si Atlas HU, sinon taux produit (si mixte, géré ligne par ligne)
  subtotal_ht numeric(12,2) not null default 0,
  total_vat numeric(12,2) not null default 0,
  total_ttc numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_devis_client on devis(client_id);
create index idx_devis_owner on devis(owner_id);
create index idx_devis_company on devis(company_id);

create table devis_lines (
  id uuid primary key default gen_random_uuid(),
  devis_id uuid not null references devis(id) on delete cascade,
  product_id uuid references products(id) on delete set null,
  description text not null,                   -- snapshot du nom produit au moment du devis
  quantity numeric(12,3) not null,
  unit_price numeric(10,2) not null,
  vat_rate numeric(5,2) not null default 0,     -- snapshot du taux appliqué à cette ligne
  line_discount numeric(10,2) not null default 0,
  unit_commission numeric(10,2) not null default 0, -- commission prévisionnelle interne (jamais sur le PDF client)
  sort_order int not null default 0
);

create index idx_devis_lines_devis on devis_lines(devis_id);

-- ============================================================
-- FACTURES
-- ============================================================
create table factures (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,                 -- FAC-2026-129
  devis_id uuid references devis(id) on delete set null, -- facture peut venir d'un devis accepté
  client_id uuid not null references clients(id) on delete restrict,
  company_id uuid not null references companies(id) on delete restrict,
  owner_id uuid references profiles(id) on delete set null,
  status facture_status not null default 'draft',
  shipping_status shipping_status not null default 'to_ship',
  global_discount numeric(10,2) not null default 0,
  shipping_fee numeric(10,2) not null default 0,
  notes text,
  subtotal_ht numeric(12,2) not null default 0,
  total_vat numeric(12,2) not null default 0,
  total_ttc numeric(12,2) not null default 0,
  issued_at date not null default current_date,
  due_at date,
  paid_at date,
  shipped_at date,
  -- snapshot des infos TVA intraco du client au moment de la facturation (preuve comptable)
  client_intra_vat_snapshot text,
  client_intra_vat_verified_snapshot boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_factures_client on factures(client_id);
create index idx_factures_owner on factures(owner_id);
create index idx_factures_company on factures(company_id);
create index idx_factures_shipping on factures(shipping_status);

create table facture_lines (
  id uuid primary key default gen_random_uuid(),
  facture_id uuid not null references factures(id) on delete cascade,
  product_id uuid references products(id) on delete set null,
  description text not null,
  quantity numeric(12,3) not null,
  unit_price numeric(10,2) not null,
  vat_rate numeric(5,2) not null default 0,
  line_discount numeric(10,2) not null default 0,
  unit_commission numeric(10,2) not null default 0, -- snapshot commission/unité au moment de la vente
  sort_order int not null default 0
);

create index idx_facture_lines_facture on facture_lines(facture_id);

-- ============================================================
-- COMMISSIONS (table dédiée pour suivi payé/dû — amélioration vs V1)
-- ============================================================
create table commissions (
  id uuid primary key default gen_random_uuid(),
  facture_id uuid not null references factures(id) on delete cascade,
  commercial_id uuid not null references profiles(id) on delete cascade,
  amount numeric(10,2) not null,
  paid boolean not null default false,
  paid_at date,
  created_at timestamptz not null default now()
);

create index idx_commissions_commercial on commissions(commercial_id);
create index idx_commissions_facture on commissions(facture_id);

-- ============================================================
-- GESTION AUTOMATIQUE DU STOCK : réservation / libération / déduction
-- ------------------------------------------------------------
-- Règles métier validées :
-- - Un devis (dès brouillon) réserve le stock de ses lignes.
-- - Si le devis est refusé/expiré, ou si une ligne est supprimée/modifiée,
--   la réservation correspondante est libérée automatiquement.
-- - Le stock n'est RÉELLEMENT déduit (stock_quantity diminue) que lorsque
--   la facture liée passe au statut 'paid'.
-- - Le "stock disponible" affiché = stock_quantity - reserved_quantity.
-- ============================================================

-- Statuts de devis considérés "actifs" (donc qui réservent du stock)
-- = tous sauf refused / expired.

create or replace function release_devis_line_reservation(p_line_id uuid)
returns void as $$
declare
  v_product_id uuid;
  v_qty numeric;
begin
  select product_id, quantity into v_product_id, v_qty
  from devis_lines where id = p_line_id;

  if v_product_id is not null then
    update products
      set reserved_quantity = greatest(0, reserved_quantity - v_qty)
      where id = v_product_id;

    insert into stock_movements (product_id, movement_type, quantity, reference_type, reference_id, note)
    values (v_product_id, 'release', v_qty, 'devis_line', p_line_id, 'Libération réservation devis');
  end if;
end;
$$ language plpgsql;

create or replace function reserve_devis_line(p_line_id uuid)
returns void as $$
declare
  v_product_id uuid;
  v_qty numeric;
begin
  select product_id, quantity into v_product_id, v_qty
  from devis_lines where id = p_line_id;

  if v_product_id is not null then
    update products
      set reserved_quantity = reserved_quantity + v_qty
      where id = v_product_id;

    insert into stock_movements (product_id, movement_type, quantity, reference_type, reference_id, note)
    values (v_product_id, 'reservation', v_qty, 'devis_line', p_line_id, 'Réservation devis');
  end if;
end;
$$ language plpgsql;

-- Trigger: à l'insertion d'une ligne de devis, on réserve (si le devis parent
-- est dans un statut actif).
create or replace function trg_devis_lines_after_insert_fn()
returns trigger as $$
declare
  v_status devis_status;
begin
  select status into v_status from devis where id = new.devis_id;
  if v_status not in ('refused', 'expired') then
    perform reserve_devis_line(new.id);
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_devis_lines_after_insert
  after insert on devis_lines
  for each row execute function trg_devis_lines_after_insert_fn();

-- Trigger: à la suppression d'une ligne de devis (ex: ré-édition du devis
-- qui supprime puis réinsère les lignes), on libère la réservation.
create or replace function trg_devis_lines_before_delete_fn()
returns trigger as $$
declare
  v_status devis_status;
begin
  select status into v_status from devis where id = old.devis_id;
  if v_status not in ('refused', 'expired') then
    perform release_devis_line_reservation(old.id);
  end if;
  return old;
end;
$$ language plpgsql;

create trigger trg_devis_lines_before_delete
  before delete on devis_lines
  for each row execute function trg_devis_lines_before_delete_fn();

-- Trigger: quand le STATUT du devis change vers refused/expired, on libère
-- toutes les réservations de ses lignes. Si le devis revient à un statut
-- actif depuis refused/expired, on ré-réserve.
create or replace function trg_devis_status_change_fn()
returns trigger as $$
declare
  v_line record;
  v_was_active boolean;
  v_is_active boolean;
begin
  v_was_active := old.status not in ('refused', 'expired');
  v_is_active := new.status not in ('refused', 'expired');

  if v_was_active and not v_is_active then
    for v_line in select id from devis_lines where devis_id = new.id loop
      perform release_devis_line_reservation(v_line.id);
    end loop;
  elsif (not v_was_active) and v_is_active then
    for v_line in select id from devis_lines where devis_id = new.id loop
      perform reserve_devis_line(v_line.id);
    end loop;
  end if;

  return new;
end;
$$ language plpgsql;

create trigger trg_devis_status_change
  after update of status on devis
  for each row execute function trg_devis_status_change_fn();

-- Trigger: quand une FACTURE passe au statut 'paid', on déduit réellement
-- le stock physique pour chaque ligne de facture, ET on libère la réservation
-- du devis d'origine si applicable (la réservation est "consommée").
create or replace function trg_facture_paid_fn()
returns trigger as $$
declare
  v_line record;
  v_devis_line_id uuid;
  v_total_commission numeric(12,2);
begin
  if old.status is distinct from 'paid' and new.status = 'paid' then
    v_total_commission := 0;

    for v_line in select * from facture_lines where facture_id = new.id loop
      if v_line.product_id is not null then
        -- Déduction réelle du stock physique
        update products
          set stock_quantity = stock_quantity - v_line.quantity
          where id = v_line.product_id;

        insert into stock_movements (product_id, movement_type, quantity, reference_type, reference_id, note)
        values (v_line.product_id, 'sale', v_line.quantity, 'facture_line', v_line.id, 'Vente confirmée (facture payée)');

        -- Si la facture est liée à un devis, on libère la réservation
        -- correspondante (la quantité réservée devient une sortie réelle,
        -- pas un double-décompte).
        if new.devis_id is not null then
          select id into v_devis_line_id
          from devis_lines
          where devis_id = new.devis_id and product_id = v_line.product_id
          limit 1;

          if v_devis_line_id is not null then
            update products
              set reserved_quantity = greatest(0, reserved_quantity - v_line.quantity)
              where id = v_line.product_id;
          end if;
        end if;
      end if;

      -- Cumul de la commission de cette ligne (quantité * commission unitaire snapshot)
      v_total_commission := v_total_commission + (v_line.quantity * coalesce(v_line.unit_commission, 0));
    end loop;

    -- Création de la commission due au commercial, une seule fois par facture.
    -- Si la facture repasse plusieurs fois à 'paid' (edge case via update),
    -- on évite le doublon en vérifiant qu'aucune commission n'existe déjà
    -- pour cette facture.
    if new.owner_id is not null and v_total_commission > 0
       and not exists (select 1 from commissions where facture_id = new.id) then
      insert into commissions (facture_id, commercial_id, amount, paid, paid_at)
      values (new.id, new.owner_id, v_total_commission, false, null);
    end if;
  end if;

  return new;
end;
$$ language plpgsql;

create trigger trg_facture_paid
  after update of status on factures
  for each row execute function trg_facture_paid_fn();

-- NOTE IMPORTANTE: les factures créées DIRECTEMENT (sans devis_id, donc
-- sans passer par un devis au préalable) ne déclenchent AUCUNE réservation
-- de stock à leur création — seulement à facture_lines insert il n'y a pas
-- de trigger de réservation (contrairement aux devis_lines). Le stock n'est
-- impacté qu'au moment où la facture passe à 'paid' (trg_facture_paid ci-dessus).
-- C'est le comportement voulu : le stock n'est "engagé" que pour un devis
-- (intention de vente), jamais pour une facture tant qu'elle n'est pas payée.


create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_clients_updated_at before update on clients
  for each row execute function set_updated_at();
create trigger trg_products_updated_at before update on products
  for each row execute function set_updated_at();
create trigger trg_devis_updated_at before update on devis
  for each row execute function set_updated_at();
create trigger trg_factures_updated_at before update on factures
  for each row execute function set_updated_at();

-- ============================================================
-- RÈGLE MÉTIER SOCIÉTÉ / TVA INTRACO
-- ------------------------------------------------------------
-- Choix produit : avertissement NON-BLOQUANT côté UI uniquement.
-- La base ne bloque pas la création (un admin peut avoir une raison
-- légitime de forcer un cas particulier). On trace simplement si la
-- règle était respectée au moment de la création, pour audit.
-- ============================================================
alter table devis add column if not exists vat_rule_overridden boolean not null default false;
alter table factures add column if not exists vat_rule_overridden boolean not null default false;
-- vat_rule_overridden = true si le document a été créé alors que la règle
-- "TVA intraco vérifiée requise" n'était pas respectée (override manuel admin).
-- Permet de retrouver facilement ces cas en audit/compta sans bloquer le flux.

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table profiles enable row level security;
alter table companies enable row level security;
alter table clients enable row level security;
alter table products enable row level security;
alter table stock_movements enable row level security;
alter table devis enable row level security;
alter table devis_lines enable row level security;
alter table factures enable row level security;
alter table facture_lines enable row level security;
alter table commissions enable row level security;

-- Helper: fonction pour récupérer le rôle de l'utilisateur courant
create or replace function current_user_role()
returns user_role as $$
  select role from profiles where id = auth.uid();
$$ language sql security definer stable;

create or replace function is_admin()
returns boolean as $$
  select coalesce((select role = 'admin' from profiles where id = auth.uid()), false);
$$ language sql security definer stable;

-- ---- PROFILES ----
create policy "profiles_select_all" on profiles for select using (true);
create policy "profiles_update_self_or_admin" on profiles for update
  using (id = auth.uid() or is_admin());
create policy "profiles_insert_admin_only" on profiles for insert
  with check (is_admin());
create policy "profiles_delete_admin_only" on profiles for delete
  using (is_admin());

-- ---- COMPANIES (lecture par tous les connectés, écriture admin only) ----
create policy "companies_select_all" on companies for select using (auth.uid() is not null);
create policy "companies_write_admin_only" on companies for all
  using (is_admin()) with check (is_admin());

-- ---- PRODUCTS (lecture tous, écriture admin only) ----
create policy "products_select_all" on products for select using (auth.uid() is not null);
create policy "products_write_admin_only" on products for all
  using (is_admin()) with check (is_admin());

-- ---- STOCK MOVEMENTS ----
create policy "stock_movements_select_all" on stock_movements for select using (auth.uid() is not null);
create policy "stock_movements_write_admin_only" on stock_movements for all
  using (is_admin()) with check (is_admin());

-- ---- CLIENTS (admin voit tout, commercial voit ses clients) ----
create policy "clients_select_scoped" on clients for select
  using (is_admin() or owner_id = auth.uid());
create policy "clients_insert_scoped" on clients for insert
  with check (is_admin() or owner_id = auth.uid());
create policy "clients_update_scoped" on clients for update
  using (is_admin() or owner_id = auth.uid());
create policy "clients_delete_admin_only" on clients for delete
  using (is_admin());

-- ---- DEVIS (scoped par owner) ----
create policy "devis_select_scoped" on devis for select
  using (is_admin() or owner_id = auth.uid());
create policy "devis_insert_scoped" on devis for insert
  with check (is_admin() or owner_id = auth.uid());
create policy "devis_update_scoped" on devis for update
  using (is_admin() or owner_id = auth.uid());
create policy "devis_delete_admin_only" on devis for delete
  using (is_admin());

-- ---- DEVIS LINES (suit le scoping du devis parent) ----
create policy "devis_lines_select_scoped" on devis_lines for select
  using (exists (select 1 from devis d where d.id = devis_id and (is_admin() or d.owner_id = auth.uid())));
create policy "devis_lines_write_scoped" on devis_lines for all
  using (exists (select 1 from devis d where d.id = devis_id and (is_admin() or d.owner_id = auth.uid())))
  with check (exists (select 1 from devis d where d.id = devis_id and (is_admin() or d.owner_id = auth.uid())));

-- ---- FACTURES (scoped par owner) ----
create policy "factures_select_scoped" on factures for select
  using (is_admin() or owner_id = auth.uid());
create policy "factures_insert_scoped" on factures for insert
  with check (is_admin() or owner_id = auth.uid());
create policy "factures_update_scoped" on factures for update
  using (is_admin() or owner_id = auth.uid());
create policy "factures_delete_admin_only" on factures for delete
  using (is_admin());

-- ---- FACTURE LINES ----
create policy "facture_lines_select_scoped" on facture_lines for select
  using (exists (select 1 from factures f where f.id = facture_id and (is_admin() or f.owner_id = auth.uid())));
create policy "facture_lines_write_scoped" on facture_lines for all
  using (exists (select 1 from factures f where f.id = facture_id and (is_admin() or f.owner_id = auth.uid())))
  with check (exists (select 1 from factures f where f.id = facture_id and (is_admin() or f.owner_id = auth.uid())));

-- ---- COMMISSIONS (commercial voit les siennes, admin voit tout) ----
create policy "commissions_select_scoped" on commissions for select
  using (is_admin() or commercial_id = auth.uid());
create policy "commissions_write_admin_only" on commissions for all
  using (is_admin()) with check (is_admin());

-- ============================================================
-- STORAGE : bucket pour les logos de société
-- ------------------------------------------------------------
-- À exécuter une seule fois. Le bucket est public en LECTURE
-- (les logos doivent être visibles dans les PDF générés côté
-- navigateur, donc accessibles sans authentification), mais
-- l'écriture reste réservée aux admins.
-- ============================================================
insert into storage.buckets (id, name, public)
values ('company-logos', 'company-logos', true)
on conflict (id) do nothing;

create policy "company_logos_public_read"
  on storage.objects for select
  using (bucket_id = 'company-logos');

create policy "company_logos_admin_write"
  on storage.objects for insert
  with check (bucket_id = 'company-logos' and is_admin());

create policy "company_logos_admin_update"
  on storage.objects for update
  using (bucket_id = 'company-logos' and is_admin());

create policy "company_logos_admin_delete"
  on storage.objects for delete
  using (bucket_id = 'company-logos' and is_admin());


insert into companies (name, country_code, is_default, address_line, postal_code, city, vat_number, requires_client_intra_vat, legal_footer_text)
values
  ('El Camino Verde', 'FR', true, '32 rue de Constantinople', '75008', 'Paris', null, false,
   'TVA non applicable selon le taux du produit. En cas de retard de paiement, indemnité forfaitaire de 40€ pour frais de recouvrement (art. L441-10 du Code de commerce).'),
  ('Atlas Group Kft', 'HU', false, null, null, null, null, true,
   'Livraison intracommunautaire exonérée de TVA - Autoliquidation par le preneur.');
