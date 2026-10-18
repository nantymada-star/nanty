-- Série 4 : rapprochement d'un même produit entre boutiques et valeurs suspectes par médiane (ajout pur).
alter table public.online_products add column barcode text;
alter table public.online_products add column match_key text not null default '';
create index online_products_match on public.online_products (match_key);
create index online_products_barcode on public.online_products (barcode) where barcode is not null;

-- Valeurs suspectes, même règle que pour le PAM (×3 ou ÷3 de la médiane) :
--   1) par rapport à l'historique du produit (≥ 4 relevés sur 180 jours) ;
--   2) par rapport au même produit dans les autres boutiques (≥ 3 offres de la même clé).
-- Le saut brutal d'un jour à l'autre (« jump ») reste signalé s'il n'y a pas d'autre motif.
create or replace function public.online_flag_outliers(p_shop text) returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  with hist as (
    select pp.product_id, percentile_cont(0.5) within group (order by pp.price) as med, count(*) as k
    from public.online_price_points pp
    join public.online_products p on p.id = pp.product_id and p.shop_id = p_shop
    where pp.seen_on >= current_date - 180
    group by pp.product_id
  ), cross_shop as (
    select match_key, percentile_cont(0.5) within group (order by price) as med, count(*) as k
    from public.online_products
    where match_key <> '' and match_key not like 'n:|%'
    group by match_key
  ), verdict as (
    select p.id,
      case
        when h.k >= 4 and (p.price > 3 * h.med or p.price < h.med / 3) then 'outlier'
        when c.k >= 3 and (p.price > 3 * c.med or p.price < c.med / 3) then 'outlier'
        when p.suspect = 'jump' then 'jump'
        else null
      end as s
    from public.online_products p
    left join hist h on h.product_id = p.id
    left join cross_shop c on c.match_key = p.match_key
    where p.shop_id = p_shop
  )
  update public.online_products p set suspect = v.s
  from verdict v where v.id = p.id and p.suspect is distinct from v.s;
  select count(*) into n from public.online_products where shop_id = p_shop and suspect is not null;
  return n;
end $$;
revoke all on function public.online_flag_outliers(text) from public, anon, authenticated;
grant execute on function public.online_flag_outliers(text) to service_role;

-- Même produit vendu par au moins deux boutiques (lecture publique, droits du lecteur)
create view public.online_matches with (security_invoker = on) as
select match_key,
  min(name) as name,
  max(barcode) as barcode,
  max(size_qty) as size_qty,
  max(size_unit) as size_unit,
  max(product_group) as product_group,
  count(distinct shop_id) as shops,
  count(*) as offers,
  min(price) filter (where suspect is null) as min_price,
  max(price) filter (where suspect is null) as max_price,
  max(last_seen_at) as last_seen_at
from public.online_products
where match_key <> '' and match_key not like 'n:|%'
group by match_key
having count(distinct shop_id) >= 2;
grant select on public.online_matches to anon, authenticated;
