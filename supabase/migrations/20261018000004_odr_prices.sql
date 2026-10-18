-- Série 5 : prix officiels du riz publiés par l'Observatoire du Riz (ODR, ministère de l'Agriculture), ajout pur.
-- Producteur (paddy et riz blanc), grossiste et détaillant, par région et par district, chaque mois.

create table public.odr_bulletins (
  url text primary key,
  bulletin_no integer,
  period_start date,
  rows_count integer not null default 0,
  status text not null default 'ok' check (status in ('ok', 'error', 'empty')),
  error text,
  fetched_at timestamptz not null default now()
);

create table public.odr_prices (
  id text primary key,                       -- « odr|niveau|zone|produit|stade|AAAA-MM-01 »
  bulletin_no integer,
  bulletin_url text not null,
  period_start date not null,
  level text not null check (level in ('national', 'region', 'district')),
  area text not null,
  region text,
  product text not null check (product in ('paddy', 'riz_local', 'riz_importe')),
  stage text not null check (stage in ('producteur', 'grossiste', 'detaillant')),
  price numeric not null check (price > 0),
  unit text not null default 'kg',
  change_pct numeric,
  first_seen_at timestamptz not null default now(),
  last_verified_at timestamptz not null default now(),
  revisions jsonb not null default '[]'
);
create index odr_prices_period on public.odr_prices (period_start);
create index odr_prices_series on public.odr_prices (product, stage, level, area);
create index odr_prices_verified on public.odr_prices (last_verified_at, id);

alter table public.odr_bulletins enable row level security;
alter table public.odr_prices enable row level security;
create policy "bulletins ODR: lecture publique" on public.odr_bulletins for select to anon, authenticated using (true);
create policy "prix ODR: lecture publique" on public.odr_prices for select to anon, authenticated using (true);
-- Écriture : uniquement la fonction serveur sync-odr (service role).

alter publication supabase_realtime add table public.odr_prices;

create or replace function private.invoke_sync_odr() returns bigint
language sql security definer set search_path = '' as $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/sync-odr',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-cron-token', (select decrypted_secret from vault.decrypted_secrets where name = 'sync_wfp_cron_token')),
    body := '{"action":"sync"}'::jsonb,
    timeout_milliseconds := 150000
  )
$$;
revoke all on function private.invoke_sync_odr() from public, anon, authenticated;

-- Chaque jour à 04:10 UTC (07:10 à Antananarivo) : les bulletins sont mensuels, la vérification quotidienne est légère.
select cron.schedule('sync-odr-daily', '10 4 * * *', $$ select private.invoke_sync_odr(); $$);
