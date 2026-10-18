import { useEffect, lazy, Suspense } from 'react'
import { BrowserRouter, Link, NavLink, Route, Routes } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { useT } from './i18n'
import { Icon } from './components/Icon'
import { DataProvider, useData } from './lib/data'
import { evaluateSeasonAlerts } from './lib/seasonal'
import { ensureOfficialSeeds } from './lib/official'
import { syncFxIfDue } from './lib/fx'
import { AuthProvider } from './lib/auth'
import { subscribeServerPrices } from './lib/serverSync'
import { db } from './lib/db'
import { useSettings } from './lib/settings'
import { syncIfDue, syncWfp } from './lib/sync'
import { syncOnlineCache } from './lib/onlineCache'
import Home from './pages/Home'
import Onboarding from './pages/Onboarding'

const Compare = lazy(() => import('./pages/Compare'))
const Product = lazy(() => import('./pages/Product'))
const MapPage = lazy(() => import('./pages/MapPage'))
const ShopPage = lazy(() => import('./pages/ShopPage'))
const RoutePage = lazy(() => import('./pages/RoutePage'))
const Regions = lazy(() => import('./pages/Regions'))
const Search = lazy(() => import('./pages/Search'))
const Seasons = lazy(() => import('./pages/Seasons'))
const Simulator = lazy(() => import('./pages/Simulator'))
const Alerts = lazy(() => import('./pages/Alerts'))
const Submit = lazy(() => import('./pages/Submit'))
const Profile = lazy(() => import('./pages/Profile'))
const Merchant = lazy(() => import('./pages/Merchant'))
const Admin = lazy(() => import('./pages/Admin'))
const Privacy = lazy(() => import('./pages/Privacy'))
const History = lazy(() => import('./pages/History'))
const Enrich = lazy(() => import('./pages/Enrich'))
const Account = lazy(() => import('./pages/Account'))
const Lists = lazy(() => import('./pages/Lists'))
const Quotes = lazy(() => import('./pages/Quotes'))
const Online = lazy(() => import('./pages/Online'))

/** Planification : au démarrage, toutes les N minutes, au retour du réseau et au retour sur l'onglet. */
function useAutoSync() {
  const s = useSettings()
  useEffect(() => {
    if (!s.onboarded) return
    const every = Math.max(5, s.autoSyncMinutes)
    syncIfDue(every, 'auto')
    // Prix des boutiques en ligne : copie locale (hors ligne) et alertes, au plus toutes les 6 h
    const onlineCache = () => { syncOnlineCache().catch(() => {}) }
    onlineCache()
    const i = setInterval(() => { syncIfDue(every, 'interval'); onlineCache() }, 60000)
    const online = () => syncWfp('online')
    const vis = () => document.visibilityState === 'visible' && syncIfDue(every, 'visible')
    window.addEventListener('online', online)
    document.addEventListener('visibilitychange', vis)
    return () => {
      clearInterval(i)
      window.removeEventListener('online', online)
      document.removeEventListener('visibilitychange', vis)
    }
  }, [s.onboarded, s.autoSyncMinutes, s.appId, s.hapiMode])
}

function useTheme() {
  const { theme, lang } = useSettings()
  useEffect(() => {
    const el = document.documentElement
    if (theme === 'auto') el.removeAttribute('data-theme')
    else el.setAttribute('data-theme', theme)
    el.lang = lang
  }, [theme, lang])
}

/** Alertes saisonnières : vérifiées quand les prix changent (au plus une fois par mois et par alerte). */
function useSeasonAlerts() {
  const { seriesList, ready } = useData()
  const { lang } = useSettings()
  useEffect(() => {
    if (ready && seriesList.length) evaluateSeasonAlerts(seriesList, lang).catch(() => {})
  }, [ready, seriesList, lang])
}

/** Sources complémentaires : prix officiels initiaux (une fois) et taux de change (toutes les 6 h au plus). */
function useEnrichment() {
  useEffect(() => {
    ensureOfficialSeeds().catch(() => {})
    syncFxIfDue().catch(() => {})
    const i = setInterval(() => syncFxIfDue().catch(() => {}), 30 * 60000)
    return () => clearInterval(i)
  }, [])
}

function Shell() {
  const { t } = useT()
  useSeasonAlerts()
  useEnrichment()
  // Temps réel : nouveaux relevés poussés par la base partagée
  const { dataSource, onboarded } = useSettings()
  useEffect(() => (onboarded && dataSource !== 'hapi' ? subscribeServerPrices() : undefined), [dataSource, onboarded])
  const unread = useLiveQuery(() => db.notifications.filter((n) => !n.read).count(), []) ?? 0
  const nav: [string, string, Parameters<typeof t>[0]][] = [
    ['/', 'home', 'navHome'],
    ['/hitady', 'search', 'navSearch'],
    ['/sarintany', 'map', 'navMap'],
    ['/vanim-potoana', 'calendar', 'navSeasons'],
    ['/kajy', 'calc', 'navSim'],
    ['/fanairana', 'bell', 'navAlerts'],
    ['/mombamomba', 'user', 'navProfile'],
  ]
  return (
    <div className="app">
      <header className="topbar">
        <Link to="/" className="brand" aria-label="MadaPrice">
          <img src="/icon.svg" width={28} height={28} alt="" />
          <span>Mada<b>Price</b></span>
        </Link>
        <span className="spacer" />
        <Link className="icon" to="/hitady" aria-label={t('navSearch')}><Icon name="search" /></Link>
        <Link className="icon" to="/kaonty" aria-label={t('account')}><Icon name="user" /></Link>
        <Link className="icon" to="/fanairana" aria-label={t('notifications')}>
          <Icon name="bell" />
          {unread > 0 && <span className="badge-dot">{unread > 9 ? '9+' : unread}</span>}
        </Link>
      </header>
      <nav className="bottomnav" aria-label="Navigation">
        {nav.map(([to, ic, key]) => (
          <NavLink key={to} to={to} end={to === '/'}>
            <Icon name={ic} />
            <span>{t(key)}</span>
          </NavLink>
        ))}
      </nav>
      <main className="main">
        <Suspense fallback={<div className="empty"><span className="spinner" /> {t('loading')}</div>}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/vidiny" element={<Compare />} />
            <Route path="/vokatra/:code" element={<Product />} />
            <Route path="/sarintany" element={<MapPage />} />
            <Route path="/fivarotana/:type/:id" element={<ShopPage />} />
            <Route path="/dia" element={<RoutePage />} />
            <Route path="/faritra" element={<Regions />} />
            <Route path="/hitady" element={<Search />} />
            <Route path="/vanim-potoana" element={<Seasons />} />
            <Route path="/kajy" element={<Simulator />} />
            <Route path="/fanairana" element={<Alerts />} />
            <Route path="/hanome-vidiny" element={<Submit />} />
            <Route path="/mombamomba" element={<Profile />} />
            <Route path="/mpivarotra" element={<Merchant />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/fiarovana" element={<Privacy />} />
            <Route path="/tantarako" element={<History />} />
            <Route path="/fanampiny" element={<Enrich />} />
            <Route path="/kaonty" element={<Account />} />
            <Route path="/lisitra" element={<Lists />} />
            <Route path="/devis" element={<Quotes />} />
            <Route path="/an-tserasera" element={<Online />} />
            <Route path="*" element={<Home />} />
          </Routes>
        </Suspense>
      </main>
    </div>
  )
}

export default function App() {
  const s = useSettings()
  useTheme()
  useAutoSync()
  return (
    <BrowserRouter>
      <AuthProvider>
        <DataProvider>{s.onboarded ? <Shell /> : <Onboarding />}</DataProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
