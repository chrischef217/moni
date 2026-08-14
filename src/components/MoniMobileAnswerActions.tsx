'use client'

import { useEffect } from 'react'

const THREAD_KEY = 'moni-global-agent-thread-v11'

type AgentMessage = { id?: string; role?: string; content?: string }
type Rating = 'UP' | 'DOWN' | null

type FeedbackMap = Record<string, { rating?: 'UP' | 'DOWN'; learning_status?: string }>

const ICONS = {
  up: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.5 21H4.8A1.8 1.8 0 0 1 3 19.2v-7.4A1.8 1.8 0 0 1 4.8 10h2.7m0 11V10l4.1-6.1c.5-.8 1.8-.4 1.8.6v4.1h4.1a2.8 2.8 0 0 1 2.7 3.4l-1.5 6.7a3 3 0 0 1-2.9 2.3H7.5Z"/></svg>',
  down: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.5 3H4.8A1.8 1.8 0 0 0 3 4.8v7.4A1.8 1.8 0 0 0 4.8 14h2.7m0-11v11l4.1 6.1c.5.8 1.8.4 1.8-.6v-4.1h4.1a2.8 2.8 0 0 0 2.7-3.4l-1.5-6.7A3 3 0 0 0 15.8 3H7.5Z"/></svg>',
  copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>',
  share: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V3m0 0L7.5 7.5M12 3l4.5 4.5"/><path d="M5 11v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>',
  report: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h7l4 4v14H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></svg>',
}

function button(icon: string, label: string, extraClass = '') {
  const element = document.createElement('button')
  element.type = 'button'
  element.className = `moni-answer-action ${extraClass}`.trim()
  element.setAttribute('aria-label', label)
  element.title = label
  element.innerHTML = icon
  return element
}

function copyText(value: string) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(value)
  const area = document.createElement('textarea')
  area.value = value
  area.style.position = 'fixed'
  area.style.opacity = '0'
  document.body.appendChild(area)
  area.select()
  document.execCommand('copy')
  area.remove()
  return Promise.resolve()
}

function notice(text: string) {
  const previous = document.querySelector('[data-moni-action-notice]')
  previous?.remove()
  const node = document.createElement('div')
  node.dataset.moniActionNotice = 'true'
  node.className = 'moni-answer-notice'
  node.textContent = text
  document.body.appendChild(node)
  window.setTimeout(() => node.remove(), 1500)
}

function filenameFromDisposition(value: string | null) {
  const match = value?.match(/filename="?([^";]+)"?/i)
  return match?.[1] || `MONI_Report_${Date.now()}.docx`
}

export default function MoniMobileAnswerActions() {
  useEffect(() => {
    let disposed = false
    let syncing = false
    let syncTimer: number | null = null

    async function fetchContext(threadId: string) {
      const [messagesResponse, feedbackResponse] = await Promise.all([
        fetch(`/api/moni/agent-runtime?thread_id=${encodeURIComponent(threadId)}&_=${Date.now()}`, { cache: 'no-store' }),
        fetch(`/api/moni/answer-feedback?thread_id=${encodeURIComponent(threadId)}&_=${Date.now()}`, { cache: 'no-store' }),
      ])
      const messagesPayload = await messagesResponse.json() as { ok?: boolean; messages?: AgentMessage[] }
      const feedbackPayload = await feedbackResponse.json() as { ok?: boolean; feedback?: FeedbackMap }
      if (!messagesResponse.ok || !messagesPayload.ok) throw new Error('messages_unavailable')
      return {
        assistants: (messagesPayload.messages || []).filter((item) => item.role === 'assistant' && item.id),
        feedback: feedbackResponse.ok && feedbackPayload.ok ? (feedbackPayload.feedback || {}) : {},
      }
    }

    function setRatingState(toolbar: HTMLElement, rating: Rating) {
      toolbar.dataset.rating = rating || ''
      toolbar.querySelector('[data-rating="UP"]')?.classList.toggle('is-selected', rating === 'UP')
      toolbar.querySelector('[data-rating="DOWN"]')?.classList.toggle('is-selected', rating === 'DOWN')
    }

    async function saveRating(toolbar: HTMLElement, threadId: string, messageId: string, rating: Rating) {
      const prior = (toolbar.dataset.rating || '') as Rating
      const next: Rating = prior === rating ? null : rating
      setRatingState(toolbar, next)
      try {
        const response = await fetch('/api/moni/answer-feedback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ thread_id: threadId, assistant_message_id: messageId, rating: next }),
        })
        const payload = await response.json() as { ok?: boolean; error?: string }
        if (!response.ok || !payload.ok) throw new Error(payload.error || 'feedback_failed')
        notice(next === 'UP' ? '좋은 답변으로 기록했습니다.' : next === 'DOWN' ? '개선할 답변으로 기록했습니다.' : '평가를 취소했습니다.')
      } catch {
        setRatingState(toolbar, prior || null)
        notice('답변 평가를 저장하지 못했습니다.')
      }
    }

    async function downloadReport(buttonNode: HTMLButtonElement, threadId: string, messageId: string) {
      if (buttonNode.dataset.busy === '1') return
      buttonNode.dataset.busy = '1'
      buttonNode.classList.add('is-busy')
      const label = buttonNode.querySelector('span')
      if (label) label.textContent = '작성 중'
      try {
        const response = await fetch('/api/moni/answer-report', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ thread_id: threadId, assistant_message_id: messageId }),
        })
        if (!response.ok) throw new Error('report_failed')
        const blob = await response.blob()
        const url = URL.createObjectURL(blob)
        const anchor = document.createElement('a')
        anchor.href = url
        anchor.download = filenameFromDisposition(response.headers.get('Content-Disposition'))
        document.body.appendChild(anchor)
        anchor.click()
        anchor.remove()
        window.setTimeout(() => URL.revokeObjectURL(url), 5000)
        notice('MONI 보고서를 만들었습니다.')
      } catch {
        notice('보고서를 만들지 못했습니다.')
      } finally {
        buttonNode.dataset.busy = '0'
        buttonNode.classList.remove('is-busy')
        if (label) label.textContent = '보고서'
      }
    }

    function installToolbar(markdown: HTMLElement, threadId: string, message: AgentMessage, feedback: FeedbackMap) {
      const bubble = markdown.parentElement
      if (!bubble || !message.id) return
      let toolbar = bubble.querySelector<HTMLElement>(':scope > [data-moni-answer-actions]')
      if (!toolbar) {
        toolbar = document.createElement('div')
        toolbar.dataset.moniAnswerActions = 'true'
        toolbar.className = 'moni-answer-actions'

        const up = button(ICONS.up, '좋아요')
        up.dataset.rating = 'UP'
        const down = button(ICONS.down, '싫어요')
        down.dataset.rating = 'DOWN'
        const copy = button(ICONS.copy, '답변 복사')
        const share = button(ICONS.share, '답변 공유')
        const report = button(`${ICONS.report}<span>보고서</span>`, '보고서 다운로드', 'moni-answer-report')

        up.addEventListener('click', () => void saveRating(toolbar!, threadId, message.id!, 'UP'))
        down.addEventListener('click', () => void saveRating(toolbar!, threadId, message.id!, 'DOWN'))
        copy.addEventListener('click', () => void copyText(String(message.content || '')).then(() => notice('답변을 복사했습니다.')).catch(() => notice('복사하지 못했습니다.')))
        share.addEventListener('click', () => {
          const answer = String(message.content || '')
          if (navigator.share) {
            void navigator.share({ title: 'MONI 답변', text: answer }).catch((error) => {
              if (error instanceof DOMException && error.name === 'AbortError') return
              void copyText(answer).then(() => notice('공유 대신 답변을 복사했습니다.'))
            })
          } else {
            void copyText(answer).then(() => notice('공유 대신 답변을 복사했습니다.'))
          }
        })
        report.addEventListener('click', () => void downloadReport(report, threadId, message.id!))

        toolbar.append(up, down, copy, share, report)
        bubble.appendChild(toolbar)
      }
      toolbar.dataset.messageId = message.id
      setRatingState(toolbar, feedback[message.id]?.rating || null)
    }

    async function sync() {
      if (disposed || syncing) return
      const threadId = window.localStorage.getItem(THREAD_KEY) || ''
      const markdownNodes = Array.from(document.querySelectorAll<HTMLElement>('[data-moni-mobile-chat] .moni-markdown'))
      if (!threadId || markdownNodes.length === 0) return
      syncing = true
      try {
        const { assistants, feedback } = await fetchContext(threadId)
        const offset = Math.max(0, assistants.length - markdownNodes.length)
        markdownNodes.forEach((node, index) => {
          const message = assistants[offset + index]
          if (message) installToolbar(node, threadId, message, feedback)
        })
      } catch {
        // Action controls are secondary UX and must never block the chat.
      } finally {
        syncing = false
      }
    }

    const scheduleSync = () => {
      if (syncTimer !== null) window.clearTimeout(syncTimer)
      syncTimer = window.setTimeout(() => {
        syncTimer = null
        void sync()
      }, 80)
    }

    const observer = new MutationObserver(scheduleSync)
    observer.observe(document.body, { childList: true, subtree: true })
    scheduleSync()

    return () => {
      disposed = true
      observer.disconnect()
      if (syncTimer !== null) window.clearTimeout(syncTimer)
      document.querySelector('[data-moni-action-notice]')?.remove()
    }
  }, [])

  return (
    <style jsx global>{`
      .moni-answer-actions { display:flex; align-items:center; gap:3px; margin-top:10px; padding-top:8px; border-top:1px solid rgba(148,163,184,.18); min-height:38px; }
      .moni-answer-action { display:inline-flex; align-items:center; justify-content:center; width:36px; height:34px; padding:0; border:0; border-radius:10px; background:transparent; color:#647780; transition:background .16s ease,color .16s ease,transform .12s ease; -webkit-tap-highlight-color:transparent; }
      .moni-answer-action svg { width:18px; height:18px; fill:none; stroke:currentColor; stroke-width:1.75; stroke-linecap:round; stroke-linejoin:round; }
      .moni-answer-action:active { transform:scale(.92); }
      .moni-answer-action:hover { background:#f0f6f5; color:#254c59; }
      .moni-answer-action[data-rating="UP"].is-selected { background:#e6f7f1; color:#13866d; }
      .moni-answer-action[data-rating="DOWN"].is-selected { background:#fff1ed; color:#cf5a3d; }
      .moni-answer-report { width:auto; height:34px; gap:6px; margin-left:3px; padding:0 11px; border:1px solid #cce8e1; border-radius:12px; background:#f2fbf8; color:#167e6b; font-size:11px; font-weight:800; letter-spacing:-.01em; }
      .moni-answer-report svg { width:16px; height:16px; }
      .moni-answer-report.is-busy { opacity:.58; pointer-events:none; }
      .moni-answer-notice { position:fixed; left:50%; bottom:calc(env(safe-area-inset-bottom) + 92px); z-index:1400; max-width:86vw; transform:translateX(-50%); padding:9px 13px; border:1px solid rgba(23,59,82,.08); border-radius:999px; background:rgba(24,39,47,.92); color:white; box-shadow:0 8px 24px rgba(15,23,42,.18); font-size:12px; font-weight:700; white-space:nowrap; pointer-events:none; }
    `}</style>
  )
}
