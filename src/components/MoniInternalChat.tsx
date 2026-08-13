'use client'

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

type Message = { role: 'user' | 'assistant'; content: string }
type Reply = { ok?: boolean; text?: string; error?: string; thread_id?: string }
const THREAD_KEY = 'moni-global-agent-thread-v11'

function pageContext() {
  return {
    pathname: window.location.pathname,
    search: window.location.search,
    title: document.title,
    headings: Array.from(document.querySelectorAll<HTMLElement>('h1,h2')).map((node) => (node.textContent || '').trim()).filter(Boolean).slice(0, 6),
  }
}

function ThinkingIndicator() {
  return (
    <div role="status" aria-live="polite" aria-label="MONI가 생각 중입니다" className="mr-20 rounded-2xl border border-[#d8e8e4] bg-white px-4 py-3 text-[#607d8d] shadow-[0_5px_18px_rgba(23,59,82,0.04)]">
      <div className="flex items-center gap-2.5">
        <span className="text-xs font-bold text-[#456b79]">MONI가 생각 중</span>
        <span className="flex h-4 items-end gap-1" aria-hidden="true">
          <span className="moni-thinking-dot h-1.5 w-1.5 rounded-full bg-[#1fae91]" />
          <span className="moni-thinking-dot h-1.5 w-1.5 rounded-full bg-[#1fae91] [animation-delay:160ms]" />
          <span className="moni-thinking-dot h-1.5 w-1.5 rounded-full bg-[#1fae91] [animation-delay:320ms]" />
        </span>
      </div>
      <div className="mt-1 text-[11px] leading-4 text-[#78909d]">필요한 데이터를 확인하고 답을 정리하고 있어요.</div>
    </div>
  )
}

export default function MoniInternalChat() {
  const [messages, setMessages] = useState<Message[]>([])
  const [threadId, setThreadId] = useState('')
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const saved = window.localStorage.getItem(THREAD_KEY) || ''
    if (!saved) return
    setThreadId(saved)
    void fetch(`/api/moni/agent-runtime?thread_id=${encodeURIComponent(saved)}&_=${Date.now()}`, { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json() as { ok?: boolean; messages?: Array<{ role?: string; content?: string }> }
        if (!response.ok || !payload.ok) throw new Error('restore_failed')
        setMessages((payload.messages || []).filter((item) => item.role === 'user' || item.role === 'assistant').map((item) => ({ role: item.role as 'user' | 'assistant', content: String(item.content || '') })))
      })
      .catch(() => {
        window.localStorage.removeItem(THREAD_KEY)
        setThreadId('')
      })
  }, [])

  useEffect(() => {
    window.setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }), 20)
  }, [messages, sending])

  async function send(raw: string) {
    const question = raw.trim()
    if (!question || sending) return
    setSending(true)
    setError('')
    setInput('')
    setMessages((current) => [...current, { role: 'user', content: question }])
    try {
      const response = await fetch('/api/moni/agent-runtime', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: question, thread_id: threadId || undefined, page: pageContext() }),
      })
      const payload = await response.json() as Reply
      if (!response.ok || !payload.ok || !payload.text) throw new Error(payload.error || 'MONI 응답을 받지 못했습니다.')
      if (payload.thread_id) {
        setThreadId(payload.thread_id)
        window.localStorage.setItem(THREAD_KEY, payload.thread_id)
      }
      setMessages((current) => [...current, { role: 'assistant', content: payload.text! }])
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : 'MONI 연결 오류')
    } finally {
      setSending(false)
    }
  }

  function submit(event: FormEvent) { event.preventDefault(); void send(input) }
  function keyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(input) }
  }
  function reset() {
    if (sending) return
    window.localStorage.removeItem(THREAD_KEY)
    setThreadId('')
    setMessages([])
    setInput('')
    setError('')
  }

  return (
    <>
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div className="space-y-3">
            <div className="mr-4 rounded-2xl border border-[#d8e8e4] bg-white px-4 py-3 text-sm leading-6 text-[#263f4d]">무엇이든 말씀하세요. 필요한 두배 데이터를 확인하고 답하겠습니다.</div>
            {['지금 제일 먼저 할 일?', '오늘 받을 돈 있어?', '이번 달 생산 상황 분석해줘'].map((starter) => <button key={starter} type="button" onClick={() => void send(starter)} className="block w-full rounded-xl border border-[#cee2de] bg-white px-3 py-2.5 text-left text-xs font-bold text-[#35606f] hover:bg-[#f3fbf8]">{starter}</button>)}
            {sending && <ThinkingIndicator />}
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((message, index) => (
              <div key={`${message.role}-${index}`} className={message.role === 'user' ? 'ml-10 rounded-2xl bg-[#1fae91] px-4 py-3 text-sm leading-6 text-white' : 'mr-2 rounded-2xl border border-[#d8e8e4] bg-white px-4 py-3 text-sm leading-6 text-[#263f4d] shadow-[0_5px_18px_rgba(23,59,82,0.035)]'}>
                {message.role === 'assistant' ? <div className="moni-markdown"><ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown></div> : message.content}
              </div>
            ))}
            {sending && <ThinkingIndicator />}
          </div>
        )}
      </div>
      <footer className="border-t border-[#d7e9e5] bg-white/90 p-3">
        {error && <div className="mb-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">{error}</div>}
        <form onSubmit={submit} className="rounded-2xl border border-[#c9dfda] bg-[#f7fbfa] p-2">
          <div className="flex items-end gap-2">
            <button type="button" onClick={reset} disabled={sending} className="h-10 shrink-0 rounded-xl px-2 text-[11px] font-bold text-[#607d8d] disabled:opacity-40">새 대화</button>
            <textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={keyDown} disabled={sending} rows={1} placeholder="MONI에게 질문하세요" className="max-h-28 min-h-10 min-w-0 flex-1 resize-none bg-transparent px-1 py-2 text-sm text-[#173b52] outline-none placeholder:text-[#8aa0aa] disabled:opacity-60" />
            <button type="submit" disabled={sending || !input.trim()} className="rounded-xl bg-[#21b99a] px-4 py-2.5 text-sm font-black text-white disabled:opacity-35">전송</button>
          </div>
        </form>
        <div className="mt-2 px-1 text-[10px] text-[#78909d]">대화 상태 유지 · 변경 작업은 승인 절차 적용</div>
      </footer>

      <style jsx global>{`
        .moni-thinking-dot { animation: moniThinkingDot 1.05s ease-in-out infinite; }
        @keyframes moniThinkingDot {
          0%, 70%, 100% { transform: translateY(0); opacity: 0.35; }
          35% { transform: translateY(-4px); opacity: 1; }
        }
        .moni-markdown { line-height: 1.65; }
        .moni-markdown > :first-child { margin-top: 0; }
        .moni-markdown > :last-child { margin-bottom: 0; }
        .moni-markdown h1,
        .moni-markdown h2 { margin: 14px 0 7px; color: #173b52; font-size: 15px; font-weight: 900; line-height: 1.45; }
        .moni-markdown h2 { border-bottom: 1px solid #e1eeeb; padding-bottom: 5px; }
        .moni-markdown h3 { margin: 12px 0 6px; color: #245466; font-size: 14px; font-weight: 900; }
        .moni-markdown p { margin: 0 0 9px; }
        .moni-markdown strong { color: #173b52; font-weight: 900; }
        .moni-markdown ul,
        .moni-markdown ol { margin: 6px 0 11px 20px; padding: 0; }
        .moni-markdown ul { list-style: disc; }
        .moni-markdown ol { list-style: decimal; }
        .moni-markdown li { margin: 5px 0; padding-left: 2px; }
        .moni-markdown li::marker { color: #0f8f78; font-weight: 800; }
        .moni-markdown table { display: block; width: 100%; margin: 10px 0 12px; overflow-x: auto; border: 1px solid #d6e7e3; border-radius: 10px; border-collapse: separate; border-spacing: 0; font-size: 12px; line-height: 1.5; }
        .moni-markdown thead { background: #edf8f5; color: #245466; }
        .moni-markdown th,
        .moni-markdown td { min-width: 82px; padding: 8px 9px; border-right: 1px solid #e2eeeb; border-bottom: 1px solid #e2eeeb; text-align: left; vertical-align: top; }
        .moni-markdown th { white-space: nowrap; font-weight: 900; }
        .moni-markdown tr:last-child td { border-bottom: 0; }
        .moni-markdown th:last-child,
        .moni-markdown td:last-child { border-right: 0; }
        .moni-markdown blockquote { margin: 10px 0; border-left: 4px solid #56c8b0; border-radius: 0 8px 8px 0; background: #f1faf7; padding: 8px 10px; color: #35606f; }
        .moni-markdown code { border-radius: 4px; background: #edf5f3; padding: 1px 4px; color: #245466; font-size: 12px; }
        @media (prefers-reduced-motion: reduce) { .moni-thinking-dot { animation: none !important; opacity: 0.75; } }
      `}</style>
    </>
  )
}
