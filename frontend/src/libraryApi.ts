export type DocumentSummary = {
  id: string
  title: string
  authors: string[]
  folderPath: string[]
}

export type DocumentDetail = DocumentSummary & {
  fileName: string
  format: 'pdf' | 'pptx'
}

export type PageSummary = {
  id: string
  documentId: string
  pageNumber: number
  heading: string
  summary: string
  tags: string[]
  previewUrl: string | null
  document: DocumentSummary
}

export type Page = Omit<PageSummary, 'document'> & { document: DocumentDetail }
type PageList = { items: PageSummary[]; total: number; limit: number; offset: number }
export type SearchFilters = { tag: string; folderPath: string }

export class ApiError extends Error {
  status: number

  constructor(status: number) {
    super(`API request failed (${status})`)
    this.status = status
  }
}

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 15_000)
  const onAbort = () => controller.abort()
  init?.signal?.addEventListener('abort', onAbort, { once: true })
  if (init?.signal?.aborted) controller.abort()
  let response: Response
  try {
    response = await fetch(path, { ...init, signal: controller.signal })
  } finally {
    window.clearTimeout(timeout)
    init?.signal?.removeEventListener('abort', onAbort)
  }
  if (!response.ok) throw new ApiError(response.status)
  return response.json() as Promise<T>
}

async function collectPages(
  path: (offset: number) => string,
  init: (offset: number) => RequestInit,
): Promise<PageSummary[]> {
  const items: PageSummary[] = []
  while (true) {
    const result = await json<PageList>(path(items.length), init(items.length))
    items.push(...result.items)
    if (result.items.length === 0 || items.length >= result.total) return items
  }
}

export function searchPages(
  query: string,
  filters: SearchFilters,
  signal: AbortSignal,
): Promise<PageSummary[]> {
  if (!query.trim() && !filters.tag && !filters.folderPath) {
    return collectPages(
      (offset) => `/api/pages?limit=100&offset=${offset}`,
      () => ({ signal }),
    )
  }
  return collectPages(
    () => '/api/pages/search',
    (offset) => ({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: query.trim(),
        filters: {
          ...(filters.tag ? { tag: filters.tag } : {}),
          ...(filters.folderPath ? { folderPath: filters.folderPath } : {}),
        },
        limit: 100,
        offset,
      }),
      signal,
    }),
  )
}

export function getPage(id: string, signal: AbortSignal): Promise<Page> {
  return json<Page>(`/api/pages/${encodeURIComponent(id)}`, { signal })
}

export function getDocumentPages(
  documentId: string,
  signal: AbortSignal,
): Promise<PageSummary[]> {
  return collectPages(
    (offset) => `/api/documents/${encodeURIComponent(documentId)}/pages?limit=100&offset=${offset}`,
    () => ({ signal }),
  )
}
