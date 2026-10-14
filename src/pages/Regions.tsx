import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useT } from '../i18n'
import { Icon } from '../components/Icon'
import { Empty, PageHeader, StatusBadge, useFreshness, useOnline } from '../components/ui'
import { useData } from '../lib/data'
import { fetchRoute } from '../lib/geo'
import { haversineKm, median } from '../lib/stats'
import { commodityLabel, priceTypeLabel, unitLabel } from '../lib/commodities'
import { daysBetween, fmtAr, fmtMonth, fmtNum } from '../lib/format'

export default function Regions() {
  const { t, lang } = useT()
  const online = useOnline()
  const fresh = useFreshness()
  const { commodities, seriesList } = useData()
  const [code, setCode] = useState('')
  const c = commodities.find((x) => x.code === code) ?? commodities[0]
  const [unit, setUnit] = useState('')
  const [pt, setPt] = useState('')
  const u = unit && c?.units.includes(unit) ? unit : c?.units[0] ?? ''
  const p = pt && c?.priceTypes.includes(pt) ? pt : c?.priceTypes.includes('Wholesale') ? 'Wholesale' : c?.priceTypes.includes('Retail') ? 'Retail' : c?.priceTypes[0] ?? ''
  const group = useMemo(
    () => seriesList.filter((s) => s.latest.commodityCode === c?.code && s.latest.unit === u && s.latest.priceType === p && s.latest.lat != null),
    [seriesList, c?.code, u, p],
  )
  const [buyKey, setBuyKey] = useState('')
  const buy = group.find((s) => s.key === buyKey) ?? [...group].sort((a, b) => a.latest.price - b.latest.price)[0]
  const [rate, setRate] = useState('')
  const [loss, setLoss] = useState('3')
  const [fees, setFees] = useState('0')
  const [roads, setRoads] = useState<Record<string, number>>({})
  const [busy, setBusy] = useState(false)

  const byRegion = useMemo(() => {
    const m = new Map<string, number[]>()
    for (const s of group) {
      const a = m.get(s.latest.admin1) ?? []
      a.push(s.latest.price)
      m.set(s.latest.admin1, a)
    }
    return [...m.entries()].map(([r, xs]) => ({ r, med: median(xs)!, n: xs.length })).sort((a, b) => a.med - b.med)
  }, [group])

  const rows = useMemo(() => {
    if (!buy) return []
    return group
      .filter((s) => s.key !== buy.key)
      .map((s) => {
        const a = { lat: buy.latest.lat!, lon: buy.latest.lon! }
        const b = { lat: s.latest.lat!, lon: s.latest.lon! }
        const rk = `${buy.latest.marketCode}>${s.latest.marketCode}`
        const road = roads[rk]
        const km = road ?? haversineKm(a, b) * 1.3
        const transport = Number(rate) > 0 ? (Number(rate) * km) / 100 : 0
        const lossF = Math.min(100, Math.max(0, Number(loss) || 0)) / 100
        const net = s.latest.price * (1 - lossF) - buy.latest.price - transport - (Number(fees) || 0)
        const gap = Math.abs(daysBetween(buy.latest.periodStart, s.latest.periodStart))
        return { s, km, road: road != null, transport, net, gap }
      })
      .sort((x, y) => y.net - x.net)
  }, [group, buy, rate, loss, fees, roads])

  const computeRoads = async () => {
    if (!buy) return
    setBusy(true)
    const next = { ...roads }
    for (const r of rows.slice(0, 12)) {
      const rk = `${buy.latest.marketCode}>${r.s.latest.marketCode}`
      if (next[rk] != null) continue
      try {
        const route = await fetchRoute([{ lat: buy.latest.lat!, lon: buy.latest.lon! }, { lat: r.s.latest.lat!, lon: r.s.latest.lon! }])
        next[rk] = route.distanceKm
        setRoads({ ...next })
      } catch {
        /* garde l'estimation */
      }
      await new Promise((res) => setTimeout(res, 400)) // respect du serveur de démonstration OSRM
    }
    setBusy(false)
  }

  if (!commodities.length) return <div><PageHeader title={t('regionsTitle')} /><Empty>{t('noData')}</Empty></div>

  return (
    <div className="stack">
      <PageHeader title={t('regionsTitle')} />
      <div className="card stack">
        <label className="field"><span>{t('product')}</span>
          <select value={c?.code} onChange={(e) => { setCode(e.target.value); setBuyKey(''); setUnit(''); setPt('') }}>
            {commodities.map((x) => <option key={x.code} value={x.code}>{commodityLabel(x.name, lang)}</option>)}
          </select>
        </label>
        <div className="grid2">
          <label className="field"><span>{t('unit')}</span>
            <select value={u} onChange={(e) => { setUnit(e.target.value); setBuyKey('') }}>{c?.units.map((x) => <option key={x} value={x}>{unitLabel(x, lang)}</option>)}</select>
          </label>
          <label className="field"><span>{t('priceType')}</span>
            <select value={p} onChange={(e) => { setPt(e.target.value); setBuyKey('') }}>{c?.priceTypes.map((x) => <option key={x} value={x}>{priceTypeLabel(x, lang)}</option>)}</select>
          </label>
        </div>
      </div>

      <div className="card">
        <h2 style={{ marginBottom: 6 }}>{t('region')} — {t('median')}</h2>
        <table className="table">
          <tbody>
            {byRegion.map((r) => (
              <tr key={r.r}><td>{r.r || '—'}</td><td className="num" style={{ textAlign: 'right' }}><b>{fmtAr(r.med)}</b> <small>/ {unitLabel(u, lang)} · {r.n} {t('markets')}</small></td></tr>
            ))}
          </tbody>
        </table>
      </div>

      {buy && (
        <div className="card stack">
          <label className="field"><span>{t('buyAt')}</span>
            <select value={buy.key} onChange={(e) => setBuyKey(e.target.value)}>
              {[...group].sort((a, b) => a.latest.marketName.localeCompare(b.latest.marketName)).map((s) => (
                <option key={s.key} value={s.key}>{s.latest.marketName} — {fmtAr(s.latest.price)} ({fmtMonth(s.latest.periodStart, lang)})</option>
              ))}
            </select>
          </label>
          <div className="grid3">
            <label className="field"><span>{u === 'kg' ? t('transportRate') : t('transportRate').replace('kg', unitLabel(u, lang))}</span>
              <input type="number" inputMode="decimal" min={0} value={rate} onChange={(e) => setRate(e.target.value)} placeholder="Ar" />
            </label>
            <label className="field"><span>{t('lossRate')}</span><input type="number" min={0} max={100} value={loss} onChange={(e) => setLoss(e.target.value)} /></label>
            <label className="field"><span>{t('feesPerKg').replace('kg', unitLabel(u, lang))}</span><input type="number" min={0} value={fees} onChange={(e) => setFees(e.target.value)} /></label>
          </div>
          {!(Number(rate) > 0) && <div className="banner warn"><Icon name="truck" /> {t('transportMissing')}</div>}
          <button className="btn secondary" onClick={computeRoads} disabled={busy || !online}>{busy ? <span className="spinner" /> : <Icon name="route" size={18} />} {t('computeRoads')}</button>
        </div>
      )}

      {buy && (
        <div className="card" style={{ paddingBlock: 0 }}>
          <ul className="list">
            {rows.map((r) => (
              <li key={r.s.key}>
                <div className="row between" style={{ alignItems: 'flex-start' }}>
                  <div style={{ minWidth: 0 }}>
                    <Link to={`/vokatra/${encodeURIComponent(r.s.latest.commodityCode)}?market=${encodeURIComponent(r.s.latest.marketCode)}&unit=${encodeURIComponent(u)}&pt=${encodeURIComponent(p)}`}><b>{r.s.latest.marketName}</b></Link>
                    <small> · {r.s.latest.admin1}</small>
                    <div className="row wrap" style={{ gap: 6, fontSize: 12.5 }}>
                      <StatusBadge status={fresh(r.s.latest)} />
                      <span className="muted">{t('sellPrice')} : <b className="num">{fmtAr(r.s.latest.price)}</b> ({fmtMonth(r.s.latest.periodStart, lang)})</span>
                    </div>
                    <small className="num">{fmtNum(r.km)} km ({r.road ? 'OSRM' : t('stEstimated')}) · {t('transport')} {fmtAr(r.transport)}</small>
                    {r.gap > 60 && <div><small className="up">⚠ {t('dateGap')}</small></div>}
                  </div>
                  <div style={{ textAlign: 'right', flex: 'none' }}>
                    <small>{t('netPerKg')}</small>
                    <div className={`price num ${r.net >= 0 ? 'down' : 'up'}`} style={{ color: r.net >= 0 ? 'var(--green2)' : 'var(--red)' }}>{fmtAr(r.net)}</div>
                    <small>/ {unitLabel(u, lang)}</small>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      <small>{t('regionsNote')}</small>
    </div>
  )
}
