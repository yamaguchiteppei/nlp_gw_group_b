import { useEffect, useRef, useState, type DragEvent, type FormEvent } from 'react'
import { registerDocumentMock, type RegistrationDetails, type RegistrationStage } from './mockRegistration'

const maxFileSize = 50 * 1024 * 1024
const categories = ['研究発表', '論文読会', '研究室セミナー']
type Phase = 'editing' | RegistrationStage | 'complete' | 'failed'
type FormValues = { title: string; authors: string; category: string; year: string; folderPath: string }
const emptyValues: FormValues = { title: '', authors: '', category: '', year: '', folderPath: '' }

function titleFromFilename(filename: string) {
  return filename.replace(/\.(pptx|pdf)$/i, '').replace(/[_-]+/g, ' ').trim().slice(0, 200)
}

function formatSize(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function RegistrationPage({ onBack }: { onBack: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const taskRef = useRef<AbortController | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [values, setValues] = useState<FormValues>(emptyValues)
  const [phase, setPhase] = useState<Phase>('editing')
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState(false)

  useEffect(() => () => taskRef.current?.abort(), [])

  const rejectFile = (message: string) => {
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
    setError('')
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDragging(false)
    if (phase === 'uploading' || phase === 'processing') return
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

    const details: RegistrationDetails = {
      file,
      title: values.title.trim(),
      authors: values.authors.split(/\r?\n/).map((item) => item.trim()).filter(Boolean),
      category: values.category,
      year: values.year.trim(),
      folderPath: values.folderPath.split('/').map((item) => item.trim()).filter(Boolean),
    }
    const controller = new AbortController()
    taskRef.current?.abort()
    taskRef.current = controller
    setError('')

    try {
      await registerDocumentMock(details, setPhase, controller.signal)
      setPhase('complete')
    } catch (cause) {
      if (!controller.signal.aborted) {
        setError(cause instanceof Error ? cause.message : '登録に失敗しました。再試行してください。')
        setPhase('failed')
      }
    }
  }

  const busy = phase === 'uploading' || phase === 'processing'
  const setValue = (key: keyof FormValues, value: string) => setValues((current) => ({ ...current, [key]: value }))
  const reset = () => {
    taskRef.current?.abort()
    setFile(null)
    setValues(emptyValues)
    setPhase('editing')
    setError('')
    if (inputRef.current) inputRef.current.value = ''
  }

  return <div className="registration-shell">
    <header className="site-header registration-header">
      <strong>Slide Library</strong>
      <button type="button" onClick={onBack}>一覧に戻る</button>
    </header>
    <main className="registration-main">
      <h1>資料を登録</h1>
      <p className="registration-demo-note">画面確認用のモックです。選択したファイルは保存されません。</p>

      {phase === 'complete' ? <section className="registration-complete" aria-live="polite">
        <p className="registration-kicker">完了</p>
        <h2>登録フローを確認しました</h2>
        <p>この画面ではファイルを保存していません。</p>
        <dl><dt>資料</dt><dd>{values.title}</dd><dt>ファイル</dt><dd>{file?.name}</dd></dl>
        <div className="registration-actions"><button type="button" onClick={reset}>別の資料を試す</button><button type="button" className="registration-primary" onClick={onBack}>一覧に戻る</button></div>
      </section> : <>
        <section className="registration-section" aria-label="ファイル選択">
          <div className={`registration-dropzone${dragging ? ' is-dragging' : ''}`} onDragOver={(event) => { event.preventDefault(); setDragging(true) }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false) }} onDrop={handleDrop}>
            <div><strong>{file ? file.name : 'PDFまたはPPTXを選択'}</strong><span>{file ? `${formatSize(file.size)} · ${file.name.toLowerCase().endsWith('.pdf') ? 'PDF' : 'PPTX'}` : 'ここにドロップすることもできます · 最大50 MB'}</span></div>
            <input ref={inputRef} type="file" accept=".pdf,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation" className="sr-only" tabIndex={-1} aria-hidden="true" disabled={busy} onChange={(event) => selectFile(event.target.files?.[0] ?? null)} />
            <button type="button" disabled={busy} onClick={() => inputRef.current?.click()}>{file ? '変更する' : 'ファイルを選ぶ'}</button>
          </div>
        </section>

        {error && <p className="registration-error" role="alert">{error}</p>}

        {file && <form className="registration-form" onSubmit={submit}>
          <div className="registration-form-heading"><h2>登録情報</h2><span>ファイル名からタイトルを仮入力しています。確認して修正してください。</span></div>
          <div className="registration-fields">
            <label className="registration-field registration-field--wide"><span>資料タイトル <b>必須</b></span><input value={values.title} required maxLength={200} disabled={busy} onChange={(event) => setValue('title', event.target.value)} /></label>
            <label className="registration-field registration-field--wide"><span>著者</span><textarea value={values.authors} rows={2} disabled={busy} placeholder={'1行に1人ずつ入力'} onChange={(event) => setValue('authors', event.target.value)} /></label>
            <label className="registration-field"><span>資料区分</span><select value={values.category} disabled={busy} onChange={(event) => setValue('category', event.target.value)}><option value="">未設定</option>{categories.map((category) => <option key={category} value={category}>{category}</option>)}</select></label>
            <label className="registration-field"><span>発表年</span><input type="number" min="1900" max="2100" value={values.year} disabled={busy} placeholder="例: 2026" onChange={(event) => setValue('year', event.target.value)} /></label>
            <label className="registration-field registration-field--wide"><span>元フォルダ</span><input value={values.folderPath} disabled={busy} placeholder="例: 論文読会 / 2026" onChange={(event) => setValue('folderPath', event.target.value)} /><small>階層は / で区切って入力</small></label>
          </div>

          {(busy || phase === 'failed') && <div className="registration-progress" role="status" aria-live="polite">
            <span className="registration-progress-mark" aria-hidden="true" />
            <div><strong>{phase === 'uploading' ? 'アップロード中' : phase === 'processing' ? '解析中' : '登録できませんでした'}</strong><span>{phase === 'uploading' ? 'ファイルを確認しています。' : phase === 'processing' ? 'スライドを処理しています。' : '入力内容を確認して再試行できます。'}</span></div>
          </div>}

          <div className="registration-actions"><button type="button" disabled={busy} onClick={onBack}>キャンセル</button><button type="submit" className="registration-primary" disabled={busy}>{phase === 'failed' ? '再試行する' : '登録の流れを確認'}</button></div>
        </form>}
      </>}
    </main>
  </div>
}
