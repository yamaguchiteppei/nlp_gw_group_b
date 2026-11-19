import type { Slide } from './mockData'

type Props = { slide: Slide; className?: string }

const accents: Record<string, string> = {
  'deck-01': '#687d8c',
  'deck-02': '#7b907f',
  'deck-03': '#82798e',
  'deck-04': '#9a816d',
}

function Diagram({ slide, accent }: { slide: Slide; accent: string }) {
  const kind = slide.artwork
  const line = '#929292'
  const dark = '#505050'
  const pale = '#e7e7e7'

  if (kind === 'flow' || kind === 'timeline') {
    return <g>
      {[0, 1, 2].map((i) => <g key={i}>
        <rect x={48 + i * 185} y="142" width="145" height="105" fill={i === 1 ? accent : '#f4f4f4'} fillOpacity={i === 1 ? '.16' : '1'} stroke={i === 1 ? accent : line} />
        <rect x={68 + i * 185} y="168" width="72" height="8" fill={dark} opacity=".58" />
        <rect x={68 + i * 185} y="189" width="102" height="5" fill={line} opacity=".56" />
        <rect x={68 + i * 185} y="202" width="87" height="5" fill={line} opacity=".4" />
      </g>)}
      <path d="M198 195h32m-8-8 8 8-8 8M383 195h32m-8-8 8 8-8 8" fill="none" stroke={dark} strokeWidth="2" />
      <text x="53" y="278" fill={line} fontSize="13">入力</text><text x="238" y="278" fill={line} fontSize="13">処理</text><text x="423" y="278" fill={line} fontSize="13">出力</text>
    </g>
  }

  if (kind === 'chart') {
    return <g>
      <path d="M83 275V140M83 275H553" fill="none" stroke={dark} strokeWidth="2" />
      {[0, 1, 2, 3, 4].map((i) => <g key={i}>
        <line x1="83" y1={153 + i * 28} x2="553" y2={153 + i * 28} stroke={pale} />
        <text x={117 + i * 95} y="300" fill={line} fontSize="12">条件 {i + 1}</text>
      </g>)}
      {[0, 1, 2, 3, 4].map((i) => <rect key={i} x={126 + i * 95} y={240 - [25, 46, 61, 78, 93][i]} width="44" height={[35, 56, 71, 88, 103][i]} fill={i === 3 ? accent : '#a7a7a7'} />)}
    </g>
  }

  if (kind === 'compare') {
    return <g>
      <rect x="47" y="130" width="258" height="153" fill="#f5f5f5" stroke={line} />
      <rect x="335" y="130" width="258" height="153" fill="#e9e9e9" stroke={line} />
      <text x="67" y="160" fill={dark} fontSize="17">従来の説明</text>
      <text x="355" y="160" fill={accent} fontSize="17">改善した説明</text>
      {[0, 1, 2].map((i) => <g key={i}><rect x="68" y={184 + i * 25} width={190 - i * 20} height="7" fill="#b7b7b7" /><rect x="355" y={184 + i * 25} width={165 + i * 14} height="7" fill="#989898" /></g>)}
      <path d="M312 205h17" stroke={dark} strokeWidth="2" />
    </g>
  }

  if (kind === 'matrix') {
    return <g>
      <rect x="60" y="130" width="520" height="160" fill="#f6f6f6" stroke={line} />
      <rect x="60" y="130" width="520" height="38" fill={accent} opacity=".25" />
      {[0, 1, 2].map((i) => <line key={i} x1="60" x2="580" y1={168 + i * 40} y2={168 + i * 40} stroke={line} />)}
      {[0, 1, 2].map((i) => <line key={i} y1="130" y2="290" x1={205 + i * 125} x2={205 + i * 125} stroke={line} />)}
      <text x="79" y="156" fontSize="14" fill={dark}>評価項目</text><text x="225" y="156" fontSize="14" fill={dark}>手法 A</text><text x="351" y="156" fontSize="14" fill={dark}>手法 B</text>
      {[0, 1, 2].map((i) => <g key={i}><rect x="80" y={185 + i * 40} width="77" height="6" fill="#a8a8a8" /><rect x="225" y={185 + i * 40} width="53" height="6" fill="#bcbcbc" /><rect x="351" y={185 + i * 40} width="70" height="6" fill="#7f7f7f" /></g>)}
    </g>
  }

  if (kind === 'network') {
    return <g>
      <path d="M137 170 310 203 503 148M137 232 310 203 503 255M137 170 137 232M503 148 503 255" stroke={line} strokeWidth="2" fill="none" />
      {[[137, 170], [137, 232], [310, 203], [503, 148], [503, 255]].map(([x, y], i) => <g key={i}><rect x={x - 54} y={y - 25} width="108" height="50" fill={i === 2 ? accent : '#f2f2f2'} fillOpacity={i === 2 ? '.2' : '1'} stroke={i === 2 ? accent : dark} /><rect x={x - 30} y={y - 3} width="60" height="6" fill={dark} opacity=".55" /></g>)}
    </g>
  }

  if (kind === 'title') {
    return <g><line x1="52" y1="157" x2="588" y2="157" stroke={accent} strokeWidth="3" /><rect x="53" y="190" width="362" height="13" fill={dark} opacity=".55" /><rect x="53" y="219" width="276" height="9" fill={line} opacity=".55" /><rect x="53" y="274" width="127" height="6" fill={line} opacity=".4" /></g>
  }

  return <g>{(slide.previewLines ?? ['要点を整理する', '結果を比較する', '今後の課題を示す']).map((lineText, i) => <g key={i}><circle cx="72" cy={150 + i * 37} r="5" fill={i === 0 ? accent : dark} /><text x="96" y={156 + i * 37} fontSize="17" fill={dark}>{lineText}</text></g>)}</g>
}

export function SlideArtwork({ slide, className = '' }: Props) {
  const accent = accents[slide.deckId] ?? '#687d8c'
  return <svg className={`slide-artwork ${className}`} viewBox="0 0 640 360" role="img" aria-label={`${slide.heading}の仮スライド画像`}>
    <rect x="1" y="1" width="638" height="358" fill="#fff" stroke="#d2d2d2" strokeWidth="2" />
    <rect x="1" y="1" width="638" height="8" fill={accent} />
    <text x="43" y="80" fontSize="25" fontWeight="600" fill="#303030">{slide.heading.length > 23 ? `${slide.heading.slice(0, 22)}…` : slide.heading}</text>
    <line x1="43" y1="102" x2="597" y2="102" stroke="#d1d1d1" />
    <Diagram slide={slide} accent={accent} />
    <text x="579" y="330" fontSize="12" fill="#979797" textAnchor="end">{String(slide.pageNumber).padStart(2, '0')}</text>
  </svg>
}
