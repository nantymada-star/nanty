import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { useT } from '../i18n'
import { Icon } from '../components/Icon'
import { Empty, PageHeader, StatusBadge } from '../components/ui'
import { useData } from '../lib/data'
import { db } from '../lib/db'
import { categoryLabel, commodityLabel, matchScore, stripAccents, unitLabel } from '../lib/commodities'
import { fmtAr, fmtDateTime, fmtMonth } from '../lib/format'

type SR = { start: () => void; stop: () => void; lang: string; interimResults: boolean; onresult: (e: { results: { 0: { transcript: string } }[] }) => void; onend: () => void; onerror: (e: { error: string }) => void }

export default function Search() {
  const { t, lang } = useT()
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState(params.get('q') ?? '')
  const [listening, setListening] = useState(false)
  const [voiceErr, setVoiceErr] = useState('')
  const recRef = useRef<SR | null>(null)
  const { commodities, seriesList } = useData()
  const shopPrices = useLiveQuery(() => db.shopPrices.toArray(), []) ?? []

  // Retire les mots de quantité/lieu courants pour garder le produit ("vary 50 kg any Antananarivo")
  const productQuery = q.replace(/\d+\s*(kg|l|gony|sacs?|litatra|litres?)/gi, '').replace(/\b(any|ao|eto|à|a|au|de|du|des|le|la|les|akaiky|mora|indrindra|aiza|no|ahitana|où|acheter|trouve|cherche|tadiavo)\b/gi, ' ').trim()

  const matches = useMemo(() => {
    if (!productQuery) return []
    return commodities
      .map((c) => ({ c, score: matchScore(productQuery, c.name) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || b.c.markets - a.c.markets)
      .slice(0, 12)
      .map(({ c }) => {
        const ss = seriesList.filter((s) => s.latest.commodityCode === c.code && s.latest.priceType === 'Retail')
        const cheapest = [...ss].sort((a, b) => a.latest.price - b.latest.price)[0]
        return { c, cheapest, n: ss.length }
      })
  }, [productQuery, commodities, seriesList])

  const declared = useMemo(() => {
    const k = stripAccents(productQuery)
    if (!k) return []
    return shopPrices.filter((p) => stripAccents(p.product).includes(k)).slice(0, 20)
  }, [productQuery, shopPrices])

  const startVoice = () => {
    const W = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR }
    const Ctor = W.SpeechRecognition ?? W.webkitSpeechRecognition
    if (!Ctor) { setVoiceErr(t('voiceUnsupported')); return }
    const rec = new Ctor()
    // Le malgache n'est pas pris en charge par la plupart des moteurs ; le français reconnaît bien les noms de lieux.
    rec.lang = lang === 'mg' ? 'mg-MG' : 'fr-FR'
    rec.interimResults = false
    rec.onresult = (e) => { const txt = e.results[0][0].transcript; setQ(txt); setParams({ q: txt }, { replace: true }) }
    rec.onend = () => setListening(false)
    rec.onerror = (e) => {
      setListening(false)
      if (e.error === 'language-not-supported' && rec.lang !== 'fr-FR') { rec.lang = 'fr-FR'; setListening(true); rec.start(); return }
      setVoiceErr(`${t('error')} : ${e.error}`)
    }
    recRef.current = rec
    setVoiceErr(''); setListening(true)
    try { rec.start() } catch (e) { setListening(false); setVoiceErr(String(e)) }
  }

  useEffect(() => {
    if (params.get('voice') === '1') startVoice()
    return () => recRef.current?.stop()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="stack">
      <PageHeader title={t('searchTitle')} back={false} />
      <form className="search" onSubmit={(e) => { e.preventDefault(); setParams({ q }, { replace: true }) }}>
        <Icon name="search" />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('searchPh')} aria-label={t('searchPh')} />
        <button type="button" className={`btn small ${listening ? 'orange' : 'secondary'}`} onClick={startVoice} aria-label={t('voice')}><Icon name="mic" size={16} /></button>
      </form>
      {listening && <div className="banner info"><span className="spinner" /> {t('speakNow')}</div>}
      {voiceErr && <div className="banner warn">{voiceErr}</div>}

      {productQuery && (
        <>
          <div className="section-title"><h2>{t('inPrices')}</h2></div>
          <div className="card" style={{ paddingBlock: 0 }}>
            {matches.length === 0 ? <Empty>{t('noResults')}</Empty> : (
              <ul className="list">
                {matches.map(({ c, cheapest, n }) => (
                  <li key={c.code}>
                    <Link className="rowlink" to={`/vidiny?c=${encodeURIComponent(c.code)}`}>
                      <div style={{ flex: 1 }}>
                        <b>{commodityLabel(c.name, lang)}</b> <small>· {categoryLabel(c.category, lang)}</small>
                        <div><small>{n} {t('markets')} · {fmtMonth(c.latest, lang)}</small></div>
                      </div>
                      {cheapest && (
                        <div style={{ textAlign: 'right' }}>
                          <small>{t('sortCheap')}</small>
                          <div className="price num">{fmtAr(cheapest.latest.price)}</div>
                          <small>/ {unitLabel(cheapest.latest.unit, lang)} · {cheapest.latest.marketName}</small>
                        </div>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {declared.length > 0 && (
            <>
              <div className="section-title"><h2>{t('declaredPrices')}</h2></div>
              <div className="card" style={{ paddingBlock: 0 }}>
                <ul className="list">
                  {declared.map((p) => (
                    <li key={p.id}>
                      <Link className="rowlink" to={`/fivarotana/${p.shopId}`}>
                        <div style={{ flex: 1 }}><b>{p.product}</b> · {p.shopName}<div className="row" style={{ gap: 6 }}><StatusBadge status="declared" /><small>{fmtDateTime(p.declaredAt, lang)}</small></div></div>
                        <div className="price num">{fmtAr(p.price)}<small>/{p.unit}</small></div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}

          <div className="section-title"><h2>{t('inShops')}</h2></div>
          <Link className="btn block" to={`/sarintany?q=${encodeURIComponent(productQuery)}`}><Icon name="store" size={18} /> {t('searchShops')}</Link>
          <small>{t('maySell')}. {t('stockUnknown')}.</small>
        </>
      )}

      {!productQuery && (
        <div className="card stack">
          <small>{lang === 'mg' ? 'Ohatra:' : 'Exemples :'}</small>
          <div className="chips" style={{ flexWrap: 'wrap' }}>
            {['vary', 'katsaka', 'mangahazo', 'menaka', 'siramamy', 'tsaramaso', 'lasantsy', 'ciment'].map((x) => (
              <button key={x} className="chip" onClick={() => { setQ(x); setParams({ q: x }, { replace: true }) }}>{x}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
