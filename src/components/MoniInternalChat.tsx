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
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((message, index) => <div key={`${message.role}-${index}`} className={message.role === 'user' ? 'ml-10 rounded-2xl bg-[#1fae91] px-4 py-3 text-sm leading-6 text-white' : 'mr-4 rounded-2xl border border-[#d8e8e4] bg-white px-4 py-3 text-sm leading-6 text-[#263f4d]'}>{message.role === 'assistant' ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown> : message.content}</div>)}
            {sending && <div className="mr-20 rounded-2xl border border-[#d8e8e4] bg-white px-4 py-3 text-sm text-[#607d8d]">필요한 데이터를 확인하고 있어요…</div>}
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
    </>
  )
}
