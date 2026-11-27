export type RegistrationStage = 'uploading' | 'processing'

export type RegistrationDetails = {
  file: File
  title: string
  authors: string[]
  category: string
  year: string
  folderPath: string[]
}

function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }

    const timer = window.setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      window.clearTimeout(timer)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

export async function registerDocumentMock(
  _details: RegistrationDetails,
  onStage: (stage: RegistrationStage) => void,
  signal: AbortSignal,
): Promise<void> {
  onStage('uploading')
  await pause(700, signal)
  onStage('processing')
  await pause(1000, signal)

  // The optional URL state makes the failure view inspectable without adding a demo control to the form.
  if (new URLSearchParams(window.location.search).get('demo') === 'failed') {
    throw new Error('解析を完了できませんでした。入力内容を確認して再試行してください。')
  }
}
