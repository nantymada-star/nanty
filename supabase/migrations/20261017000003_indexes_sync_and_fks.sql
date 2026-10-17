create index if not exists price_obs_sync_cursor on public.price_observations (last_verified_at, id);
create index if not exists business_prices_updated_by on public.business_prices (updated_by);
create index if not exists businesses_verified_by on public.businesses (verified_by);
create index if not exists official_prices_entered_by on public.official_prices (entered_by);
create index if not exists submissions_moderated_by on public.user_submissions (moderated_by);
comment on function public.record_business_view(uuid) is 'Volontairement appelable sans connexion : compteur de vues des fiches commerce (incrément seulement).';
