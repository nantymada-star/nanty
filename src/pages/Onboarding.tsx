import { useState } from 'react'
import { useT } from '../i18n'
import { Icon } from '../components/Icon'
import { PlacePicker } from '../components/ui'
import { updateSettings, useSettings } from '../lib/settings'

export default function Onboarding() {
  const { t } = useT()
  const s = useSettings()
  const [step, setStep] = useState(0)
  const slides: [string, Parameters<typeof t>[0], Parameters<typeof t>[0]][] = [
    ['shield', 'onb1t', 'onb1'],
    ['chart', 'onb2t', 'onb2'],
    ['wifiOff', 'onb3t', 'onb3'],
  ]
  const finish = () => updateSettings({ onboarded: true })

  return (
    <div className="onb">
      <div style={{ textAlign: 'center', marginTop: 20 }}>
        <img src="/icon.svg" width={84} height={84} alt="" />
        <h1>Mada<b>Price</b></h1>
        <p style={{ fontWeight: 600, margin: '6px 0 0' }}>{t('tagline')}</p>
        <small style={{ color: '#cfe7d6' }}>{t('motto')}</small>
      </div>

      {step === 0 && (
        <div className="stack">
          <h2>{t('chooseLang')}</h2>
          {(['mg', 'fr'] as const).map((l) => (
            <button key={l} className={`btn ${s.lang === l ? 'orange' : 'ghost'} block`} onClick={() => updateSettings({ lang: l })} aria-pressed={s.lang === l}>
              <Icon name="globe" /> {l === 'mg' ? 'Malagasy' : 'Français'}
            </button>
          ))}
          <button className="btn orange block" onClick={() => setStep(1)}>{t('start')}</button>
        </div>
      )}

      {step >= 1 && step <= 3 && (
        <div className="stack" style={{ flex: 1 }}>
          <div style={{ width: 64, height: 64, borderRadius: 18, background: 'rgba(255,255,255,.12)', display: 'grid', placeItems: 'center' }}>
            <Icon name={slides[step - 1][0]} size={32} />
          </div>
          <h2 style={{ fontSize: 24 }}>{t(slides[step - 1][1])}</h2>
          <p style={{ color: '#e8f3eb' }}>{t(slides[step - 1][2])}</p>
          <div className="row" style={{ marginTop: 'auto' }}>
            {[1, 2, 3].map((i) => <span key={i} className="dot" style={{ background: i === step ? 'var(--orange)' : 'rgba(255,255,255,.35)' }} />)}
          </div>
          <button className="btn orange block" onClick={() => setStep(step + 1)}>{t('next')}</button>
        </div>
      )}

      {step === 4 && (
        <div className="stack">
          <h2>{t('chooseTown')}</h2>
          <PlacePicker dark />
          <button className="btn orange block" onClick={finish}>{t('start')}</button>
          <button className="btn ghost block" onClick={() => { updateSettings({ place: null }); finish() }}>{t('skip')}</button>
        </div>
      )}
    </div>
  )
}
