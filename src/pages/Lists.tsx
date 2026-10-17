import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useT } from '../i18n'
import { Icon } from '../components/Icon'
import { Empty, PageHeader } from '../components/ui'
import { useAuth } from '../lib/auth'
import { useData } from '../lib/data'
import { errText, supabase } from '../lib/supabase'
import { useServer } from '../lib/useServer'
import { commodityLabel, unitLabel } from '../lib/commodities'
import { fmtAr } from '../lib/format'
import { median } from '../lib/stats'

interface Item { name: string; code?: string; qty: number; unit: string; done?: boolean }
interface List { id: string; name: string; items: Item[]; updated_at: string }

/** Listes de courses enregistrées sur le compte, avec un total estimé à partir des prix WFP médians. */
export default function Lists() {
  const { t, lang } = useT()
  const { session } = useAuth()
  const { commodities, seriesList } = useData()
  const { data, reload } = useServer<List[]>(() => (session && supabase ? supabase.from('shopping_lists').select('*').order('updated_at', { ascending: false }) : null), [session?.user.id])
  const [name, setName] = useState('')
  const [err, setErr] = useState('')

  if (!session) return <div className="stack"><PageHeader title={t('lists')} /><div className="banner info">{t('needLogin')} <Link className="btn small" to="/kaonty">{t('login')}</Link></div></div>

  const priceOf = (code?: string, unit?: string) => {
    if (!code) return null
    const xs = seriesList.filter((s) => s.latest.commodityCode === code && s.latest.unit === unit && s.latest.priceType === 'Retail').map((s) => s.latest.price)
    return median(xs)
  }
  const save = async (l: List, items: Item[]) => {
    const { error } = await supabase!.from('shopping_lists').update({ items, updated_at: new Date().toISOString() }).eq('id', l.id)
    if (error) setErr(errText(error)); else reload()
  }

  return (
    <div className="stack">
      <PageHeader title={t('lists')} />
      <small>{t('listsNote')}</small>
      <form className="row" onSubmit={async (e) => {
        e.preventDefault()
        if (!name.trim()) return
        const { error } = await supabase!.from('shopping_lists').insert({ name: name.trim() })
        if (error) setErr(errText(error)); else { setName(''); reload() }
      }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('newList')} maxLength={80} />
        <button className="btn"><Icon name="plus" size={16} /> {t('add')}</button>
      </form>
      {err && <div className="banner err">{err}</div>}
      {!data?.length ? <Empty icon="edit">{t('noLists')}</Empty> : data.map((l) => {
        const total = l.items.reduce((s, it) => s + (priceOf(it.code, it.unit) ?? 0) * it.qty, 0)
        return (
          <div key={l.id} className="card stack">
            <div className="row between"><h2>{l.name}</h2>
              <button className="btn small danger" aria-label={t('del')} onClick={async () => { await supabase!.from('shopping_lists').delete().eq('id', l.id); reload() }}><Icon name="trash" size={14} /></button>
            </div>
            <ul className="list">
              {l.items.map((it, i) => {
                const p = priceOf(it.code, it.unit)
                return (
                  <li key={i} className="row between">
                    <label className="row" style={{ gap: 8 }}>
                      <input type="checkbox" checked={!!it.done} onChange={() => save(l, l.items.map((x, j) => (j === i ? { ...x, done: !x.done } : x)))} />
                      <span style={{ textDecoration: it.done ? 'line-through' : 'none' }}>{it.qty} {unitLabel(it.unit, lang)} · {it.name}</span>
                    </label>
                    <span className="row">
                      {p != null && <small className="num">≈ {fmtAr(p * it.qty)}</small>}
                      <button className="btn small ghost" aria-label={t('del')} onClick={() => save(l, l.items.filter((_, j) => j !== i))}><Icon name="x" size={12} /></button>
                    </span>
                  </li>
                )
              })}
            </ul>
            <AddItem onAdd={(it) => save(l, [...l.items, it])} commodities={commodities.map((c) => ({ code: c.code, label: commodityLabel(c.name, lang), unit: c.units[0] }))} />
            {total > 0 && <div className="row between"><span>{t('estTotal')} <span className="badge b-estimated">{t('stEstimated')}</span></span><b className="price num">{fmtAr(total)}</b></div>}
          </div>
        )
      })}
    </div>
  )
}

function AddItem({ onAdd, commodities }: { onAdd: (it: Item) => void; commodities: { code: string; label: string; unit: string }[] }) {
  const { t } = useT()
  const [code, setCode] = useState('')
  const [free, setFree] = useState('')
  const [qty, setQty] = useState('1')
  return (
    <div className="row wrap">
      <select value={code} onChange={(e) => setCode(e.target.value)} style={{ flex: '2 1 150px' }} aria-label={t('product')}>
        <option value="">— {t('otherShop')} —</option>
        {commodities.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
      </select>
      {!code && <input value={free} onChange={(e) => setFree(e.target.value)} placeholder={t('productName')} style={{ flex: '2 1 120px' }} maxLength={80} />}
      <input type="number" min={0.1} step="any" value={qty} onChange={(e) => setQty(e.target.value)} style={{ flex: '1 1 70px' }} aria-label={t('quantity')} />
      <button className="btn small secondary" onClick={() => {
        const c = commodities.find((x) => x.code === code)
        const n = Number(qty)
        if (!(n > 0) || (!c && !free.trim())) return
        onAdd({ name: c ? c.label : free.trim(), code: c?.code, unit: c?.unit ?? '', qty: n })
        setFree(''); setQty('1')
      }}><Icon name="plus" size={14} /> {t('addItem')}</button>
    </div>
  )
}
