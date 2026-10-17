-- MadaPrice — schéma partagé (série 2)
-- Toutes les tables ont RLS activé. Les écritures WFP passent par la fonction serveur (service role).

create schema if not exists private;

-- ---------- Types ----------
create type public.app_role as enum ('user', 'merchant', 'moderator', 'admin');
create type public.moderation_status as enum ('pending', 'approved', 'rejected');
create type public.stock_status as enum ('declared', 'unknown', 'out');
create type public.quote_status as enum ('open', 'answered', 'closed');

-- ---------- Profils et rôles ----------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  display_name text check (char_length(display_name) <= 60),
  role public.app_role not null default 'user',
  reputation integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function private.my_role() returns public.app_role
language sql stable security definer set search_path = '' as $$
  select role from public.profiles where id = auth.uid()
$$;
create or replace function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false)
$$;
create or replace function private.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select role in ('moderator', 'admin') from public.profiles where id = auth.uid()), false)
$$;
grant usage on schema private to anon, authenticated;
grant execute on all functions in schema private to anon, authenticated;

-- Création automatique du profil ; premier administrateur désigné par e-mail.
create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, display_name, role)
  values (
    new.id,
    new.email,
    left(coalesce(new.raw_user_meta_data ->> 'display_name', ''), 60),
    case when lower(new.email) = 'nantymada@gmail.com' then 'admin'::public.app_role else 'user'::public.app_role end
  );
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- Personne ne change son propre rôle ni sa réputation ; seul un admin change les rôles.
create or replace function private.protect_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- auth.uid() est null pour le serveur (service role) et la console SQL : seuls cas autorisés sans être admin.
  if (new.role is distinct from old.role) and auth.uid() is not null and not private.is_admin() then
    raise exception 'Seul un administrateur peut changer un rôle';
  end if;
  if (new.reputation is distinct from old.reputation) and auth.uid() is not null and not private.is_admin()
     and pg_trigger_depth() <= 1 then
    new.reputation := old.reputation;
  end if;
  new.email := old.email;
  new.id := old.id;
  new.updated_at := now();
  return new;
end $$;
create trigger protect_profile before update on public.profiles
  for each row execute function private.protect_profile();

alter table public.profiles enable row level security;
create policy "profil: lecture soi ou staff" on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select private.is_staff()));
create policy "profil: modification soi ou admin" on public.profiles for update to authenticated
  using (id = (select auth.uid()) or (select private.is_admin()))
  with check (id = (select auth.uid()) or (select private.is_admin()));

-- ---------- Journal d'audit ----------
create table public.audit_logs (
  id bigserial primary key,
  at timestamptz not null default now(),
  actor uuid,
  action text not null,
  table_name text not null,
  row_id text,
  details jsonb not null default '{}'
);
alter table public.audit_logs enable row level security;
create policy "audit: lecture admin" on public.audit_logs for select to authenticated using ((select private.is_admin()));

create or replace function private.audit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare rid text;
begin
  rid := coalesce((to_jsonb(new) ->> 'id'), (to_jsonb(old) ->> 'id'));
  insert into public.audit_logs (actor, action, table_name, row_id, details)
  values (auth.uid(), lower(tg_op), tg_table_name, rid,
          case when tg_op = 'DELETE' then to_jsonb(old) else jsonb_build_object('new', to_jsonb(new), 'old', case when tg_op = 'UPDATE' then to_jsonb(old) end) end);
  return coalesce(new, old);
end $$;
create trigger audit_profiles after update on public.profiles for each row
  when (old.role is distinct from new.role) execute function private.audit();

-- ---------- Marchés et relevés WFP (synchronisés par le serveur) ----------
create table public.markets (
  code text primary key,
  name text not null,
  admin1 text not null default '',
  admin2 text not null default '',
  lat double precision,
  lon double precision,
  updated_at timestamptz not null default now()
);
create table public.price_observations (
  id text primary key,
  source text not null default 'wfp-hapi',
  market_code text not null,
  market_name text not null,
  admin1 text not null default '',
  admin2 text not null default '',
  lat double precision,
  lon double precision,
  commodity_code text not null,
  commodity_name text not null,
  category text not null default '',
  unit text not null,
  price_type text not null,
  price_flag text not null,
  currency text not null default 'MGA',
  price numeric not null check (price > 0),
  period_start date not null,
  period_end date not null,
  first_seen_at timestamptz not null default now(),
  last_verified_at timestamptz not null default now(),
  revisions jsonb not null default '[]',
  suspect text
);
create index price_obs_first_seen on public.price_observations (first_seen_at);
create index price_obs_last_verified on public.price_observations (last_verified_at);
create index price_obs_series on public.price_observations (commodity_code, market_code);
create table public.data_sync_runs (
  id bigserial primary key,
  source text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  duration_ms integer,
  status text not null default 'running',
  fetched integer not null default 0,
  inserted integer not null default 0,
  updated integer not null default 0,
  suspects integer not null default 0,
  attempts integer not null default 0,
  error text,
  trigger text not null default 'cron'
);
alter table public.markets enable row level security;
alter table public.price_observations enable row level security;
alter table public.data_sync_runs enable row level security;
create policy "marchés: lecture publique" on public.markets for select to anon, authenticated using (true);
create policy "relevés: lecture publique" on public.price_observations for select to anon, authenticated using (true);
create policy "synchro: lecture publique" on public.data_sync_runs for select to anon, authenticated using (true);

-- ---------- Prix soumis par les utilisateurs (modération) ----------
create table public.user_submissions (
  id uuid primary key default gen_random_uuid(),
  submitted_by uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  commodity_code text not null,
  commodity_name text not null check (char_length(commodity_name) <= 120),
  category text not null default '',
  market_code text not null,
  market_name text not null check (char_length(market_name) <= 120),
  admin1 text not null default '',
  unit text not null check (char_length(unit) <= 30),
  price_type text not null check (price_type in ('Retail', 'Wholesale', 'Producer')),
  price numeric not null check (price > 0 and price < 1000000000),
  observed_on date not null,
  note text check (char_length(note) <= 300),
  lat double precision,
  lon double precision,
  status public.moderation_status not null default 'pending',
  moderated_by uuid references public.profiles (id),
  moderated_at timestamptz,
  moderation_note text check (char_length(moderation_note) <= 300),
  created_at timestamptz not null default now()
);
create index submissions_status on public.user_submissions (status, created_at desc);
create index submissions_by on public.user_submissions (submitted_by, created_at desc);

create or replace function private.submission_before_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.user_submissions
      where submitted_by = new.submitted_by and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'Trop de soumissions en une heure' using errcode = 'P0001';
  end if;
  if new.observed_on > current_date or new.observed_on <= current_date - 366 then
    raise exception 'Date du relevé invalide' using errcode = 'P0001';
  end if;
  new.status := 'pending';
  new.moderated_by := null;
  new.moderated_at := null;
  new.created_at := now();
  return new;
end $$;
create trigger submission_before_insert before insert on public.user_submissions
  for each row execute function private.submission_before_insert();

create or replace function private.submission_before_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- Seule la modération change : les champs du relevé restent ceux d'origine.
  new.submitted_by := old.submitted_by;
  new.commodity_code := old.commodity_code;
  new.commodity_name := old.commodity_name;
  new.category := old.category;
  new.market_code := old.market_code;
  new.market_name := old.market_name;
  new.admin1 := old.admin1;
  new.unit := old.unit;
  new.price_type := old.price_type;
  new.price := old.price;
  new.observed_on := old.observed_on;
  new.note := old.note;
  new.lat := old.lat;
  new.lon := old.lon;
  new.created_at := old.created_at;
  if new.status is distinct from old.status then
    new.moderated_by := auth.uid();
    new.moderated_at := now();
    -- Réputation : +1 si validé, −1 si rejeté
    update public.profiles set reputation = reputation + case new.status when 'approved' then 1 when 'rejected' then -1 else 0 end
      where id = new.submitted_by;
  else
    new.moderated_by := old.moderated_by;
    new.moderated_at := old.moderated_at;
  end if;
  return new;
end $$;
create trigger submission_before_update before update on public.user_submissions
  for each row execute function private.submission_before_update();
create trigger audit_submissions after update or delete on public.user_submissions
  for each row execute function private.audit();

alter table public.user_submissions enable row level security;
create policy "soumissions: lecture validées, siennes ou staff" on public.user_submissions for select to anon, authenticated
  using (status = 'approved' or submitted_by = (select auth.uid()) or (select private.is_staff()));
create policy "soumissions: envoi par soi" on public.user_submissions for insert to authenticated
  with check (submitted_by = (select auth.uid()) and status = 'pending');
create policy "soumissions: modération staff" on public.user_submissions for update to authenticated
  using ((select private.is_staff())) with check ((select private.is_staff()));
create policy "soumissions: suppression siennes en attente ou staff" on public.user_submissions for delete to authenticated
  using ((submitted_by = (select auth.uid()) and status = 'pending') or (select private.is_staff()));

-- ---------- Commerces et prix des commerçants ----------
create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  osm_id text unique,
  name text not null check (char_length(name) between 1 and 120),
  kind text not null default '',
  lat double precision,
  lon double precision,
  address text check (char_length(address) <= 200),
  phone text check (char_length(phone) <= 40),
  hours text check (char_length(hours) <= 200),
  delivery boolean,
  delivery_area text check (char_length(delivery_area) <= 120),
  owner_id uuid default auth.uid() references public.profiles (id) on delete set null,
  verified boolean not null default false,
  verified_by uuid references public.profiles (id),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index businesses_owner on public.businesses (owner_id);

create or replace function private.business_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if not private.is_admin() then
      new.owner_id := auth.uid();
      new.verified := false; new.verified_by := null; new.verified_at := null;
    end if;
  else
    if not private.is_admin() then
      new.owner_id := old.owner_id;
      new.verified := old.verified; new.verified_by := old.verified_by; new.verified_at := old.verified_at;
      new.osm_id := old.osm_id;
    elsif new.verified is distinct from old.verified then
      new.verified_by := case when new.verified then auth.uid() end;
      new.verified_at := case when new.verified then now() end;
    end if;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger business_guard before insert or update on public.businesses
  for each row execute function private.business_guard();
create trigger audit_businesses after update or delete on public.businesses
  for each row execute function private.audit();

create or replace function private.owns_business(b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.businesses where id = b and owner_id = auth.uid())
$$;
grant execute on function private.owns_business(uuid) to anon, authenticated;

alter table public.businesses enable row level security;
create policy "commerces: lecture publique" on public.businesses for select to anon, authenticated using (true);
create policy "commerces: création connectée" on public.businesses for insert to authenticated with check (true);
create policy "commerces: modification propriétaire ou admin" on public.businesses for update to authenticated
  using (owner_id = (select auth.uid()) or (select private.is_admin()))
  with check (owner_id = (select auth.uid()) or (select private.is_admin()));
create policy "commerces: suppression admin" on public.businesses for delete to authenticated using ((select private.is_admin()));

create table public.business_prices (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  product text not null check (char_length(product) between 1 and 120),
  unit text not null check (char_length(unit) between 1 and 30),
  price numeric not null check (price > 0 and price < 1000000000),
  price_type text not null default 'Retail' check (price_type in ('Retail', 'Wholesale')),
  stock public.stock_status not null default 'unknown',
  delivery boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid() references public.profiles (id) on delete set null
);
create index business_prices_business on public.business_prices (business_id);
create index business_prices_product on public.business_prices (lower(product));

create or replace function private.business_price_touch() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;
create trigger business_price_touch before insert or update on public.business_prices
  for each row execute function private.business_price_touch();

alter table public.business_prices enable row level security;
create policy "prix commerces: lecture publique" on public.business_prices for select to anon, authenticated using (true);
create policy "prix commerces: écriture propriétaire ou admin" on public.business_prices for insert to authenticated
  with check ((select private.owns_business(business_id)) or (select private.is_admin()));
create policy "prix commerces: modification propriétaire ou admin" on public.business_prices for update to authenticated
  using ((select private.owns_business(business_id)) or (select private.is_admin()))
  with check ((select private.owns_business(business_id)) or (select private.is_admin()));
create policy "prix commerces: suppression propriétaire ou admin" on public.business_prices for delete to authenticated
  using ((select private.owns_business(business_id)) or (select private.is_admin()));

-- ---------- Demandes de devis ----------
create table public.quote_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  requester_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  product text not null check (char_length(product) between 1 and 120),
  quantity text check (char_length(quantity) <= 60),
  message text check (char_length(message) <= 500),
  contact text check (char_length(contact) <= 80),
  status public.quote_status not null default 'open',
  reply text check (char_length(reply) <= 500),
  created_at timestamptz not null default now(),
  replied_at timestamptz
);
create index quotes_business on public.quote_requests (business_id, created_at desc);
create index quotes_requester on public.quote_requests (requester_id, created_at desc);

create or replace function private.quote_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if (select count(*) from public.quote_requests where requester_id = auth.uid() and created_at > now() - interval '1 hour') >= 10 then
      raise exception 'Trop de demandes en une heure' using errcode = 'P0001';
    end if;
    new.requester_id := auth.uid(); new.status := 'open'; new.reply := null; new.replied_at := null; new.created_at := now();
    return new;
  end if;
  new.business_id := old.business_id; new.requester_id := old.requester_id; new.product := old.product;
  new.quantity := old.quantity; new.message := old.message; new.contact := old.contact; new.created_at := old.created_at;
  if private.owns_business(old.business_id) or private.is_admin() then
    if new.reply is distinct from old.reply then new.replied_at := now(); new.status := 'answered'; end if;
  else
    -- le demandeur peut seulement clore sa demande
    new.reply := old.reply; new.replied_at := old.replied_at;
    if new.status <> 'closed' then new.status := old.status; end if;
  end if;
  return new;
end $$;
create trigger quote_guard before insert or update on public.quote_requests
  for each row execute function private.quote_guard();

alter table public.quote_requests enable row level security;
create policy "devis: lecture demandeur, commerçant ou admin" on public.quote_requests for select to authenticated
  using (requester_id = (select auth.uid()) or (select private.owns_business(business_id)) or (select private.is_admin()));
create policy "devis: création connectée" on public.quote_requests for insert to authenticated
  with check (requester_id = (select auth.uid()));
create policy "devis: mise à jour demandeur ou commerçant" on public.quote_requests for update to authenticated
  using (requester_id = (select auth.uid()) or (select private.owns_business(business_id)) or (select private.is_admin()))
  with check (requester_id = (select auth.uid()) or (select private.owns_business(business_id)) or (select private.is_admin()));

-- ---------- Statistiques de consultation des fiches ----------
create table public.business_views (
  business_id uuid not null references public.businesses (id) on delete cascade,
  day date not null default current_date,
  views integer not null default 0,
  primary key (business_id, day)
);
alter table public.business_views enable row level security;
create policy "vues: lecture propriétaire ou admin" on public.business_views for select to authenticated
  using ((select private.owns_business(business_id)) or (select private.is_admin()));

create or replace function public.record_business_view(b uuid) returns void
language sql security definer set search_path = '' as $$
  insert into public.business_views (business_id, day, views) values (b, current_date, 1)
  on conflict (business_id, day) do update set views = public.business_views.views + 1
$$;
grant execute on function public.record_business_view(uuid) to anon, authenticated;

-- ---------- Prix officiels partagés ----------
create table public.official_prices (
  id bigserial primary key,
  key text not null check (char_length(key) <= 60),
  label text not null default '',
  unit text not null,
  price numeric not null check (price > 0),
  area text not null default '',
  effective_from text not null check (effective_from ~ '^\d{4}-\d{2}(-\d{2})?$'),
  source_type text not null check (source_type in ('official', 'press')),
  source_name text not null check (char_length(source_name) between 1 and 200),
  source_url text not null default '' check (source_url = '' or source_url ~ '^https://'),
  entered_at timestamptz not null default now(),
  entered_by uuid default auth.uid() references public.profiles (id) on delete set null
);
alter table public.official_prices enable row level security;
create policy "prix officiels: lecture publique" on public.official_prices for select to anon, authenticated using (true);
create policy "prix officiels: écriture staff" on public.official_prices for insert to authenticated with check ((select private.is_staff()));
create policy "prix officiels: modification staff" on public.official_prices for update to authenticated using ((select private.is_staff())) with check ((select private.is_staff()));
create policy "prix officiels: suppression admin" on public.official_prices for delete to authenticated using ((select private.is_admin()));
create trigger audit_official after insert or update or delete on public.official_prices
  for each row execute function private.audit();

-- ---------- Listes de courses ----------
create table public.shopping_lists (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  items jsonb not null default '[]' check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) <= 200),
  updated_at timestamptz not null default now()
);
create index shopping_lists_owner on public.shopping_lists (owner_id);
alter table public.shopping_lists enable row level security;
create policy "listes: tout pour le propriétaire" on public.shopping_lists for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

-- ---------- Temps réel ----------
alter publication supabase_realtime add table public.price_observations, public.data_sync_runs, public.user_submissions,
  public.business_prices, public.businesses, public.official_prices, public.quote_requests;
