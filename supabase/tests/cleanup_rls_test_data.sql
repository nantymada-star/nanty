-- Supprime les données créées par les tests RLS du 17/10/2026 (2 comptes *.test et leurs objets).
delete from public.business_views;
delete from public.businesses where osm_id = 'node/1' and name = 'Test';
delete from public.official_prices where source_name = 'OMH' and price = 4700;
delete from auth.users where id in ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002');
delete from public.audit_logs;
