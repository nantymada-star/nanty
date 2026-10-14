import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { useT, type MsgKey } from '../i18n'
import { Icon } from '../components/Icon'
import { PageHeader } from '../components/ui'
import { db } from '../lib/db'
import { useData } from '../lib/data'
import { EMPTY_SIM, priceForTarget, scenario, simulate, type Scenario, type SimInput } from '../lib/simulator'
import { commodityLabel, unitLabel } from '../lib/commodities'
import { fmtAr, fmtDateTime, fmtMonth, fmtNum, fmtPct } from '../lib/format'

const ADV: (keyof SimInput)[] = ['handling', 'storage', 'packaging', 'labour', 'taxes', 'commissions', 'financing', 'unsoldPct']
const LABEL: Record<keyof SimInput, MsgKey> = {
  quantity: 'quantity', buyPrice: 'buyPrice', sellPrice: 'sellPrice', lossPct: 'lossPct', unsoldPct: 'unsoldPct',
  transport: 'transport', handling: 'handling', storage: 'storage', packaging: 'packaging', labour: 'labour',
  taxes: 'taxes', commissions: 'commissions', financing: 'financing', other: 'otherCosts',
}

export default function Simulator() {
  const { t, lang } = useT()
  const [params] = useSearchParams()
  const { seriesList } = useData()
  const [inp, setInp] = useState<SimInput>(() => ({ ...EMPTY_SIM, buyPrice: Number(params.get('buy')) || 0 }))
  const [adv, setAdv] = useState(false)
  const [target, setTarget] = useState('')
  const [swing, setSwing] = useState(10)
  const [lossSwing, setLossSwing] = useState(5)
  const [name, setName] = useState('')
  const [savedOk, setSavedOk] = useState(false)
  const sims = useLiveQuery(() => db.simulations.orderBy('createdAt').reverse().toArray(), []) ?? []
  const cParam = params.get('c')
  const unitParam = params.get('unit')
  const [pick, setPick] = useState('')

  const options = useMemo(
    () => seriesList.filter((s) => (!cParam || s.latest.commodityCode === cParam) && (!unitParam || s.latest.unit === unitParam))
      .sort((a, b) => a.latest.commodityName.localeCompare(b.latest.commodityName) || a.latest.marketName.localeCompare(b.latest.marketName)),
    [seriesList, cParam, unitParam],
  )

  const r = simulate(inp)
  const set = (k: keyof SimInput, v: string) => setInp({ ...inp, [k]: v === '' ? 0 : Number(v) })
  const pctOrNa = (v: number | null) => (v == null ? t('notComputable') : fmtPct(v))
  const need = target !== '' ? priceForTarget(inp, Number(target)) : null

  const field = (k: keyof SimInput) => (
    <label className="field" key={k}>
      <span>{t(LABEL[k])}{k.endsWith('Pct') ? '' : k === 'quantity' ? '' : ' (Ar)'}</span>
      <input type="number" inputMode="decimal" min={0} value={inp[k] || ''} onChange={(e) => set(k, e.target.value)} placeholder="0" />
    </label>
  )

  return (
    <div className="stack">
      <PageHeader title={t('simTitle')} back={false} />
      <div className="card stack">
        <label className="field"><span>{t('useLatest')}</span>
          <div className="row">
            <select value={pick} onChange={(e) => setPick(e.target.value)}>
              <option value="">—</option>
              {options.map((s) => (
                <option key={s.key} value={s.key}>{commodityLabel(s.latest.commodityName, lang)} · {s.latest.marketName} · {fmtAr(s.latest.price)}/{unitLabel(s.latest.unit, lang)} ({fmtMonth(s.latest.periodStart, lang)})</option>
              ))}
            </select>
            <button className="btn small secondary" disabled={!pick} onClick={() => { const s = options.find((x) => x.key === pick)!; setInp({ ...inp, buyPrice: s.latest.price }) }}>{lang === 'mg' ? 'Fividianana' : 'Achat'}</button>
            <button className="btn small secondary" disabled={!pick} onClick={() => { const s = options.find((x) => x.key === pick)!; setInp({ ...inp, sellPrice: s.latest.price }) }}>{lang === 'mg' ? 'Fivarotana' : 'Vente'}</button>
          </div>
        </label>
        <div className="chips">
          <button className={`chip ${!adv ? 'on' : ''}`} onClick={() => setAdv(false)}>{lang === 'mg' ? 'Tsotra' : 'Simple'}</button>
          <button className={`chip ${adv ? 'on' : ''}`} onClick={() => setAdv(true)}>{lang === 'mg' ? 'Fanampiny' : 'Avancé'}</button>
        </div>
        <div className="grid2">
          {(['quantity', 'buyPrice', 'sellPrice', 'transport', 'lossPct', 'other'] as (keyof SimInput)[]).map(field)}
          {adv && ADV.map(field)}
        </div>
      </div>

      <div className="card stack" aria-live="polite">
        <div className="grid2">
          <div className="kpi"><div className="v num">{fmtAr(r.purchaseCost)}</div><div className="l">{t('purchaseCost')}</div></div>
          <div className="kpi"><div className="v num">{fmtAr(r.revenue)}</div><div className="l">{t('revenue')} · {t('sold')} {fmtNum(r.soldQty, 1)}</div></div>
          <div className="kpi"><div className="v num">{fmtAr(r.totalCost)}</div><div className="l">{t('totalCost')}</div></div>
          <div className="kpi"><div className={`v num ${r.netProfit >= 0 ? 'down' : 'up'}`}>{fmtAr(r.netProfit)}</div><div className="l">{t('netProfit')}</div></div>
          <div className="kpi"><div className="v num">{pctOrNa(r.marginPct)}</div><div className="l">{t('margin')}</div></div>
          <div className="kpi"><div className="v num">{pctOrNa(r.roiPct)}</div><div className="l">{t('roi')}</div></div>
        </div>
        <div className="row between"><span>{t('breakEven')}</span><b className="num">{r.breakEvenPrice == null ? t('notComputable') : fmtAr(r.breakEvenPrice, 1)}</b></div>
        <div className="row between"><span>{t('sellable')}</span><b className="num">{fmtNum(r.sellableQty, 1)}</b></div>
        <div className="row wrap">
          <label className="field" style={{ flex: 1 }}><span>{t('targetProfit')} (Ar)</span><input type="number" value={target} onChange={(e) => setTarget(e.target.value)} /></label>
          <div style={{ flex: 1 }}><small>{t('priceNeeded')}</small><div className="price num">{target === '' ? '—' : need == null ? t('notComputable') : fmtAr(need, 1)}</div></div>
        </div>
      </div>

      <div className="card stack">
        <h2>{t('scenarios')}</h2>
        <div className="grid2">
          <label className="field"><span>{t('swing')}</span><input type="number" min={0} value={swing} onChange={(e) => setSwing(Number(e.target.value) || 0)} /></label>
          <label className="field"><span>{t('lossPct')} ±</span><input type="number" min={0} value={lossSwing} onChange={(e) => setLossSwing(Number(e.target.value) || 0)} /></label>
        </div>
        <div className="scroll-x">
          <table className="table">
            <thead><tr><th /><th>{t('sellPrice')}</th><th>{t('netProfit')}</th><th>{t('margin')}</th></tr></thead>
            <tbody>
              {(['pessimistic', 'realistic', 'optimistic'] as Scenario[]).map((sc) => {
                const i = scenario(inp, sc, swing, lossSwing)
                const x = simulate(i)
                return (
                  <tr key={sc}>
                    <td><b>{t(sc)}</b></td>
                    <td className="num">{fmtAr(i.sellPrice)}</td>
                    <td className={`num ${x.netProfit >= 0 ? 'down' : 'up'}`}><b>{fmtAr(x.netProfit)}</b></td>
                    <td className="num">{pctOrNa(x.marginPct)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <small>{t('estimateOnly')}</small>
      </div>

      <div className="card stack">
        <h2>{t('mySims')}</h2>
        <div className="row">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={lang === 'mg' ? 'Anarana' : 'Nom'} />
          <button className="btn small" onClick={async () => { await db.simulations.add({ name: name || fmtDateTime(new Date().toISOString(), lang), createdAt: new Date().toISOString(), input: inp }); setSavedOk(true); setName('') }}><Icon name="download" size={16} /> {t('save')}</button>
        </div>
        {savedOk && <small className="down">{t('saved')}</small>}
        <ul className="list">
          {sims.map((s) => (
            <li key={s.id} className="row between">
              <span>{s.name}</span>
              <span className="row">
                <button className="btn small secondary" onClick={() => setInp({ ...EMPTY_SIM, ...(s.input as SimInput) })}>{t('load')}</button>
                <button className="btn small danger" onClick={() => db.simulations.delete(s.id!)} aria-label={t('del')}><Icon name="trash" size={14} /></button>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
