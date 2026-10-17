import { Link } from 'react-router-dom'
import { useT } from '../i18n'
import { Icon } from '../components/Icon'
import { Empty, PageHeader } from '../components/ui'
import { useAuth } from '../lib/auth'
import { supabase, type QuoteRequest } from '../lib/supabase'
import { useServer } from '../lib/useServer'
import { fmtDateTime } from '../lib/format'

export function QuoteStatus({ s }: { s: QuoteRequest['status'] }) {
  const { t } = useT()
  const m = { open: ['b-declared', 'qOpen'], answered: ['b-verified', 'qAnswered'], closed: ['b-stale', 'qClosed'] } as const
  return <span className={`badge ${m[s][0]}`}>{t(m[s][1])}</span>
}

/** « Ny fangatahako » : demandes de devis envoyées par l'utilisateur, avec les réponses en direct. */
export default function Quotes() {
  const { t, lang } = useT()
  const { session } = useAuth()
  const { data } = useServer<QuoteRequest[]>(
    () => (session && supabase ? supabase.from('quote_requests').select('*, businesses(name)').eq('requester_id', session.user.id).order('created_at', { ascending: false }) : null),
    [session?.user.id], ['quote_requests'],
  )
  if (!session) return <div className="stack"><PageHeader title={t('myQuotes')} /><div className="banner info">{t('needLogin')} <Link className="btn small" to="/kaonty">{t('login')}</Link></div></div>
  return (
    <div className="stack">
      <PageHeader title={t('myQuotes')} />
      <div className="card" style={{ paddingBlock: 0 }}>
        {!data?.length ? <Empty icon="store">{t('noQuotes')}</Empty> : (
          <ul className="list">
            {data.map((q) => (
              <li key={q.id} className="stack">
                <div className="row between"><b>{q.product}{q.quantity ? ` · ${q.quantity}` : ''}</b><QuoteStatus s={q.status} /></div>
                <small>{q.businesses?.name} · {fmtDateTime(q.created_at, lang)}</small>
                {q.message && <div style={{ fontSize: 14 }}>{q.message}</div>}
                {q.reply && <div className="banner ok"><Icon name="check" /> <div><b>{t('reply')}</b> ({q.replied_at ? fmtDateTime(q.replied_at, lang) : ''}) : {q.reply}</div></div>}
                {q.status !== 'closed' && (
                  <button className="btn small ghost" onClick={() => supabase!.from('quote_requests').update({ status: 'closed' }).eq('id', q.id)}>{t('closeQuote')}</button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
