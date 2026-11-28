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
export type SearchFilters = { tag: string; folderPath: string; author: string }

export class ApiError extends Error {
  status: number

  constructor(status: number, detail?: string) {
    super(detail || `API request failed (${status})`)
    this.status = status
  }
}

async function json<T>(path: string, init?: RequestInit, timeoutMs = 15_000): Promise<T> {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs)
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
  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => null)
    const detail = payload && typeof payload === 'object' && 'detail' in payload &&
      typeof payload.detail === 'string' ? payload.detail : undefined
    throw new ApiError(response.status, detail)
  }
  return response.json() as Promise<T>
}

export type DocumentStatus = {
  id: string
  status: 'pending' | 'ready' | 'failed'
  pageCount: number | null
  error: string | null
}

export function registerDocument(
  details: { file: File; title: string; authors: string[]; folderPath: string[]; requestId: string },
  signal: AbortSignal,
): Promise<{ id: string; status: 'pending' }> {
  const body = new FormData()
  body.append('file', details.file)
  body.append('title', details.title)
  body.append('requestId', details.requestId)
  details.authors.forEach((author) => body.append('authors', author))
  details.folderPath.forEach((folder) => body.append('folderPath', folder))
  return json('/api/documents', { method: 'POST', body, signal }, 60_000)
}

export function getDocumentStatus(id: string, signal: AbortSignal): Promise<DocumentStatus> {
  return json(`/api/documents/${encodeURIComponent(id)}`, { signal })
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
  if (!query.trim() && !filters.tag && !filters.folderPath && !filters.author) {
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
          ...(filters.author ? { author: filters.author } : {}),
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

function safeDownloadName(name: string) {
  return name.replace(/\\/g, '/').split('/').pop() || 'document'
}

function responseFilename(disposition: string | null, fallback: string) {
  const encoded = disposition?.match(/filename\*\s*=\s*UTF-8''([^;]+)/i)?.[1]
  if (encoded) {
    try { return safeDownloadName(decodeURIComponent(encoded.trim())) } catch { /* use fallback */ }
  }
  const plain = disposition?.match(/filename\s*=\s*"?([^";]+)"?/i)?.[1]
  return safeDownloadName(plain || fallback)
}

export async function getSourceFile(
  documentId: string,
  fallbackName: string,
  signal: AbortSignal,
): Promise<{ blob: Blob; filename: string }> {
  const response = await fetch(`/api/documents/${encodeURIComponent(documentId)}/source`, { signal })
  if (!response.ok) throw new ApiError(response.status)
  return {
    blob: await response.blob(),
    filename: responseFilename(response.headers.get('content-disposition'), fallbackName),
  }
}
