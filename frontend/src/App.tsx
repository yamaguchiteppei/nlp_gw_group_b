import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { SlideArtwork } from './SlideArtwork'
import { RegistrationPage } from './RegistrationPage'
import { deckById, decks, slides, type Deck, type Slide } from './mockData'

type ResultType = 'slides' | 'decks'
type Filters = { category: string; author: string; year: string; role: string }
const emptyFilters: Filters = { category: '', author: '', year: '', role: '' }
const authors = [...new Set(decks.flatMap((deck) => deck.authors))].sort((a, b) => a.localeCompare(b, 'ja'))
const years = [...new Set(decks.map((deck) => deck.year))].sort((a, b) => b - a)
const roles = [...new Set(slides.map((slide) => slide.role))]

function readUrl() {
  const p = new URLSearchParams(location.search)
  const slideId = p.get('slide')
  const deckId = p.get('deck')
  const selectedSlide = slideId && slides.some((slide) => slide.id === slideId) ? slideId : ''
  const selectedDeck = deckId && deckById.has(deckId) && slides.some((slide) => slide.deckId === deckId) ? deckId : ''
  return {
    query: p.get('q') ?? '',
    resultType: p.get('view') === 'decks' ? 'decks' as ResultType : 'slides' as ResultType,
    sort: p.get('sort') === 'newest' ? 'newest' : 'default',
    filters: { category: p.get('category') ?? '', author: p.get('author') ?? '', year: p.get('year') ?? '', role: p.get('role') ?? '' },
    selected: selectedSlide || selectedDeck,
    selectedType: selectedSlide ? 'slide' as const : 'deck' as const,
  }
}

function FilterControls({ filters, onChange }: { filters: Filters; onChange: (next: Filters) => void }) {
  const fields = [
    { key: 'category', label: '資料区分', values: ['研究発表', '論文読会', '研究室セミナー'] },
    { key: 'author', label: '著者', values: authors },
    { key: 'year', label: '発表年', values: years.map(String) },
    { key: 'role', label: 'スライドの役割', values: roles },
  ] as const
  return <div className="filter-controls">
    {fields.map(({ key, label, values }) => <label className="filter-field" key={key}>
      <span className="sr-only">{label}</span><select value={filters[key]} onChange={(e) => onChange({ ...filters, [key]: e.target.value })}>
        <option value="">{label}</option>{values.map((value) => <option key={value} value={value}>{value}</option>)}
      </select>
    </label>)}
  </div>
}

function matches(slide: Slide, query: string, filters: Filters) {
  const deck = deckById.get(slide.deckId)!
  const haystack = [slide.heading, slide.summary, slide.role, slide.visualType, ...slide.tags, deck.title, ...deck.authors, deck.folder].join(' ').normalize('NFKC').toLocaleLowerCase('ja')
  const words = query.normalize('NFKC').toLocaleLowerCase('ja').trim().split(/\s+/).filter(Boolean)
  return words.every((word) => haystack.includes(word)) &&
    (!filters.category || deck.category === filters.category) &&
    (!filters.author || deck.authors.includes(filters.author)) &&
    (!filters.year || String(deck.year) === filters.year) &&
    (!filters.role || slide.role === filters.role)
}

function ResultCard({ slide, deck, onClick }: { slide?: Slide; deck: Deck; onClick: () => void }) {
  const imageSlide = slide ?? slides.find((item) => item.deckId === deck.id)!
  return <button type="button" className="result-card" onClick={onClick} aria-label={`${slide?.heading ?? deck.title}の詳細を開く`}>
    <div className="thumbnail"><SlideArtwork slide={imageSlide} /></div>
    <div className="card-copy">
      <div className="card-heading">{slide?.heading ?? deck.title}</div>
      <div className="card-deck" title={slide ? deck.title : deck.category}>{slide ? deck.title : deck.category}</div>
      <div className="card-meta">{deck.authors.join('・')} · {deck.year}{slide ? ` · p.${slide.pageNumber}` : ''}</div>
      {slide && <div className="card-secondary"><span>{slide.role}</span></div>}
    </div>
  </button>
}

function Detail({ id, kind, overlay, onClose, onSelectSlide }: { id: string; kind: 'slide' | 'deck'; overlay: boolean; onClose: () => void; onSelectSlide: (id: string) => void }) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const shellRef = useRef<HTMLElement>(null)
  const [notice, setNotice] = useState('')
  const slide = kind === 'slide' ? slides.find((item) => item.id === id) : undefined
  const deck = kind === 'deck' ? deckById.get(id) : slide ? deckById.get(slide.deckId) : undefined
  const related = deck ? slides.filter((item) => item.deckId === deck.id).sort((a, b) => a.pageNumber - b.pageNumber) : []

  useEffect(() => {
    closeRef.current?.focus()
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key !== 'Tab' || !overlay || !shellRef.current) return
      const focusable = [...shellRef.current.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')]
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus() }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose, overlay])

  if (!deck || (!slide && related.length === 0)) return null
  return <div className={overlay ? 'detail-backdrop' : 'detail-page'} onMouseDown={(e) => { if (overlay && e.target === e.currentTarget) onClose() }}>
    <section ref={shellRef} className="detail-shell" role={overlay ? 'dialog' : undefined} aria-modal={overlay ? true : undefined} aria-label={`${slide?.heading ?? deck.title}の詳細`}>
      <div className="detail-header"><span>Slide Library <b>/</b> {slide ? 'スライド詳細' : '発表資料詳細'}</span><button ref={closeRef} type="button" onClick={onClose}>{overlay ? '閉じる' : '一覧に戻る'} <span aria-hidden="true">×</span></button></div>
      <div className="detail-main">
        <div className="detail-visual"><div className="detail-artwork"><SlideArtwork slide={slide ?? related[0]} /></div>
          {slide && <div className="slide-navigation"><span>同じ資料の前後のページ</span><div>
            <button type="button" disabled={related.indexOf(slide) === 0} onClick={() => onSelectSlide(related[related.indexOf(slide) - 1].id)}>前へ</button>
            <button type="button" disabled={related.indexOf(slide) === related.length - 1} onClick={() => onSelectSlide(related[related.indexOf(slide) + 1].id)}>次へ</button>
          </div></div>}
          <div className="same-deck"><div className="section-title"><h3>同じ資料の他のページ</h3><span>{related.length}件のサンプル</span></div><div className="same-deck-row">
            {related.map((item) => <button type="button" key={item.id} className={`related-card ${slide?.id === item.id ? 'is-current' : ''}`} onClick={() => onSelectSlide(item.id)} aria-current={slide?.id === item.id ? 'page' : undefined}><SlideArtwork slide={item} /><span>p.{item.pageNumber} · {item.heading}</span></button>)}
          </div></div>
        </div>
        <aside className="detail-facts"><p className="eyebrow">{slide ? `SLIDE · P.${slide.pageNumber}` : `DOCUMENT · ${related.length} PAGES`}</p><h2>{slide?.heading ?? deck.title}</h2><p className="detail-summary">{slide?.summary ?? deck.note}</p>
          <div className="detail-group"><h3>出典と文脈</h3><dl><dt>元資料</dt><dd>{deck.title}</dd><dt>著者</dt><dd>{deck.authors.join('、')}</dd><dt>発表</dt><dd>{deck.year} · {deck.category}</dd><dt>元フォルダ</dt><dd>{deck.folder}</dd><dt>登録形式</dt><dd>{deck.sourceFormat}</dd></dl></div>
          {slide && <div className="detail-group"><h3>表現と構成 <span>仮分析</span></h3><dl><dt>役割</dt><dd>{slide.role}</dd><dt>図の種類</dt><dd>{slide.visualType}</dd><dt>レイアウト</dt><dd>{slide.layoutType}</dd><dt>説明の流れ</dt><dd>{slide.narrativePattern}</dd><dt>タグ</dt><dd>{slide.tags.join('、')}</dd></dl></div>}
          <button type="button" className="source-button" onClick={() => setNotice(`このモックには元${deck.sourceFormat}ファイルを含めていません。`)}>元資料を参照</button>
          {notice && <p className="mock-notice" role="status">{notice}</p>}<p className="mock-note">分析情報は画面検討用の仮データです。</p>
        </aside>
      </div>
    </section>
  </div>
}

function App() {
  const initial = readUrl()
  const [resultType, setResultType] = useState<ResultType>(initial.resultType)
  const [query, setQuery] = useState(initial.query)
  const [draft, setDraft] = useState(initial.query)
  const [filters, setFilters] = useState<Filters>(initial.filters)
  const [sort, setSort] = useState(initial.sort)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [gridColumns, setGridColumns] = useState({ expanded: 2, collapsed: 3 })
  const [resultsWidth, setResultsWidth] = useState(0)
  const [visibleCount, setVisibleCount] = useState(6)
  const [selected, setSelected] = useState(initial.selected)
  const [selectedType, setSelectedType] = useState(initial.selectedType)
  const [overlay, setOverlay] = useState(Boolean(history.state?.background))
  const [registrationOpen, setRegistrationOpen] = useState(location.pathname === '/register')
  const triggerRef = useRef<HTMLElement | null>(null)
  const scrollRef = useRef({ page: 0, results: 0 })
  const resultScrollRef = useRef<HTMLDivElement>(null)
  const resultsSectionRef = useRef<HTMLElement>(null)

  const makeUrl = (next: { resultType?: ResultType; query?: string; filters?: Filters; sort?: string } = {}) => {
    const value = { resultType, query, filters, sort, ...next }
    const p = new URLSearchParams()
    if (value.query.trim()) p.set('q', value.query.trim())
    if (value.resultType !== 'slides') p.set('view', value.resultType)
    if (value.sort !== 'default') p.set('sort', value.sort)
    for (const [key, item] of Object.entries(value.filters)) if (item) p.set(key, item)
    return `${location.pathname}${p.size ? `?${p}` : ''}`
  }

  const update = (next: { resultType?: ResultType; query?: string; filters?: Filters; sort?: string }) => {
    if (next.resultType) setResultType(next.resultType)
    if (next.query !== undefined) setQuery(next.query)
    if (next.filters) setFilters(next.filters)
    if (next.sort) setSort(next.sort)
    setVisibleCount(6)
    if (next.query !== undefined || next.filters || next.resultType || next.sort) resultScrollRef.current?.scrollTo(0, 0)
    history.replaceState(null, '', makeUrl(next))
  }

  useEffect(() => {
    const onPop = () => { const state = readUrl(); setRegistrationOpen(location.pathname === '/register'); setResultType(state.resultType); setQuery(state.query); setDraft(typeof history.state?.draft === 'string' ? history.state.draft : state.query); setFilters(state.filters); setSort(state.sort); setSelected(state.selected); setSelectedType(state.selectedType); setOverlay(Boolean(history.state?.background)); if (!state.selected && location.pathname !== '/register') requestAnimationFrame(() => { resultScrollRef.current?.scrollTo(0, scrollRef.current.results); window.scrollTo(0, scrollRef.current.page); const target = triggerRef.current?.isConnected ? triggerRef.current : document.querySelector<HTMLButtonElement>('.header-register'); target?.focus({ preventScroll: true }) }) }
    addEventListener('popstate', onPop)
    return () => removeEventListener('popstate', onPop)
  }, [])

  useEffect(() => {
    const element = resultsSectionRef.current
    if (!element) return
    const observer = new ResizeObserver(() => setResultsWidth(element.clientWidth))
    observer.observe(element)
    return () => observer.disconnect()
  }, [registrationOpen])

  useEffect(() => { if (selected && overlay) { document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = '' } } }, [selected, overlay])

  const open = (kind: 'slide' | 'deck', id: string) => {
    triggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    scrollRef.current = { page: window.scrollY, results: resultScrollRef.current?.scrollTop ?? 0 }
    const p = new URLSearchParams(location.search); p.delete('slide'); p.delete('deck'); p.set(kind, id)
    history.pushState({ background: location.href }, '', `${location.pathname}?${p}`)
    setSelected(id); setSelectedType(kind); setOverlay(true)
  }
  const close = () => {
    if (overlay && history.state?.background) history.back()
    else { const p = new URLSearchParams(location.search); p.delete('slide'); p.delete('deck'); history.replaceState(null, '', `${location.pathname}${p.size ? `?${p}` : ''}`); setSelected(''); setOverlay(false) }
  }
  const selectRelated = (id: string) => {
    const p = new URLSearchParams(location.search); p.delete('deck'); p.set('slide', id)
    history.replaceState(history.state, '', `${location.pathname}?${p}`)
    setSelected(id); setSelectedType('slide')
  }
  const openRegistration = () => {
    triggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    scrollRef.current = { page: window.scrollY, results: resultScrollRef.current?.scrollTop ?? 0 }
    history.replaceState({ ...(history.state ?? {}), draft }, '', location.href)
    history.pushState({ registrationBackground: location.href }, '', '/register')
    setRegistrationOpen(true)
  }
  const closeRegistration = () => {
    if (history.state?.registrationBackground) history.back()
    else { const params = new URLSearchParams(location.search); params.delete('demo'); params.delete('slide'); params.delete('deck'); history.replaceState(null, '', `/${params.size ? `?${params}` : ''}`); setSelected(''); setOverlay(false); setRegistrationOpen(false) }
  }

  const matchedSlides = slides.filter((slide) => matches(slide, query, filters))
  if (sort === 'newest') matchedSlides.sort((a, b) => deckById.get(b.deckId)!.year - deckById.get(a.deckId)!.year)
  const matchedDecks = decks.filter((deck) => matchedSlides.some((slide) => slide.deckId === deck.id))
  if (sort === 'newest') matchedDecks.sort((a, b) => b.year - a.year)
  const results = resultType === 'slides' ? matchedSlides : matchedDecks
  const filterLabels: Record<keyof Filters, string> = { category: '資料区分', author: '著者', year: '発表年', role: '役割' }
  const activeFilters = (Object.entries(filters) as [keyof Filters, string][]).filter(([, value]) => value)
  const maxColumns = resultsWidth ? Math.max(1, Math.min(4, Math.floor((resultsWidth + 23) / 263))) : 4
  const preferredColumns = sidebarCollapsed ? gridColumns.collapsed : gridColumns.expanded
  const effectiveColumns = Math.min(preferredColumns, maxColumns)
  const gridStyle = { '--grid-columns': effectiveColumns } as CSSProperties

  if (registrationOpen) return <RegistrationPage onBack={closeRegistration} />

  return <>
    <div className="app-shell" inert={Boolean(selected)}>
      <header className="site-header"><strong>Slide Library</strong><button type="button" className="header-register" onClick={openRegistration}>資料を登録</button></header>
      <main className={`library${sidebarCollapsed ? ' library--sidebar-collapsed' : ''}`}>
        <div className="search-area">
          <form className="search-form" role="search" onSubmit={(e) => { e.preventDefault(); update({ query: draft }) }}>
            <label htmlFor="library-query" className="sr-only">内容・著者・資料名を検索</label>
            <input id="library-query" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="スライドの内容・著者・資料名を検索" />
            <button type="submit">検索</button>
          </form>
        </div>
        <div className="results-frame">
          <aside className={`filter-sidebar${sidebarCollapsed ? ' filter-sidebar--collapsed' : ''}`} aria-label="絞り込み">
            <button type="button" className="sidebar-toggle" aria-label={sidebarCollapsed ? 'フィルタを開く' : 'フィルタを閉じる'} aria-expanded={!sidebarCollapsed} onClick={() => setSidebarCollapsed((value) => !value)}>{sidebarCollapsed ? 'フィルタ ›' : 'フィルタ ‹'}</button>
            {!sidebarCollapsed && <FilterControls filters={filters} onChange={(next) => update({ filters: next })} />}
          </aside>
          <section ref={resultsSectionRef} className="results-section" aria-label="検索結果">
            <div className="results-toolbar">
              <div className="result-tabs" role="tablist" aria-label="検索結果の種類">
                <button type="button" role="tab" aria-selected={resultType === 'slides'} onClick={() => update({ resultType: 'slides' })}>スライド <span>{matchedSlides.length}</span></button>
                <button type="button" role="tab" aria-selected={resultType === 'decks'} onClick={() => update({ resultType: 'decks' })}>発表資料 <span>{matchedDecks.length}</span></button>
              </div>
              <div className="results-actions">
                {maxColumns >= 2 && <div className="column-switch" role="group" aria-label="グリッドの列数">{([2, 3, 4] as const).map((count) => <button key={count} type="button" aria-label={`${count}列表示`} aria-pressed={effectiveColumns === count} disabled={count > maxColumns} onClick={() => setGridColumns((current) => ({ ...current, [sidebarCollapsed ? 'collapsed' : 'expanded']: count }))}>{count}</button>)}</div>}
                <label className="sort-field"><span className="sr-only">並び順</span><select value={sort} onChange={(e) => update({ sort: e.target.value })}><option value="default">資料内の順</option><option value="newest">発表年の新しい順</option></select></label>
              </div>
            </div>
            {activeFilters.length > 0 && <div className="active-row">{activeFilters.map(([key, value]) => <button key={key} type="button" onClick={() => update({ filters: { ...filters, [key]: '' } })}>{filterLabels[key]}: {value} <span aria-hidden="true">×</span></button>)}<button type="button" className="clear-button" onClick={() => update({ filters: emptyFilters })}>条件を解除</button></div>}
            <div ref={resultScrollRef} className="result-scroll" role="region" aria-label="検索結果の一覧" tabIndex={0}>
              {results.length ? <>
                <div className="result-grid" style={gridStyle}>
                  {resultType === 'slides' ? matchedSlides.slice(0, visibleCount).map((slide) => <ResultCard key={slide.id} slide={slide} deck={deckById.get(slide.deckId)!} onClick={() => open('slide', slide.id)} />) : matchedDecks.slice(0, visibleCount).map((deck) => <ResultCard key={deck.id} deck={deck} onClick={() => open('deck', deck.id)} />)}
                </div>
                {visibleCount < results.length && <button type="button" className="load-more" onClick={() => setVisibleCount((count) => count + 6)}>さらに表示 · {Math.min(6, results.length - visibleCount)}件</button>}
              </> : <div className="empty-state"><h2>該当する資料がありません</h2><p>検索語を短くするか、条件を外してみてください。</p><button type="button" onClick={() => { setDraft(''); update({ query: '', filters: emptyFilters }) }}>検索をリセット</button></div>}
            </div>
          </section>
        </div>
      </main>
    </div>
    {selected && <Detail key={`${selectedType}-${selected}`} id={selected} kind={selectedType} overlay={overlay} onClose={close} onSelectSlide={selectRelated} />}
  </>
}

export default App
