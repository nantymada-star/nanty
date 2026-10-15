/** Illustrations simples des produits (pas de photos : aucune image non autorisée). */
type Kind = 'sack' | 'white' | 'bottle' | 'fish' | 'egg' | 'beans' | 'leaf' | 'fuel' | 'meat' | 'generic'

export function thumbKind(category: string, name = ''): Kind {
  const n = name.toLowerCase()
  if (/fuel|diesel|petrol|kerosene/.test(n)) return 'fuel'
  if (/sugar|salt|flour/.test(n)) return 'white'
  if (/egg/.test(n)) return 'egg'
  if (/fish/.test(n)) return 'fish'
  if (/meat|chicken/.test(n)) return 'meat'
  switch (category) {
    case 'cereals and tubers': return 'sack'
    case 'oil and fats': return 'bottle'
    case 'meat, fish and eggs': return 'meat'
    case 'pulses and nuts': return 'beans'
    case 'vegetables and fruits': return 'leaf'
    case 'non-food': return 'fuel'
    case 'miscellaneous food': return 'white'
    default: return 'generic'
  }
}

const sack = (c: string, band: string) => (
  <>
    <path d="M14 12c-3 8-5 18-3 28 1 4 25 4 26 0 2-10 0-20-3-28z" fill={c} />
    <path d="M14 12c3-3 17-3 20 0-2 2-18 2-20 0z" fill={band} />
    <rect x="16" y="24" width="16" height="8" rx="2" fill={band} opacity=".5" />
  </>
)

export function Thumb({ category, name, size = 44 }: { category: string; name?: string; size?: number }) {
  const k = thumbKind(category, name)
  const art: Record<Kind, React.ReactNode> = {
    sack: sack('#e9d9b5', '#b84a2d'),
    white: sack('#f6f4ef', '#2f7fc0'),
    bottle: (<><rect x="18" y="6" width="12" height="6" rx="2" fill="#c6892b" /><path d="M16 14h16l2 6v20a3 3 0 0 1-3 3H17a3 3 0 0 1-3-3V20z" fill="#f2c94c" /><rect x="17" y="24" width="14" height="9" rx="2" fill="#fff" opacity=".7" /></>),
    fish: (<><path d="M8 24c6-8 18-10 26-2l6-5v14l-6-5c-8 8-20 6-26-2z" fill="#5b9bd5" /><circle cx="15" cy="23" r="2" fill="#fff" /></>),
    egg: (<><ellipse cx="19" cy="27" rx="8" ry="10" fill="#f3e3c3" /><ellipse cx="30" cy="28" rx="8" ry="10" fill="#fbf3e2" /></>),
    meat: (<><path d="M28 12c8 0 12 7 9 14-2 5-8 6-12 5l-8 8c-2 2-5 0-4-2l1-2-3-1c-2-1-1-4 1-4l3 1 6-7c-2-6 1-12 7-12z" fill="#e3a05b" /><circle cx="12" cy="37" r="2.5" fill="#f5e6d0" /></>),
    beans: (<><ellipse cx="17" cy="20" rx="6" ry="4" fill="#9b3b2f" /><ellipse cx="29" cy="18" rx="6" ry="4" fill="#b84a2d" /><ellipse cx="22" cy="30" rx="6" ry="4" fill="#c4643f" /><ellipse cx="33" cy="30" rx="6" ry="4" fill="#9b3b2f" /></>),
    leaf: (<><path d="M10 38C10 20 22 10 38 10c0 16-10 28-28 28z" fill="#4caf50" /><path d="M12 36 34 14" stroke="#2e7d32" strokeWidth="2" /></>),
    fuel: (<><rect x="12" y="12" width="22" height="28" rx="3" fill="#cf3f37" /><rect x="26" y="7" width="8" height="6" rx="1" fill="#8a2a25" /><path d="M17 20l12 12M29 20 17 32" stroke="#fff" strokeWidth="2" opacity=".7" /></>),
    generic: (<rect x="12" y="12" width="24" height="24" rx="5" fill="#cfe7d6" />),
  }
  return (
    <span className="thumb" style={{ width: size, height: size }} aria-hidden="true">
      <svg viewBox="0 0 48 48" width={size - 8} height={size - 8}>{art[k]}</svg>
    </span>
  )
}
