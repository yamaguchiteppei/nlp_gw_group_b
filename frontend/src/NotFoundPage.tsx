import { Brand } from './Brand'

export function NotFoundPage() {
  return <div className="not-found-shell">
    <header className="site-header"><Brand /></header>
    <main className="not-found-main">
      <img className="mascot mascot--not-found" src="/slide-mascot-404.png" alt="" />
      <p className="not-found-code">404</p>
      <h1>ページが見つかりません</h1>
      <a href="/">検索に戻る</a>
    </main>
  </div>
}
