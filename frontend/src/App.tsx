import { useEffect, useState } from 'react'

type ApiStatus = '確認中' | '接続済み' | '接続できません'

function App() {
  const [apiStatus, setApiStatus] = useState<ApiStatus>('確認中')

  useEffect(() => {
    const controller = new AbortController()

    fetch('/api/health', { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('API is unavailable')
        setApiStatus('接続済み')
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name !== 'AbortError') {
          setApiStatus('接続できません')
        }
      })

    return () => controller.abort()
  }, [])

  return (
    <main>
      <h1>Slide Library</h1>
      <p>スライドをページ単位で探し、再利用するためのライブラリです。</p>
      <p>API: {apiStatus}</p>
    </main>
  )
}

export default App
