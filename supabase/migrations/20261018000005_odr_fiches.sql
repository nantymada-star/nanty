-- Série 6 : relevés hebdomadaires de terrain de l'ODR (fiches Excel des points focaux régionaux, groupe Google public
-- « cellule-odr-bdd-minae »), ajout pur. Seuls les prix agrégés par marché sont conservés : aucun nom ni téléphone
-- de vendeur ou d'enquêteur n'est stocké.

create table public.odr_fiche_files (
  url text primary key,                      -- pièce jointe du groupe (…/attach/…/Fiche_ODR….xlsx?part=…)
  file_name text,
  thread_url text,
  thread_title text,
  posted_on date,
  status text not null default 'pending' check (status in ('pending', 'ok', 'error', 'empty')),
  rows_count integer not null default 0,
  error text,
  fetched_at timestamptz
);

create table public.odr_fiche_prices (
  id text primary key,                       -- « fiche|marché|produit|stade|AAAA-MM-JJ »
  survey_date date not null,
  region text not null,
  district text,
  commune text,
  market text not null,
  product text not null check (product in ('paddy', 'riz_local', 'riz_importe')),
  stage text not null check (stage in ('producteur', 'grossiste', 'detaillant')),
  price numeric not null check (price > 0),  -- médiane des vendeurs relevés, Ar/kg
  price_min numeric not null,
  price_max numeric not null,
  n_sellers integer not null,
  varieties text[] not null default '{}',
  file_url text not null references public.odr_fiche_files (url) on delete cascade,
  thread_url text,
  first_seen_at timestamptz not null default now(),
  last_verified_at timestamptz not null default now()
);
create index odr_fiche_prices_date on public.odr_fiche_prices (survey_date);
create index odr_fiche_prices_series on public.odr_fiche_prices (product, stage, region, survey_date);
create index odr_fiche_prices_file on public.odr_fiche_prices (file_url);

alter table public.odr_fiche_files enable row level security;
alter table public.odr_fiche_prices enable row level security;
create policy "fiches ODR: lecture publique" on public.odr_fiche_files for select to anon, authenticated using (true);
create policy "relevés ODR: lecture publique" on public.odr_fiche_prices for select to anon, authenticated using (true);
-- Écriture : uniquement la fonction serveur sync-odr-fiches (service role).

alter publication supabase_realtime add table public.odr_fiche_prices;

create or replace function private.invoke_sync_odr_fiches(p_action text) returns bigint
language sql security definer set search_path = '' as $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/sync-odr-fiches',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-cron-token', (select decrypted_secret from vault.decrypted_secrets where name = 'sync_wfp_cron_token')),
    body := jsonb_build_object('action', p_action),
    timeout_milliseconds := 150000
  )
$$;
revoke all on function private.invoke_sync_odr_fiches(text) from public, anon, authenticated;

-- Collecte Apify du groupe le lundi à 03:20 UTC ; import des nouvelles fiches toutes les 6 heures (quelques fichiers par appel).
select cron.schedule('odr-fiches-crawl-weekly', '20 3 * * 1', $$ select private.invoke_sync_odr_fiches('crawl'); $$);
select cron.schedule('odr-fiches-import', '25 */6 * * *', $$ select private.invoke_sync_odr_fiches('sync'); $$);
