'use client'

import { ClipboardEvent, DragEvent, FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { moniBrowserDb } from '@/lib/moni/browser-db'

type MessageAttachment = { name: string; mimeType: string }
type ChatMessage = { role: 'user' | 'assistant'; content: string; attachments?: MessageAttachment[] }
type PendingAttachment = {
  key: string
  file: File
  attachmentId?: string
  status: 'uploading' | 'ready' | 'failed'
  error?: string
  previewUrl?: string
}
type AgentResponse = {
  ok: boolean
  text?: string
  error?: string
  model?: string
  provider?: string
  thread_id?: string
  pmo_handoff_status?: string
  code?: string
  retryable?: boolean
}
type HistoryResponse = {
  ok: boolean
  error?: string
  thread?: { pmo_handoff_status?: string }
  messages?: Array<{ role?: string; content?: string; model?: string }>
}
type UploadPrepareResponse = {
  ok: boolean
  error?: string
  thread_id?: string
  attachment_id?: string
  bucket?: string
  path?: string
  token?: string
}
type IntelligenceResponse = {
  ok: boolean
  top_action?: { severity?: string; title?: string; action?: string } | null
}

const HISTORY_KEY = 'moni-global-agent-history-v10'
const THREAD_KEY = 'moni-global-agent-thread-v10'
const BUBBLE_KEY = 'moni-global-agent-bubble-v9'
const MAX_STORED_MESSAGES = 40
const MAX_ATTACHMENTS = 5
const MAX_FILE_BYTES = 25 * 1024 * 1024
const ACCEPT = '.png,.jpg,.jpeg,.webp,.gif,.pdf,.txt,.csv,.json,.xls,.xlsx,.doc,.docx'
const STARTERS = ['지금 제일 먼저 할 일?', '오늘 받을 돈 있어?', '이번 달 목표매출 상황은?']

function readHistory(): ChatMessage[] {
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(HISTORY_KEY) || '[]')
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((item) => item?.role === 'user' || item?.role === 'assistant')
      .map((item) => ({ role: item.role, content: String(item.content || '').slice(0, 16000) }))
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
  try { window.sessionStorage.setItem(BUBBLE_KEY, String(Date.now())) } catch { /* no-op */ }
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

function attachmentLabel(item: PendingAttachment) {
  if (item.status === 'uploading') return '업로드 중'
  if (item.status === 'failed') return '실패'
  return formatBytes(item.file.size)
}

function waitingMessages(question: string, hasAttachments: boolean) {
  const normalized = question.replace(/\s+/g, ' ').trim()
  if (hasAttachments) return ['첨부한 자료를 안전하게 불러오고 있어요.', '자료의 표와 내용을 분석하고 있어요.', '질문과 자료를 함께 검토하고 있어요.']
  if (/(계산|금액|단가|공급가|합계|원가|수량|중량|매출|미수|미지급|잔액|재고)/.test(normalized)) return ['관련 데이터를 확인하고 있어요.', '지금 계산하고 있어요.', '계산 결과를 다시 검토하고 있어요.']
  if (/(문서|보고서|견적서|발주서|계약서|작성|정리|요약|엑셀|pdf)/i.test(normalized)) return ['요청 내용을 정리하고 있어요.', '지금 문서 구성을 작성하고 있어요.', '빠진 내용이 없는지 검토하고 있어요.']
  if (/(분석|검토|비교|원인|왜|문제|오류|이상|확인)/.test(normalized)) return ['관련 데이터를 확인하고 있어요.', '원인과 근거를 분석하고 있어요.', '답변이 정확한지 검토하고 있어요.']
  if (/(어디|위치|메뉴|링크|방법|사용법)/.test(normalized)) return ['정확한 메뉴와 기능을 찾고 있어요.', '현재 화면과 권한을 확인하고 있어요.', '가장 빠른 이동 방법을 정리하고 있어요.']
  return ['잠시만 기다려 주세요. 질문을 이해하고 있어요.', '최고의 답변을 위해 필요한 정보를 확인하고 있어요.', '답변이 정확한지 검토하고 있어요.']
}

export default function GlobalMoniAgent() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [model, setModel] = useState('')
  const [provider, setProvider] = useState('')
  const [threadId, setThreadId] = useState('')
  const [pmoStatus, setPmoStatus] = useState('NONE')
  const [attachments, setAttachments] = useState<PendingAttachment[]>([])
  const [dragActive, setDragActive] = useState(false)
  const [waitingSteps, setWaitingSteps] = useState<string[]>(['잠시만 기다려 주세요. 질문을 이해하고 있어요.'])
  const [waitingStep, setWaitingStep] = useState(0)
  const [bubble, setBubble] = useState('MONI에게 무엇이든 물어보세요.')
  const [showBubble, setShowBubble] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const threadIdRef = useRef('')
  const sendingRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    const savedThreadId = window.localStorage.getItem(THREAD_KEY) || ''
    threadIdRef.current = savedThreadId
    setThreadId(savedThreadId)

    const restore = async () => {
      if (!savedThreadId) {
        if (!cancelled) setMessages(readHistory())
        return
      }
      try {
        const response = await fetch(`/api/moni/agent-chat?thread_id=${encodeURIComponent(savedThreadId)}&_=${Date.now()}`, { cache: 'no-store' })
        const payload = await response.json() as HistoryResponse
        if (!response.ok || !payload.ok) throw new Error(payload.error || '대화를 불러오지 못했습니다.')
        const restored = (payload.messages ?? [])
          .filter((item) => item.role === 'user' || item.role === 'assistant')
          .map((item) => ({ role: item.role as 'user' | 'assistant', content: String(item.content || '') }))
          .filter((item) => item.content)
        if (cancelled) return
        setMessages(restored)
        setPmoStatus(payload.thread?.pmo_handoff_status || 'NONE')
        const lastModel = [...(payload.messages ?? [])].reverse().find((item) => item.model)?.model
        if (lastModel) setModel(lastModel)
      } catch {
        if (!cancelled) {
          window.localStorage.removeItem(THREAD_KEY)
          threadIdRef.current = ''
          setThreadId('')
          setMessages(readHistory())
        }
      }
    }
    void restore()

    let hideTimer: number | undefined
    const loadBubble = async () => {
      if (bubbleRecentlyShown()) return
      let next = 'MONI에게 무엇이든 물어보세요.'
      try {
        const response = await fetch(`/api/moni/intelligence?_=${Date.now()}`, { cache: 'no-store' })
        const payload = await response.json() as IntelligenceResponse
        const severity = payload.top_action?.severity
        if (response.ok && payload.ok && payload.top_action?.title && (severity === 'critical' || severity === 'high')) next = payload.top_action.title
      } catch { /* idle invitation stays available */ }
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
    threadIdRef.current = threadId
    if (threadId) window.localStorage.setItem(THREAD_KEY, threadId)
  }, [threadId])

  useEffect(() => {
    try { window.sessionStorage.setItem(HISTORY_KEY, JSON.stringify(messages.slice(-MAX_STORED_MESSAGES))) } catch { /* no-op */ }
    window.setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }), 30)
  }, [messages, open, sending, waitingStep])

  useEffect(() => {
    if (open) window.setTimeout(() => inputRef.current?.focus(), 120)
  }, [open])

  useEffect(() => {
    if (!sending) {
      setWaitingStep(0)
      return
    }
    const timer = window.setInterval(() => setWaitingStep((current) => Math.min(current + 1, waitingSteps.length - 1)), 3600)
    return () => window.clearInterval(timer)
  }, [sending, waitingSteps])

  const hasConversation = messages.length > 0
  const lastAssistant = useMemo(() => [...messages].reverse().find((message) => message.role === 'assistant'), [messages])
  const uploading = attachments.some((item) => item.status === 'uploading')
  const readyAttachments = attachments.filter((item) => item.status === 'ready' && item.attachmentId)

  function rememberThread(nextThreadId: string) {
    if (!nextThreadId) return
    threadIdRef.current = nextThreadId
    setThreadId(nextThreadId)
    window.localStorage.setItem(THREAD_KEY, nextThreadId)
  }

  async function uploadAttachment(item: PendingAttachment) {
    let prepared: UploadPrepareResponse | null = null
    try {
      const prepareResponse = await fetch('/api/moni/agent-files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'prepare',
          thread_id: threadIdRef.current,
          file_name: item.file.name,
          mime_type: item.file.type || 'application/octet-stream',
          size_bytes: item.file.size,
          page: pageContext(),
        }),
      })
      prepared = await prepareResponse.json() as UploadPrepareResponse
      if (!prepareResponse.ok || !prepared.ok || !prepared.thread_id || !prepared.attachment_id || !prepared.bucket || !prepared.path || !prepared.token) throw new Error(prepared.error || '첨부파일 업로드를 준비하지 못했습니다.')
      rememberThread(prepared.thread_id)
      const { error: uploadError } = await moniBrowserDb.storage.from(prepared.bucket).uploadToSignedUrl(prepared.path, prepared.token, item.file, {
        contentType: item.file.type || 'application/octet-stream', cacheControl: '3600',
      })
      if (uploadError) throw new Error(uploadError.message)
      const completeResponse = await fetch('/api/moni/agent-files', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'complete', thread_id: prepared.thread_id, attachment_id: prepared.attachment_id }),
      })
      const completed = await completeResponse.json() as UploadPrepareResponse
      if (!completeResponse.ok || !completed.ok) throw new Error(completed.error || '업로드 완료 확인에 실패했습니다.')
      setAttachments((current) => current.map((candidate) => candidate.key === item.key ? { ...candidate, status: 'ready', attachmentId: prepared!.attachment_id } : candidate))
    } catch (uploadFailure) {
      const message = uploadFailure instanceof Error ? uploadFailure.message : '첨부파일 업로드에 실패했습니다.'
      if (prepared?.thread_id && prepared?.attachment_id) void fetch('/api/moni/agent-files', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'fail', thread_id: prepared.thread_id, attachment_id: prepared.attachment_id }),
      })
      setAttachments((current) => current.map((candidate) => candidate.key === item.key ? { ...candidate, status: 'failed', error: message } : candidate))
      setError(message)
    }
  }

  function addFiles(fileList: FileList | File[]) {
    const incoming = Array.from(fileList)
    if (!incoming.length) return
    const availableSlots = Math.max(0, MAX_ATTACHMENTS - attachments.length)
    if (!availableSlots) return setError(`첨부파일은 한 번에 ${MAX_ATTACHMENTS}개까지 가능합니다.`)
    const accepted: PendingAttachment[] = []
    for (const file of incoming.slice(0, availableSlots)) {
      if (file.size <= 0 || file.size > MAX_FILE_BYTES) {
        setError(`${file.name}: 파일은 25MB 이하만 첨부할 수 있습니다.`)
        continue
      }
      accepted.push({ key: `${Date.now()}-${Math.random().toString(36).slice(2)}`, file, status: 'uploading', previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined })
    }
    if (!accepted.length) return
    setError('')
    setAttachments((current) => [...current, ...accepted])
    accepted.forEach((item) => void uploadAttachment(item))
  }

  async function removeAttachment(item: PendingAttachment) {
    if (item.previewUrl) URL.revokeObjectURL(item.previewUrl)
    setAttachments((current) => current.filter((candidate) => candidate.key !== item.key))
    if (threadIdRef.current && item.attachmentId) await fetch('/api/moni/agent-files', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', thread_id: threadIdRef.current, attachment_id: item.attachmentId }),
    }).catch(() => undefined)
  }

  function clearLocalAttachments() {
    attachments.forEach((item) => { if (item.previewUrl) URL.revokeObjectURL(item.previewUrl) })
    setAttachments([])
  }

  async function sendMessage(value: string) {
    const question = value.trim()
    if ((!question && !readyAttachments.length) || sendingRef.current || uploading) return
    const prior = messages.slice(-12)
    const attachmentSummary = readyAttachments.map((item) => ({ name: item.file.name, mimeType: item.file.type }))
    const visibleQuestion = question || '첨부한 자료를 분석해 주세요.'
    const clientRequestId = crypto.randomUUID()
    sendingRef.current = true
    setMessages((current) => [...current, { role: 'user', content: visibleQuestion, attachments: attachmentSummary }])
    setInput('')
    setError('')
    setWaitingSteps(waitingMessages(visibleQuestion, readyAttachments.length > 0))
    setWaitingStep(0)
    setSending(true)
    try {
      const response = await fetch('/api/moni/agent-chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: question, messages: prior, page: pageContext(), thread_id: threadIdRef.current, attachment_ids: readyAttachments.map((item) => item.attachmentId), client_request_id: clientRequestId }),
      })
      const payload = await response.json() as AgentResponse
      if (response.status === 409 && (payload.code === 'THREAD_BUSY' || payload.code === 'REQUEST_ALREADY_FAILED')) {
        setMessages((current) => {
          const next = [...current]
          const last = next[next.length - 1]
          if (last?.role === 'user' && last.content === visibleQuestion) next.pop()
          return next
        })
        setError(payload.error || '이전 요청을 처리 중입니다.')
        return
      }
      if (!response.ok || !payload.ok || !payload.text) throw new Error(payload.error || 'MONI 응답을 불러오지 못했습니다.')
      rememberThread(payload.thread_id || threadIdRef.current)
      setModel(payload.model || '')
      setProvider(payload.provider || '')
      setPmoStatus(payload.pmo_handoff_status || pmoStatus)
      setMessages((current) => [...current, { role: 'assistant', content: payload.text! }])
      clearLocalAttachments()
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message : 'MONI 응답을 불러오지 못했습니다.'
      setError(message)
      setMessages((current) => [...current, { role: 'assistant', content: `지금은 답변을 생성하지 못했습니다.\n\n${message}` }])
    } finally { sendingRef.current = false; setSending(false) }
  }

  async function handoffConversation() {
    if (!threadIdRef.current || sending) return
    setSending(true)
    setError('')
    setWaitingSteps(['대화와 첨부자료를 정리하고 있어요.', 'PMO 검토 요청을 저장하고 있어요.', '전달 상태를 확인하고 있어요.'])
    setWaitingStep(0)
    try {
      const response = await fetch('/api/moni/agent-chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'handoff', thread_id: threadIdRef.current, page: pageContext() }),
      })
      const payload = await response.json() as AgentResponse
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'PMO 전달에 실패했습니다.')
      setPmoStatus('REQUESTED')
      setMessages((current) => [...current, { role: 'assistant', content: '이 대화의 화면 정보·첨부파일·최근 대화를 **PMO 검토 요청**으로 저장했습니다. MONI AI는 개발을 실행하지 않습니다.' }])
    } catch (handoffError) {
      setError(handoffError instanceof Error ? handoffError.message : 'PMO 전달에 실패했습니다.')
    } finally { setSending(false) }
  }

  function submit(event: FormEvent) { event.preventDefault(); void sendMessage(input) }
  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void sendMessage(input) }
  }
  function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const files = Array.from(event.clipboardData.items as unknown as ArrayLike<DataTransferItem>)
      .filter((item) => item.kind === 'file').map((item) => item.getAsFile()).filter((item): item is File => Boolean(item))
    if (files.length) { event.preventDefault(); addFiles(files) }
  }
  function handleDragOver(event: DragEvent<HTMLElement>) { event.preventDefault(); setDragActive(true) }
  function handleDragLeave(event: DragEvent<HTMLElement>) { event.preventDefault(); if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragActive(false) }
  function handleDrop(event: DragEvent<HTMLElement>) { event.preventDefault(); setDragActive(false); if (event.dataTransfer.files?.length) addFiles(event.dataTransfer.files) }
  function resetConversation() {
    setMessages([]); setError(''); setModel(''); setProvider(''); setPmoStatus('NONE'); clearLocalAttachments(); threadIdRef.current = ''; setThreadId('')
    try { window.sessionStorage.removeItem(HISTORY_KEY); window.localStorage.removeItem(THREAD_KEY) } catch { /* no-op */ }
  }

  return (
    <div data-global-moni-agent className="pointer-events-none fixed bottom-4 right-4 z-[130] md:bottom-6 md:right-6">
      {showBubble && !open && (
        <button type="button" onClick={() => { setOpen(true); setShowBubble(false) }} className="pointer-events-auto absolute bottom-[78px] right-0 w-[min(320px,calc(100vw-32px))] rounded-2xl border border-[#b8ddd5] bg-[#f8fffc]/95 px-4 py-3 text-left text-sm font-bold leading-5 text-[#173b52] shadow-[0_18px_55px_rgba(23,59,82,0.18)] backdrop-blur-lg">
          <span className="mb-1 block text-[11px] font-black uppercase tracking-[0.14em] text-[#0f8f78]">MONI</span>{bubble}
          <span className="absolute -bottom-2 right-7 h-4 w-4 rotate-45 border-b border-r border-[#b8ddd5] bg-[#f8fffc]" />
        </button>
      )}

      {open && (
        <section onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop} className="pointer-events-auto absolute bottom-[82px] right-0 flex h-[min(720px,calc(100vh-110px))] w-[min(480px,calc(100vw-24px))] flex-col overflow-hidden rounded-[28px] border border-[#bfded8] bg-[#f7fcfb]/98 text-[#173b52] shadow-[0_28px_90px_rgba(23,59,82,0.24)] backdrop-blur-xl">
          {dragActive && <div className="pointer-events-none absolute inset-2 z-50 flex items-center justify-center rounded-[24px] border-2 border-dashed border-[#21b99a] bg-[#effbf7]/95 text-center"><div><p className="text-base font-black text-[#087d69]">파일을 놓아 첨부</p><p className="mt-1 text-xs text-[#607d8d]">이미지·PDF·엑셀·CSV·문서</p></div></div>}

          <header className="flex items-center justify-between gap-3 border-b border-[#d7e9e5] bg-white/85 px-4 py-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-[15px] border border-emerald-300/40 bg-gradient-to-br from-emerald-100 via-cyan-50 to-blue-100 shadow-inner">
                <span className="absolute left-2.5 top-2.5 h-1.5 w-1.5 rounded-full bg-[#0f8f78]" /><span className="absolute right-2.5 top-2.5 h-1.5 w-1.5 rounded-full bg-[#0f8f78]" /><span className="mt-3 h-1 w-3 rounded-full bg-[#0f8f78]/70" />
              </div>
              <div className="min-w-0"><div className="flex items-center gap-2"><h2 className="font-black text-[#173b52]">MONI</h2><span className="rounded-full border border-blue-300 bg-blue-50 px-2 py-0.5 text-[10px] font-black text-[#1878a8]">READ ONLY</span>{pmoStatus === 'REQUESTED' && <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-black text-amber-700">PMO 접수</span>}</div><p className="truncate text-xs text-[#607d8d]">대화·화면·첨부자료를 함께 저장합니다.</p></div>
            </div>
            <div className="flex items-center gap-1">{hasConversation && <button type="button" onClick={() => void handoffConversation()} disabled={sending || pmoStatus === 'REQUESTED'} className="rounded-lg px-2 py-1.5 text-xs font-bold text-amber-700 hover:bg-amber-50 disabled:opacity-45">PMO 전달</button>}{hasConversation && <button type="button" onClick={resetConversation} className="rounded-lg px-2 py-1.5 text-xs font-bold text-[#607d8d] hover:bg-[#edf7f4] hover:text-[#173b52]">새 대화</button>}<button type="button" onClick={() => setOpen(false)} className="flex h-8 w-8 items-center justify-center rounded-lg text-lg text-[#607d8d] hover:bg-[#edf7f4] hover:text-[#173b52]" aria-label="MONI 닫기">×</button></div>
          </header>

          <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            {!hasConversation ? <div className="space-y-5"><div className="rounded-2xl border border-[#c7e7df] bg-[#edf9f5] p-4"><p className="text-sm font-black text-[#087d69]">질문하거나 자료를 첨부하세요.</p><p className="mt-1 text-xs leading-5 text-[#526f7e]">스크린샷은 입력창에 붙여넣고, PDF·엑셀·문서는 대화창에 끌어놓을 수 있습니다. 개발 요청은 실행하지 않고 PMO에 전달합니다.</p></div><div className="space-y-2">{STARTERS.map((starter) => <button key={starter} type="button" onClick={() => void sendMessage(starter)} className="block w-full rounded-xl border border-[#d8e8e4] bg-white px-4 py-3 text-left text-sm font-bold text-[#274b5f] transition hover:border-[#64cbb5] hover:bg-[#edf9f5] hover:text-[#087d69]">{starter}</button>)}</div><button type="button" onClick={() => { window.location.href = '/intelligence' }} className="text-xs font-bold text-[#6467b2] hover:text-[#464b98]">MONI Intelligence 전체 우선순위 열기 →</button></div> : (
              <div className="space-y-4">
                {messages.map((message, index) => <div key={`${message.role}-${index}`} className={message.role === 'user' ? 'ml-10' : 'mr-4'}><div className={`rounded-2xl px-4 py-3 text-sm leading-6 shadow-[0_5px_18px_rgba(23,59,82,0.04)] ${message.role === 'user' ? 'border border-[#b9d8ee] bg-[#e8f4ff] text-[#173b52]' : 'border border-[#d8e8e4] bg-white text-[#263f4d]'}`}>{message.role === 'assistant' ? <div className="moni-agent-markdown"><ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown></div> : <><div className="whitespace-pre-wrap">{message.content}</div>{message.attachments?.length ? <div className="mt-2 space-y-1 border-t border-[#c9deea] pt-2 text-[11px] text-[#37708f]">{message.attachments.map((item) => <div key={item.name}>📎 {item.name}</div>)}</div> : null}</>}</div></div>)}
                {sending && <div className="mr-8 rounded-2xl border border-[#cfe5df] bg-white px-4 py-3 text-sm text-[#385968] shadow-[0_8px_24px_rgba(23,59,82,0.07)]" role="status" aria-live="polite"><div className="flex items-center gap-3"><span className="moni-thinking-dots inline-flex h-6 items-center gap-1.5" aria-hidden="true"><i /><i /><i /></span><span className="font-bold">{waitingSteps[waitingStep] || waitingSteps[0]}</span></div><p className="mt-1 pl-[42px] text-[11px] text-[#78909d]">질문에 필요한 정보만 확인하며 답변을 준비합니다.</p></div>}
              </div>
            )}
          </div>

          <footer className="border-t border-[#d7e9e5] bg-white/90 p-3">
            {error && <div className="mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700">{error}</div>}
            {attachments.length > 0 && <div className="mb-2 flex max-h-28 flex-wrap gap-2 overflow-y-auto">{attachments.map((item) => <div key={item.key} className={`flex max-w-full items-center gap-2 rounded-xl border px-2.5 py-2 text-[11px] ${item.status === 'failed' ? 'border-red-300 bg-red-50' : 'border-[#d8e8e4] bg-[#f7fbfa]'}`}>{item.previewUrl ? <img src={item.previewUrl} alt="" className="h-8 w-8 rounded-lg object-cover" /> : <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#e8f4f0] text-base">📄</span>}<span className="min-w-0"><span className="block max-w-[230px] truncate font-bold text-[#274b5f]">{item.file.name}</span><span className={item.status === 'failed' ? 'text-red-600' : 'text-[#6c8794]'}>{attachmentLabel(item)}</span></span><button type="button" onClick={() => void removeAttachment(item)} className="ml-1 rounded-md px-1.5 py-1 text-[#6c8794] hover:bg-[#e8f4f0] hover:text-[#173b52]" aria-label={`${item.file.name} 제거`}>×</button></div>)}</div>}
            <form onSubmit={submit} className="rounded-2xl border border-[#c9dfda] bg-[#f7fbfa] p-2 focus-within:border-[#21b99a] focus-within:ring-2 focus-within:ring-[#21b99a]/10"><div className="flex items-end gap-2"><input ref={fileInputRef} type="file" accept={ACCEPT} multiple className="hidden" onChange={(event) => { if (event.target.files) addFiles(event.target.files); event.target.value = '' }} /><button type="button" onClick={() => fileInputRef.current?.click()} disabled={sending || attachments.length >= MAX_ATTACHMENTS} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg text-[#607d8d] hover:bg-[#e8f4f0] hover:text-[#087d69] disabled:opacity-35" aria-label="파일 첨부">＋</button><textarea ref={inputRef} value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={handleKeyDown} onPaste={handlePaste} disabled={sending} maxLength={6000} rows={1} placeholder="질문 입력 · 스크린샷 붙여넣기 · 파일 드래그" className="max-h-28 min-h-10 min-w-0 flex-1 resize-none bg-transparent px-1 py-2 text-sm text-[#173b52] outline-none placeholder:text-[#8aa0aa]" /><button type="submit" disabled={sending || uploading || (!input.trim() && !readyAttachments.length)} className="rounded-xl bg-[#21b99a] px-4 py-2.5 text-sm font-black text-white transition hover:bg-[#159c82] disabled:cursor-not-allowed disabled:opacity-35">전송</button></div></form>
            <div className="mt-2 flex items-center justify-between px-1 text-[10px] text-[#78909d]"><span>V10 · 영구 문맥 · 조회 전용 · PMO 이관</span><span>{provider ? `${provider} · ` : ''}{model || (lastAssistant ? 'AI' : '')}</span></div>
          </footer>
        </section>
      )}

      <button type="button" onClick={() => { setOpen((current) => !current); setShowBubble(false) }} aria-label="MONI Agent 열기" className={`moni-agent-character pointer-events-auto relative h-[68px] w-[68px] rounded-[24px] border shadow-[0_16px_48px_rgba(2,6,23,0.35)] transition hover:-translate-y-1 ${open ? 'border-emerald-300/55 bg-[#102b38]' : 'border-white/25 bg-[#0c2337]'}`}><span className="absolute -top-2 left-1/2 h-3 w-1 -translate-x-1/2 rounded-full bg-emerald-300/80" /><span className="absolute -top-3.5 left-1/2 h-2.5 w-2.5 -translate-x-1/2 rounded-full border border-emerald-100/40 bg-emerald-300 shadow-[0_0_14px_rgba(110,231,183,0.65)]" /><span className="absolute inset-1 rounded-[20px] bg-gradient-to-br from-emerald-300/20 via-cyan-300/10 to-blue-500/20" /><span className="moni-agent-eye absolute left-[18px] top-[23px] h-2.5 w-2.5 rounded-full bg-emerald-50" /><span className="moni-agent-eye absolute right-[18px] top-[23px] h-2.5 w-2.5 rounded-full bg-emerald-50 [animation-delay:2.7s]" /><span className="absolute bottom-[17px] left-1/2 h-1.5 w-4 -translate-x-1/2 rounded-full bg-emerald-100/80" /><span className="absolute -left-1 top-8 h-4 w-1.5 rounded-full bg-cyan-300/50" /><span className="absolute -right-1 top-8 h-4 w-1.5 rounded-full bg-cyan-300/50" />{!open && <span className="absolute -right-1 -top-1 h-3.5 w-3.5 rounded-full border-2 border-[#071426] bg-emerald-400" />}</button>

      <style jsx global>{`
        .moni-agent-character { animation: moniAgentBreathe 4.6s ease-in-out infinite; }
        .moni-agent-eye { animation: moniAgentBlink 5.2s ease-in-out infinite; transform-origin: center; }
        .moni-agent-markdown p { margin: 0 0 0.55rem; }
        .moni-agent-markdown p:last-child { margin-bottom: 0; }
        .moni-agent-markdown ul, .moni-agent-markdown ol { margin: 0.45rem 0 0.55rem 1.15rem; }
        .moni-agent-markdown li { margin: 0.15rem 0; }
        .moni-agent-markdown strong { color: #0f6e62; font-weight: 800; }
        .moni-agent-markdown table { width: 100%; margin: 0.6rem 0; border-collapse: collapse; font-size: 0.78rem; }
        .moni-agent-markdown th, .moni-agent-markdown td { border: 1px solid #d8e8e4; padding: 0.35rem 0.45rem; text-align: left; }
        .moni-thinking-dots i { width: 7px; height: 7px; border-radius: 999px; background: #21b99a; animation: moniThinkingBounce 1.05s ease-in-out infinite; will-change: transform; }
        .moni-thinking-dots i:nth-child(2) { background: #38a6cf; animation-delay: 120ms; }
        .moni-thinking-dots i:nth-child(3) { background: #7178c9; animation-delay: 240ms; }
        @keyframes moniAgentBreathe { 0%,100% { transform: translateY(0) scale(1); } 50% { transform: translateY(-2px) scale(1.015); } }
        @keyframes moniAgentBlink { 0%,44%,48%,100% { transform: scaleY(1); } 46% { transform: scaleY(0.12); } }
        @keyframes moniThinkingBounce { 0%,60%,100% { transform: translateY(0); opacity: 0.45; } 30% { transform: translateY(-5px); opacity: 1; } }
        @media (prefers-reduced-motion: reduce) { .moni-agent-character, .moni-agent-eye, .moni-thinking-dots i { animation: none !important; will-change: auto; } }
      `}</style>
    </div>
  )
}
