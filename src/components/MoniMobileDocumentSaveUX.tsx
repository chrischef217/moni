'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const THREAD_KEY = 'moni-global-agent-thread-v11'

type SaveState = {
  phase: 'loading' | 'done' | 'error'
  progress: number
  fileName: string
  message: string
  viewUrl: string
}

function filenameFromDisposition(value: string | null) {
  if (!value) return `MONI_Answer_${Date.now()}.docx`
  const utf8 = value.match(/filename\*=UTF-8''([^;]+)/i)?.[1]
  if (utf8) {
    try { return decodeURIComponent(utf8) } catch { /* use fallback */ }
  }
  return value.match(/filename="?([^";]+)"?/i)?.[1] || `MONI_Answer_${Date.now()}.docx`
}

function downloadBlob(url: string, fileName: string) {
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
}

export default function MoniMobileDocumentSaveUX() {
  const [saveState, setSaveState] = useState<SaveState | null>(null)
  const busyRef = useRef(false)
  const viewUrlRef = useRef('')

  const releaseViewUrl = () => {
    if (!viewUrlRef.current) return
    URL.revokeObjectURL(viewUrlRef.current)
    viewUrlRef.current = ''
  }

  const closeModal = () => {
    if (busyRef.current) return
    releaseViewUrl()
    setSaveState(null)
  }

  const openDocument = () => {
    const url = viewUrlRef.current
    if (!url) return
    const opened = window.open(url, '_blank', 'noopener,noreferrer')
    if (!opened) {
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.target = '_blank'
      anchor.rel = 'noopener noreferrer'
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
    }
  }

  useEffect(() => {
    let disposed = false

    async function saveDocument(button: HTMLButtonElement) {
      if (busyRef.current) return
      const toolbar = button.closest<HTMLElement>('[data-moni-answer-actions]')
      const messageId = toolbar?.dataset.messageId || ''
      const threadId = window.localStorage.getItem(THREAD_KEY) || ''
      if (!messageId || !threadId) {
        setSaveState({ phase: 'error', progress: 0, fileName: '', viewUrl: '', message: '저장할 MONI 답변을 확인하지 못했습니다.' })
        return
      }

      busyRef.current = true
      releaseViewUrl()
      setSaveState({ phase: 'loading', progress: 8, fileName: '', viewUrl: '', message: '답변을 문서로 만들고 있습니다.' })

      let waitingProgress = 8
      const waitingTimer = window.setInterval(() => {
        waitingProgress = Math.min(34, waitingProgress + 3)
        setSaveState((current) => current?.phase === 'loading' ? { ...current, progress: waitingProgress } : current)
      }, 220)

      try {
        const response = await fetch('/api/moni/answer-report', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ thread_id: threadId, assistant_message_id: messageId }),
          cache: 'no-store',
        })
        window.clearInterval(waitingTimer)

        if (!response.ok) {
          const payload = await response.json().catch(() => ({})) as { error?: string }
          throw new Error(payload.error || '문서 파일을 만들지 못했습니다.')
        }

        const fileName = filenameFromDisposition(response.headers.get('Content-Disposition'))
        const contentType = response.headers.get('Content-Type') || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        const contentLength = Number(response.headers.get('Content-Length') || 0)
        let blob: Blob

        if (response.body) {
          const reader = response.body.getReader()
          const chunks: Uint8Array[] = []
          let received = 0
          let fallbackProgress = 35
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            if (!value) continue
            chunks.push(value)
            received += value.byteLength
            const nextProgress = contentLength > 0
              ? Math.min(94, 35 + Math.round((received / contentLength) * 59))
              : Math.min(94, fallbackProgress += 6)
            setSaveState({ phase: 'loading', progress: nextProgress, fileName, viewUrl: '', message: '파일을 다운로드하고 있습니다.' })
          }
          blob = new Blob(chunks, { type: contentType })
        } else {
          setSaveState({ phase: 'loading', progress: 82, fileName, viewUrl: '', message: '파일을 다운로드하고 있습니다.' })
          blob = await response.blob()
        }

        if (disposed) return
        const viewUrl = URL.createObjectURL(blob)
        viewUrlRef.current = viewUrl
        downloadBlob(viewUrl, fileName)
        setSaveState({
          phase: 'done',
          progress: 100,
          fileName,
          viewUrl,
          message: '문서 저장이 완료되었습니다.',
        })
      } catch (error) {
        window.clearInterval(waitingTimer)
        if (!disposed) {
          setSaveState({
            phase: 'error',
            progress: 0,
            fileName: '',
            viewUrl: '',
            message: error instanceof Error ? error.message : '문서 저장 중 오류가 발생했습니다.',
          })
        }
      } finally {
        busyRef.current = false
      }
    }

    const interceptDocumentSave = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Element)) return
      const button = target.closest<HTMLButtonElement>('.moni-answer-report')
      if (!button) return
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
      void saveDocument(button)
    }

    document.addEventListener('click', interceptDocumentSave, true)
    return () => {
      disposed = true
      document.removeEventListener('click', interceptDocumentSave, true)
      releaseViewUrl()
    }
  }, [])

  if (!saveState || typeof document === 'undefined') return null

  const done = saveState.phase === 'done'
  const failed = saveState.phase === 'error'

  return createPortal(
    <div className="moni-docsave-backdrop" role="presentation">
      <section className="moni-docsave-modal" role="dialog" aria-modal="true" aria-labelledby="moni-docsave-title">
        <div className={`moni-docsave-icon ${done ? 'is-done' : failed ? 'is-error' : 'is-loading'}`} aria-hidden="true">
          {done ? '✓' : failed ? '!' : '↓'}
        </div>
        <h2 id="moni-docsave-title">{done ? '문서 저장 완료' : failed ? '문서 저장 실패' : '문서 저장 중'}</h2>
        <p className="moni-docsave-message">{saveState.message}</p>
        {saveState.fileName ? <p className="moni-docsave-filename">{saveState.fileName}</p> : null}

        {!failed ? (
          <div className="moni-docsave-progress-wrap">
            <div
              className="moni-docsave-progress"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={saveState.progress}
            >
              <span style={{ width: `${saveState.progress}%` }} />
            </div>
            <strong>{saveState.progress}%</strong>
          </div>
        ) : null}

        <div className="moni-docsave-actions">
          {done ? <button type="button" className="moni-docsave-view" onClick={openDocument}>문서 보기</button> : null}
          {(done || failed) ? <button type="button" className="moni-docsave-close" onClick={closeModal}>닫기</button> : null}
        </div>
      </section>

      <style jsx global>{`
        .moni-docsave-backdrop {
          position: fixed;
          inset: 0;
          z-index: 5000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 22px;
          background: rgba(8, 25, 37, .38);
          backdrop-filter: blur(5px);
          -webkit-backdrop-filter: blur(5px);
        }
        .moni-docsave-modal {
          width: min(100%, 390px);
          border: 1px solid rgba(164, 207, 198, .55);
          border-radius: 28px;
          background: rgba(255, 255, 255, .98);
          padding: 28px 24px 22px;
          box-shadow: 0 28px 80px rgba(15, 43, 55, .24);
          text-align: center;
          color: #173b52;
          animation: moniDocSaveEnter .2s ease-out both;
        }
        .moni-docsave-icon {
          display: grid;
          width: 58px;
          height: 58px;
          margin: 0 auto 16px;
          place-items: center;
          border-radius: 20px;
          font-size: 30px;
          font-weight: 900;
        }
        .moni-docsave-icon.is-loading {
          background: linear-gradient(145deg, #e7f8f3, #d7f1eb);
          color: #178d76;
          animation: moniDocSavePulse 1.1s ease-in-out infinite;
        }
        .moni-docsave-icon.is-done { background: #e4f7f0; color: #13866d; }
        .moni-docsave-icon.is-error { background: #fff0ec; color: #d45b43; }
        .moni-docsave-modal h2 {
          margin: 0;
          font-size: 21px;
          line-height: 1.35;
          letter-spacing: -.03em;
        }
        .moni-docsave-message {
          margin: 9px 0 0;
          color: #64808d;
          font-size: 13px;
          font-weight: 650;
          line-height: 1.55;
        }
        .moni-docsave-filename {
          margin: 10px auto 0;
          max-width: 100%;
          overflow: hidden;
          color: #476675;
          font-size: 11px;
          font-weight: 700;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .moni-docsave-progress-wrap {
          display: grid;
          grid-template-columns: 1fr 38px;
          align-items: center;
          gap: 10px;
          margin-top: 21px;
        }
        .moni-docsave-progress {
          height: 10px;
          overflow: hidden;
          border-radius: 999px;
          background: #e8f1ef;
          box-shadow: inset 0 1px 2px rgba(23, 59, 82, .08);
        }
        .moni-docsave-progress span {
          display: block;
          height: 100%;
          border-radius: inherit;
          background: linear-gradient(90deg, #33b89c, #148a72);
          transition: width .18s ease;
        }
        .moni-docsave-progress-wrap strong {
          color: #16866f;
          font-size: 12px;
          text-align: right;
        }
        .moni-docsave-actions {
          display: flex;
          justify-content: center;
          gap: 9px;
          margin-top: 22px;
        }
        .moni-docsave-actions button {
          min-height: 45px;
          border-radius: 14px;
          padding: 0 18px;
          font-size: 13px;
          font-weight: 850;
          -webkit-tap-highlight-color: transparent;
        }
        .moni-docsave-view {
          border: 0;
          background: linear-gradient(135deg, #24a98d, #16836d);
          color: white;
          box-shadow: 0 8px 22px rgba(22, 131, 109, .2);
        }
        .moni-docsave-close {
          border: 1px solid #d8e7e4;
          background: #f7fbfa;
          color: #526f7e;
        }
        @keyframes moniDocSaveEnter {
          from { opacity: 0; transform: translateY(10px) scale(.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes moniDocSavePulse {
          0%, 100% { transform: translateY(0); box-shadow: 0 0 0 0 rgba(24, 141, 118, .12); }
          50% { transform: translateY(3px); box-shadow: 0 0 0 9px rgba(24, 141, 118, 0); }
        }
      `}</style>
    </div>,
    document.body,
  )
}
