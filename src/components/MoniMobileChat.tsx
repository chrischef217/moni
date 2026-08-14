'use client'

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

type Message = { role: 'user' | 'assistant'; content: string }
type Reply = { ok?: boolean; text?: string; error?: string; thread_id?: string }
type SpeechRecognitionAlternativeLike = { transcript: string }
type SpeechRecognitionResultLike = {
  isFinal: boolean
  length: number
  [index: number]: SpeechRecognitionAlternativeLike
}
type SpeechRecognitionEventLike = {
  resultIndex: number
  results: {
    length: number
    [index: number]: SpeechRecognitionResultLike
  }
}
type SpeechRecognitionLike = {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: { error?: string }) => void) | null
  onend: (() => void) | null
  onstart?: (() => void) | null
  onspeechstart?: (() => void) | null
  onspeechend?: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor
    webkitSpeechRecognition?: SpeechRecognitionConstructor
  }
}

const THREAD_KEY = 'moni-global-agent-thread-v11'
const BASE_WAVE = [7, 11, 16, 22, 29, 18, 25, 13, 31, 20, 15, 9, 6]

function pageContext() {
  return {
    pathname: window.location.pathname,
    search: window.location.search,
    title: document.title,
    headings: Array.from(document.querySelectorAll<HTMLElement>('h1,h2'))
      .map((node) => (node.textContent || '').trim())
      .filter(Boolean)
      .slice(0, 6),
  }
}

function MicrophoneIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-none stroke-current" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3M9 21h6" />
    </svg>
  )
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-none stroke-current" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 19V5M6.5 10.5 12 5l5.5 5.5" />
    </svg>
  )
}

function MobileMoniCharacter({ status }: { status: 'live' | 'thinking' | 'listening' | 'issue' }) {
  return (
    <div className={`moni-mobile-character moni-mobile-character-${status}`} aria-hidden="true">
      <span className="moni-mobile-antenna-stem" />
      <span className="moni-mobile-antenna-dot" />
      <span className="moni-mobile-face-glow" />
      <span className="moni-mobile-eye moni-mobile-eye-left" />
      <span className="moni-mobile-eye moni-mobile-eye-right" />
      <span className="moni-mobile-mouth" />
      <span className="moni-mobile-ear moni-mobile-ear-left" />
      <span className="moni-mobile-ear moni-mobile-ear-right" />
    </div>
  )
}

function ThinkingIndicator({ seconds }: { seconds: number }) {
  return (
    <div role="status" aria-live="polite" className="mr-10 rounded-2xl border border-[#d8e8e4] bg-white px-4 py-3 text-[#607d8d] shadow-[0_5px_18px_rgba(23,59,82,0.04)]">
      <div className="flex items-center gap-2.5">
        <span className="text-xs font-bold text-[#456b79]">MONI가 확인 중</span>
        <span className="flex h-4 items-end gap-1" aria-hidden="true">
          <span className="moni-thinking-dot h-1.5 w-1.5 rounded-full bg-[#3584e4]" />
          <span className="moni-thinking-dot h-1.5 w-1.5 rounded-full bg-[#3584e4] [animation-delay:160ms]" />
          <span className="moni-thinking-dot h-1.5 w-1.5 rounded-full bg-[#3584e4] [animation-delay:320ms]" />
        </span>
      </div>
      <div className="mt-1 text-[11px] leading-4 text-[#78909d]">
        {seconds < 20 ? '필요한 데이터를 조회하고 답을 정리하고 있어요.' : `데이터 조회가 길어지고 있습니다. ${seconds}초째 처리 중입니다.`}
      </div>
    </div>
  )
}

export default function MoniMobileChat() {
  const [messages, setMessages] = useState<Message[]>([])
  const [threadId, setThreadId] = useState('')
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [thinkingSeconds, setThinkingSeconds] = useState(0)
  const [error, setError] = useState('')
  const [listening, setListening] = useState(false)
  const [voiceFinishing, setVoiceFinishing] = useState(false)
  const [speechActive, setSpeechActive] = useState(false)
  const [voiceDraft, setVoiceDraft] = useState('')
  const [waveTick, setWaveTick] = useState(0)

  const scrollRef = useRef<HTMLDivElement>(null)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const voiceSeedRef = useRef('')
  const voiceDraftRef = useRef('')
  const finishTimerRef = useRef<number | null>(null)

  const status = error ? 'issue' : sending ? 'thinking' : listening ? 'listening' : 'live'
  const statusLabel = error ? 'ISSUE' : sending ? 'THINKING' : listening ? 'LISTENING' : 'LIVE'

  useEffect(() => {
    const saved = window.localStorage.getItem(THREAD_KEY) || ''
    if (!saved) return
    setThreadId(saved)
    void fetch(`/api/moni/agent-runtime?thread_id=${encodeURIComponent(saved)}&_=${Date.now()}`, { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json() as { ok?: boolean; messages?: Array<{ role?: string; content?: string }> }
        if (!response.ok || !payload.ok) throw new Error('restore_failed')
        setMessages((payload.messages || [])
          .filter((item) => item.role === 'user' || item.role === 'assistant')
          .map((item) => ({ role: item.role as 'user' | 'assistant', content: String(item.content || '') })))
      })
      .catch(() => {
        window.localStorage.removeItem(THREAD_KEY)
        setThreadId('')
      })
  }, [])

  useEffect(() => {
    window.setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }), 20)
  }, [messages, sending])

  useEffect(() => {
    if (!sending) {
      setThinkingSeconds(0)
      return
    }
    const started = Date.now()
    const timer = window.setInterval(() => setThinkingSeconds(Math.floor((Date.now() - started) / 1000)), 1000)
    return () => window.clearInterval(timer)
  }, [sending])

  useEffect(() => {
    if (!listening) return
    const timer = window.setInterval(() => setWaveTick((value) => value + 1), speechActive ? 95 : 240)
    return () => window.clearInterval(timer)
  }, [listening, speechActive])

  useEffect(() => () => {
    try { recognitionRef.current?.abort() } catch { /* no-op */ }
    if (finishTimerRef.current !== null) window.clearTimeout(finishTimerRef.current)
  }, [])

  function rebuildTranscript(event: SpeechRecognitionEventLike) {
    const pieces: string[] = []
    for (let index = 0; index < event.results.length; index += 1) {
      const result = event.results[index]
      const transcript = String(result[0]?.transcript || '').trim()
      if (transcript) pieces.push(transcript)
    }
    return pieces.join(' ').replace(/\s+/g, ' ').trim()
  }

  function finalizeVoiceDraft() {
    if (finishTimerRef.current !== null) {
      window.clearTimeout(finishTimerRef.current)
      finishTimerRef.current = null
    }
    const recognized = voiceDraftRef.current.trim()
    if (recognized) {
      const combined = [voiceSeedRef.current, recognized].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()
      setInput(combined)
      setError('')
    } else {
      setError('음성을 인식하지 못했습니다. 다시 마이크를 누르고 천천히 말씀해 주세요.')
    }
    setListening(false)
    setVoiceFinishing(false)
    setSpeechActive(false)
    recognitionRef.current = null
  }

  async function startVoiceInput() {
    if (sending || listening) return
    setError('')
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!Recognition) {
      setError('이 브라우저에서는 음성 받아쓰기를 지원하지 않습니다. Android Chrome에서 다시 시도해 주세요.')
      return
    }

    try {
      voiceSeedRef.current = input.trim()
      voiceDraftRef.current = ''
      setVoiceDraft('')
      setVoiceFinishing(false)
      setSpeechActive(false)

      const recognition = new Recognition()
      recognition.continuous = true
      recognition.interimResults = true
      recognition.lang = 'ko-KR'
      recognition.onstart = () => setListening(true)
      recognition.onspeechstart = () => setSpeechActive(true)
      recognition.onspeechend = () => setSpeechActive(false)
      recognition.onresult = (event) => {
        const transcript = rebuildTranscript(event)
        voiceDraftRef.current = transcript
        setVoiceDraft(transcript)
        if (transcript) setSpeechActive(true)
      }
      recognition.onerror = (event) => {
        const code = event.error || 'unknown'
        if (code === 'not-allowed' || code === 'service-not-allowed') {
          setError('마이크 권한이 필요합니다. Chrome 사이트 설정에서 마이크를 허용해 주세요.')
        } else if (code !== 'aborted' && code !== 'no-speech') {
          setError(`음성 인식 오류가 발생했습니다. (${code})`)
        }
        if (!voiceFinishing) finalizeVoiceDraft()
      }
      recognition.onend = () => finalizeVoiceDraft()
      recognitionRef.current = recognition
      setListening(true)
      recognition.start()
    } catch (voiceError) {
      setListening(false)
      setVoiceFinishing(false)
      setError(voiceError instanceof DOMException && voiceError.name === 'NotAllowedError'
        ? '마이크 권한이 필요합니다.'
        : '음성 입력을 시작할 수 없습니다. 브라우저 마이크 권한을 확인해 주세요.')
    }
  }

  function confirmVoiceInput() {
    if (!listening || voiceFinishing) return
    setVoiceFinishing(true)
    setSpeechActive(false)
    const recognition = recognitionRef.current
    if (recognition) {
      try { recognition.stop() } catch { finalizeVoiceDraft() }
      finishTimerRef.current = window.setTimeout(() => finalizeVoiceDraft(), 900)
    } else {
      finalizeVoiceDraft()
    }
  }

  async function send(raw: string) {
    const question = raw.trim()
    if (!question || sending || listening) return
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

  function submit(event: FormEvent) {
    event.preventDefault()
    void send(input)
  }

  function keyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void send(input)
    }
  }

  return (
    <>
      <header className="flex shrink-0 items-center gap-3 border-b border-[#d7e9e5] bg-white/95 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+12px)] backdrop-blur-xl">
        <MobileMoniCharacter status={status} />
        <div className="min-w-0 flex-1">
          <h1 className="text-[16px] font-black tracking-[-0.02em] text-[#173b52]">MONI</h1>
          <div className={`moni-live-state moni-live-state-${status}`} role="status" aria-live="polite">
            <span className="moni-live-dot" aria-hidden="true" />
            <span>{statusLabel}</span>
          </div>
        </div>
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 pb-5 pt-5">
        {messages.length === 0 ? (
          <div className="space-y-3">
            <div className="mx-auto max-w-[92%] rounded-2xl border border-[#d8e8e4] bg-white px-4 py-3 text-sm leading-6 text-[#263f4d] shadow-[0_5px_18px_rgba(23,59,82,0.035)]">
              무엇이든 말씀하세요. 필요한 두배 데이터를 확인하고 답하겠습니다.
            </div>
            {sending ? <ThinkingIndicator seconds={thinkingSeconds} /> : null}
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((message, index) => (
              <div key={`${message.role}-${index}`} className={message.role === 'user'
                ? 'ml-10 rounded-2xl bg-[#1fae91] px-4 py-3 text-sm leading-6 text-white'
                : 'mr-2 rounded-2xl border border-[#d8e8e4] bg-white px-4 py-3 text-sm leading-6 text-[#263f4d] shadow-[0_5px_18px_rgba(23,59,82,0.035)]'}>
                {message.role === 'assistant'
                  ? <div className="moni-markdown"><ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown></div>
                  : message.content}
              </div>
            ))}
            {sending ? <ThinkingIndicator seconds={thinkingSeconds} /> : null}
          </div>
        )}
      </div>

      <footer data-moni-mobile-composer className="shrink-0 bg-gradient-to-t from-white via-white/98 to-white/88 px-3 pb-[calc(env(safe-area-inset-bottom)+10px)] pt-2">
        {error ? <div className="mb-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold leading-5 text-amber-800">{error}</div> : null}
        <form onSubmit={submit}>
          <div className={`overflow-hidden rounded-[28px] border bg-white shadow-[0_8px_32px_rgba(23,59,82,0.12)] transition ${listening ? 'border-violet-300 ring-4 ring-violet-100/70' : 'border-[#d2dfdc]'}`}>
            {listening ? (
              <div className="flex min-h-[78px] items-center gap-3 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="flex h-9 items-center justify-center gap-[3px]" aria-label="음성 인식 상태">
                    {BASE_WAVE.map((height, index) => {
                      const activeHeight = speechActive ? 8 + ((height + waveTick * (index + 3)) % 27) : 6 + (index % 3) * 2
                      return <span key={index} className="w-[3px] rounded-full bg-violet-500 transition-[height] duration-100" style={{ height: `${activeHeight}px` }} />
                    })}
                  </div>
                  <div className="mt-1 min-h-[18px] truncate text-center text-[12px] font-semibold text-[#5f6670]">
                    {voiceDraft || (voiceFinishing ? '음성을 텍스트로 정리하고 있어요…' : '듣고 있어요… 말씀해 주세요')}
                  </div>
                </div>
                <button type="button" onClick={confirmVoiceInput} disabled={voiceFinishing} className="h-11 shrink-0 rounded-full bg-violet-100 px-4 text-xs font-black text-violet-700 disabled:opacity-50">
                  {voiceFinishing ? '처리 중' : '확인'}
                </button>
              </div>
            ) : (
              <div className="flex min-h-[58px] items-end gap-1.5 px-2 py-2">
                <textarea
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={keyDown}
                  disabled={sending}
                  rows={1}
                  placeholder="MONI에게 메시지"
                  className="max-h-32 min-h-[42px] min-w-0 flex-1 resize-none bg-transparent px-3 py-[11px] text-[15px] leading-5 text-[#173b52] outline-none placeholder:text-[#9ba6ab] disabled:opacity-60"
                />
                <button type="button" onClick={() => void startVoiceInput()} disabled={sending} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[#27343b] transition active:scale-95 disabled:opacity-30" aria-label="음성으로 입력">
                  <MicrophoneIcon />
                </button>
                <button type="submit" disabled={sending || !input.trim()} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#17191b] text-white transition active:scale-95 disabled:bg-[#d7dcde] disabled:text-white" aria-label="전송">
                  <SendIcon />
                </button>
              </div>
            )}
          </div>
        </form>
      </footer>

      <style jsx global>{`
        .moni-thinking-dot { animation: moniThinkingDot 1.05s ease-in-out infinite; }
        @keyframes moniThinkingDot { 0%,70%,100% { transform: translateY(0); opacity:.35; } 35% { transform: translateY(-4px); opacity:1; } }
        .moni-mobile-character { position:relative; width:54px; height:54px; flex:0 0 auto; border:1px solid rgb(255 255 255 / .25); border-radius:19px; background:#0c2337; box-shadow:0 10px 26px rgb(2 6 23 / .20); animation:moniMobileFloat 2.7s ease-in-out infinite; transform-origin:center; }
        .moni-mobile-character-thinking { box-shadow:0 10px 28px rgb(53 132 228 / .28),0 0 0 3px rgb(53 132 228 / .09); }
        .moni-mobile-character-listening { box-shadow:0 10px 28px rgb(139 92 246 / .25),0 0 0 3px rgb(139 92 246 / .08); }
        .moni-mobile-character-issue { box-shadow:0 10px 28px rgb(245 158 11 / .24),0 0 0 3px rgb(245 158 11 / .08); }
        .moni-mobile-antenna-stem { position:absolute; top:-7px; left:50%; width:3px; height:9px; transform:translateX(-50%); border-radius:999px; background:rgb(110 231 183 / .8); }
        .moni-mobile-antenna-dot { position:absolute; top:-12px; left:50%; width:8px; height:8px; transform:translateX(-50%); border:1px solid rgb(209 250 229 / .42); border-radius:999px; background:rgb(52 211 153); box-shadow:0 0 12px rgb(110 231 183 / .65); }
        .moni-mobile-face-glow { position:absolute; inset:3px; border-radius:16px; background:linear-gradient(135deg,rgb(110 231 183 / .20),rgb(103 232 249 / .10) 52%,rgb(59 130 246 / .20)); }
        .moni-mobile-eye { position:absolute; top:19px; width:7px; height:7px; border-radius:999px; background:rgb(236 253 245); animation:moniMobileBlink 2.15s ease-in-out infinite; transform-origin:center; }
        .moni-mobile-eye-left { left:15px; } .moni-mobile-eye-right { right:15px; }
        .moni-mobile-mouth { position:absolute; left:50%; bottom:12px; width:14px; height:7px; transform:translateX(-50%); border-bottom:2px solid rgb(209 250 229 / .92); border-radius:0 0 12px 12px; }
        .moni-mobile-ear { position:absolute; top:25px; width:4px; height:12px; border-radius:999px; background:rgb(103 232 249 / .50); }
        .moni-mobile-ear-left { left:-3px; } .moni-mobile-ear-right { right:-3px; }
        @keyframes moniMobileFloat { 0%,100% { transform:translateY(0) scale(1); } 50% { transform:translateY(-3px) scale(1.018); } }
        @keyframes moniMobileBlink { 0%,34%,42%,100% { transform:scaleY(1); } 38% { transform:scaleY(.08); } }
        .moni-live-state { display:inline-flex; align-items:center; gap:6px; margin-top:3px; font-size:10px; font-weight:900; letter-spacing:.13em; }
        .moni-live-dot { width:7px; height:7px; border-radius:999px; flex:0 0 auto; }
        .moni-live-state-live { color:#dc2626; } .moni-live-state-live .moni-live-dot { background:#ef4444; animation:moniLivePulse 1.25s ease-out infinite; }
        .moni-live-state-thinking { color:#2563eb; } .moni-live-state-thinking .moni-live-dot { background:#3b82f6; animation:moniThinkingPulse .85s ease-in-out infinite; }
        .moni-live-state-listening { color:#7c3aed; } .moni-live-state-listening .moni-live-dot { background:#8b5cf6; animation:moniThinkingPulse .75s ease-in-out infinite; }
        .moni-live-state-issue { color:#d97706; } .moni-live-state-issue .moni-live-dot { background:#f59e0b; }
        @keyframes moniLivePulse { 0% { box-shadow:0 0 0 0 rgb(239 68 68 / .48); opacity:1; } 70% { box-shadow:0 0 0 7px rgb(239 68 68 / 0); opacity:.7; } 100% { box-shadow:0 0 0 0 rgb(239 68 68 / 0); opacity:1; } }
        @keyframes moniThinkingPulse { 0%,100% { transform:scale(.82); opacity:.6; } 50% { transform:scale(1.18); opacity:1; } }
        .moni-markdown { line-height:1.65; } .moni-markdown > :first-child { margin-top:0; } .moni-markdown > :last-child { margin-bottom:0; }
        .moni-markdown h1,.moni-markdown h2 { margin:14px 0 7px; color:#173b52; font-size:15px; font-weight:900; line-height:1.45; }
        .moni-markdown h3 { margin:12px 0 6px; color:#245466; font-size:14px; font-weight:900; }
        .moni-markdown p { margin:0 0 9px; } .moni-markdown strong { color:#173b52; font-weight:900; }
        .moni-markdown ul,.moni-markdown ol { margin:6px 0 11px 20px; padding:0; } .moni-markdown ul { list-style:disc; } .moni-markdown ol { list-style:decimal; }
        .moni-markdown table { display:block; width:100%; margin:10px 0 12px; overflow-x:auto; border:1px solid #d6e7e3; border-radius:10px; border-collapse:separate; border-spacing:0; font-size:12px; }
        .moni-markdown th,.moni-markdown td { min-width:82px; padding:8px 9px; border-right:1px solid #e2eeeb; border-bottom:1px solid #e2eeeb; text-align:left; vertical-align:top; }
        @media (prefers-reduced-motion:reduce) { .moni-thinking-dot,.moni-mobile-character,.moni-mobile-eye,.moni-live-dot { animation:none !important; } }
      `}</style>
    </>
  )
}
