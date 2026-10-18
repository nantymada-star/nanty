import { Link } from 'react-router-dom'
import { useT } from '../i18n'
import { Icon } from './Icon'
import { supabase } from '../lib/supabase'
import { useServer } from '../lib/useServer'
import { fmtAr, fmtDay, fmtMonth } from '../lib/format'
import { chain, latest, odrForCommodity, stageKey, weeklyByRegion, type FicheRow, type OdrRow } from '../lib/odr'

export function OfficialBadge() {
  const { t } = useT()
  return <span className="badge b-official" title={t('stOfficialHelp')}><Icon name="shield" size={11} /> {t('stOfficial')} · ODR</span>
}

/** Chaîne producteur → grossiste → détaillant, avec la marge entre deux étapes. */
export function OdrChain({ rows, product, area }: { rows: OdrRow[]; product: string; area: string }) {
  const { t } = useT()
  const c = chain(rows, product, area)
  const step = (stage: 'producteur' | 'grossiste' | 'detaillant', v: number | null) => (
    <div className="kpi" style={{ flex: 1, minWidth: 0 }}>
      <div className="v num">{v != null ? fmtAr(v) : '—'}</div>
      <div className="l">{t(stageKey(stage))} · /kg</div>
    </div>
  )
  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="row" style={{ gap: 6, alignItems: 'stretch' }}>
        {step('producteur', c.producteur)}
        {step('grossiste', c.grossiste)}
        {step('detaillant', c.detaillant)}
      </div>
      {(c.m1 != null || c.m2 != null) && (
        <small className="muted">
          {t('odrMargin')} : {c.m1 != null ? `${t('odr_producteur')} → ${t('odr_grossiste')} +${fmtAr(c.m1)}` : ''}
          {c.m1 != null && c.m2 != null ? ' · ' : ''}
          {c.m2 != null ? `${t('odr_grossiste')} → ${t('odr_detaillant')} +${fmtAr(c.m2)}` : ''}
        </small>
      )}
    </div>
  )
}

/** Sur la fiche d'un produit PAM « riz » : prix officiels ODR du dernier bulletin (ensemble du pays + région du marché). */
export function OdrForCommodity({ code, region }: { code: string; region?: string }) {
  const { t, lang } = useT()
  const product = odrForCommodity(code)
  const { data } = useServer<OdrRow[]>(
    () => (product && supabase ? supabase.from('odr_prices').select('*').in('level', ['national', 'region']).in('product', product === 'riz_local' ? ['riz_local', 'paddy'] : [product]).order('period_start', { ascending: false }).limit(400) : null),
    [product], ['odr_prices'])
  if (!product || !data?.length) return null
  const l = latest(data)
  const reg = region ? l.rows.find((r) => r.level === 'region' && r.area.toLowerCase() === region.toLowerCase())?.area : undefined
  const paddy = l.rows.find((r) => r.product === 'paddy' && r.area === (reg ?? 'Madagascar'))
  return (
    <div className="card stack">
      <div className="row between wrap"><h2>{t('odrShort')}</h2><OfficialBadge /></div>
      <small>{t('odrBulletin')} · {fmtMonth(l.period, lang)}</small>
      <b style={{ fontSize: 14 }}>{t('odrNational')}</b>
      <OdrChain rows={l.rows} product={product} area="Madagascar" />
      {reg && <><b style={{ fontSize: 14 }}>{reg}</b><OdrChain rows={l.rows} product={product} area={reg} /></>}
      {paddy && product === 'riz_local' && <small>{t('odr_paddy')} ({t('odr_producteur')}) : <b className="num">{fmtAr(paddy.price)}</b> /kg</small>}
      <Link className="btn small secondary" to={`/ofisialy?p=${product}`}><Icon name="chart" size={14} /> {t('seeAll')}</Link>
    </div>
  )
}

/** Relevés hebdomadaires de terrain (fiches ODR régionales) : dernière semaine de chaque région, médiane des marchés. */
export function OdrWeekly({ product }: { product: string }) {
  const { t, lang } = useT()
  const since = new Date(Date.now() - 120 * 86400000).toISOString().slice(0, 10)
  const { data, loading } = useServer<FicheRow[]>(
    () => supabase?.from('odr_fiche_prices').select('id, survey_date, region, district, commune, market, product, stage, price, price_min, price_max, n_sellers, varieties, thread_url')
      .eq('product', product).gte('survey_date', since).order('survey_date', { ascending: false }).limit(3000) ?? null,
    [product], ['odr_fiche_prices'])
  const weeks = weeklyByRegion(data ?? [], product)
  const stages = product === 'paddy' ? (['producteur'] as const) : product === 'riz_importe' ? (['grossiste', 'detaillant'] as const) : (['producteur', 'grossiste', 'detaillant'] as const)
  return (
    <div className="card stack">
      <div className="row between wrap"><h2>{t('odrWeekly')}</h2><OfficialBadge /></div>
      <small className="muted">{t('odrWeeklyNote')}</small>
      {!weeks.length ? (loading ? <div className="empty"><span className="spinner" /></div> : <small>{t('odrWeeklyNone')}</small>) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead><tr><th>{t('region')}</th>{stages.map((s) => <th key={s} style={{ textAlign: 'right' }}>{t(stageKey(s))}</th>)}<th>{t('odrSource')}</th></tr></thead>
            <tbody>
              {weeks.map((w) => (
                <tr key={w.region}>
                  <td>{w.region}<div><small className="muted">{t('odrWeekOf', { from: fmtDay(w.from, lang), to: fmtDay(w.to, lang) })} · {t('odrMarkets', { n: w.markets })}</small></div></td>
                  {stages.map((s) => <td key={s} className="num" style={{ textAlign: 'right' }}>{w[s] ? fmtAr(w[s]!.price) : '—'}</td>)}
                  <td>{w.thread ? <a href={w.thread} target="_blank" rel="noopener noreferrer"><Icon name="download" size={14} /> ODR</a> : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
