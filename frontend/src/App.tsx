import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { flushSync } from 'react-dom'
import { Brand } from './Brand'
import { NotFoundPage } from './NotFoundPage'
import { RegistrationPage } from './RegistrationPage'
import { SlidePreview } from './SlidePreview'
import {
  ApiError,
  getDocumentPages,
  getPage,
  getSourceFile,
  searchPages,
  type Page,
  type PageSummary,
  type SearchFilters,
} from './libraryApi'

type ResultType = 'slides' | 'decks'
type SearchStatus = 'ready' | 'loading' | 'error'
type DeckResult = { id: string; title: string; pages: PageSummary[] }
const emptyFilters: SearchFilters = { tag: '', folderPath: '' }

function runViewTransition(change: () => void): Promise<void> {
  if (!document.startViewTransition || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    flushSync(change)
    return Promise.resolve()
  }
  return document.startViewTransition(() => flushSync(change)).updateCallbackDone
}

function readUrl() {
  const params = new URLSearchParams(location.search)
  const slide = params.get('slide')
  const deck = params.get('deck')
  return {
    query: params.get('q') ?? '',
    resultType: params.get('view') === 'decks' ? 'decks' as ResultType : 'slides' as ResultType,
    filters: { tag: params.get('tag') ?? '', folderPath: params.get('folderPath') ?? '' },
    selected: slide || deck || '',
    selectedType: slide ? 'slide' as const : 'deck' as const,
  }
}

function isNotFoundRoute() {
  return location.pathname !== '/' && location.pathname !== '/register'
}

function displayHeading(page: PageSummary) {
  return page.heading || `p.${page.pageNumber} · 見出しなし`
}

function SearchSkeleton({ gridStyle }: { gridStyle: CSSProperties }) {
  return <div className="search-loading" role="status" aria-live="polite">
    <span className="search-loading-label">読み込み中…</span>
    <div className="result-grid" style={gridStyle} aria-hidden="true">
      {Array.from({ length: 6 }, (_, index) => <div className="result-skeleton" key={index}>
        <div className="result-skeleton-image" /><div className="result-skeleton-title" /><div className="result-skeleton-meta" />
      </div>)}
    </div>
  </div>
}

type SearchMessageProps = { kind: 'empty' } | { kind: 'error'; onRetry: () => void }

function SearchMessage(props: SearchMessageProps) {
  const failed = props.kind === 'error'
  return <div className="search-message" role={failed ? 'alert' : 'status'}>
    <img className="mascot mascot--message" src={failed ? '/slide-mascot-error.png' : '/slide-mascot-empty.png'} alt="" />
    <h2>{failed ? 'スライドを読み込めませんでした' : '資料がありません'}</h2>
    {props.kind === 'error' && <><p>検索条件は保持されています。接続を確認して再試行してください。</p><button type="button" onClick={props.onRetry}>再試行</button></>}
  </div>
}

function FilterControls({
  filters, pages, onChange,
}: { filters: SearchFilters; pages: PageSummary[]; onChange: (next: SearchFilters) => void }) {
  const tags = [...new Set(pages.flatMap((page) => page.tags))].sort((a, b) => a.localeCompare(b, 'ja'))
  const folders = [...new Set(pages.flatMap((page) => page.document.folderPath.map((_, index) => page.document.folderPath.slice(0, index + 1).join('/'))))].sort((a, b) => a.localeCompare(b, 'ja'))
  return <div className="filter-controls">
    <label className="filter-field"><span className="sr-only">元フォルダ</span><select value={filters.folderPath} onChange={(event) => onChange({ ...filters, folderPath: event.target.value })}>
      <option value="">元フォルダ</option>{folders.map((folder) => <option key={folder} value={folder}>{folder}</option>)}
    </select></label>
    <label className="filter-field"><span className="sr-only">タグ</span><select value={filters.tag} onChange={(event) => onChange({ ...filters, tag: event.target.value })}>
      <option value="">タグ</option>{tags.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
    </select></label>
  </div>
}

function ResultCard({
  page, deck, onClick, activeTransitionName,
}: { page?: PageSummary; deck?: DeckResult; onClick: () => void; activeTransitionName: string }) {
  const preview = page ?? deck?.pages[0]
  if (!preview) return null
  const transitionName = page ? `slide-${page.id}` : `deck-${deck!.id}`
  const title = page ? displayHeading(page) : deck!.title
  const authors = preview.document.authors.join('・')
  return <button type="button" className="result-card" onClick={onClick} aria-label={`${title}の詳細を開く`}>
    <div className="thumbnail" style={{ viewTransitionName: activeTransitionName === transitionName ? transitionName : 'none' }}><SlidePreview page={preview} /></div>
    <div className="card-copy">
      <div className="card-heading">{title}</div>
      {page && <div className="card-deck" title={preview.document.title}>{preview.document.title}</div>}
      <div className="card-meta">{authors}{authors && page ? ' · ' : ''}{page ? `p.${page.pageNumber}` : `一致 ${deck!.pages.length}ページ`}</div>
      {page && page.tags.length > 0 && <div className="card-secondary"><span>{page.tags.join(' · ')}</span></div>}
    </div>
  </button>
}

function Detail({
  id, kind, overlay, onClose, onSelectSlide, onMissing, onFallbackDeck,
}: {
  id: string
  kind: 'slide' | 'deck'
  overlay: boolean
  onClose: () => void
  onSelectSlide: (id: string) => void
  onMissing: () => void
  onFallbackDeck: (id: string) => void
}) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const shellRef = useRef<HTMLElement>(null)
  const onMissingRef = useRef(onMissing)
  const onFallbackDeckRef = useRef(onFallbackDeck)
  const downloadControllerRef = useRef<AbortController | null>(null)
  useEffect(() => {
    onMissingRef.current = onMissing
    onFallbackDeckRef.current = onFallbackDeck
  }, [onMissing, onFallbackDeck])
  const [page, setPage] = useState<Page | null>(null)
  const [related, setRelated] = useState<PageSummary[]>([])
  const [status, setStatus] = useState<SearchStatus>('loading')
  const [retry, setRetry] = useState(0)
  const [downloadStatus, setDownloadStatus] = useState<'idle' | 'loading' | 'error'>('idle')

  useEffect(() => () => downloadControllerRef.current?.abort(), [])

  useEffect(() => {
    const controller = new AbortController()
    const load = async () => {
      try {
        if (kind === 'slide') {
          const selectedPage = await getPage(id, controller.signal)
          const pages = await getDocumentPages(selectedPage.documentId, controller.signal)
          if (controller.signal.aborted) return
          setPage(selectedPage)
          setRelated(pages.sort((a, b) => a.pageNumber - b.pageNumber))
        } else {
          const pages = await getDocumentPages(id, controller.signal)
          if (pages.length === 0) { setStatus('ready'); return }
          const firstPage = await getPage(pages[0].id, controller.signal)
          if (controller.signal.aborted) return
          setPage(firstPage)
          setRelated(pages.sort((a, b) => a.pageNumber - b.pageNumber))
        }
        setStatus('ready')
      } catch (error) {
        if (controller.signal.aborted) return
        if (error instanceof ApiError && error.status === 404 && kind === 'slide') {
          const fallback = new URLSearchParams(location.search).get('deck')
          if (fallback) { onFallbackDeckRef.current(fallback); return }
        }
        if (error instanceof ApiError && error.status === 404 && !overlay) onMissingRef.current()
        else setStatus('error')
      }
    }
    void load()
    return () => controller.abort()
  }, [id, kind, overlay, retry])

  useEffect(() => {
    closeRef.current?.focus()
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key !== 'Tab' || !overlay || !shellRef.current) return
      const focusable = [...shellRef.current.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')]
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose, overlay])

  const documentInfo = page?.document
  const selectedIndex = kind === 'slide' ? related.findIndex((item) => item.id === id) : -1
  const downloadSource = async () => {
    if (!documentInfo) return
    downloadControllerRef.current?.abort()
    const controller = new AbortController()
    downloadControllerRef.current = controller
    setDownloadStatus('loading')
    try {
      const { blob, filename } = await getSourceFile(documentInfo.id, documentInfo.fileName, controller.signal)
      if (controller.signal.aborted) return
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
      setDownloadStatus('idle')
    } catch {
      if (!controller.signal.aborted) setDownloadStatus('error')
    }
  }
  return <div className={overlay ? 'detail-backdrop' : 'detail-page'} onMouseDown={(event) => { if (overlay && event.target === event.currentTarget) onClose() }}>
    <section ref={shellRef} className="detail-shell" role={overlay ? 'dialog' : undefined} aria-modal={overlay ? true : undefined} aria-label="資料の詳細">
      <div className="detail-header"><span>Slide Library <b>/</b> {kind === 'slide' ? 'スライド詳細' : '発表資料詳細'}</span><button ref={closeRef} type="button" onClick={onClose}>{overlay ? '閉じる' : '一覧に戻る'} <span aria-hidden="true">×</span></button></div>
      {status === 'loading' && <div className="detail-message" role="status">読み込み中…</div>}
      {status === 'error' && <div className="detail-message" role="alert"><p>スライドを読み込めませんでした</p><button type="button" onClick={() => { setStatus('loading'); setRetry((value) => value + 1) }}>再試行</button></div>}
      {status === 'ready' && !page && <div className="detail-message" role="status"><p>ページを準備中です。</p><button type="button" onClick={() => { setStatus('loading'); setRetry((value) => value + 1) }}>再読み込み</button></div>}
      {status === 'ready' && page && documentInfo && <div className="detail-main">
        <div className="detail-visual">
          <div className="detail-artwork" style={{ viewTransitionName: kind === 'slide' ? `slide-${id}` : `deck-${id}` }}><SlidePreview page={page} /></div>
          {kind === 'slide' && <div className="slide-navigation"><span>同じ資料の前後のページ</span><div>
            <button type="button" disabled={selectedIndex <= 0} onClick={() => onSelectSlide(related[selectedIndex - 1].id)}>前へ</button>
            <button type="button" disabled={selectedIndex < 0 || selectedIndex >= related.length - 1} onClick={() => onSelectSlide(related[selectedIndex + 1].id)}>次へ</button>
          </div></div>}
          <div className="same-deck"><div className="section-title"><h3>同じ資料の他のページ</h3><span>{related.length}ページ</span></div><div className="same-deck-row">
            {related.map((item) => <button type="button" key={item.id} className={`related-card ${kind === 'slide' && id === item.id ? 'is-current' : ''}`} onClick={() => onSelectSlide(item.id)} aria-current={kind === 'slide' && id === item.id ? 'page' : undefined}><SlidePreview page={item} /><span>p.{item.pageNumber} · {item.heading || '見出しなし'}</span></button>)}
          </div></div>
        </div>
        <aside className="detail-facts"><p className="eyebrow">{kind === 'slide' ? `SLIDE · P.${page.pageNumber}` : `DOCUMENT · ${related.length} PAGES`}</p><h2>{kind === 'slide' ? displayHeading(page) : documentInfo.title}</h2>
          {kind === 'slide' && page.summary && <p className="detail-summary">{page.summary}</p>}
          <div className="detail-group"><h3>出典と文脈</h3><dl><dt>元資料</dt><dd>{documentInfo.title}</dd><dt>著者</dt><dd>{documentInfo.authors.join('、') || '未登録'}</dd><dt>元フォルダ</dt><dd>{documentInfo.folderPath.join(' / ') || '未登録'}</dd><dt>登録形式</dt><dd>{documentInfo.format.toUpperCase()}</dd></dl></div>
          {kind === 'slide' && page.tags.length > 0 && <div className="detail-group"><h3>タグ</h3><p>{page.tags.join('、')}</p></div>}
          <button type="button" className="source-button" disabled={downloadStatus === 'loading'} onClick={() => { void downloadSource() }}>{downloadStatus === 'loading' ? 'ダウンロードを準備中…' : '元資料全体をダウンロード'}</button>
          {downloadStatus === 'error' && <p className="download-error" role="alert">元資料を取得できませんでした。再試行してください。</p>}
        </aside>
      </div>}
    </section>
  </div>
}

function App() {
  const initial = readUrl()
  const [resultType, setResultType] = useState<ResultType>(initial.resultType)
  const [query, setQuery] = useState(initial.query)
  const [draft, setDraft] = useState(initial.query)
  const [filters, setFilters] = useState<SearchFilters>(initial.filters)
  const [catalog, setCatalog] = useState<PageSummary[]>([])
  const [pages, setPages] = useState<PageSummary[]>([])
  const [searchStatus, setSearchStatus] = useState<SearchStatus>('loading')
  const [retry, setRetry] = useState(0)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [gridColumns, setGridColumns] = useState({ expanded: 2, collapsed: 3 })
  const [resultsWidth, setResultsWidth] = useState(0)
  const [visibleCount, setVisibleCount] = useState(6)
  const [selected, setSelected] = useState(initial.selected)
  const [selectedType, setSelectedType] = useState(initial.selectedType)
  const [activeTransitionName, setActiveTransitionName] = useState(initial.selected ? `${initial.selectedType}-${initial.selected}` : '')
  const [overlay, setOverlay] = useState(Boolean(history.state?.background))
  const [registrationOpen, setRegistrationOpen] = useState(location.pathname === '/register')
  const [notFound, setNotFound] = useState(isNotFoundRoute)
  const triggerRef = useRef<HTMLElement | null>(null)
  const scrollRef = useRef({ page: 0, results: 0 })
  const resultScrollRef = useRef<HTMLDivElement>(null)
  const resultsSectionRef = useRef<HTMLElement>(null)
  const tag = filters.tag
  const folderPath = filters.folderPath

  useEffect(() => {
    if ((!query && !tag && !folderPath) || catalog.length) return
    const controller = new AbortController()
    void searchPages('', emptyFilters, controller.signal).then((result) => {
      if (!controller.signal.aborted) setCatalog(result)
    }).catch(() => { /* The current results still provide filter choices. */ })
    return () => controller.abort()
  }, [query, tag, folderPath, retry, catalog.length])

  useEffect(() => {
    const controller = new AbortController()
    void searchPages(query, { tag, folderPath }, controller.signal).then((result) => {
      if (controller.signal.aborted) return
      setPages(result)
      if (!query && !tag && !folderPath) setCatalog(result)
      setSearchStatus('ready')
    }).catch(() => { if (!controller.signal.aborted) setSearchStatus('error') })
    return () => controller.abort()
  }, [query, tag, folderPath, retry])

  const makeUrl = (next: { resultType?: ResultType; query?: string; filters?: SearchFilters } = {}) => {
    const value = { resultType, query, filters, ...next }
    const params = new URLSearchParams()
    if (value.query.trim()) params.set('q', value.query.trim())
    if (value.resultType !== 'slides') params.set('view', value.resultType)
    if (value.filters.tag) params.set('tag', value.filters.tag)
    if (value.filters.folderPath) params.set('folderPath', value.filters.folderPath)
    return `${location.pathname}${params.size ? `?${params}` : ''}`
  }

  const update = (next: { resultType?: ResultType; query?: string; filters?: SearchFilters }) => {
    if (next.resultType) setResultType(next.resultType)
    if (next.query !== undefined) setQuery(next.query)
    if (next.filters) setFilters(next.filters)
    const searchChanged = (next.query !== undefined && next.query !== query) ||
      (next.filters !== undefined && (next.filters.tag !== filters.tag || next.filters.folderPath !== filters.folderPath))
    if (searchChanged) setSearchStatus('loading')
    else if (next.query !== undefined || next.filters) { setSearchStatus('loading'); setRetry((value) => value + 1) }
    setVisibleCount(6)
    resultScrollRef.current?.scrollTo(0, 0)
    history.replaceState(null, '', makeUrl(next))
  }

  useEffect(() => {
    const onPop = () => {
      const state = readUrl()
      const searchChanged = state.query !== query || state.filters.tag !== filters.tag || state.filters.folderPath !== filters.folderPath
      void runViewTransition(() => {
        setRegistrationOpen(location.pathname === '/register')
        setNotFound(isNotFoundRoute())
        setResultType(state.resultType)
        setQuery(state.query)
        setDraft(typeof history.state?.draft === 'string' ? history.state.draft : state.query)
        setFilters(state.filters)
        if (searchChanged) setSearchStatus('loading')
        setSelected(state.selected)
        setSelectedType(state.selectedType)
        setOverlay(Boolean(history.state?.background))
      }).then(() => {
        if (state.selected || location.pathname === '/register') return
        requestAnimationFrame(() => {
          resultScrollRef.current?.scrollTo(0, scrollRef.current.results)
          window.scrollTo(0, scrollRef.current.page)
          const target = triggerRef.current?.isConnected ? triggerRef.current : document.querySelector<HTMLButtonElement>('.header-register')
          target?.focus({ preventScroll: true })
        })
      })
    }
    addEventListener('popstate', onPop)
    return () => removeEventListener('popstate', onPop)
  }, [query, filters.tag, filters.folderPath])

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
    const params = new URLSearchParams(location.search); params.delete('slide'); params.delete('deck'); params.set(kind, id)
    flushSync(() => setActiveTransitionName(`${kind}-${id}`))
    void runViewTransition(() => { history.pushState({ background: location.href }, '', `${location.pathname}?${params}`); setSelected(id); setSelectedType(kind); setOverlay(true) })
  }
  const close = () => {
    if (overlay && history.state?.background) history.back()
    else { const params = new URLSearchParams(location.search); params.delete('slide'); params.delete('deck'); void runViewTransition(() => { history.replaceState(null, '', `${location.pathname}${params.size ? `?${params}` : ''}`); setSelected(''); setOverlay(false) }) }
  }
  const selectRelated = (id: string) => {
    const params = new URLSearchParams(location.search); params.delete('deck'); params.set('slide', id)
    flushSync(() => setActiveTransitionName(`slide-${id}`))
    void runViewTransition(() => { history.replaceState(history.state, '', `${location.pathname}?${params}`); setSelected(id); setSelectedType('slide') })
  }
  const fallbackToDeck = (id: string) => {
    const params = new URLSearchParams(location.search); params.delete('slide')
    history.replaceState(history.state, '', `${location.pathname}?${params}`)
    setSelected(id); setSelectedType('deck')
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
    else { const params = new URLSearchParams(location.search); params.delete('slide'); params.delete('deck'); history.replaceState(null, '', `/${params.size ? `?${params}` : ''}`); setSelected(''); setOverlay(false); setRegistrationOpen(false) }
  }

  const sortedPages = [...pages].sort((a, b) => a.document.title.localeCompare(b.document.title, 'ja') || a.pageNumber - b.pageNumber)
  const deckMap = new Map<string, DeckResult>()
  for (const page of sortedPages) {
    const deck = deckMap.get(page.documentId) ?? { id: page.documentId, title: page.document.title, pages: [] }
    deck.pages.push(page)
    deckMap.set(page.documentId, deck)
  }
  const decks = [...deckMap.values()]
  const results = resultType === 'slides' ? sortedPages : decks
  const activeFilters = (Object.entries(filters) as [keyof SearchFilters, string][]).filter(([, value]) => value)
  const maxColumns = resultsWidth ? Math.max(1, Math.min(4, Math.floor((resultsWidth + 23) / 263))) : 4
  const preferredColumns = sidebarCollapsed ? gridColumns.collapsed : gridColumns.expanded
  const effectiveColumns = Math.min(preferredColumns, maxColumns)
  const gridStyle = { '--grid-columns': effectiveColumns } as CSSProperties

  if (notFound) return <NotFoundPage />
  if (registrationOpen) return <RegistrationPage onBack={closeRegistration} />

  return <>
    <div className="app-shell" inert={Boolean(selected)}>
      <header className="site-header"><Brand /><button type="button" className="header-register" onClick={openRegistration}>資料を登録</button></header>
      <main className={`library${sidebarCollapsed ? ' library--sidebar-collapsed' : ''}`}>
        <div className="search-area"><form className="search-form" role="search" onSubmit={(event) => { event.preventDefault(); update({ query: draft }) }}>
          <label htmlFor="library-query" className="sr-only">内容・著者・資料名を検索</label>
          <input id="library-query" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="スライドの内容・著者・資料名を検索" />
          <button type="submit">検索</button>
        </form></div>
        <div className="results-frame">
          <aside className={`filter-sidebar${sidebarCollapsed ? ' filter-sidebar--collapsed' : ''}`} aria-label="絞り込み">
            <button type="button" className="sidebar-toggle" aria-label={sidebarCollapsed ? 'フィルタを開く' : 'フィルタを閉じる'} aria-expanded={!sidebarCollapsed} onClick={() => setSidebarCollapsed((value) => !value)}>{sidebarCollapsed ? 'フィルタ ›' : 'フィルタ ‹'}</button>
            {!sidebarCollapsed && <FilterControls filters={filters} pages={catalog.length ? catalog : pages} onChange={(next) => update({ filters: next })} />}
          </aside>
          <section ref={resultsSectionRef} className="results-section" aria-label="検索結果">
            <div className="results-toolbar">
              <div className="result-tabs" role="tablist" aria-label="検索結果の種類">
                <button type="button" role="tab" aria-selected={resultType === 'slides'} onClick={() => update({ resultType: 'slides' })}>スライド {searchStatus === 'ready' && <span>{sortedPages.length}</span>}</button>
                <button type="button" role="tab" aria-selected={resultType === 'decks'} onClick={() => update({ resultType: 'decks' })}>発表資料 {searchStatus === 'ready' && <span>{decks.length}</span>}</button>
              </div>
              <div className="results-actions">{maxColumns >= 2 && <div className="column-switch" role="group" aria-label="グリッドの列数">{([2, 3, 4] as const).map((count) => <button key={count} type="button" aria-label={`${count}列表示`} aria-pressed={effectiveColumns === count} disabled={count > maxColumns} onClick={() => setGridColumns((current) => ({ ...current, [sidebarCollapsed ? 'collapsed' : 'expanded']: count }))}>{count}</button>)}</div>}</div>
            </div>
            {activeFilters.length > 0 && <div className="active-row">{activeFilters.map(([key, value]) => <button key={key} type="button" onClick={() => update({ filters: { ...filters, [key]: '' } })}>{key === 'tag' ? 'タグ' : '元フォルダ'}: {value} <span aria-hidden="true">×</span></button>)}<button type="button" className="clear-button" onClick={() => update({ filters: emptyFilters })}>条件を解除</button></div>}
            <div ref={resultScrollRef} className="result-scroll" role="region" aria-label="検索結果の一覧" aria-busy={searchStatus === 'loading'} tabIndex={0}>
              {searchStatus === 'loading' ? <SearchSkeleton gridStyle={gridStyle} /> : searchStatus === 'error' ? <SearchMessage kind="error" onRetry={() => { setSearchStatus('loading'); setRetry((value) => value + 1) }} /> : results.length ? <>
                <div className="result-grid" style={gridStyle}>
                  {resultType === 'slides' ? sortedPages.slice(0, visibleCount).map((page) => <ResultCard key={page.id} page={page} activeTransitionName={activeTransitionName} onClick={() => open('slide', page.id)} />) : decks.slice(0, visibleCount).map((deck) => <ResultCard key={deck.id} deck={deck} activeTransitionName={activeTransitionName} onClick={() => open('deck', deck.id)} />)}
                </div>
                {visibleCount < results.length && <button type="button" className="load-more" onClick={() => setVisibleCount((count) => count + 6)}>さらに表示 · {Math.min(6, results.length - visibleCount)}件</button>}
              </> : <SearchMessage kind="empty" />}
            </div>
          </section>
        </div>
      </main>
    </div>
    {selected && <Detail key={`${selectedType}-${selected}`} id={selected} kind={selectedType} overlay={overlay} onClose={close} onSelectSlide={selectRelated} onMissing={() => setNotFound(true)} onFallbackDeck={fallbackToDeck} />}
  </>
}

export default App
