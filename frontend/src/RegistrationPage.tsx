import { useEffect, useRef, useState, type DragEvent, type FormEvent } from 'react'
import { ApiError, getDocumentStatus, registerDocument } from './libraryApi'
import { Brand } from './Brand'

const maxFileSize = 50 * 1024 * 1024
type Phase = 'editing' | 'uploading' | 'processing' | 'deferred' | 'complete' | 'failed'
type FormValues = { title: string; authors: string; folderPath: string }
const emptyValues: FormValues = { title: '', authors: '', folderPath: '' }

function titleFromFilename(filename: string) {
  return filename.replace(/\.(pptx|pdf)$/i, '').replace(/[_-]+/g, ' ').trim().slice(0, 200)
}

function formatSize(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new DOMException('Aborted', 'AbortError')); return }
    const timer = window.setTimeout(() => { signal.removeEventListener('abort', onAbort); resolve() }, ms)
    const onAbort = () => { window.clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')) }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

export function RegistrationPage({ onBack, onCompleteBack, onOpenDocument, onRegistered }: {
  onBack: () => void
  onCompleteBack: () => void
  onOpenDocument: (id: string) => void
  onRegistered: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const taskRef = useRef<AbortController | null>(null)
  const requestIdRef = useRef<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [values, setValues] = useState<FormValues>(emptyValues)
  const [phase, setPhase] = useState<Phase>('editing')
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState(false)
  const [documentId, setDocumentId] = useState<string | null>(null)
  const [uploadStarted, setUploadStarted] = useState(false)

  useEffect(() => () => taskRef.current?.abort(), [])

  const rejectFile = (message: string) => {
    setFile(null)
    setValues(emptyValues)
    setDocumentId(null)
    setUploadStarted(false)
    requestIdRef.current = null
    setPhase('editing')
    setError(message)
    if (inputRef.current) inputRef.current.value = ''
  }

  const selectFile = (next: File | null) => {
    if (!next) return
    if (!/\.(pptx|pdf)$/i.test(next.name)) {
      rejectFile('PDFまたはPPTXファイルを選択してください。')
      return
    }
    if (next.size === 0) {
      rejectFile('空のファイルは登録できません。')
      return
    }
    if (next.size > maxFileSize) {
      rejectFile('ファイルは50 MB以下にしてください。')
      return
    }
    setFile(next)
    setValues({ ...emptyValues, title: titleFromFilename(next.name) })
    setPhase('editing')
    setDocumentId(null)
    setUploadStarted(false)
    requestIdRef.current = crypto.randomUUID()
    setError('')
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDragging(false)
    if (phase === 'uploading' || phase === 'processing' || documentId || uploadStarted) return
    if (event.dataTransfer.files.length !== 1) {
      rejectFile('ファイルを1つだけ選択してください。')
      return
    }
    selectFile(event.dataTransfer.files[0])
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!file) {
      setError('ファイルを選択してください。')
      return
    }
    if (!values.title.trim()) {
      setError('資料タイトルを入力してください。')
      return
    }

    const details = {
      file,
      title: values.title.trim(),
      requestId: requestIdRef.current ?? crypto.randomUUID(),
      authors: values.authors.split(/\r?\n/).map((item) => item.trim()).filter(Boolean),
      folderPath: values.folderPath.split('/').map((item) => item.trim()).filter(Boolean),
    }
    const controller = new AbortController()
    taskRef.current?.abort()
    taskRef.current = controller
    setError('')

    try {
      let id = documentId
      if (!id) {
        requestIdRef.current = details.requestId
        setUploadStarted(true)
        setPhase('uploading')
        const accepted = await registerDocument(details, controller.signal)
        id = accepted.id
        setDocumentId(id)
      }
      setPhase('processing')
      for (let attempt = 0; attempt < 15 && !controller.signal.aborted; attempt += 1) {
        let status
        try { status = await getDocumentStatus(id, controller.signal) }
        catch (cause) {
          if (cause instanceof ApiError && cause.status === 404) {
            setDocumentId(null)
            setUploadStarted(false)
            requestIdRef.current = crypto.randomUUID()
          }
          throw cause
        }
        if (status.status === 'ready') { onRegistered(); setPhase('complete'); return }
        if (status.status === 'failed') {
          setDocumentId(null)
          setUploadStarted(false)
          requestIdRef.current = crypto.randomUUID()
          throw new Error(status.error || '資料を解析できませんでした。')
        }
        await pause(Math.min(1500 * 1.5 ** attempt, 10_000), controller.signal)
      }
      if (!controller.signal.aborted) setPhase('deferred')
    } catch (cause) {
      if (!controller.signal.aborted) {
        if (cause instanceof ApiError && cause.status === 400) {
          setUploadStarted(false)
          requestIdRef.current = crypto.randomUUID()
        }
        setError(cause instanceof ApiError && cause.status === 400
          ? 'ファイル形式・サイズ・タイトルを確認してください。'
          : cause instanceof Error && cause.message && !(cause instanceof DOMException)
            ? cause.message : '通信に失敗しました。接続を確認して再試行してください。')
        setPhase('failed')
      }
    }
  }

  const busy = phase === 'uploading' || phase === 'processing'
  const metadataLocked = busy || uploadStarted || Boolean(documentId)
  const setValue = (key: keyof FormValues, value: string) => setValues((current) => ({ ...current, [key]: value }))
  const reset = () => {
    taskRef.current?.abort()
    setFile(null)
    setValues(emptyValues)
    setPhase('editing')
    setDocumentId(null)
    setUploadStarted(false)
    requestIdRef.current = null
    setError('')
    if (inputRef.current) inputRef.current.value = ''
  }

  return <div className="registration-shell">
    <header className="site-header registration-header">
      <Brand />
      <button type="button" onClick={phase === 'complete' ? onCompleteBack : onBack}>一覧に戻る</button>
    </header>
    <main className="registration-main">
      <h1>資料を登録</h1>
      {phase === 'complete' ? <section className="registration-complete" aria-live="polite">
        <p className="registration-kicker">完了</p>
        <h2>資料を登録しました</h2>
        <dl><dt>資料</dt><dd>{values.title}</dd><dt>ファイル</dt><dd>{file?.name}</dd></dl>
        <div className="registration-actions"><button type="button" onClick={reset}>別の資料を登録</button><button type="button" className="registration-primary" onClick={() => documentId && onOpenDocument(documentId)}>資料を見る</button></div>
      </section> : <>
        <section className="registration-section" aria-label="ファイル選択">
          <div className={`registration-dropzone${dragging ? ' is-dragging' : ''}`} onDragOver={(event) => { event.preventDefault(); setDragging(true) }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false) }} onDrop={handleDrop}>
            <div><strong>{file ? file.name : 'PDFまたはPPTXを選択'}</strong><span>{file ? `${formatSize(file.size)} · ${file.name.toLowerCase().endsWith('.pdf') ? 'PDF' : 'PPTX'}` : 'ここにドロップすることもできます · 最大50 MB'}</span></div>
            <input ref={inputRef} type="file" accept=".pdf,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation" className="sr-only" tabIndex={-1} aria-hidden="true" disabled={metadataLocked} onChange={(event) => selectFile(event.target.files?.[0] ?? null)} />
            <button type="button" disabled={metadataLocked} onClick={() => inputRef.current?.click()}>{file ? '変更する' : 'ファイルを選ぶ'}</button>
          </div>
        </section>

        {error && <p className="registration-error" role="alert">{error}</p>}

        {file && <form className="registration-form" onSubmit={submit}>
          <div className="registration-form-heading"><h2>登録情報</h2><span>ファイル名からタイトルを仮入力しています。確認して修正してください。</span></div>
          <div className="registration-fields">
            <label className="registration-field registration-field--wide"><span>資料タイトル <b>必須</b></span><input value={values.title} required maxLength={200} disabled={metadataLocked} onChange={(event) => setValue('title', event.target.value)} /></label>
            <label className="registration-field registration-field--wide"><span>著者</span><textarea value={values.authors} rows={2} disabled={metadataLocked} placeholder={'1行に1人ずつ入力'} onChange={(event) => setValue('authors', event.target.value)} /></label>
            <label className="registration-field registration-field--wide"><span>元フォルダ</span><input value={values.folderPath} disabled={metadataLocked} placeholder="例: 論文読会 / 2026" onChange={(event) => setValue('folderPath', event.target.value)} /><small>階層は / で区切って入力</small></label>
          </div>

          {(busy || phase === 'failed' || phase === 'deferred') && <div className="registration-progress" role="status" aria-live="polite">
            {busy ? <img className="mascot mascot--progress" src="/slide-mascot.png" alt="" /> : <span className="registration-progress-mark" aria-hidden="true" />}
            <div><strong>{phase === 'uploading' ? 'アップロード中' : phase === 'processing' ? '解析中' : phase === 'deferred' ? '解析を続けています' : '登録できませんでした'}</strong><span>{phase === 'uploading' ? 'ファイルを送信しています。' : phase === 'processing' ? 'スライドを処理しています。' : phase === 'deferred' ? '時間をおいて状態を再確認できます。' : documentId ? '資料の状態を再確認できます。' : '入力内容を確認して再試行できます。'}</span></div>
          </div>}

          <div className="registration-actions"><button type="button" disabled={busy} onClick={onBack}>キャンセル</button><button type="submit" className="registration-primary" disabled={busy}>{documentId && !busy ? '状態を再確認' : phase === 'failed' ? '再試行する' : '登録する'}</button></div>
        </form>}
      </>}
    </main>
  </div>
}
