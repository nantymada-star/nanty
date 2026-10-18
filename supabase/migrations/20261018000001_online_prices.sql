-- MadaPrice — prix affichés par les boutiques en ligne malgaches (série 3, ajout pur : aucune table existante modifiée).
-- Collecte : fonction serveur sync-online (API WooCommerce publique, ou jeux de données Apify).
-- Ces prix sont « affichés en ligne » : jamais présentés comme prix vérifié sur un marché.

create table public.online_shops (
  id text primary key check (id ~ '^[a-z0-9-]{2,40}$'),
  name text not null,
  url text not null,
  kind text not null check (kind in ('woocommerce', 'apify')),
  -- woocommerce : {"categories":[id,…]} ; apify : {"task":"utilisateur~tache"} ou {"actor":"utilisateur~acteur"}
  config jsonb not null default '{}',
  area text not null default 'Antananarivo',
  enabled boolean not null default true,
  note text,
  last_run_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.online_products (
  id text primary key,                     -- « boutique|référence »
  shop_id text not null references public.online_shops (id) on delete cascade,
  ref text not null,
  name text not null,
  url text,
  image_url text,
  category text not null default '',
  product_group text,                      -- riz, huile, sucre… (classement MadaPrice)
  size_qty numeric,                        -- contenance totale dans size_unit
  size_unit text check (size_unit in ('kg', 'L', 'pièce')),
  price numeric not null check (price > 0),
  unit_price numeric,                      -- Ar par kg / L / pièce
  currency text not null default 'MGA',
  in_stock boolean,
  suspect text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_changed_at timestamptz not null default now()
);
create index online_products_shop on public.online_products (shop_id);
create index online_products_group on public.online_products (product_group);
create index online_products_seen on public.online_products (last_seen_at, id);

-- Un point de prix par produit et par jour : historique sans doublons
create table public.online_price_points (
  product_id text not null references public.online_products (id) on delete cascade,
  seen_on date not null,
  price numeric not null check (price > 0),
  primary key (product_id, seen_on)
);

alter table public.online_shops enable row level security;
alter table public.online_products enable row level security;
alter table public.online_price_points enable row level security;
create policy "boutiques en ligne: lecture publique" on public.online_shops for select to anon, authenticated using (true);
create policy "boutiques en ligne: modification admin" on public.online_shops for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "boutiques en ligne: ajout admin" on public.online_shops for insert to authenticated with check ((select private.is_admin()));
create policy "produits en ligne: lecture publique" on public.online_products for select to anon, authenticated using (true);
create policy "historique en ligne: lecture publique" on public.online_price_points for select to anon, authenticated using (true);
-- Écriture des produits et de l'historique : uniquement la fonction serveur (service role, sans politique).

create trigger audit_online_shops after insert or delete on public.online_shops
  for each row execute function private.audit();
-- La mise à jour quotidienne de last_run_at n'est pas journalisée, seules les modifications de réglages le sont
create trigger audit_online_shops_settings after update on public.online_shops for each row
  when ((old.enabled, old.config, old.kind, old.url, old.name) is distinct from (new.enabled, new.config, new.kind, new.url, new.name))
  execute function private.audit();

alter publication supabase_realtime add table public.online_products, public.online_shops;

-- Boutiques de départ (vérifiées le 18/10/2026 : prix en Ariary, robots.txt autorise les pages produits)
insert into public.online_shops (id, name, url, kind, config, note) values
  ('bonmarche', 'BonMarche.mg', 'https://bonmarche.mg', 'woocommerce',
   '{"categories":[199,91,92,93,94,95,96,97,98,99,100,101,102,103,104,105,106,107,108,109,110]}',
   'API publique WooCommerce Store, rayon Supermarché (épicerie, riz, huiles, boissons, produits frais, hygiène)'),
  ('kibo', 'KIBO', 'https://www.kibo.mg', 'apify', '{}',
   'Site PrestaShop multi-magasins chargé en JavaScript : collecte par Apify (tâche à renseigner)'),
  ('supermarche-mg', 'Supermarché.mg', 'https://supermarche.mg', 'apify', '{}',
   'Certificat TLS refusé par le serveur : collecte par Apify (tâche à renseigner)');
update public.online_shops set enabled = false where kind = 'apify';

-- Tâche planifiée : même jeton que sync-wfp (Vault)
create or replace function private.invoke_sync_online() returns bigint
language sql security definer set search_path = '' as $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/sync-online',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-cron-token', (select decrypted_secret from vault.decrypted_secrets where name = 'sync_wfp_cron_token')),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  )
$$;
revoke all on function private.invoke_sync_online() from public, anon, authenticated;

-- Chaque jour à 03:40 UTC (06:40 à Antananarivo), après la synchro WFP
select cron.schedule('sync-online-daily', '40 3 * * *', $$ select private.invoke_sync_online(); $$);
