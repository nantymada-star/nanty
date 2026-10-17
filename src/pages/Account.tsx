import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useT } from '../i18n'
import { Icon } from '../components/Icon'
import { PageHeader } from '../components/ui'
import { useAuth } from '../lib/auth'
import { errText, supabase } from '../lib/supabase'

type Mode = 'login' | 'signup' | 'forgot' | 'reset'

/** Connexion, inscription, mot de passe oublié et nouveau mot de passe (lien reçu par e-mail). */
export default function Account() {
  const { t } = useT()
  const { session, profile, signOut, refreshProfile } = useAuth()
  const [params] = useSearchParams()
  const [mode, setMode] = useState<Mode>(params.get('mode') === 'reset' ? 'reset' : 'login')
  const [email, setEmail] = useState('')
  const [pwd, setPwd] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    // Le lien de récupération ouvre une session « PASSWORD_RECOVERY »
    const sub = supabase?.auth.onAuthStateChange((e) => { if (e === 'PASSWORD_RECOVERY') setMode('reset') })
    return () => sub?.data.subscription.unsubscribe()
  }, [])

  const run = async (fn: () => Promise<{ error: unknown }>, okText?: string) => {
    setBusy(true); setMsg(null)
    try {
      const { error } = await fn()
      if (error) setMsg({ ok: false, text: errText(error) })
      else if (okText) setMsg({ ok: true, text: okText })
    } finally { setBusy(false) }
  }
  const redirect = `${location.origin}/kaonty?mode=reset`

  if (!supabase) return <div className="empty">{t('error')}</div>

  if (session && mode !== 'reset') {
    return (
      <div className="stack">
        <PageHeader title={t('account')} />
        <div className="card stack">
          <div className="row"><Icon name="user" /> <div><small>{t('loggedAs')}</small><div><b>{session.user.email}</b></div></div></div>
          {profile && (
            <div className="row wrap" style={{ gap: 8 }}>
              <span className="badge b-verified">{t(({ user: 'roleUser', merchant: 'roleMerchant', moderator: 'roleModerator', admin: 'roleAdmin' } as const)[profile.role])}</span>
              <small>{t('reputation')} : {profile.reputation}</small>
            </div>
          )}
          <label className="field"><span>{t('yourName')}</span>
            <input defaultValue={profile?.display_name ?? ''} maxLength={60} onBlur={async (e) => {
              await supabase!.from('profiles').update({ display_name: e.target.value.trim() }).eq('id', session.user.id)
              refreshProfile()
            }} />
          </label>
          <div className="row wrap">
            <Link className="btn small secondary" to="/lisitra"><Icon name="edit" size={16} /> {t('lists')}</Link>
            <Link className="btn small secondary" to="/devis"><Icon name="store" size={16} /> {t('myQuotes')}</Link>
            <button className="btn small ghost" onClick={() => setMode('reset')}><Icon name="shield" size={16} /> {t('newPassword')}</button>
          </div>
          <button className="btn danger" onClick={signOut}><Icon name="x" size={18} /> {t('logout')}</button>
        </div>
      </div>
    )
  }

  return (
    <div className="stack">
      <PageHeader title={t('account')} />
      {mode !== 'reset' && (
        <div className="chips" role="tablist">
          {([['login', 'login'], ['signup', 'signup'], ['forgot', 'forgot']] as const).map(([k, l]) => (
            <button key={k} role="tab" aria-selected={mode === k} className={`chip ${mode === k ? 'on' : ''}`} onClick={() => { setMode(k); setMsg(null) }}>{t(l)}</button>
          ))}
        </div>
      )}
      <form className="card stack" onSubmit={(e) => {
        e.preventDefault()
        if (mode === 'login') run(() => supabase!.auth.signInWithPassword({ email, password: pwd }))
        if (mode === 'signup') run(() => supabase!.auth.signUp({ email, password: pwd, options: { data: { display_name: name.trim() }, emailRedirectTo: location.origin } }), t('signupSent'))
        if (mode === 'forgot') run(() => supabase!.auth.resetPasswordForEmail(email, { redirectTo: redirect }), t('resetSent'))
        if (mode === 'reset') run(() => supabase!.auth.updateUser({ password: pwd }), t('passwordUpdated'))
      }}>
        {mode === 'signup' && <label className="field"><span>{t('yourName')}</span><input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoComplete="name" /></label>}
        {mode !== 'reset' && <label className="field"><span>{t('email')}</span><input type="email" required value={email} onChange={(e) => setEmail(e.target.value.trim())} autoComplete="email" /></label>}
        {mode !== 'forgot' && (
          <label className="field"><span>{mode === 'reset' ? t('newPassword') : t('password')}</span>
            <input type="password" required minLength={8} value={pwd} onChange={(e) => setPwd(e.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
            {mode !== 'login' && <small>{t('pwdHint')}</small>}
          </label>
        )}
        <button className="btn orange block" disabled={busy}>
          {busy ? <span className="spinner" /> : <Icon name="check" size={18} />}{' '}
          {mode === 'login' ? t('login') : mode === 'signup' ? t('signup') : mode === 'forgot' ? t('sendReset') : t('save')}
        </button>
        {msg && <div className={`banner ${msg.ok ? 'ok' : 'err'}`}>{msg.text}</div>}
        {(mode === 'signup' || mode === 'forgot') && <small>{t('emailLimitNote')}</small>}
      </form>
      <small>{t('needLogin')}.</small>
    </div>
  )
}
