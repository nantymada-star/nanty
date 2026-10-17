import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useT } from '../i18n'
import { Icon } from '../components/Icon'
import { Empty, PageHeader, StatusBadge, useOnline } from '../components/ui'
import { db, getKV } from '../lib/db'
import { useSettings } from '../lib/settings'
import { FX_CURRENCIES, latestRates, syncFx, syncFxHistory } from '../lib/fx'
import { currentOfficial, ensureOfficialSeeds, OFFICIAL_PRESETS, OFFICIAL_SEEDS, officialIsStale, presetOf } from '../lib/official'
import { useAuth } from '../lib/auth'
import { errText, supabase } from '../lib/supabase'
import { useServer } from '../lib/useServer'
import { importRtfp, itemLabel, latestByMarket } from '../lib/rtfp'
import { commodityLabel } from '../lib/commodities'
import { fmtAr, fmtDateTime, fmtDay, fmtMonth, fmtNum, MONTHS_SHORT } from '../lib/format'

type Tab = 'fx' | 'official' | 'wb'

export default function Enrich() {
  const { t } = useT()
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as Tab) || 'fx'
  useEffect(() => { ensureOfficialSeeds().catch(() => {}) }, [])
  return (
    <div className="stack">
      <PageHeader title={t('enrichTitle')} />
      <small>{t('enrichIntro')}</small>
      <div className="chips" role="tablist">
        {([['fx', 'tabFx'], ['official', 'tabOfficial'], ['wb', 'tabWb']] as const).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={`chip ${tab === k ? 'on' : ''}`} onClick={() => setParams({ tab: k }, { replace: true })}>{t(l)}</button>
        ))}
      </div>
      {tab === 'fx' && <FxTab />}
      {tab === 'official' && <OfficialTab />}
      {tab === 'wb' && <WbTab />}
    </div>
  )
}

function FxTab() {
  const { t, lang } = useT()
  const online = useOnline()
  const rates = useLiveQuery(() => db.fxRates.toArray(), []) ?? []
  const lastSuccess = useLiveQuery(() => getKV<string | null>('fx:lastSuccess', null), [rates.length])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [hist, setHist] = useState<string>('USD')
  const latest = latestRates(rates)
  const series = rates.filter((r) => r.base === hist && r.provider === 'blended').sort((a, b) => a.date.localeCompare(b.date)).slice(-13)

  const refresh = async () => {
    setBusy(true); setErr('')
    try {
      const r = await syncFx()
      if (r.errors.length && !r.saved) setErr(r.errors.join(' — '))
      await syncFxHistory(hist).catch(() => {})
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }
  useEffect(() => {
    if (!rates.length && online) refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    if (online && !rates.some((r) => r.base === hist && r.provider === 'blended')) syncFxHistory(hist).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hist])

  return (
    <div className="stack">
      <div className="card stack">
        <div className="row between">
          <small>{lastSuccess ? `${t('lastSync')} : ${fmtDateTime(lastSuccess, lang)}` : t('neverSynced')}</small>
          <button className="btn small secondary" onClick={refresh} disabled={busy || !online}>{busy ? <span className="spinner" /> : <Icon name="refresh" size={16} />}</button>
        </div>
        {err && <div className="banner err">{t('error')} : {err}</div>}
        {latest.size === 0 ? <Empty icon="globe">{busy ? t('loading') : t('noData')}</Empty> : (
          <table className="table">
            <tbody>
              {FX_CURRENCIES.filter((c) => latest.has(c)).map((c) => {
                const r = latest.get(c)!
                return (
                  <tr key={c}>
                    <td><b>1 {c}</b></td>
                    <td className="num" style={{ textAlign: 'right' }}><b className="price" style={{ fontSize: 16 }}>{fmtNum(r.rate, 2)} Ar</b></td>
                    <td style={{ textAlign: 'right' }}><small>{fmtDay(r.date, lang)}<br />{r.provider === 'BFM' ? 'BFM (MID)' : t('fxBlended')}</small></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
        <small>{t('fxNote')}</small>
      </div>
      <div className="card">
        <div className="row between" style={{ marginBottom: 6 }}>
          <h2>{t('fxHistory')}</h2>
          <select value={hist} onChange={(e) => setHist(e.target.value)} style={{ width: 'auto' }} aria-label="devise">
            {FX_CURRENCIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        {series.length > 1 ? (
          <div style={{ width: '100%', height: 200 }}>
            <ResponsiveContainer>
              <LineChart data={series.map((r) => ({ d: r.date, v: r.rate }))}>
                <CartesianGrid stroke="var(--line)" vertical={false} />
                <XAxis dataKey="d" tickFormatter={(d: string) => `${MONTHS_SHORT[lang][Number(d.slice(5, 7)) - 1]} ${d.slice(2, 4)}`} tick={{ fontSize: 11, fill: 'var(--muted)' }} minTickGap={20} />
                <YAxis domain={['auto', 'auto']} tickFormatter={(v: number) => fmtNum(v)} tick={{ fontSize: 11, fill: 'var(--muted)' }} width={52} />
                <Tooltip formatter={(v: number) => [`${fmtNum(v, 2)} Ar`, `1 ${hist}`]} labelFormatter={(d: string) => fmtMonth(d, lang)} contentStyle={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 10 }} />
                <Line dataKey="v" stroke="var(--blue)" strokeWidth={2} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : <small>{t('notEnough')}</small>}
        <small>Frankfurter · {t('fxBlended')}</small>
      </div>
    </div>
  )
}

function OfficialTab() {
  const { t, lang } = useT()
  const s = useSettings()
  const local = useLiveQuery(() => db.officialPrices.toArray(), []) ?? []
  const { session, isStaff } = useAuth()
  // Prix officiels partagés (saisis par le staff) ; repli sur les valeurs locales si la base est vide
  const { data: shared, reload: reloadShared } = useServer<{ id: number; key: string; label: string; unit: string; price: number; area: string; effective_from: string; source_type: 'official' | 'press'; source_name: string; source_url: string; entered_at: string }[]>(
    () => (supabase ? supabase.from('official_prices').select('*') : null), [], ['official_prices'])
  const all = shared?.length
    ? shared.map((p) => ({ id: p.id, key: p.key, label: p.label, unit: p.unit, price: Number(p.price), area: p.area, effectiveFrom: p.effective_from, sourceType: p.source_type, sourceName: p.source_name, sourceUrl: p.source_url, enteredAt: p.entered_at, enteredBy: '' }))
    : local
  const cur = currentOfficial(all).sort((a, b) => a.key.localeCompare(b.key) || a.area.localeCompare(b.area))
  const [f, setF] = useState({ key: OFFICIAL_PRESETS[0].key, price: '', area: '', effectiveFrom: new Date().toISOString().slice(0, 10), sourceType: 'official' as 'official' | 'press', sourceName: '', sourceUrl: '' })
  const [msg, setMsg] = useState('')
  const name = (key: string) => { const p = presetOf(key); return p ? (lang === 'mg' ? p.mg : p.fr) : key }

  const add = async () => {
    const p = presetOf(f.key)
    const price = Number(f.price)
    if (!p || !(price > 0) || !f.effectiveFrom || !f.sourceName.trim()) { setMsg(t('invalid')); return }
    if (f.sourceUrl && !/^https:\/\//.test(f.sourceUrl)) { setMsg(t('invalid')); return }
    if (session && isStaff && supabase) {
      const { error } = await supabase.from('official_prices').insert({
        key: p.key, label: p.fr, unit: p.unit, price, area: f.area.trim(), effective_from: f.effectiveFrom,
        source_type: f.sourceType, source_name: f.sourceName.trim(), source_url: f.sourceUrl.trim(),
      })
      if (error) { setMsg(errText(error)); return }
      // Première saisie partagée : publie aussi les valeurs initiales sourcées pour garder l'historique
      if (!shared?.length) {
        await supabase.from('official_prices').insert(OFFICIAL_SEEDS.map((x) => ({ key: x.key, label: x.label, unit: x.unit, price: x.price, area: x.area, effective_from: x.effectiveFrom, source_type: x.sourceType, source_name: x.sourceName, source_url: x.sourceUrl })))
      }
      setMsg(t('saved')); setF({ ...f, price: '' }); reloadShared()
      return
    }
    await db.officialPrices.add({
      key: p.key, label: p.fr, unit: p.unit, price, area: f.area.trim(), effectiveFrom: f.effectiveFrom,
      sourceType: f.sourceType, sourceName: f.sourceName.trim(), sourceUrl: f.sourceUrl.trim(),
      enteredAt: new Date().toISOString(), enteredBy: s.displayName || t('roleAdmin'),
    })
    setMsg(t('saved')); setF({ ...f, price: '' })
  }

  return (
    <div className="stack">
      <small>{t('officialNote')}</small>
      <div className="card" style={{ paddingBlock: 0 }}>
        {cur.length === 0 ? <Empty icon="shield">{t('noOfficial')}</Empty> : (
          <ul className="list">
            {cur.map((p) => {
              const stale = officialIsStale(p)
              const history = all.filter((x) => x.key === p.key && x.area === p.area && x.id !== p.id).sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))
              return (
                <li key={p.id}>
                  <div className="row between" style={{ alignItems: 'flex-start' }}>
                    <div style={{ minWidth: 0 }}>
                      <b>{name(p.key)}</b>{p.area && <small> · {p.area}</small>}
                      <div className="row wrap" style={{ gap: 6, fontSize: 12.5 }}>
                        {stale ? <StatusBadge status="stale" /> : <span className={`badge ${p.sourceType === 'official' ? 'b-verified' : 'b-declared'}`}>{p.sourceType === 'official' ? t('officialBadge') : t('pressBadge')}</span>}
                        <span className="muted">{t('effectiveFrom')} {p.effectiveFrom.length === 7 ? fmtMonth(p.effectiveFrom, lang) : fmtDay(p.effectiveFrom, lang)}</span>
                      </div>
                      <small>{t('source')} : {p.sourceUrl ? <a href={p.sourceUrl} target="_blank" rel="noreferrer">{p.sourceName}</a> : p.sourceName}</small>
                      {history.length > 0 && <div><small className="muted">{history.slice(0, 3).map((h) => `${fmtAr(h.price)} (${h.effectiveFrom})`).join(' · ')}</small></div>}
                    </div>
                    <div style={{ textAlign: 'right', flex: 'none' }}>
                      <div className="price num">{fmtAr(p.price)}</div>
                      <small>/ {p.unit === 'L' ? (lang === 'mg' ? 'litatra' : 'litre') : p.unit}</small>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
      <small>{t('officialStaleNote')} ODR : <a href="https://www.miasa.gov.mg" target="_blank" rel="noreferrer">miasa.gov.mg</a></small>

      {s.role === 'admin' ? (
        <div className="card stack">
          <h2>{t('addOfficial')}</h2>
          <label className="field"><span>{t('product')}</span>
            <select value={f.key} onChange={(e) => setF({ ...f, key: e.target.value })}>
              {OFFICIAL_PRESETS.map((p) => <option key={p.key} value={p.key}>{lang === 'mg' ? p.mg : p.fr} ({p.unit})</option>)}
            </select>
          </label>
          <div className="grid2">
            <label className="field"><span>{t('amount')}</span><input type="number" min={1} value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} /></label>
            <label className="field"><span>{t('effectiveFrom')}</span><input type="date" value={f.effectiveFrom} onChange={(e) => setF({ ...f, effectiveFrom: e.target.value })} /></label>
            <label className="field"><span>{t('area')}</span><input value={f.area} onChange={(e) => setF({ ...f, area: e.target.value })} placeholder="Antananarivo Renivohitra" /></label>
            <label className="field"><span>{t('sourceKind')}</span>
              <select value={f.sourceType} onChange={(e) => setF({ ...f, sourceType: e.target.value as 'official' | 'press' })}>
                <option value="official">{t('officialBadge')}</option><option value="press">{t('pressBadge')}</option>
              </select>
            </label>
            <label className="field"><span>{t('source')}</span><input value={f.sourceName} onChange={(e) => setF({ ...f, sourceName: e.target.value })} placeholder="OMH, Bulletin ODR n°…" /></label>
            <label className="field"><span>{t('sourceUrl')}</span><input type="url" value={f.sourceUrl} onChange={(e) => setF({ ...f, sourceUrl: e.target.value })} placeholder="https://…" /></label>
          </div>
          <button className="btn orange" onClick={add}><Icon name="plus" size={18} /> {t('add')}</button>
          {msg && <small>{msg}</small>}
        </div>
      ) : <small>{t('addOfficial')} : {t('adminOnly')}</small>}
    </div>
  )
}

function WbTab() {
  const { t, lang } = useT()
  const s = useSettings()
  const count = useLiveQuery(() => db.estimates.count(), []) ?? 0
  const items = useLiveQuery(async () => [...new Set(await db.estimates.orderBy('item').uniqueKeys())] as string[], [count]) ?? []
  const [item, setItem] = useState('')
  const cur = item || (items.includes('rice') ? 'rice' : items[0]) || ''
  const rows = useLiveQuery(() => (cur ? db.estimates.where('item').equals(cur).toArray() : []), [cur, count]) ?? []
  const latest = useMemo(() => latestByMarket(rows, cur), [rows, cur])
  const [years, setYears] = useState(4)
  const [busy, setBusy] = useState(false)
  const [prog, setProg] = useState('')
  const [err, setErr] = useState('')

  const onFile = async (file: File | undefined) => {
    if (!file) return
    setBusy(true); setErr(''); setProg('')
    try {
      const text = await file.text()
      const r = await importRtfp(text, file.name, years, (l, n) => setProg(`${fmtNum(l)} / ${fmtNum(n)}`))
      setProg(`${fmtNum(r.saved)} ${t('wbImported')} · ${r.items.length} ${t('products')}`)
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }

  return (
    <div className="stack">
      <div className="banner info"><Icon name="chart" /> <div>{t('wbNote')}</div></div>
      {count === 0 ? <div className="card"><Empty icon="chart">{t('wbEmpty')}</Empty></div> : (
        <>
          <select value={cur} onChange={(e) => setItem(e.target.value)} aria-label={t('product')}>
            {items.map((i) => <option key={i} value={i}>{commodityLabel(itemLabel(i), lang) !== itemLabel(i) ? `${commodityLabel(itemLabel(i), lang)} (${itemLabel(i)})` : itemLabel(i)}</option>)}
          </select>
          <small>{latest.length} {t('wbMarkets')} · {t('wbUnit')}</small>
          <div className="card" style={{ paddingBlock: 0 }}>
            <ul className="list">
              {latest.slice(0, 200).map((e) => (
                <li key={e.id} className="row between">
                  <div style={{ minWidth: 0 }}>
                    <b>{e.market}</b> <small>· {e.admin1}</small>
                    <div className="row wrap" style={{ gap: 6, fontSize: 12.5 }}>
                      <StatusBadge status="estimated" />
                      <span className="muted">{fmtMonth(e.date, lang)}</span>
                      {e.trust != null && <span className="muted">· {t('trust')} {fmtNum(e.trust, 1)}</span>}
                    </div>
                    {e.low != null && e.high != null && <small>{t('rangeLabel')} : {fmtAr(e.low)} – {fmtAr(e.high)}</small>}
                  </div>
                  <div className="price num">{fmtAr(e.price)}</div>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
      {s.role === 'admin' ? (
        <div className="card stack">
          <h2>{t('wbImport')}</h2>
          <small>{t('wbHowTo')} <a href="https://microdata.worldbank.org/catalog/8240" target="_blank" rel="noreferrer">microdata.worldbank.org/catalog/8240</a></small>
          <label className="field"><span>{t('wbYears')}</span><input type="number" min={1} max={20} value={years} onChange={(e) => setYears(Math.min(20, Math.max(1, Number(e.target.value) || 4)))} /></label>
          <input type="file" accept=".csv,text/csv" disabled={busy} onChange={(e) => onFile(e.target.files?.[0])} aria-label={t('wbImport')} />
          {busy && <div><span className="spinner" /> {prog}</div>}
          {!busy && prog && <div className="banner ok"><Icon name="check" /> {prog}</div>}
          {err && <div className="banner err">{err}</div>}
          {count > 0 && <button className="btn small danger" onClick={() => confirm(t('clearData') + ' ?') && db.estimates.clear()}><Icon name="trash" size={14} /> {t('del')}</button>}
        </div>
      ) : <small>{t('wbImport')} : {t('adminOnly')}</small>}
    </div>
  )
}
