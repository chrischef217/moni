'use client'

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
}

type AgentResponse = {
  ok: boolean
  text?: string
  error?: string
  model?: string
  read_only?: boolean
}

type IntelligenceResponse = {
  ok: boolean
  top_action?: {
    severity?: string
    title?: string
    action?: string
  } | null
}

const HISTORY_KEY = 'moni-global-agent-history-v9'
const BUBBLE_KEY = 'moni-global-agent-bubble-v9'
const MAX_STORED_MESSAGES = 20

const STARTERS = [
  '지금 제일 먼저 할 일?',
  '오늘 받을 돈 있어?',
  '이번 달 목표매출 상황은?',
]

function readHistory(): ChatMessage[] {
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(HISTORY_KEY) || '[]')
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((item) => item?.role === 'user' || item?.role === 'assistant')
      .map((item) => ({ role: item.role, content: String(item.content || '').slice(0, 12000) }))
      .filter((item) => item.content)
      .slice(-MAX_STORED_MESSAGES)
  } catch {
    return []
  }
}

function pageContext() {
  const headings = Array.from(document.querySelectorAll<HTMLElement>('h1,h2'))
    .map((element) => (element.textContent || '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
  return {
    pathname: window.location.pathname,
    search: window.location.search,
    title: document.title,
    headings: Array.from(new Set(headings)).slice(0, 6),
  }
}

function bubbleRecentlyShown() {
  try {
    const last = Number(window.sessionStorage.getItem(BUBBLE_KEY) || 0)
    return Number.isFinite(last) && Date.now() - last < 30 * 60 * 1000
  } catch {
    return false
  }
}

function saveBubbleTimestamp() {
  try {
    window.sessionStorage.setItem(BUBBLE_KEY, String(Date.now()))
  } catch {
    // sessionStorage can be unavailable in restricted browser modes.
  }
}

export default function GlobalMoniAgent() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [model, setModel] = useState('')
  const [bubble, setBubble] = useState('MONI에게 무엇이든 물어보세요.')
  const [showBubble, setShowBubble] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setMessages(readHistory())

    let cancelled = false
    let hideTimer: number | undefined
    const loadBubble = async () => {
      if (bubbleRecentlyShown()) return
      let next = 'MONI에게 무엇이든 물어보세요.'
      try {
        const response = await fetch(`/api/moni/intelligence?_=${Date.now()}`, { cache: 'no-store' })
        const payload = await response.json() as IntelligenceResponse
        const severity = payload.top_action?.severity
        if (response.ok && payload.ok && payload.top_action?.title && (severity === 'critical' || severity === 'high')) {
          next = payload.top_action.title
        }
      } catch {
        // The idle invitation is still useful when Intelligence is temporarily unavailable.
      }
      if (cancelled) return
      setBubble(next)
      setShowBubble(true)
      saveBubbleTimestamp()
      hideTimer = window.setTimeout(() => setShowBubble(false), 12000)
    }
    const startTimer = window.setTimeout(() => void loadBubble(), 900)
    return () => {
      cancelled = true
      window.clearTimeout(startTimer)
      if (hideTimer) window.clearTimeout(hideTimer)
    }
  }, [])

  useEffect(() => {
    try {
      window.sessionStorage.setItem(HISTORY_KEY, JSON.stringify(messages.slice(-MAX_STORED_MESSAGES)))
    } catch {
      // Conversation persistence is best-effort only.
    }
    window.setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }), 30)
  }, [messages, open])

  useEffect(() => {
    if (open) window.setTimeout(() => inputRef.current?.focus(), 120)
  }, [open])

  const hasConversation = messages.length > 0
  const lastAssistant = useMemo(() => [...messages].reverse().find((message) => message.role === 'assistant'), [messages])

  async function sendMessage(value: string) {
    const question = value.trim()
    if (!question || sending) return

    const prior = messages.slice(-10)
    setMessages((current) => [...current, { role: 'user', content: question }])
    setInput('')
    setError('')
    setSending(true)

    try {
      const response = await fetch('/api/moni/agent-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: question,
          messages: prior,
          page: pageContext(),
        }),
      })
      const payload = await response.json() as AgentResponse
      if (!response.ok || !payload.ok || !payload.text) throw new Error(payload.error || 'MONI 응답을 불러오지 못했습니다.')
      setModel(payload.model || '')
      setMessages((current) => [...current, { role: 'assistant', content: payload.text! }])
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message : 'MONI 응답을 불러오지 못했습니다.'
      setError(message)
      setMessages((current) => [...current, { role: 'assistant', content: `지금은 답변을 생성하지 못했습니다.\n\n${message}` }])
    } finally {
      setSending(false)
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    void sendMessage(input)
  }

  function resetConversation() {
    setMessages([])
    setError('')
    setModel('')
    try {
      window.sessionStorage.removeItem(HISTORY_KEY)
    } catch {
      // no-op
    }
  }

  return (
    <div data-global-moni-agent className="pointer-events-none fixed bottom-4 right-4 z-[130] md:bottom-6 md:right-6">
      {showBubble && !open && (
        <button
          type="button"
          onClick={() => { setOpen(true); setShowBubble(false) }}
          className="pointer-events-auto absolute bottom-[78px] right-0 w-[min(320px,calc(100vw-32px))] rounded-2xl border border-white/20 bg-[#0c1d33]/95 px-4 py-3 text-left text-sm font-bold leading-5 text-white shadow-[0_18px_55px_rgba(2,6,23,0.42)] backdrop-blur-xl"
        >
          <span className="mb-1 block text-[11px] font-black uppercase tracking-[0.14em] text-emerald-300">MONI</span>
          {bubble}
          <span className="absolute -bottom-2 right-7 h-4 w-4 rotate-45 border-b border-r border-white/20 bg-[#0c1d33]" />
        </button>
      )}

      {open && (
        <section className="pointer-events-auto absolute bottom-[82px] right-0 flex h-[min(680px,calc(100vh-120px))] w-[min(440px,calc(100vw-24px))] flex-col overflow-hidden rounded-[28px] border border-white/20 bg-[#071426]/95 text-slate-100 shadow-[0_28px_90px_rgba(2,6,23,0.58)] backdrop-blur-2xl">
          <header className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-[15px] border border-emerald-300/30 bg-gradient-to-br from-emerald-300/25 via-cyan-300/15 to-blue-500/25 shadow-inner">
                <span className="absolute top-2.5 left-2.5 h-1.5 w-1.5 rounded-full bg-emerald-100" />
                <span className="absolute top-2.5 right-2.5 h-1.5 w-1.5 rounded-full bg-emerald-100" />
                <span className="mt-3 h-1 w-3 rounded-full bg-emerald-100/75" />
              </div>
              <div className="min-w-0"><div className="flex items-center gap-2"><h2 className="font-black text-white">MONI</h2><span className="rounded-full border border-blue-400/25 bg-blue-400/10 px-2 py-0.5 text-[10px] font-black text-blue-200">READ ONLY</span></div><p className="truncate text-xs text-slate-500">현재 화면과 경영 데이터를 함께 봅니다.</p></div>
            </div>
            <div className="flex items-center gap-1">
              {hasConversation && <button type="button" onClick={resetConversation} className="rounded-lg px-2 py-1.5 text-xs font-bold text-slate-500 hover:bg-white/5 hover:text-slate-300">새 대화</button>}
              <button type="button" onClick={() => setOpen(false)} className="flex h-8 w-8 items-center justify-center rounded-lg text-lg text-slate-400 hover:bg-white/5 hover:text-white" aria-label="MONI 닫기">×</button>
            </div>
          </header>

          <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            {!hasConversation ? (
              <div className="space-y-5">
                <div className="rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.05] p-4">
                  <p className="text-sm font-black text-emerald-100">무엇부터 확인할까요?</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">수금, 매출목표, 현금흐름, 생산 데이터를 실제 MONI 기록 기준으로 조회합니다. 저장·수정은 아직 실행하지 않습니다.</p>
                </div>
                <div className="space-y-2">
                  {STARTERS.map((starter) => <button key={starter} type="button" onClick={() => void sendMessage(starter)} className="block w-full rounded-xl border border-white/10 bg-white/[0.025] px-4 py-3 text-left text-sm font-bold text-slate-300 transition hover:border-emerald-400/25 hover:bg-emerald-400/[0.05] hover:text-white">{starter}</button>)}
                </div>
                <button type="button" onClick={() => { window.location.href = '/intelligence' }} className="text-xs font-bold text-violet-300 hover:text-violet-200">MONI Intelligence 전체 우선순위 열기 →</button>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((message, index) => (
                  <div key={`${message.role}-${index}`} className={message.role === 'user' ? 'ml-10' : 'mr-4'}>
                    <div className={`rounded-2xl px-4 py-3 text-sm leading-6 ${message.role === 'user' ? 'bg-blue-500/20 text-blue-50' : 'border border-white/10 bg-white/[0.035] text-slate-200'}`}>
                      {message.role === 'assistant' ? (
                        <div className="moni-agent-markdown"><ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown></div>
                      ) : message.content}
                    </div>
                  </div>
                ))}
                {sending && <div className="mr-16 rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3 text-sm text-slate-400"><span className="inline-flex items-center gap-1.5"><i className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-300" /><i className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-300 [animation-delay:120ms]" /><i className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-300 [animation-delay:240ms]" />MONI가 현재 데이터를 확인하고 있습니다.</span></div>}
              </div>
            )}
          </div>

          <footer className="border-t border-white/10 bg-[#071426]/85 p-3">
            {error && <div className="mb-2 rounded-lg border border-red-400/20 bg-red-400/[0.06] px-3 py-2 text-[11px] text-red-200">{error}</div>}
            <form onSubmit={submit} className="flex items-end gap-2 rounded-2xl border border-white/15 bg-black/15 p-2 focus-within:border-emerald-400/35">
              <input ref={inputRef} value={input} onChange={(event) => setInput(event.target.value)} disabled={sending} maxLength={4000} placeholder="MONI에게 물어보세요" className="min-w-0 flex-1 bg-transparent px-2 py-2 text-sm text-white outline-none placeholder:text-slate-600" />
              <button type="submit" disabled={sending || !input.trim()} className="rounded-xl bg-emerald-400 px-4 py-2 text-sm font-black text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-35">전송</button>
            </form>
            <div className="mt-2 flex items-center justify-between px-1 text-[10px] text-slate-600"><span>V9 · 조회 전용 · 승인 없는 DB 변경 금지</span><span>{model || (lastAssistant ? 'Gemini' : '')}</span></div>
          </footer>
        </section>
      )}

      <button
        type="button"
        onClick={() => { setOpen((current) => !current); setShowBubble(false) }}
        aria-label="MONI Agent 열기"
        className={`moni-agent-character pointer-events-auto relative h-[68px] w-[68px] rounded-[24px] border shadow-[0_16px_48px_rgba(2,6,23,0.48)] transition hover:-translate-y-1 ${open ? 'border-emerald-300/55 bg-[#102b38]' : 'border-white/25 bg-[#0c2337]'}`}
      >
        <span className="absolute -top-2 left-1/2 h-3 w-1 -translate-x-1/2 rounded-full bg-emerald-300/80" />
        <span className="absolute -top-3.5 left-1/2 h-2.5 w-2.5 -translate-x-1/2 rounded-full border border-emerald-100/40 bg-emerald-300 shadow-[0_0_14px_rgba(110,231,183,0.65)]" />
        <span className="absolute inset-1 rounded-[20px] bg-gradient-to-br from-emerald-300/20 via-cyan-300/10 to-blue-500/20" />
        <span className="moni-agent-eye absolute left-[18px] top-[23px] h-2.5 w-2.5 rounded-full bg-emerald-50" />
        <span className="moni-agent-eye absolute right-[18px] top-[23px] h-2.5 w-2.5 rounded-full bg-emerald-50 [animation-delay:2.7s]" />
        <span className="absolute bottom-[17px] left-1/2 h-1.5 w-4 -translate-x-1/2 rounded-full bg-emerald-100/80" />
        <span className="absolute -left-1 top-8 h-4 w-1.5 rounded-full bg-cyan-300/50" />
        <span className="absolute -right-1 top-8 h-4 w-1.5 rounded-full bg-cyan-300/50" />
        {!open && <span className="absolute -right-1 -top-1 h-3.5 w-3.5 rounded-full border-2 border-[#071426] bg-emerald-400" />}
      </button>

      <style jsx global>{`
        .moni-agent-character { animation: moniAgentBreathe 4.6s ease-in-out infinite; }
        .moni-agent-eye { animation: moniAgentBlink 5.2s ease-in-out infinite; transform-origin: center; }
        .moni-agent-markdown p { margin: 0 0 0.55rem; }
        .moni-agent-markdown p:last-child { margin-bottom: 0; }
        .moni-agent-markdown ul, .moni-agent-markdown ol { margin: 0.45rem 0 0.55rem 1.15rem; }
        .moni-agent-markdown li { margin: 0.15rem 0; }
        .moni-agent-markdown strong { color: #fff; font-weight: 800; }
        .moni-agent-markdown table { width: 100%; margin: 0.6rem 0; border-collapse: collapse; font-size: 0.78rem; }
        .moni-agent-markdown th, .moni-agent-markdown td { border: 1px solid rgba(255,255,255,0.12); padding: 0.35rem 0.45rem; text-align: left; }
        @keyframes moniAgentBreathe { 0%,100% { transform: translateY(0) scale(1); } 50% { transform: translateY(-2px) scale(1.015); } }
        @keyframes moniAgentBlink { 0%,44%,48%,100% { transform: scaleY(1); } 46% { transform: scaleY(0.12); } }
        @media (prefers-reduced-motion: reduce) { .moni-agent-character, .moni-agent-eye { animation: none !important; } }
      `}</style>
    </div>
  )
}
