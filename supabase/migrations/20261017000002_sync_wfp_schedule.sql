create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

-- Jeton aléatoire pour authentifier la tâche planifiée auprès de la fonction serveur
select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'sync_wfp_cron_token', 'Jeton de la tâche planifiée sync-wfp');
select vault.create_secret('https://aetwjbobrnrudmulvnjp.supabase.co', 'project_url', 'URL du projet');

create or replace function public.check_cron_token(t text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from vault.decrypted_secrets where name = 'sync_wfp_cron_token' and decrypted_secret = t)
$$;
revoke all on function public.check_cron_token(text) from public, anon, authenticated;
grant execute on function public.check_cron_token(text) to service_role;

create or replace function private.invoke_sync_wfp() returns bigint
language sql security definer set search_path = '' as $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/sync-wfp',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-cron-token', (select decrypted_secret from vault.decrypted_secrets where name = 'sync_wfp_cron_token')),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  )
$$;
revoke all on function private.invoke_sync_wfp() from public, anon, authenticated;

-- Chaque jour à 03:10 UTC (06:10 à Antananarivo)
select cron.schedule('sync-wfp-daily', '10 3 * * *', $$ select private.invoke_sync_wfp(); $$);
