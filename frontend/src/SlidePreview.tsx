import type { PageSummary } from './libraryApi'

export function SlidePreview({ page }: { page: PageSummary }) {
  if (!page.previewUrl) {
    return <div className="slide-artwork slide-artwork--missing" role="img" aria-label="プレビューはありません">プレビューなし</div>
  }
  return <img className="slide-artwork" src={page.previewUrl} alt={`${page.heading || `p.${page.pageNumber}`}のスライド画像`} loading="lazy" />
}
