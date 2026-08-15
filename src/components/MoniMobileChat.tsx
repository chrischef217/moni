'use client'

import { ChangeEvent, FormEvent, KeyboardEvent, useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { moniBrowserDb } from '@/lib/moni/browser-db'

type Message = { role: 'user' | 'assistant'; content: string }
type Reply = { ok?: boolean; text?: string; error?: string; thread_id?: string }
type RequestKind = 'monthly-comparison' | 'monthly-report' | 'general'
type PendingPhoto = {
  id: string
  fileName: string
  mimeType: string
  sizeBytes: number
  previewUrl: string
  localPreview: boolean
}
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
type SpeechWindow = Window & {
  SpeechRecognition?: SpeechRecognitionConstructor
  webkitSpeechRecognition?: SpeechRecognitionConstructor
  webkitAudioContext?: typeof AudioContext
}

const THREAD_KEY = 'moni-global-agent-thread-v11'
const MESSAGE_CACHE_KEY = 'moni-mobile-message-cache-v1'
const ETA_KEY = 'moni-mobile-eta-v1'
const COMPOSER_MIN_HEIGHT = 42
const COMPOSER_MAX_HEIGHT = 128
const MAX_PENDING_PHOTOS = 4
const MAX_PHOTO_BYTES = 10 * 1024 * 1024
const ALLOWED_PHOTO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
const BASE_WAVE = [7, 11, 16, 22, 29, 18, 25, 13, 31, 20, 15, 9, 6]
const DEFAULT_ETA: Record<RequestKind, number> = {
  'monthly-comparison': 20,
  'monthly-report': 16,
  general: 12,
}

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

function requestKind(question: string): RequestKind {
  const normalized = String(question || '').replace(/\s+/g, ' ')
  const months = normalized.match(/(?:20\d{2}\s*년\s*)?(?:1[0-2]|0?[1-9])\s*월/g) || []
  const comparison = /(비교|차이|대비|두\s*달|두\s*가지|각각)/.test(normalized)
  if (months.length >= 2 && comparison) return 'monthly-comparison'
  if (/(이번\s*달|금월|현재\s*월|(?:1[0-2]|0?[1-9])\s*월)/.test(normalized) && /(생산|경영|매출|매입)/.test(normalized)) return 'monthly-report'
  return 'general'
}

function readEstimatedSeconds(kind: RequestKind) {
  try {
    const stored = JSON.parse(window.localStorage.getItem(ETA_KEY) || '{}') as Record<string, number>
    const value = Number(stored[kind])
    if (Number.isFinite(value) && value >= 5 && value <= 60) return Math.round(value)
  } catch { /* use default */ }
  return DEFAULT_ETA[kind]
}

function rememberDuration(kind: RequestKind, actualSeconds: number) {
  if (!Number.isFinite(actualSeconds) || actualSeconds <= 0) return
  try {
    const stored = JSON.parse(window.localStorage.getItem(ETA_KEY) || '{}') as Record<string, number>
    const previous = Number(stored[kind]) || DEFAULT_ETA[kind]
    stored[kind] = Math.max(5, Math.min(60, Math.round(previous * 0.65 + actualSeconds * 0.35)))
    window.localStorage.setItem(ETA_KEY, JSON.stringify(stored))
  } catch { /* ETA learning is UI-only */ }
}

function normalizeMessages(raw: unknown): Message[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((item): item is { role: 'user' | 'assistant'; content: unknown } => {
      if (!item || typeof item !== 'object') return false
      const role = (item as { role?: unknown }).role
      return role === 'user' || role === 'assistant'
    })
    .map((item) => ({ role: item.role, content: String(item.content || '') }))
    .filter((item) => item.content.trim())
    .slice(-100)
}

function readCachedMessages() {
  try {
    return normalizeMessages(JSON.parse(window.localStorage.getItem(MESSAGE_CACHE_KEY) || '[]'))
  } catch {
    return []
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

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-none stroke-current" strokeWidth="2" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-none stroke-current" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 8.5h3l1.4-2h7.2l1.4 2h3v10H4z" />
      <circle cx="12" cy="13.5" r="3.2" />
    </svg>
  )
}

function PhotoIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-none stroke-current" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3.5" y="4" width="17" height="16" rx="2.5" />
      <circle cx="9" cy="9" r="1.5" />
      <path d="m5.5 17 4.2-4.2 2.7 2.7 2.1-2.1 4 3.6" />
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

function ThinkingIndicator({ seconds, estimatedSeconds }: { seconds: number; estimatedSeconds: number }) {
  const remaining = Math.max(0, estimatedSeconds - seconds)
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
      <div className="mt-1 text-[11px] font-semibold leading-4 text-[#5d7d8d]">
        {remaining > 0 ? `예상 대기 시간 · 약 ${remaining}초 남음` : `예상 시간을 지나 마무리 중 · ${seconds - estimatedSeconds}초 추가`}
      </div>
      <div className="mt-0.5 text-[10px] leading-4 text-[#8aa0aa]">실제 조회 범위와 데이터량에 따라 달라질 수 있습니다.</div>
    </div>
  )
}

function mergeTranscriptPieces(pieces: string[]) {
  let merged = ''
  for (const rawPiece of pieces) {
    const piece = rawPiece.replace(/\s+/g, ' ').trim()
    if (!piece) continue
    if (!merged) {
      merged = piece
      continue
    }
    if (piece === merged || merged.startsWith(piece) || merged.endsWith(piece)) continue
    if (piece.startsWith(merged)) {
      merged = piece
      continue
    }

    const left = merged.split(' ')
    const right = piece.split(' ')
    let overlap = Math.min(left.length, right.length)
    while (overlap > 0) {
      const leftTail = left.slice(left.length - overlap).join(' ')
      const rightHead = right.slice(0, overlap).join(' ')
      if (leftTail === rightHead) break
      overlap -= 1
    }
    merged = [...left, ...right.slice(overlap)].join(' ')
  }
  return merged.replace(/\s+/g, ' ').trim()
}

export default function MoniMobileChat() {
  const [messages, setMessages] = useState<Message[]>([])
  const [threadId, setThreadId] = useState('')
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [thinkingSeconds, setThinkingSeconds] = useState(0)
  const [estimatedSeconds, setEstimatedSeconds] = useState(DEFAULT_ETA.general)
  const [error, setError] = useState('')
  const [listening, setListening] = useState(false)
  const [voiceFinishing, setVoiceFinishing] = useState(false)
  const [speechActive, setSpeechActive] = useState(false)
  const [voiceDraft, setVoiceDraft] = useState('')
  const [waveTick, setWaveTick] = useState(0)
  const [storageReady, setStorageReady] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [pendingPhotos, setPendingPhotos] = useState<PendingPhoto[]>([])

  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const galleryInputRef = useRef<HTMLInputElement>(null)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const voiceSeedRef = useRef('')
  const voiceDraftRef = useRef('')
  const finishTimerRef = useRef<number | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const pendingPhotosRef = useRef<PendingPhoto[]>([])

  const status = error ? 'issue' : sending ? 'thinking' : listening ? 'listening' : 'live'
  const statusLabel = error ? 'ISSUE' : sending ? 'THINKING' : listening ? 'LISTENING' : 'LIVE'

  function replacePendingPhotos(next: PendingPhoto[]) {
    pendingPhotosRef.current = next
    setPendingPhotos(next)
  }

  function resizeComposer() {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = 'auto'
    const scrollHeight = textarea.scrollHeight
    const nextHeight = Math.max(COMPOSER_MIN_HEIGHT, Math.min(scrollHeight, COMPOSER_MAX_HEIGHT))
    textarea.style.height = `${nextHeight}px`
    textarea.style.overflowY = scrollHeight > COMPOSER_MAX_HEIGHT ? 'auto' : 'hidden'
  }

  function playCue(kind: 'sent' | 'error') {
    try {
      const speechWindow = window as SpeechWindow
      const AudioContextClass = window.AudioContext || speechWindow.webkitAudioContext
      if (!AudioContextClass) return
      const context = audioContextRef.current || new AudioContextClass()
      audioContextRef.current = context
      void context.resume()
      const now = context.currentTime
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      oscillator.type = 'sine'
      oscillator.frequency.setValueAtTime(kind === 'sent' ? 620 : 300, now)
      gain.gain.setValueAtTime(0.0001, now)
      gain.gain.exponentialRampToValueAtTime(kind === 'error' ? 0.035 : 0.04, now + 0.012)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12)
      oscillator.connect(gain)
      gain.connect(context.destination)
      oscillator.start(now)
      oscillator.stop(now + 0.13)
    } catch { /* sound is best-effort UX */ }
  }

  function announceMoniReply() {
    try {
      if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') return
      const synthesis = window.speechSynthesis
      synthesis.cancel()
      const utterance = new SpeechSynthesisUtterance('모니, 답변이 왔어요.')
      utterance.lang = 'ko-KR'
      utterance.rate = 1
      utterance.pitch = 1.03
      utterance.volume = 0.92
      const koreanVoice = synthesis.getVoices().find((voice) => /^ko(?:-|_)/i.test(voice.lang))
      if (koreanVoice) utterance.voice = koreanVoice
      synthesis.speak(utterance)
    } catch { /* voice notification is best-effort UX */ }
  }

  async function restorePendingPhotos(savedThreadId: string) {
    try {
      const response = await fetch(`/api/moni/agent-files?thread_id=${encodeURIComponent(savedThreadId)}&_=${Date.now()}`, { cache: 'no-store' })
      const payload = await response.json() as { ok?: boolean; attachments?: Array<Record<string, unknown>> }
      if (!response.ok || !payload.ok) return
      const restored = (payload.attachments || [])
        .filter((item) => !item.message_id && String(item.mime_type || '').startsWith('image/') && item.signed_url)
        .slice(-MAX_PENDING_PHOTOS)
        .map((item) => ({
          id: String(item.id || ''),
          fileName: String(item.file_name || '사진'),
          mimeType: String(item.mime_type || 'image/jpeg'),
          sizeBytes: Number(item.size_bytes || 0),
          previewUrl: String(item.signed_url || ''),
          localPreview: false,
        }))
        .filter((item) => item.id && item.previewUrl)
      if (restored.length) replacePendingPhotos(restored)
    } catch { /* attachment restore is best-effort */ }
  }

  useEffect(() => {
    const cachedMessages = readCachedMessages()
    if (cachedMessages.length) setMessages(cachedMessages)

    const saved = window.localStorage.getItem(THREAD_KEY) || ''
    if (!saved) {
      setStorageReady(true)
      return
    }

    setThreadId(saved)
    setRestoring(true)
    setStorageReady(true)
    void restorePendingPhotos(saved)
    void fetch(`/api/moni/agent-runtime?thread_id=${encodeURIComponent(saved)}&_=${Date.now()}`, { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json() as { ok?: boolean; messages?: Array<{ role?: string; content?: string }> }
        if (!response.ok || !payload.ok) throw new Error('restore_failed')
        const restored = normalizeMessages(payload.messages || [])
        setMessages(restored)
        try {
          window.localStorage.setItem(MESSAGE_CACHE_KEY, JSON.stringify(restored))
        } catch { /* local cache is best-effort */ }
      })
      .catch(() => {
        // Never erase the user's visible conversation because of a temporary restore failure.
        // Keep the saved thread id and local message cache so the next visit can retry.
      })
      .finally(() => setRestoring(false))
  }, [])

  useEffect(() => {
    if (!storageReady) return
    try {
      if (messages.length) window.localStorage.setItem(MESSAGE_CACHE_KEY, JSON.stringify(messages.slice(-100)))
      else window.localStorage.removeItem(MESSAGE_CACHE_KEY)
    } catch { /* local cache is best-effort */ }
  }, [messages, storageReady])

  useEffect(() => {
    resizeComposer()
  }, [input])

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
    try { window.speechSynthesis?.cancel() } catch { /* no-op */ }
    if (finishTimerRef.current !== null) window.clearTimeout(finishTimerRef.current)
    void audioContextRef.current?.close().catch(() => undefined)
    pendingPhotosRef.current.forEach((photo) => {
      if (photo.localPreview) URL.revokeObjectURL(photo.previewUrl)
    })
  }, [])

  function rebuildTranscript(event: SpeechRecognitionEventLike) {
    const finalPieces: string[] = []
    let latestInterim = ''
    for (let index = 0; index < event.results.length; index += 1) {
      const result = event.results[index]
      const transcript = String(result[0]?.transcript || '').trim()
      if (!transcript) continue
      if (result.isFinal) finalPieces.push(transcript)
      else latestInterim = transcript
    }
    return mergeTranscriptPieces([...finalPieces, latestInterim].filter(Boolean))
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
    if (sending || listening || photoBusy) return
    setError('')
    setAttachmentMenuOpen(false)
    const speechWindow = window as SpeechWindow
    const Recognition = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition
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

      const recognition = new Recognition() as unknown as SpeechRecognitionLike
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
        finalizeVoiceDraft()
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

  function startNewConversation() {
    if (sending || listening || photoBusy) return
    if ((messages.length > 0 || pendingPhotos.length > 0) && !window.confirm('현재 대화를 지우고 새 대화를 시작할까요?')) return

    pendingPhotos.forEach((photo) => {
      if (photo.localPreview) URL.revokeObjectURL(photo.previewUrl)
    })
    replacePendingPhotos([])
    try { window.speechSynthesis?.cancel() } catch { /* no-op */ }
    try {
      window.localStorage.removeItem(THREAD_KEY)
      window.localStorage.removeItem(MESSAGE_CACHE_KEY)
    } catch { /* local storage is best-effort */ }

    setThreadId('')
    setMessages([])
    setInput('')
    setError('')
    setVoiceDraft('')
    setAttachmentMenuOpen(false)
    voiceDraftRef.current = ''
    voiceSeedRef.current = ''
    window.setTimeout(() => textareaRef.current?.focus(), 30)
  }

  async function uploadOnePhoto(file: File, activeThreadId: string) {
    if (!ALLOWED_PHOTO_TYPES.has(file.type)) throw new Error('사진은 JPG, PNG, WEBP 형식으로 첨부해 주세요.')
    if (file.size <= 0 || file.size > MAX_PHOTO_BYTES) throw new Error('사진 한 장은 10MB 이하만 첨부할 수 있습니다.')

    const prepareResponse = await fetch('/api/moni/agent-files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'prepare',
        thread_id: activeThreadId || undefined,
        file_name: file.name || `photo-${Date.now()}.jpg`,
        mime_type: file.type,
        size_bytes: file.size,
        page: pageContext(),
      }),
    })
    const prepared = await prepareResponse.json() as {
      ok?: boolean
      error?: string
      thread_id?: string
      attachment_id?: string
      bucket?: string
      path?: string
      token?: string
    }
    if (!prepareResponse.ok || !prepared.ok || !prepared.thread_id || !prepared.attachment_id || !prepared.bucket || !prepared.path || !prepared.token) {
      throw new Error(prepared.error || '사진 업로드를 준비하지 못했습니다.')
    }

    const { error: uploadError } = await moniBrowserDb.storage
      .from(prepared.bucket)
      .uploadToSignedUrl(prepared.path, prepared.token, file, { contentType: file.type, upsert: false })

    if (uploadError) {
      void fetch('/api/moni/agent-files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'fail', thread_id: prepared.thread_id, attachment_id: prepared.attachment_id }),
      })
      throw new Error('사진 업로드에 실패했습니다. 다시 시도해 주세요.')
    }

    const completeResponse = await fetch('/api/moni/agent-files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'complete', thread_id: prepared.thread_id, attachment_id: prepared.attachment_id }),
    })
    const completed = await completeResponse.json() as { ok?: boolean; error?: string }
    if (!completeResponse.ok || !completed.ok) throw new Error(completed.error || '업로드한 사진을 확인하지 못했습니다.')

    return {
      threadId: prepared.thread_id,
      photo: {
        id: prepared.attachment_id,
        fileName: file.name || '사진',
        mimeType: file.type,
        sizeBytes: file.size,
        previewUrl: URL.createObjectURL(file),
        localPreview: true,
      } satisfies PendingPhoto,
    }
  }

  async function handlePhotoFiles(files: File[]) {
    if (!files.length || sending || listening || photoBusy) return
    const remaining = Math.max(0, MAX_PENDING_PHOTOS - pendingPhotosRef.current.length)
    if (remaining <= 0) {
      setError('사진은 한 번에 최대 4장까지 첨부할 수 있습니다.')
      return
    }

    setPhotoBusy(true)
    setError('')
    setAttachmentMenuOpen(false)
    let activeThreadId = threadId
    try {
      for (const file of files.slice(0, remaining)) {
        const uploaded = await uploadOnePhoto(file, activeThreadId)
        activeThreadId = uploaded.threadId
        setThreadId(activeThreadId)
        window.localStorage.setItem(THREAD_KEY, activeThreadId)
        replacePendingPhotos([...pendingPhotosRef.current, uploaded.photo])
      }
      if (files.length > remaining) setError(`사진은 한 번에 최대 ${MAX_PENDING_PHOTOS}장까지 첨부할 수 있습니다.`)
    } catch (photoError) {
      setError(photoError instanceof Error ? photoError.message : '사진 첨부 중 문제가 발생했습니다.')
    } finally {
      setPhotoBusy(false)
      if (cameraInputRef.current) cameraInputRef.current.value = ''
      if (galleryInputRef.current) galleryInputRef.current.value = ''
    }
  }

  function photoInputChanged(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || [])
    void handlePhotoFiles(files)
  }

  async function removePendingPhoto(photo: PendingPhoto) {
    if (sending || photoBusy) return
    replacePendingPhotos(pendingPhotosRef.current.filter((item) => item.id !== photo.id))
    if (photo.localPreview) URL.revokeObjectURL(photo.previewUrl)
    if (!threadId) return
    try {
      await fetch('/api/moni/agent-files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', thread_id: threadId, attachment_id: photo.id }),
      })
    } catch { /* deletion cleanup is best-effort */ }
  }

  async function send(raw: string) {
    const rawQuestion = raw.trim()
    const photos = [...pendingPhotosRef.current]
    if ((!rawQuestion && photos.length === 0) || sending || listening || photoBusy) return
    const questionForAgent = rawQuestion || '첨부한 사진을 확인해줘.'
    const displayQuestion = [rawQuestion, photos.length ? `📷 사진 ${photos.length}장 첨부` : ''].filter(Boolean).join('\n\n')
    const kind = requestKind(questionForAgent)
    const estimated = readEstimatedSeconds(kind)
    const startedAt = Date.now()
    setEstimatedSeconds(estimated)
    setSending(true)
    setError('')
    setInput('')
    setAttachmentMenuOpen(false)
    setMessages((current) => [...current, { role: 'user', content: displayQuestion }])
    playCue('sent')
    try {
      const response = await fetch('/api/moni/agent-runtime', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: rawQuestion,
          attachment_ids: photos.map((photo) => photo.id),
          thread_id: threadId || undefined,
          page: pageContext(),
        }),
      })
      const payload = await response.json() as Reply
      if (!response.ok || !payload.ok || !payload.text) throw new Error(payload.error || 'MONI 응답을 받지 못했습니다.')
      if (payload.thread_id) {
        setThreadId(payload.thread_id)
        window.localStorage.setItem(THREAD_KEY, payload.thread_id)
      }
      photos.forEach((photo) => {
        if (photo.localPreview) URL.revokeObjectURL(photo.previewUrl)
      })
      replacePendingPhotos([])
      setMessages((current) => [...current, { role: 'assistant', content: payload.text! }])
      rememberDuration(kind, Math.max(1, Math.round((Date.now() - startedAt) / 1000)))
      window.setTimeout(announceMoniReply, 60)
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : 'MONI 연결 오류')
      playCue('error')
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
      <header className="flex shrink-0 items-center gap-3 overflow-visible border-b border-[#d7e9e5] bg-white/95 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+20px)] backdrop-blur-xl">
        <MobileMoniCharacter status={status} />
        <div className="min-w-0 flex-1">
          <h1 className="text-[16px] font-black tracking-[-0.02em] text-[#173b52]">MONI</h1>
          <div className={`moni-live-state moni-live-state-${status}`} role="status" aria-live="polite">
            <span className="moni-live-dot" aria-hidden="true" />
            <span>{statusLabel}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={startNewConversation}
          disabled={sending || listening || photoBusy}
          className="moni-new-chat-button relative inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-[#66aef5] bg-[#eef7ff] px-3 text-[12px] font-black text-[#175a9a] shadow-[0_4px_14px_rgba(23,90,154,0.12)] transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="새 대화 시작"
          title="새 대화"
        >
          <span className="moni-new-chat-pulse h-2 w-2 rounded-full bg-[#2f80ed]" aria-hidden="true" />
          <span>새 대화</span>
        </button>
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 pb-5 pt-5">
        {messages.length === 0 ? (
          <div className="space-y-3">
            <div className="mx-auto max-w-[92%] rounded-2xl border border-[#d8e8e4] bg-white px-4 py-3 text-sm leading-6 text-[#263f4d] shadow-[0_5px_18px_rgba(23,59,82,0.035)]">
              {restoring ? '이전 대화를 불러오고 있습니다…' : '무엇이든 말씀하세요. 필요한 두배 데이터를 확인하고 답하겠습니다.'}
            </div>
            {sending ? <ThinkingIndicator seconds={thinkingSeconds} estimatedSeconds={estimatedSeconds} /> : null}
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((message, index) => (
              <div key={`${message.role}-${index}`} className={message.role === 'user'
                ? 'ml-10 whitespace-pre-wrap rounded-2xl bg-[#1fae91] px-4 py-3 text-sm leading-6 text-white'
                : 'mr-2 rounded-2xl border border-[#d8e8e4] bg-white px-4 py-3 text-sm leading-6 text-[#263f4d] shadow-[0_5px_18px_rgba(23,59,82,0.035)]'}>
                {message.role === 'assistant'
                  ? <div className="moni-markdown"><ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown></div>
                  : message.content}
              </div>
            ))}
            {sending ? <ThinkingIndicator seconds={thinkingSeconds} estimatedSeconds={estimatedSeconds} /> : null}
          </div>
        )}
      </div>

      <footer data-moni-mobile-composer className="shrink-0 bg-gradient-to-t from-white via-white/98 to-white/88 px-3 pb-[calc(env(safe-area-inset-bottom)+10px)] pt-2">
        {error ? <div className="mb-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold leading-5 text-amber-800">{error}</div> : null}
        <form onSubmit={submit}>
          <div className={`relative overflow-visible rounded-[28px] border bg-white shadow-[0_8px_32px_rgba(23,59,82,0.12)] transition ${listening ? 'border-violet-300 ring-4 ring-violet-100/70' : 'border-[#d2dfdc]'}`}>
            {attachmentMenuOpen && !listening ? (
              <div className="absolute bottom-[calc(100%+8px)] left-0 z-20 w-[188px] overflow-hidden rounded-2xl border border-[#d8e8e4] bg-white p-1.5 shadow-[0_14px_38px_rgba(23,59,82,0.18)]">
                <button type="button" onClick={() => cameraInputRef.current?.click()} className="flex h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-[13px] font-bold text-[#244858] active:bg-[#eef8f5]">
                  <CameraIcon /><span>카메라로 촬영</span>
                </button>
                <button type="button" onClick={() => galleryInputRef.current?.click()} className="flex h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-[13px] font-bold text-[#244858] active:bg-[#eef8f5]">
                  <PhotoIcon /><span>사진에서 선택</span>
                </button>
              </div>
            ) : null}

            <input ref={cameraInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" capture="environment" className="hidden" onChange={photoInputChanged} />
            <input ref={galleryInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple className="hidden" onChange={photoInputChanged} />

            {pendingPhotos.length > 0 && !listening ? (
              <div className="flex gap-2 overflow-x-auto px-3 pb-1 pt-3">
                {pendingPhotos.map((photo) => (
                  <div key={photo.id} className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-[#cfe4df] bg-[#eff8f5]">
                    <img src={photo.previewUrl} alt={photo.fileName} className="h-full w-full object-cover" />
                    <button type="button" onClick={() => void removePendingPhoto(photo)} disabled={sending || photoBusy} className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/65 text-[13px] font-bold leading-none text-white" aria-label={`${photo.fileName} 첨부 취소`}>×</button>
                  </div>
                ))}
                {photoBusy ? <div className="flex h-16 min-w-24 items-center justify-center rounded-xl border border-dashed border-[#cfe4df] px-3 text-[11px] font-bold text-[#6d8b95]">사진 준비 중…</div> : null}
              </div>
            ) : photoBusy && !listening ? (
              <div className="px-4 pt-3 text-[11px] font-bold text-[#6d8b95]">사진을 안전하게 준비하고 있어요…</div>
            ) : null}

            {listening ? (
              <div className="flex min-h-[78px] items-center gap-3 overflow-hidden px-3 py-2">
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
              <div className="flex min-h-[58px] items-end gap-1 px-2 py-2">
                <button
                  type="button"
                  onClick={() => setAttachmentMenuOpen((value) => !value)}
                  disabled={sending || photoBusy}
                  className={`flex h-11 w-10 shrink-0 items-center justify-center rounded-full transition active:scale-95 disabled:opacity-30 ${attachmentMenuOpen ? 'bg-[#e8f7f3] text-[#187c69]' : 'text-[#53666f]'}`}
                  aria-label="사진 첨부"
                  title="사진 첨부"
                >
                  <PlusIcon />
                </button>
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={keyDown}
                  onFocus={() => setAttachmentMenuOpen(false)}
                  disabled={sending || photoBusy}
                  rows={1}
                  placeholder={pendingPhotos.length ? '사진에 대해 물어보세요' : 'MONI에게 메시지'}
                  className="min-h-[42px] min-w-0 flex-1 resize-none bg-transparent px-2 py-[11px] text-[15px] leading-5 text-[#173b52] outline-none placeholder:text-[#9ba6ab] disabled:opacity-60"
                  style={{ maxHeight: `${COMPOSER_MAX_HEIGHT}px`, overflowY: 'hidden' }}
                />
                <button type="button" onClick={() => void startVoiceInput()} disabled={sending || photoBusy} className="flex h-11 w-10 shrink-0 items-center justify-center rounded-full text-[#27343b] transition active:scale-95 disabled:opacity-30" aria-label="음성으로 입력">
                  <MicrophoneIcon />
                </button>
                <button type="submit" disabled={sending || photoBusy || (!input.trim() && pendingPhotos.length === 0)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#17191b] text-white transition active:scale-95 disabled:bg-[#d7dcde] disabled:text-white" aria-label="전송">
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
        .moni-new-chat-pulse { animation:moniNewChatPulse 1.35s ease-out infinite; }
        @keyframes moniNewChatPulse { 0% { box-shadow:0 0 0 0 rgb(47 128 237 / .46); } 72% { box-shadow:0 0 0 7px rgb(47 128 237 / 0); } 100% { box-shadow:0 0 0 0 rgb(47 128 237 / 0); } }
        @keyframes moniLivePulse { 0% { box-shadow:0 0 0 0 rgb(239 68 68 / .48); opacity:1; } 70% { box-shadow:0 0 0 7px rgb(239 68 68 / 0); opacity:.7; } 100% { box-shadow:0 0 0 0 rgb(239 68 68 / 0); opacity:1; } }
        @keyframes moniThinkingPulse { 0%,100% { transform:scale(.82); opacity:.6; } 50% { transform:scale(1.18); opacity:1; } }
        .moni-markdown { line-height:1.65; } .moni-markdown > :first-child { margin-top:0; } .moni-markdown > :last-child { margin-bottom:0; }
        .moni-markdown h1,.moni-markdown h2 { margin:14px 0 7px; color:#173b52; font-size:15px; font-weight:900; line-height:1.45; }
        .moni-markdown h3 { margin:12px 0 6px; color:#245466; font-size:14px; font-weight:900; }
        .moni-markdown p { margin:0 0 9px; } .moni-markdown strong { color:#173b52; font-weight:900; }
        .moni-markdown ul,.moni-markdown ol { margin:6px 0 11px 20px; padding:0; } .moni-markdown ul { list-style:disc; } .moni-markdown ol { list-style:decimal; }
        .moni-markdown table { display:block; width:100%; margin:10px 0 12px; overflow-x:auto; border:1px solid #d6e7e3; border-radius:10px; border-collapse:separate; border-spacing:0; font-size:12px; }
        .moni-markdown th,.moni-markdown td { min-width:82px; padding:8px 9px; border-right:1px solid #e2eeeb; border-bottom:1px solid #e2eeeb; text-align:left; vertical-align:top; }
        @media (prefers-reduced-motion:reduce) { .moni-thinking-dot,.moni-mobile-character,.moni-mobile-eye,.moni-live-dot,.moni-new-chat-pulse { animation:none !important; } }
      `}</style>
    </>
  )
}
