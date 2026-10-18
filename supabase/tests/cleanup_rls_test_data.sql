-- Supprime uniquement les données créées par rls_test.sql (comptes fictifs 00000000-…-0001 et …-0002).
-- À exécuter dans Supabase > SQL Editor. Les prix WFP et les vrais comptes ne sont pas touchés.
begin;
delete from public.business_views where business_id in (select id from public.businesses where osm_id = 'node/1' and name = 'Test');
delete from public.user_submissions where submitted_by in ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002');
delete from public.businesses where osm_id = 'node/1' and name = 'Test';
delete from public.official_prices where entered_by in ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002');
delete from auth.users where id in ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002');
delete from public.audit_logs where actor in ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002')
  or row_id in ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002')
  -- y compris les lignes que les suppressions ci-dessus viennent d'ajouter au journal
  or details::text like '%00000000-0000-4000-8000-00000000000_%';
commit;
