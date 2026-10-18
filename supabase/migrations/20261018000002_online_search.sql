-- Recherche sans accents ni majuscules sur les produits en ligne (remplie par sync-online)
create extension if not exists pg_trgm with schema extensions;
alter table public.online_products add column search_text text not null default '';
create index online_products_search on public.online_products using gin (search_text extensions.gin_trgm_ops);
