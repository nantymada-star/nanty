import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useT } from '../i18n'
import { Icon } from '../components/Icon'
import { Empty, PageHeader } from '../components/ui'
import { OdrChain, OdrWeekly, OfficialBadge } from '../components/Odr'
import { supabase } from '../lib/supabase'
import { useServer } from '../lib/useServer'
import { fmtAr, fmtMonth, fmtPct } from '../lib/format'
import { latest, ODR_PRODUCTS, ODR_STAGES, productKey, stageKey, type OdrRow } from '../lib/odr'

const COLORS: Record<string, string> = { producteur: 'var(--green2)', grossiste: 'var(--orange)', detaillant: 'var(--blue)' }

/** « Vidiny ofisialy » : prix officiels du riz (Observatoire du Riz), par étape de la filière, région et district. */
export default function Official() {
  const { t, lang } = useT()
  const [params, setParams] = useSearchParams()
  const product = (ODR_PRODUCTS as readonly string[]).includes(params.get('p') ?? '') ? params.get('p')! : 'riz_local'
  const level = params.get('l') === 'district' ? 'district' : 'region'
  const set = (k: string, v: string) => { const n = new URLSearchParams(params); n.set(k, v); setParams(n, { replace: true }) }

  const { data, loading, error } = useServer<OdrRow[]>(
    () => supabase?.from('odr_prices').select('*').eq('product', product).order('period_start').limit(5000) ?? null, [product], ['odr_prices'])
  const rows = data ?? []
  const l = latest(rows)
  const stages = product === 'paddy' ? (['producteur'] as const) : product === 'riz_importe' ? (['grossiste', 'detaillant'] as const) : ODR_STAGES

  // Historique national par étape
  const history = useMemo(() => {
    const m = new Map<string, Record<string, number | string>>()
    for (const r of rows) if (r.level === 'national') {
      const o = m.get(r.period_start) ?? { p: r.period_start }
      o[r.stage] = Number(r.price)
      m.set(r.period_start, o)
    }
    return [...m.values()].sort((a, b) => String(a.p).localeCompare(String(b.p)))
  }, [rows])

  const areas = useMemo(() => {
    const m = new Map<string, { area: string; region: string | null; v: Record<string, OdrRow> }>()
    for (const r of l.rows) if (r.level === level) {
      const o = m.get(r.area) ?? { area: r.area, region: r.region, v: {} }
      o.v[r.stage] = r
      m.set(r.area, o)
    }
    return [...m.values()].sort((a, b) => a.area.localeCompare(b.area))
  }, [l.rows, level])

  const bulletin = l.rows[0]

  return (
    <div className="stack">
      <PageHeader title={t('odrTitle')} />
      <div className="banner info"><Icon name="shield" /> <small>{t('odrNote')}</small></div>
      <div className="chips" role="tablist">
        {ODR_PRODUCTS.map((p) => <button key={p} role="tab" aria-selected={product === p} className={`chip ${product === p ? 'on' : ''}`} onClick={() => set('p', p)}>{t(productKey(p))}</button>)}
      </div>
      {error && <div className="banner err">{error}</div>}
      <OdrWeekly product={product} />
      {!rows.length ? (loading ? <div className="empty"><span className="spinner" /></div> : <Empty icon="shield">{t('odrNoData')}</Empty>) : <>
        <div className="card stack">
          <div className="row between wrap">
            <h2>{t('odrNational')} · {fmtMonth(l.period, lang)}</h2>
            <OfficialBadge />
          </div>
          <OdrChain rows={l.rows} product={product} area="Madagascar" />
          {bulletin && <a className="btn small ghost" href={bulletin.bulletin_url} target="_blank" rel="noopener noreferrer"><Icon name="download" size={14} /> {t('odrBulletin')} n°{bulletin.bulletin_no ?? '?'} (PDF)</a>}
        </div>

        {history.length > 1 && (
          <div className="card" style={{ height: 240 }} aria-label={t('priceHistory')}>
            <ResponsiveContainer>
              <LineChart data={history}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
                <XAxis dataKey="p" tickFormatter={(v) => fmtMonth(String(v), lang)} fontSize={10} />
                <YAxis fontSize={10} width={46} domain={['auto', 'auto']} />
                <Tooltip formatter={(v) => fmtAr(Number(v))} labelFormatter={(v) => fmtMonth(String(v), lang)} />
                <Legend formatter={(v) => t(stageKey(String(v)))} />
                {stages.map((s) => <Line key={s} dataKey={s} stroke={COLORS[s]} dot={false} strokeWidth={2} connectNulls />)}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        <div className="chips" role="tablist">
          <button role="tab" aria-selected={level === 'region'} className={`chip ${level === 'region' ? 'on' : ''}`} onClick={() => set('l', 'region')}>{t('odrRegions')}</button>
          <button role="tab" aria-selected={level === 'district'} className={`chip ${level === 'district' ? 'on' : ''}`} onClick={() => set('l', 'district')}>{t('odrDistricts')}</button>
        </div>
        <div className="card" style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead><tr><th>{level === 'region' ? t('region') : t('odrDistricts')}</th>{stages.map((s) => <th key={s} style={{ textAlign: 'right' }}>{t(stageKey(s))}</th>)}</tr></thead>
            <tbody>
              {areas.map((a) => (
                <tr key={a.area}>
                  <td>{a.area}{level === 'district' && a.region ? <small className="muted"> · {a.region}</small> : null}</td>
                  {stages.map((s) => {
                    const r = a.v[s]
                    return <td key={s} className="num" style={{ textAlign: 'right' }}>
                      {r ? fmtAr(Number(r.price)) : '—'}
                      {r?.change_pct != null && <div><small className={Number(r.change_pct) > 0 ? 'up' : Number(r.change_pct) < 0 ? 'down' : 'muted'}>{fmtPct(Number(r.change_pct))}</small></div>}
                    </td>
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>}
    </div>
  )
}
