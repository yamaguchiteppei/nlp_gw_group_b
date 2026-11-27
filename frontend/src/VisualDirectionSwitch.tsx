import { useEffect, useState } from 'react'

const styles = [
  ['modern', 'Modern'],
  ['apple', 'Apple風'],
  ['google', 'Google風'],
  ['editorial', 'Editorial / Swiss'],
  ['gallery', 'Visual Gallery'],
  ['experimental', 'Experimental'],
  ['productivity', 'Productivity'],
  ['glass', 'Glass'],
  ['bento', 'Bento'],
  ['brutalist', 'Neo Brutal'],
  ['soft', 'Soft UI'],
] as const
const backgrounds = [
  ['flat', 'Flat'],
  ['grain', 'Subtle Grain'],
  ['dots', 'Dot Grid'],
  ['mesh', 'Mesh'],
  ['aurora', 'Aurora（登録画面）'],
] as const
const typography = [
  ['theme', '各案の標準'],
  ['editorial', 'Editorial見出し'],
  ['mono', '数字を等幅'],
  ['reading', '日本語をゆったり'],
] as const
const motions = [
  ['quiet', '控えめ'],
  ['off', '動きなし'],
  ['hover', 'Hover Lift'],
  ['spring', 'Spring風'],
  ['shared', 'Shared / FLIP'],
  ['fade', 'Fade Through'],
  ['stagger', 'Stagger'],
] as const

type Style = typeof styles[number][0]
type Background = typeof backgrounds[number][0]
type Typography = typeof typography[number][0]
type Motion = typeof motions[number][0]

function saved<T extends string>(key: string, options: readonly (readonly [T, string])[], fallback: T): T {
  const value = window.localStorage.getItem(key)
  return options.find(([id]) => id === value)?.[0] ?? fallback
}

export function VisualDirectionSwitch() {
  const hasViewTransitions = typeof document.startViewTransition === 'function'
  const [style, setStyle] = useState<Style>(() => saved('slide-library-visual-direction', styles, 'modern'))
  const [background, setBackground] = useState<Background>(() => saved('slide-library-background', backgrounds, 'flat'))
  const [type, setType] = useState<Typography>(() => saved('slide-library-typography', typography, 'theme'))
  const [motion, setMotion] = useState<Motion>(() => saved('slide-library-motion', motions, 'quiet'))
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const root = document.documentElement
    root.dataset.visualDirection = style
    root.dataset.background = background
    root.dataset.typography = type
    root.dataset.motion = motion
    root.dataset.viewTransitions = hasViewTransitions ? 'supported' : 'fallback'
    window.localStorage.setItem('slide-library-visual-direction', style)
    window.localStorage.setItem('slide-library-background', background)
    window.localStorage.setItem('slide-library-typography', type)
    window.localStorage.setItem('slide-library-motion', motion)
  }, [style, background, type, motion, hasViewTransitions])

  const reset = () => { setStyle('modern'); setBackground('flat'); setType('theme'); setMotion('quiet') }
  return <div className="design-lab">
    <button type="button" className="design-lab-toggle" aria-expanded={open} aria-controls="design-lab-panel" onClick={() => setOpen((value) => !value)}>
      {open ? '比較を閉じる' : `デザイン比較 · ${styles.find(([id]) => id === style)?.[1]}`}
    </button>
    {open && <div id="design-lab-panel" className="design-lab-panel" role="region" aria-label="デザイン比較">
      <div className="design-lab-heading"><strong>Design Lab</strong><button type="button" onClick={reset}>初期値に戻す</button></div>
      <fieldset><legend>外観</legend><div className="design-lab-styles">
        {styles.map(([id, label]) => <button key={id} type="button" aria-pressed={style === id} onClick={() => setStyle(id)}>{label}</button>)}
      </div></fieldset>
      <label>背景<select value={background} onChange={(event) => setBackground(event.target.value as Background)}>{backgrounds.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
      <label>文字<select value={type} onChange={(event) => setType(event.target.value as Typography)}>{typography.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
      <label>動き<select value={motion} onChange={(event) => setMotion(event.target.value as Motion)}>{motions.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
      {motion === 'shared' && !hasViewTransitions && <p className="design-lab-note">このブラウザでは詳細のズーム表示に切り替わります。</p>}
    </div>}
  </div>
}
