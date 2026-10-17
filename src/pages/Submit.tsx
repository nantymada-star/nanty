import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { useT } from '../i18n'
import { Icon } from '../components/Icon'
import { PageHeader, StatusBadge } from '../components/ui'
import { db, type Observation } from '../lib/db'
import { useAuth } from '../lib/auth'
import { errText, supabase, type ServerSubmission } from '../lib/supabase'
import { useServer } from '../lib/useServer'
import { useData } from '../lib/data'
import { useSettings } from '../lib/settings'
import { commodityLabel, priceTypeLabel, unitLabel } from '../lib/commodities'
import { fmtAr, fmtDateTime } from '../lib/format'
import { compKey, median } from '../lib/stats'

/** Formulaire de signalement de prix : relevé « Déclaré » soumis à modération, limité à 10 par heure. */
export default function Submit() {
  const { t, lang } = useT()
  const s = useSettings()
  const { commodities, markets, seriesList } = useData()
  const { session } = useAuth()
  const { data: serverMine, reload: reloadServer } = useServer<ServerSubmission[]>(
    () => (session && supabase ? supabase.from('user_submissions').select('*').eq('submitted_by', session.user.id).order('created_at', { ascending: false }).limit(50) : null),
    [session?.user.id], ['user_submissions'],
  )
  const mine = useLiveQuery(() => db.observations.where('source').equals('user').reverse().sortBy('firstSeenAt'), []) ?? []
  const [c, setC] = useState(commodities[0]?.code ?? '')
  const com = commodities.find((x) => x.code === c) ?? commodities[0]
  const [unit, setUnit] = useState('')
  const [pt, setPt] = useState('Retail')
  const [m, setM] = useState('')
  const [price, setPrice] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [note, setNote] = useState('')
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err' | 'warn'; text: string } | null>(null)
  const [confirmFar, setConfirmFar] = useState(false)
  const u = unit && com?.units.includes(unit) ? unit : com?.units[0] ?? 'kg'
  const market = markets.find((x) => x.code === m)

  const submit = async () => {
    const value = Number(price)
    if (!com || !market || !(value > 0) || !date || date > new Date().toISOString().slice(0, 10)) {
      setMsg({ kind: 'err', text: t('invalid') }); return
    }
    const hourAgo = new Date(Date.now() - 3600000).toISOString()
    const recent = mine.filter((o) => o.firstSeenAt > hourAgo).length
    if (recent >= 10) { setMsg({ kind: 'err', text: t('rateLimited') }); return }
    const comparable = seriesList.filter((x) => compKey(x.latest) === compKey({ commodityCode: com.code, unit: u, priceType: pt })).map((x) => x.latest.price)
    const med = median(comparable)
    if (med && (value > med * 3 || value < med / 3) && !confirmFar) {
      setConfirmFar(true)
      setMsg({ kind: 'warn', text: t('farFromMedian', { m: fmtAr(med) }) }); return
    }
    // Connecté : envoi à la base partagée (modération par le staff, visible par tous une fois validé)
    if (session && supabase) {
      const { error } = await supabase.from('user_submissions').insert({
        commodity_code: com.code, commodity_name: com.name, category: com.category, market_code: market.code, market_name: market.name,
        admin1: market.admin1, unit: u, price_type: pt, price: value, observed_on: date, note: note.trim() || null, lat: market.lat, lon: market.lon,
      })
      if (error) { setMsg({ kind: 'err', text: errText(error) }); return }
      setMsg({ kind: 'ok', text: t('sent') }); setPrice(''); setNote(''); setConfirmFar(false); reloadServer()
      return
    }
    const now = new Date().toISOString()
    const o: Observation = {
      id: `user|${crypto.randomUUID()}`, source: 'user', marketCode: market.code, marketName: market.name, admin1: market.admin1, admin2: market.admin2,
      lat: market.lat, lon: market.lon, commodityCode: com.code, commodityName: com.name, category: com.category, unit: u, priceType: pt,
      priceFlag: 'actual', currency: 'MGA', price: value, periodStart: date, periodEnd: date, firstSeenAt: now, lastVerifiedAt: now,
      moderation: 'pending', note: [s.displayName && `par ${s.displayName}`, note].filter(Boolean).join(' — '),
    }
    await db.observations.add(o)
    setMsg({ kind: 'ok', text: t('sent') }); setPrice(''); setNote(''); setConfirmFar(false)
  }

  return (
    <div className="stack">
      <PageHeader title={t('submitTitle')} />
      <div className="banner info"><Icon name="shield" /> <div>{t('submitNote')}</div></div>
      <div className="card stack">
        <label className="field"><span>{t('product')}</span>
          <select value={com?.code ?? ''} onChange={(e) => { setC(e.target.value); setUnit('') }}>
            {commodities.map((x) => <option key={x.code} value={x.code}>{commodityLabel(x.name, lang)}</option>)}
          </select>
        </label>
        <div className="grid2">
          <label className="field"><span>{t('unit')}</span><select value={u} onChange={(e) => setUnit(e.target.value)}>{com?.units.map((x) => <option key={x} value={x}>{unitLabel(x, lang)}</option>)}</select></label>
          <label className="field"><span>{t('priceType')}</span><select value={pt} onChange={(e) => setPt(e.target.value)}>{['Retail', 'Wholesale', 'Producer'].map((x) => <option key={x} value={x}>{priceTypeLabel(x, lang)}</option>)}</select></label>
        </div>
        <label className="field"><span>{t('market')}</span>
          <select value={m} onChange={(e) => setM(e.target.value)}>
            <option value="">—</option>
            {[...markets].sort((a, b) => a.name.localeCompare(b.name)).map((x) => <option key={x.code} value={x.code}>{x.name} ({x.admin1})</option>)}
          </select>
        </label>
        <div className="grid2">
          <label className="field"><span>{t('amount')}</span><input type="number" inputMode="numeric" min={1} value={price} onChange={(e) => { setPrice(e.target.value); setConfirmFar(false) }} /></label>
          <label className="field"><span>{t('date')}</span><input type="date" value={date} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setDate(e.target.value)} /></label>
        </div>
        <label className="field"><span>{t('comment')}</span><textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} /></label>
        {msg && <div className={`banner ${msg.kind === 'ok' ? 'ok' : msg.kind === 'warn' ? 'warn' : 'err'}`}>{msg.text}</div>}
        <button className="btn orange block" onClick={submit}><Icon name="check" size={18} /> {confirmFar ? t('yes') + ' — ' + t('send') : t('send')}</button>
        <small>{lang === 'mg' ? 'Tsy mbola misy mpizara iraisana: ato amin\'ity fitaovana ity no voatahiry ny vidinao ary hamarinin\'ny mpitantana eto.' : 'Pas encore de serveur partagé : votre prix est stocké sur cet appareil et validé par l’administration locale.'} <Link to="/admin">{t('moderation')}</Link></small>
      </div>
      {!session && <div className="banner info"><Icon name="user" /> <div style={{ flex: 1 }}>{t('needLogin')}</div><Link className="btn small" to="/kaonty">{t('login')}</Link></div>}
      {!!serverMine?.length && (
        <div className="card">
          <h2>{lang === 'mg' ? 'Ny vidiny nalefako' : 'Mes prix envoyés'} <span className="badge b-estimated">{t('sharedBadge')}</span></h2>
          <ul className="list">
            {serverMine.map((o) => (
              <li key={o.id} className="row between">
                <div>
                  <b>{commodityLabel(o.commodity_name, lang)}</b> · {o.market_name}
                  <div className="row" style={{ gap: 6 }}>
                    <StatusBadge status={o.status === 'pending' ? 'pending' : o.status === 'approved' ? 'verified' : 'stale'} />
                    {o.status === 'rejected' && <span className="badge b-suspect">{t('reject')}</span>}
                    <small>{fmtDateTime(o.created_at, lang)}</small>
                  </div>
                  {o.moderation_note && <small>{o.moderation_note}</small>}
                </div>
                <div className="price num">{fmtAr(Number(o.price))}</div>
              </li>
            ))}
          </ul>
        </div>
      )}
      {mine.length > 0 && (
        <div className="card">
          <h2>{lang === 'mg' ? 'Ny vidiny nalefako' : 'Mes prix envoyés'}</h2>
          <ul className="list">
            {mine.map((o) => (
              <li key={o.id} className="row between">
                <div><b>{commodityLabel(o.commodityName, lang)}</b> · {o.marketName}<div className="row" style={{ gap: 6 }}><StatusBadge status={o.moderation === 'pending' ? 'pending' : o.moderation === 'approved' ? 'verified' : 'stale'} /><small>{fmtDateTime(o.firstSeenAt, lang)}</small>{o.moderation === 'rejected' && <span className="badge b-suspect">{t('reject')}</span>}</div></div>
                <div className="price num">{fmtAr(o.price)}</div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
