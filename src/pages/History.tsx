import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { useT } from '../i18n'
import { Icon } from '../components/Icon'
import { Empty, PageHeader } from '../components/ui'
import { db } from '../lib/db'
import { fmtAgo } from '../lib/format'

/** « Tantarako » : produits, recherches et commerces consultés sur cet appareil. */
export default function History() {
  const { t, lang } = useT()
  const items = useLiveQuery(() => db.history.orderBy('at').reverse().limit(200).toArray(), [])
  const icon = { product: 'chart', search: 'search', shop: 'store' } as const
  const label = { product: 'hProduct', search: 'hSearch', shop: 'hShop' } as const

  return (
    <div className="stack">
      <PageHeader
        title={t('historyTitle')}
        right={items && items.length > 0 ? (
          <button className="btn small danger" onClick={() => confirm(t('clearHistory') + ' ?') && db.history.clear()}>
            <Icon name="trash" size={14} /> {t('clearHistory')}
          </button>
        ) : undefined}
      />
      <small>{t('localOnly')}</small>
      <div className="card" style={{ paddingBlock: 0 }}>
        {items === undefined ? (
          <div className="empty"><span className="spinner" /></div>
        ) : items.length === 0 ? (
          <Empty icon="refresh">{t('noHistory')}</Empty>
        ) : (
          <ul className="list">
            {items.map((h) => (
              <li key={h.id}>
                <Link className="rowlink" to={h.link}>
                  <span className="thumb" style={{ width: 36, height: 36, color: 'var(--green2)' }}><Icon name={icon[h.kind]} size={18} /></span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.label}</div>
                    <small>{t(label[h.kind])} · {fmtAgo(h.at, lang)}</small>
                  </div>
                  <Icon name="chevron" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
