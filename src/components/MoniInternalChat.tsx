'use client'

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

type Message = { role: 'user' | 'assistant'; content: string }
type Reply = { ok?: boolean; text?: string; error?: string; thread_id?: string }
type MoniInternalChatProps = { mobile?: boolean }
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
const DEFAULT_WAVE = [0.2, 0.3, 0.42, 0.56, 0.72, 0.9, 0.68, 0.48, 0.82, 0.6, 0.4, 0.28, 0.18]

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

function ThinkingIndicator() {
  return (
    <div role="status" aria-live="polite" aria-label="MONI가 생각 중입니다" className="mr-16 rounded-2xl border border-[#d8e8e4] bg-white px-4 py-3 text-[#607d8d] shadow-[0_5px_18px_rgba(23,59,82,0.04)]">
      <div className="flex items-center gap-2.5">
        <span className="text-xs font-bold text-[#456b79]">MONI가 생각 중</span>
        <span className="flex h-4 items-end gap-1" aria-hidden="true">
          <span className="moni-thinking-dot h-1.5 w-1.5 rounded-full bg-[#3584e4]" />
          <span className="moni-thinking-dot h-1.5 w-1.5 rounded-full bg-[#3584e4] [animation-delay:160ms]" />
          <span className="moni-thinking-dot h-1.5 w-1.5 rounded-full bg-[#3584e4] [animation-delay:320ms]" />
        </span>
      </div>
      <div className="mt-1 text-[11px] leading-4 text-[#78909d]">필요한 데이터를 확인하고 답을 정리하고 있어요.</div>
    </div>
  )
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

function MobileStatusHeader({ sending, listening, error }: { sending: boolean; listening: boolean; error: string }) {
  const state = error ? 'issue' : sending ? 'thinking' : listening ? 'listening' : 'live'
  const label = error ? 'ISSUE' : sending ? 'THINKING' : listening ? 'LISTENING' : 'LIVE'

  return (
    <header className="flex shrink-0 items-center gap-3 border-b border-[#d7e9e5] bg-white/95 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+12px)] backdrop-blur-xl">
      <MobileMoniCharacter status={state} />
      <div className="min-w-0 flex-1">
        <h1 className="text-[16px] font-black tracking-[-0.02em] text-[#173b52]">MONI</h1>
        <div className={`moni-live-state moni-live-state-${state}`} role="status" aria-live="polite">
          <span className="moni-live-dot" aria-hidden="true" />
          <span>{label}</span>
        </div>
      </div>
    </header>
  )
}

export default function MoniInternalChat({ mobile = false }: MoniInternalChatProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [threadId, setThreadId] = useState('')
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [listening, setListening] = useState(false)
  const [voiceInterim, setVoiceInterim] = useState('')
  const [voiceLevels, setVoiceLevels] = useState(DEFAULT_WAVE)
  const scrollRef = useRef<HTMLDivElement>(null)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const meterFrameRef = useRef<number | null>(null)
  const voiceSeedRef = useRef('')
  const voiceFinalRef = useRef('')

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

  useEffect(() => () => {
    try { recognitionRef.current?.abort() } catch { /* no-op */ }
    stopVoiceMeter()
  }, [])

  async function send(raw: string) {
    const question = raw.trim()
    if (!question || sending) return
    if (listening) stopVoiceInput()
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

  function reset() {
    if (sending) return
    if (listening) stopVoiceInput()
    window.localStorage.removeItem(THREAD_KEY)
    setThreadId('')
    setMessages([])
    setInput('')
    setError('')
  }

  function stopVoiceMeter() {
    if (meterFrameRef.current !== null) {
      window.cancelAnimationFrame(meterFrameRef.current)
      meterFrameRef.current = null
    }
    analyserRef.current = null
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop())
    mediaStreamRef.current = null
    const context = audioContextRef.current
    audioContextRef.current = null
    if (context && context.state !== 'closed') void context.close().catch(() => undefined)
    setVoiceLevels(DEFAULT_WAVE)
  }

  async function startVoiceMeter() {
    if (!navigator.mediaDevices?.getUserMedia) return
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    mediaStreamRef.current = stream
    const context = new AudioContext()
    audioContextRef.current = context
    const analyser = context.createAnalyser()
    analyser.fftSize = 256
    analyser.smoothingTimeConstant = 0.72
    analyserRef.current = analyser
    context.createMediaStreamSource(stream).connect(analyser)
    const data = new Uint8Array(analyser.frequencyBinCount)
    const bandCount = DEFAULT_WAVE.length

    const updateMeter = () => {
      analyser.getByteFrequencyData(data)
      const bandSize = Math.max(1, Math.floor(data.length / bandCount))
      const next = Array.from({ length: bandCount }, (_, bandIndex) => {
        let total = 0
        let count = 0
        const start = bandIndex * bandSize
        const end = Math.min(data.length, start + bandSize)
        for (let index = start; index < end; index += 1) {
          total += data[index]
          count += 1
        }
        const level = count ? total / count / 118 : 0
        return Math.max(0.13, Math.min(1, level))
      })
      setVoiceLevels(next)
      meterFrameRef.current = window.requestAnimationFrame(updateMeter)
    }
    updateMeter()
  }

  async function startVoiceInput() {
    if (sending || listening) return
    setError('')
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!Recognition) {
      setError('이 브라우저에서는 음성 받아쓰기를 지원하지 않습니다. 모바일 Chrome에서 다시 시도해 주세요.')
      return
    }

    try {
      await startVoiceMeter()
      voiceSeedRef.current = input.trim()
      voiceFinalRef.current = ''
      setVoiceInterim('')
      const recognition = new Recognition()
      recognition.continuous = true
      recognition.interimResults = true
      recognition.lang = 'ko-KR'
      recognition.onresult = (event) => {
        let interim = ''
        let finalText = ''
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const result = event.results[index]
          const transcript = String(result[0]?.transcript || '').trim()
          if (!transcript) continue
          if (result.isFinal) finalText = [finalText, transcript].filter(Boolean).join(' ')
          else interim = [interim, transcript].filter(Boolean).join(' ')
        }
        if (finalText) {
          voiceFinalRef.current = [voiceFinalRef.current, finalText].filter(Boolean).join(' ')
          setInput([voiceSeedRef.current, voiceFinalRef.current].filter(Boolean).join(' '))
        }
        setVoiceInterim(interim)
      }
      recognition.onerror = (event) => {
        const code = event.error || 'unknown'
        if (code !== 'aborted' && code !== 'no-speech') {
          setError(code === 'not-allowed' ? '마이크 권한이 필요합니다.' : '음성 입력 중 문제가 발생했습니다. 다시 시도해 주세요.')
        }
        setListening(false)
        setVoiceInterim('')
        stopVoiceMeter()
      }
      recognition.onend = () => {
        setListening(false)
        setVoiceInterim('')
        recognitionRef.current = null
        stopVoiceMeter()
      }
      recognitionRef.current = recognition
      setListening(true)
      recognition.start()
    } catch (voiceError) {
      stopVoiceMeter()
      setListening(false)
      setError(voiceError instanceof DOMException && voiceError.name === 'NotAllowedError'
        ? '마이크 권한이 필요합니다.'
        : '마이크를 시작할 수 없습니다. 브라우저 권한을 확인해 주세요.')
    }
  }

  function stopVoiceInput() {
    const recognition = recognitionRef.current
    recognitionRef.current = null
    if (recognition) {
      try { recognition.stop() } catch { /* no-op */ }
    }
    setListening(false)
    setVoiceInterim('')
    stopVoiceMeter()
  }

  const emptyState = messages.length === 0

  return (
    <>
      {mobile ? <MobileStatusHeader sending={sending} listening={listening} error={error} /> : null}

      <div ref={scrollRef} className={`min-h-0 flex-1 overflow-y-auto ${mobile ? 'px-4 pb-5 pt-5' : 'px-4 py-4'}`}>
        {emptyState ? (
          <div className="space-y-3">
            <div className={`${mobile ? 'mx-auto max-w-[92%]' : 'mr-4'} rounded-2xl border border-[#d8e8e4] bg-white px-4 py-3 text-sm leading-6 text-[#263f4d] shadow-[0_5px_18px_rgba(23,59,82,0.035)]`}>
              무엇이든 말씀하세요. 필요한 두배 데이터를 확인하고 답하겠습니다.
            </div>
            {!mobile ? ['지금 제일 먼저 할 일?', '오늘 받을 돈 있어?', '이번 달 생산 상황 분석해줘'].map((starter) => (
              <button key={starter} type="button" onClick={() => void send(starter)} className="block w-full rounded-xl border border-[#cee2de] bg-white px-3 py-2.5 text-left text-xs font-bold text-[#35606f] hover:bg-[#f3fbf8]">
                {starter}
              </button>
            )) : null}
            {sending && <ThinkingIndicator />}
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
            {sending && <ThinkingIndicator />}
          </div>
        )}
      </div>

      {mobile ? (
        <footer data-moni-mobile-composer className="shrink-0 bg-gradient-to-t from-white via-white/98 to-white/88 px-3 pb-[calc(env(safe-area-inset-bottom)+10px)] pt-2">
          {error ? <div className="mb-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold leading-5 text-amber-800">{error}</div> : null}
          <form onSubmit={submit}>
            <div className={`overflow-hidden rounded-[28px] border bg-white shadow-[0_8px_32px_rgba(23,59,82,0.12)] transition ${listening ? 'border-violet-300 ring-4 ring-violet-100/70' : 'border-[#d2dfdc]'}`}>
              {listening ? (
                <div className="flex min-h-[72px] items-center gap-3 px-3 py-2">
                  <button type="button" onClick={stopVoiceInput} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#18181b] text-white" aria-label="음성 입력 중지">
                    <span className="h-3.5 w-3.5 rounded-[3px] bg-white" />
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex h-9 items-center justify-center gap-[3px]" aria-label="마이크 입력 음량">
                      {voiceLevels.map((level, index) => (
                        <span key={index} className="w-[3px] rounded-full bg-violet-500 transition-[height] duration-75" style={{ height: `${Math.max(5, Math.round(level * 30))}px` }} />
                      ))}
                    </div>
                    <div className="mt-0.5 truncate text-center text-[11px] font-semibold text-[#68727a]">{voiceInterim || '듣고 있어요… 말씀해 주세요'}</div>
                  </div>
                  <button type="button" onClick={stopVoiceInput} className="h-10 shrink-0 rounded-full bg-violet-100 px-3 text-xs font-black text-violet-700">완료</button>
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
      ) : (
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
      )}

      <style jsx global>{`
        .moni-thinking-dot { animation: moniThinkingDot 1.05s ease-in-out infinite; }
        @keyframes moniThinkingDot {
          0%, 70%, 100% { transform: translateY(0); opacity: 0.35; }
          35% { transform: translateY(-4px); opacity: 1; }
        }

        .moni-mobile-character {
          position: relative;
          width: 54px;
          height: 54px;
          flex: 0 0 auto;
          border: 1px solid rgb(255 255 255 / 0.25);
          border-radius: 19px;
          background: #0c2337;
          box-shadow: 0 10px 26px rgb(2 6 23 / 0.20);
          animation: moniMobileFloat 2.7s ease-in-out infinite;
          transform-origin: center;
          transition: box-shadow 180ms ease, border-color 180ms ease;
        }
        .moni-mobile-character-thinking { box-shadow: 0 10px 28px rgb(53 132 228 / 0.28), 0 0 0 3px rgb(53 132 228 / 0.09); }
        .moni-mobile-character-listening { box-shadow: 0 10px 28px rgb(139 92 246 / 0.25), 0 0 0 3px rgb(139 92 246 / 0.08); }
        .moni-mobile-character-issue { box-shadow: 0 10px 28px rgb(245 158 11 / 0.24), 0 0 0 3px rgb(245 158 11 / 0.08); }
        .moni-mobile-antenna-stem {
          position: absolute; top: -7px; left: 50%; width: 3px; height: 9px; transform: translateX(-50%); border-radius: 999px; background: rgb(110 231 183 / 0.80);
        }
        .moni-mobile-antenna-dot {
          position: absolute; top: -12px; left: 50%; width: 8px; height: 8px; transform: translateX(-50%); border: 1px solid rgb(209 250 229 / 0.42); border-radius: 999px; background: rgb(52 211 153); box-shadow: 0 0 12px rgb(110 231 183 / 0.65);
        }
        .moni-mobile-face-glow {
          position: absolute; inset: 3px; border-radius: 16px; background: linear-gradient(135deg, rgb(110 231 183 / 0.20), rgb(103 232 249 / 0.10) 52%, rgb(59 130 246 / 0.20));
        }
        .moni-mobile-eye {
          position: absolute; top: 19px; width: 7px; height: 7px; border-radius: 999px; background: rgb(236 253 245); animation: moniMobileBlink 2.15s ease-in-out infinite; transform-origin: center;
        }
        .moni-mobile-eye-left { left: 15px; }
        .moni-mobile-eye-right { right: 15px; }
        .moni-mobile-mouth {
          position: absolute; left: 50%; bottom: 12px; width: 14px; height: 7px; transform: translateX(-50%); border-bottom: 2px solid rgb(209 250 229 / 0.92); border-radius: 0 0 12px 12px; animation: moniMobileSmile 1.55s ease-in-out infinite; transform-origin: center bottom;
        }
        .moni-mobile-ear { position: absolute; top: 25px; width: 4px; height: 12px; border-radius: 999px; background: rgb(103 232 249 / 0.50); }
        .moni-mobile-ear-left { left: -3px; }
        .moni-mobile-ear-right { right: -3px; }
        @keyframes moniMobileFloat {
          0%, 100% { transform: translateY(0) scale(1); }
          50% { transform: translateY(-3px) scale(1.018); }
        }
        @keyframes moniMobileBlink {
          0%, 34%, 42%, 100% { transform: scaleY(1); }
          38% { transform: scaleY(0.08); }
        }
        @keyframes moniMobileSmile {
          0%, 100% { transform: translateX(-50%) scaleX(0.92) scaleY(0.88); }
          50% { transform: translateX(-50%) scaleX(1.08) scaleY(1.08); }
        }

        .moni-live-state { display: inline-flex; align-items: center; gap: 6px; margin-top: 3px; font-size: 10px; font-weight: 900; letter-spacing: 0.13em; }
        .moni-live-dot { width: 7px; height: 7px; border-radius: 999px; flex: 0 0 auto; }
        .moni-live-state-live { color: #dc2626; }
        .moni-live-state-live .moni-live-dot { background: #ef4444; box-shadow: 0 0 0 0 rgb(239 68 68 / 0.5); animation: moniLivePulse 1.25s ease-out infinite; }
        .moni-live-state-thinking { color: #2563eb; }
        .moni-live-state-thinking .moni-live-dot { background: #3b82f6; box-shadow: 0 0 12px rgb(59 130 246 / 0.55); animation: moniThinkingPulse 0.85s ease-in-out infinite; }
        .moni-live-state-listening { color: #7c3aed; }
        .moni-live-state-listening .moni-live-dot { background: #8b5cf6; box-shadow: 0 0 12px rgb(139 92 246 / 0.5); animation: moniThinkingPulse 0.75s ease-in-out infinite; }
        .moni-live-state-issue { color: #d97706; }
        .moni-live-state-issue .moni-live-dot { background: #f59e0b; box-shadow: 0 0 10px rgb(245 158 11 / 0.45); }
        @keyframes moniLivePulse {
          0% { box-shadow: 0 0 0 0 rgb(239 68 68 / 0.48); opacity: 1; }
          70% { box-shadow: 0 0 0 7px rgb(239 68 68 / 0); opacity: 0.7; }
          100% { box-shadow: 0 0 0 0 rgb(239 68 68 / 0); opacity: 1; }
        }
        @keyframes moniThinkingPulse { 0%,100% { transform: scale(0.82); opacity: 0.6; } 50% { transform: scale(1.18); opacity: 1; } }

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
        @media (prefers-reduced-motion: reduce) {
          .moni-thinking-dot,
          .moni-mobile-character,
          .moni-mobile-eye,
          .moni-mobile-mouth,
          .moni-live-dot { animation: none !important; }
        }
      `}</style>
    </>
  )
}
