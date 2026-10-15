import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { useT } from '../i18n'
import { Icon } from './Icon'
import { StatusBadge } from './ui'
import { db } from '../lib/db'
import { latestRates } from '../lib/fx'
import { officialFor, officialIsStale, presetOf } from '../lib/official'
import { itemLabel, itemsMatching, latestByMarket } from '../lib/rtfp'
import { fmtAr, fmtDay, fmtMonth, fmtNum } from '../lib/format'

/** Bandeau des taux de change (accueil). */
export function FxStrip() {
  const { t, lang } = useT()
  const rates = useLiveQuery(() => db.fxRates.toArray(), []) ?? []
  const latest = latestRates(rates)
  const show = ['USD', 'EUR'].filter((c) => latest.has(c))
  if (!show.length) return null
  const d = latest.get(show[0])!
  return (
    <Link to="/fanampiny?tab=fx" className="card row between" style={{ textDecoration: 'none', color: 'inherit', padding: '10px 12px', fontSize: 13.5 }}>
      <span className="row wrap" style={{ gap: 12 }}>
        <Icon name="globe" size={16} />
        {show.map((c) => <span key={c} className="num"><b>1 {c}</b> = {fmtNum(latest.get(c)!.rate, 0)} Ar</span>)}
      </span>
      <small>{d.provider === 'BFM' ? 'BFM' : t('fxBlended')} · {fmtDay(d.date, lang)}</small>
    </Link>
  )
}

/** Compléments pour un produit WFP : prix officiel lié et estimations Banque mondiale. */
export function CommodityEnrichment({ commodityName, market }: { commodityName: string; market?: string }) {
  const { t, lang } = useT()
  const official = useLiveQuery(() => db.officialPrices.toArray(), []) ?? []
  const items = useLiveQuery(async () => (await db.estimates.orderBy('item').uniqueKeys()) as string[], []) ?? []
  const matched = itemsMatching(commodityName, items)
  const estimates = useLiveQuery(
    () => (matched.length ? db.estimates.where('item').anyOf(matched).toArray() : []),
    [matched.join(',')],
  ) ?? []
  const off = officialFor(commodityName, official)
  const rows = matched.flatMap((it) => latestByMarket(estimates, it).map((e) => ({ e, it })))
  const forMarket = market ? rows.filter(({ e }) => e.market.toLowerCase() === market.toLowerCase()) : rows
  const shown = (market ? forMarket : rows).slice(0, 8)
  if (!off.length && !shown.length) return null

  return (
    <div className="card stack" style={{ borderLeft: '4px solid var(--blue)' }}>
      {off.length > 0 && (
        <div className="stack">
          <b>{t('officialForProduct')}</b>
          {off.map((p) => (
            <div key={p.id} className="row between">
              <span>
                {lang === 'mg' ? presetOf(p.key)?.mg : presetOf(p.key)?.fr}{p.area ? ` · ${p.area}` : ''}{' '}
                {officialIsStale(p) ? <StatusBadge status="stale" /> : <span className={`badge ${p.sourceType === 'official' ? 'b-verified' : 'b-declared'}`}>{p.sourceType === 'official' ? t('officialBadge') : t('pressBadge')}</span>}
                <div><small>{t('effectiveFrom')} {p.effectiveFrom.length === 7 ? fmtMonth(p.effectiveFrom, lang) : fmtDay(p.effectiveFrom, lang)} · {p.sourceName}</small></div>
              </span>
              <b className="price num" style={{ fontSize: 16 }}>{fmtAr(p.price)}<small>/{p.unit}</small></b>
            </div>
          ))}
        </div>
      )}
      {shown.length > 0 && (
        <div className="stack">
          <b>{t('wbForProduct')}</b>
          <ul className="list">
            {shown.map(({ e, it }) => (
              <li key={e.id} className="row between">
                <span style={{ minWidth: 0 }}>
                  {e.market} <small>· {itemLabel(it)} · {fmtMonth(e.date, lang)}</small>
                  {e.low != null && e.high != null && <div><small>{t('rangeLabel')} {fmtAr(e.low)} – {fmtAr(e.high)}</small></div>}
                </span>
                <span style={{ textAlign: 'right' }}><b className="num">{fmtAr(e.price)}</b><br /><StatusBadge status="estimated" /></span>
              </li>
            ))}
          </ul>
          <small>{t('wbUnit')} · <Link to="/fanampiny?tab=wb">{t('seeEnrich')}</Link></small>
        </div>
      )}
    </div>
  )
}
