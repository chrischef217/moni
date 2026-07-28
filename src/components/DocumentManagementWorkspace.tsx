'use client'

import { useEffect, useMemo, useState } from 'react'

type DocumentView = 'official' | 'quotes' | null
type Status = 'DRAFT' | 'REVIEW' | 'APPROVED' | 'ISSUED' | 'SENT' | 'CANCELLED'
type DocumentType = 'GENERAL' | 'REQUEST' | 'CHANGE' | 'REPLY' | 'APOLOGY' | 'FREE'

type Client = {
  id: string
  company_name: string
  contact_name?: string | null
  phone?: string | null
  email?: string | null
  address?: string | null
  status?: string | null
}

type CompanyProfile = Record<string, any>

type OfficialDocument = {
  id: string
  document_no: string | null
  status: Status
  document_type: DocumentType
  document_date: string
  recipient_client_id: string | null
  recipient_company_name: string
  recipient_contact_name: string
  recipient_address: string
  recipient_email: string
  recipient_phone: string
  title: string
  greeting: string
  reference_text: string
  body: string
  request_summary: string
  attachment_names: string[]
  sender_snapshot: CompanyProfile
  author_name: string
  approver_name: string
  use_signature: boolean
  source_document_id?: string | null
  issued_at?: string | null
  sent_at?: string | null
  cancelled_at?: string | null
  cancel_reason?: string
  created_at?: string
  updated_at?: string
}

type EditorDocument = Omit<OfficialDocument, 'id' | 'document_no' | 'status' | 'sender_snapshot'> & {
  id?: string
  document_no?: string | null
  status?: Status
  sender_snapshot?: CompanyProfile
}

type ApiPayload = {
  ok: boolean
  error?: string
  documents?: OfficialDocument[]
  document?: OfficialDocument
  clients?: Client[]
  company_profile?: CompanyProfile | null
}

const TYPE_CONFIG: Array<{
  key: DocumentType
  title: string
  description: string
  referenceLabel: string
  summaryLabel: string
  titleSuggestion: string
  bodyTemplate: string
}> = [
  {
    key: 'GENERAL',
    title: '일반 안내',
    description: '일정, 정책, 운영방식 등 사실을 공식적으로 안내',
    referenceLabel: '관련 일정·근거',
    summaryLabel: '핵심 안내사항',
    titleSuggestion: '업무 관련 안내의 건',
    bodyTemplate: '귀사의 무궁한 발전을 기원합니다.\n\n아래와 같이 안내드리오니 업무에 참고하여 주시기 바랍니다.\n\n1. 안내 내용\n- \n\n2. 적용 또는 시행일\n- ',
  },
  {
    key: 'REQUEST',
    title: '요청·협조',
    description: '자료 제출, 일정 협의, 업무 협조를 정식으로 요청',
    referenceLabel: '요청 배경·관련 근거',
    summaryLabel: '요청사항·회신기한',
    titleSuggestion: '업무 협조 요청의 건',
    bodyTemplate: '귀사의 무궁한 발전을 기원합니다.\n\n원활한 업무 진행을 위하여 아래 사항에 대한 협조를 요청드립니다.\n\n1. 요청사항\n- \n\n2. 요청기한\n- \n\n3. 회신방법\n- ',
  },
  {
    key: 'CHANGE',
    title: '통보·변경',
    description: '가격, 납기, 계약조건, 담당자 등 변경사항을 통보',
    referenceLabel: '변경 사유·관련 계약',
    summaryLabel: '변경 전·후 내용 및 적용일',
    titleSuggestion: '업무 조건 변경 안내의 건',
    bodyTemplate: '귀사의 무궁한 발전을 기원합니다.\n\n아래와 같이 업무 조건이 변경됨을 안내드립니다.\n\n1. 변경 전\n- \n\n2. 변경 후\n- \n\n3. 적용일\n- \n\n4. 변경 사유\n- ',
  },
  {
    key: 'REPLY',
    title: '회신·확인',
    description: '상대방 요청에 대한 답변 또는 사실관계를 확인',
    referenceLabel: '상대방 요청·기존 문서번호',
    summaryLabel: '회신 결론·확인사항',
    titleSuggestion: '요청사항 회신의 건',
    bodyTemplate: '귀사에서 요청하신 사항에 대하여 아래와 같이 회신드립니다.\n\n1. 요청내용\n- \n\n2. 당사 회신\n- \n\n3. 추가 확인사항\n- ',
  },
  {
    key: 'APOLOGY',
    title: '사과·정정',
    description: '오류, 지연, 품질 문제 등에 대한 공식 사과와 정정',
    referenceLabel: '문제 발생일·관련 문서',
    summaryLabel: '정정내용·재발방지 조치',
    titleSuggestion: '업무 오류 사과 및 정정 안내의 건',
    bodyTemplate: '귀사에 불편을 드린 점 진심으로 사과드립니다.\n\n확인된 내용과 조치사항을 아래와 같이 안내드립니다.\n\n1. 발생 내용\n- \n\n2. 원인\n- \n\n3. 정정 및 조치사항\n- \n\n4. 재발방지 계획\n- ',
  },
  {
    key: 'FREE',
    title: '자유 형식',
    description: '기존 유형에 해당하지 않는 특수 목적의 공문',
    referenceLabel: '관련 근거·참고사항',
    summaryLabel: '핵심 결론',
    titleSuggestion: '',
    bodyTemplate: '귀사의 무궁한 발전을 기원합니다.\n\n아래와 같이 알려드립니다.\n\n1. 주요 내용\n- ',
  },
]

const STATUS_LABELS: Record<Status, string> = {
  DRAFT: '작성 중',
  REVIEW: '검토 대기',
  APPROVED: '승인 완료',
  ISSUED: '발행 완료',
  SENT: '발송 완료',
  CANCELLED: '취소',
}

const STATUS_STYLES: Record<Status, string> = {
  DRAFT: 'border-slate-200 bg-slate-50 text-slate-700',
  REVIEW: 'border-amber-200 bg-amber-50 text-amber-800',
  APPROVED: 'border-blue-200 bg-blue-50 text-blue-800',
  ISSUED: 'border-violet-200 bg-violet-50 text-violet-800',
  SENT: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  CANCELLED: 'border-rose-200 bg-rose-50 text-rose-800',
}

function today() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date())
}

function readView(): DocumentView {
  if (window.location.pathname !== '/business-management') return null
  const params = new URLSearchParams(window.location.search)
  if (params.get('tab') !== 'document-management') return null
  return params.get('view') === 'quotes' ? 'quotes' : 'official'
}

function emptyEditor(company: CompanyProfile | null): EditorDocument {
  return {
    document_type: 'GENERAL',
    document_date: today(),
    recipient_client_id: null,
    recipient_company_name: '',
    recipient_contact_name: '',
    recipient_address: '',
    recipient_email: '',
    recipient_phone: '',
    title: '',
    greeting: '귀사의 무궁한 발전을 기원합니다.',
    reference_text: '',
    body: '',
    request_summary: '',
    attachment_names: [],
    author_name: '',
    approver_name: String(company?.representative_name_ko || ''),
    use_signature: true,
  }
}

function formatDate(value?: string | null) {
  if (!value) return '-'
  return value.slice(0, 10)
}

function typeConfig(type: DocumentType) {
  return TYPE_CONFIG.find((item) => item.key === type) || TYPE_CONFIG[0]
}

function escapeSearch(value: string) {
  return value.trim().toLowerCase()
}

function QuoteWorkspace() {
  return (
    <div className="mx-auto w-full max-w-[1500px] px-6 py-8 lg:px-10 lg:py-10">
      <div className="rounded-[28px] border border-sky-100 bg-white/90 p-8 shadow-[0_18px_45px_rgba(44,91,126,0.10)] backdrop-blur-sm lg:p-10">
        <div className="text-xs font-black tracking-[0.18em] text-sky-700">DOCUMENT MANAGEMENT</div>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-[#173b52]">견적서 관리</h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-[#627f91]">
          견적서 작성, 버전관리, 유효기간, 거래처 발송 이력을 관리할 화면입니다. 대외 공문 관리 완성 후 다음 순서로 개발합니다.
        </p>
        <div className="mt-8 rounded-2xl border border-dashed border-sky-200 bg-sky-50/70 px-6 py-10 text-center">
          <div className="text-lg font-black text-[#36586d]">견적서 관리 기본 메뉴 생성 완료</div>
          <div className="mt-2 text-sm text-[#6a8495]">현재는 대외 공문 관리 기능을 우선 운영합니다.</div>
        </div>
      </div>
    </div>
  )
}

function DocumentPreview({ document, company }: { document: EditorDocument; company: CompanyProfile | null }) {
  const sender = document.sender_snapshot || company || {}
  const attachments = Array.isArray(document.attachment_names) ? document.attachment_names : []
  return (
    <article data-official-document-print className="mx-auto min-h-[1123px] w-full max-w-[794px] bg-white px-[62px] py-[54px] text-[#172f3f] shadow-[0_18px_50px_rgba(31,69,96,0.16)]">
      <header className="border-b-2 border-[#244c65] pb-5">
        <div className="flex items-start justify-between gap-6">
          <div>
            <div className="text-3xl font-black tracking-[0.32em] text-[#173b52]">공 문</div>
            <div className="mt-2 text-xs font-bold tracking-[0.12em] text-[#7a919f]">OFFICIAL DOCUMENT</div>
          </div>
          <div className="text-right text-xs leading-6 text-[#526f81]">
            <div className="text-lg font-black text-[#173b52]">{sender.company_name_ko || '두배'}</div>
            <div>{sender.address_ko || ''}</div>
            <div>{sender.company_phone || ''} · {sender.company_email || ''}</div>
          </div>
        </div>
      </header>

      <section className="mt-7 grid grid-cols-[118px_1fr] border-y border-[#bbced9] text-sm">
        {[
          ['문서번호', document.document_no || '발행 시 자동부여'],
          ['시행일자', document.document_date || '-'],
          ['수신', `${document.recipient_company_name || '-'}${document.recipient_contact_name ? ` / ${document.recipient_contact_name}` : ''}`],
          ['제목', document.title || '제목을 입력해 주세요.'],
        ].map(([label, value]) => (
          <div key={label} className="contents">
            <div className="border-b border-r border-[#d5e1e8] bg-[#f4f8fa] px-4 py-3 font-black text-[#36586d] last:border-b-0">{label}</div>
            <div className="border-b border-[#d5e1e8] px-4 py-3 font-bold last:border-b-0">{value}</div>
          </div>
        ))}
      </section>

      <section className="mt-10 text-[14px] leading-8">
        <p className="font-bold">{document.greeting || '귀사의 무궁한 발전을 기원합니다.'}</p>
        {document.reference_text && (
          <div className="mt-5 rounded-lg border border-[#dbe6ec] bg-[#f8fafb] px-4 py-3 text-[13px] text-[#526f81]">
            <b>관련 근거:</b> {document.reference_text}
          </div>
        )}
        <div className="mt-7 whitespace-pre-wrap">{document.body || '공문 본문이 여기에 표시됩니다.'}</div>
        {document.request_summary && (
          <div className="mt-7 border-l-4 border-[#2c789f] bg-[#f1f7fa] px-5 py-4 whitespace-pre-wrap">
            <b className="block text-[#245f7d]">요청·결론</b>
            {document.request_summary}
          </div>
        )}
      </section>

      {attachments.length > 0 && (
        <section className="mt-9 border-t border-[#d8e3e9] pt-5 text-sm">
          <div className="font-black text-[#36586d]">첨부</div>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            {attachments.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}
          </ol>
        </section>
      )}

      <footer className="mt-16 flex items-end justify-between gap-8 border-t border-[#d8e3e9] pt-7">
        <div className="text-xs leading-6 text-[#6d8492]">
          <div>작성자: {document.author_name || '-'}</div>
          <div>승인자: {document.approver_name || sender.representative_name_ko || '-'}</div>
        </div>
        <div className="relative min-w-[220px] text-right">
          <div className="text-xl font-black tracking-[0.12em] text-[#173b52]">{sender.company_name_ko || '두배'}</div>
          <div className="mt-2 text-sm font-bold text-[#526f81]">대표 {sender.representative_name_ko || ''}</div>
          {document.use_signature && sender.signature_data_url && (
            <img src={sender.signature_data_url} alt="대표자 서명" className="absolute -bottom-5 right-0 h-20 max-w-48 object-contain opacity-90" />
          )}
        </div>
      </footer>
      {document.status === 'CANCELLED' && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="rotate-[-18deg] rounded-xl border-4 border-rose-500 px-10 py-4 text-5xl font-black text-rose-500/60">취소</div>
        </div>
      )}
    </article>
  )
}

function OfficialWorkspace() {
  const [documents, setDocuments] = useState<OfficialDocument[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [company, setCompany] = useState<CompanyProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'ALL' | Status>('ALL')
  const [editorOpen, setEditorOpen] = useState(false)
  const [step, setStep] = useState(1)
  const [editor, setEditor] = useState<EditorDocument>(() => emptyEditor(null))

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/moni/official-documents', { cache: 'no-store' })
      const payload = await response.json() as ApiPayload
      if (!response.ok || !payload.ok) throw new Error(payload.error || '공문 목록을 불러오지 못했습니다.')
      setDocuments(payload.documents || [])
      setClients(payload.clients || [])
      setCompany(payload.company_profile || null)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '공문 목록을 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const filteredDocuments = useMemo(() => {
    const keyword = escapeSearch(search)
    return documents.filter((document) => {
      if (statusFilter !== 'ALL' && document.status !== statusFilter) return false
      if (!keyword) return true
      return [document.document_no, document.title, document.recipient_company_name, document.recipient_contact_name]
        .some((value) => String(value || '').toLowerCase().includes(keyword))
    })
  }, [documents, search, statusFilter])

  const counts = useMemo(() => ({
    total: documents.length,
    draft: documents.filter((item) => item.status === 'DRAFT').length,
    pending: documents.filter((item) => ['REVIEW', 'APPROVED'].includes(item.status)).length,
    issued: documents.filter((item) => ['ISSUED', 'SENT'].includes(item.status)).length,
  }), [documents])

  const updateEditor = <K extends keyof EditorDocument>(key: K, value: EditorDocument[K]) => {
    setEditor((current) => ({ ...current, [key]: value }))
  }

  const openNew = () => {
    setEditor(emptyEditor(company))
    setStep(1)
    setEditorOpen(true)
  }

  const openDocument = (document: OfficialDocument, preview = false) => {
    setEditor({ ...document, attachment_names: Array.isArray(document.attachment_names) ? document.attachment_names : [] })
    setStep(preview ? 3 : 2)
    setEditorOpen(true)
  }

  const applyClient = (id: string) => {
    const client = clients.find((item) => item.id === id)
    setEditor((current) => ({
      ...current,
      recipient_client_id: id || null,
      recipient_company_name: client?.company_name || current.recipient_company_name,
      recipient_contact_name: client?.contact_name || '',
      recipient_address: client?.address || '',
      recipient_email: client?.email || '',
      recipient_phone: client?.phone || '',
    }))
  }

  const saveEditor = async () => {
    setSaving(true)
    setError('')
    try {
      const method = editor.id ? 'PATCH' : 'POST'
      const response = await fetch('/api/moni/official-documents', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...editor, action: editor.id ? 'save' : 'create' }),
      })
      const payload = await response.json() as ApiPayload
      if (!response.ok || !payload.ok || !payload.document) throw new Error(payload.error || '공문 저장에 실패했습니다.')
      setEditor({ ...payload.document, attachment_names: payload.document.attachment_names || [] })
      await load()
      return payload.document
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '공문 저장에 실패했습니다.')
      return null
    } finally {
      setSaving(false)
    }
  }

  const runAction = async (document: OfficialDocument | EditorDocument, action: string, extra: Record<string, unknown> = {}) => {
    if (!document.id) return null
    setSaving(true)
    setError('')
    try {
      const response = await fetch('/api/moni/official-documents', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: document.id, action, ...extra }),
      })
      const payload = await response.json() as ApiPayload
      if (!response.ok || !payload.ok || !payload.document) throw new Error(payload.error || '공문 처리에 실패했습니다.')
      setEditor((current) => current.id === payload.document?.id ? { ...payload.document, attachment_names: payload.document.attachment_names || [] } : current)
      await load()
      return payload.document
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '공문 처리에 실패했습니다.')
      return null
    } finally {
      setSaving(false)
    }
  }

  const submitReview = async () => {
    const saved = await saveEditor()
    if (!saved) return
    const updated = await runAction(saved, 'submit_review')
    if (updated) setStep(3)
  }

  const copyDocument = async (document: OfficialDocument) => {
    setSaving(true)
    try {
      const response = await fetch('/api/moni/official-documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'copy', id: document.id }),
      })
      const payload = await response.json() as ApiPayload
      if (!response.ok || !payload.ok || !payload.document) throw new Error(payload.error || '공문 복사에 실패했습니다.')
      await load()
      openDocument(payload.document)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '공문 복사에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const deleteDraft = async (document: OfficialDocument) => {
    if (!window.confirm(`작성 중인 공문 “${document.title || '제목 없음'}”을 삭제하시겠습니까?`)) return
    const response = await fetch(`/api/moni/official-documents?id=${encodeURIComponent(document.id)}`, { method: 'DELETE' })
    const payload = await response.json() as ApiPayload
    if (!response.ok || !payload.ok) {
      setError(payload.error || '공문 삭제에 실패했습니다.')
      return
    }
    await load()
  }

  const cancelDocument = async (document: OfficialDocument) => {
    const reason = window.prompt('취소 사유를 입력해 주세요.')
    if (!reason?.trim()) return
    await runAction(document, 'cancel', { cancel_reason: reason.trim() })
  }

  const printDocument = (document?: OfficialDocument) => {
    if (document) openDocument(document, true)
    window.setTimeout(() => window.print(), document ? 180 : 30)
  }

  const currentType = typeConfig(editor.document_type)
  const locked = editor.status ? !['DRAFT', 'REVIEW', 'APPROVED'].includes(editor.status) : false

  return (
    <div className="mx-auto w-full max-w-[1600px] px-5 py-7 lg:px-9 lg:py-9">
      <header className="rounded-[28px] border border-sky-100 bg-white/92 p-7 shadow-[0_18px_45px_rgba(44,91,126,0.10)] backdrop-blur-sm lg:p-9">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-xs font-black tracking-[0.18em] text-sky-700">DOCUMENT MANAGEMENT</div>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-[#173b52]">대외 공문 관리</h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-[#627f91]">공문 작성부터 검토, 승인, 발행, 발송 이력까지 한 화면에서 관리합니다.</p>
          </div>
          <button type="button" onClick={openNew} className="rounded-2xl border border-emerald-600 bg-emerald-600 px-6 py-3 text-sm font-black text-white shadow-[0_10px_24px_rgba(5,150,105,0.20)] hover:bg-emerald-700">+ 새 공문 작성</button>
        </div>
        <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ['전체 공문', counts.total, 'text-[#173b52]'],
            ['작성 중', counts.draft, 'text-slate-700'],
            ['검토·승인 대기', counts.pending, 'text-amber-700'],
            ['발행·발송 완료', counts.issued, 'text-emerald-700'],
          ].map(([label, value, color]) => (
            <div key={String(label)} className="rounded-2xl border border-[#dce9f1] bg-[#f8fbfd] px-5 py-4">
              <div className="text-xs font-bold text-[#78909f]">{label}</div>
              <div className={`mt-1 text-2xl font-black ${color}`}>{value}건</div>
            </div>
          ))}
        </div>
      </header>

      {error && <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm font-bold text-rose-700">{error}</div>}

      <section className="mt-6 overflow-hidden rounded-[28px] border border-sky-100 bg-white/92 shadow-[0_18px_45px_rgba(44,91,126,0.08)] backdrop-blur-sm">
        <div className="flex flex-col gap-3 border-b border-sky-100 px-6 py-5 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div>
            <div className="text-xs font-black tracking-[0.16em] text-sky-700">DOCUMENT LIST</div>
            <h2 className="mt-1 text-xl font-black text-[#173b52]">공문 목록</h2>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="문서번호·제목·수신처 검색" className="h-11 min-w-[270px] rounded-xl border border-[#cfdee7] bg-white px-4 text-sm text-[#173b52] outline-none focus:border-sky-500" />
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'ALL' | Status)} className="h-11 rounded-xl border border-[#cfdee7] bg-white px-4 text-sm font-bold text-[#36586d] outline-none">
              <option value="ALL">전체 상태</option>
              {Object.entries(STATUS_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1120px] border-collapse text-left text-sm">
            <thead className="bg-[#eef5f9] text-xs font-black text-[#5c788a]">
              <tr>
                <th className="px-6 py-4">문서번호</th>
                <th className="px-4 py-4">시행일</th>
                <th className="px-4 py-4">유형</th>
                <th className="px-4 py-4">수신처</th>
                <th className="px-4 py-4">제목</th>
                <th className="px-4 py-4">상태</th>
                <th className="px-6 py-4 text-center">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e3edf3]">
              {loading ? (
                <tr><td colSpan={7} className="px-6 py-16 text-center font-bold text-[#7b93a2]">공문 데이터를 불러오는 중입니다.</td></tr>
              ) : filteredDocuments.length === 0 ? (
                <tr><td colSpan={7} className="px-6 py-16 text-center"><div className="font-black text-[#36586d]">등록된 공문이 없습니다.</div><button type="button" onClick={openNew} className="mt-3 text-sm font-black text-sky-700 underline">첫 공문 작성하기</button></td></tr>
              ) : filteredDocuments.map((document) => (
                <tr key={document.id} className="bg-white hover:bg-[#f9fcfe]">
                  <td className="px-6 py-4 font-black text-[#173b52]">{document.document_no || '미발행'}</td>
                  <td className="px-4 py-4 text-[#526f81]">{formatDate(document.document_date)}</td>
                  <td className="px-4 py-4 font-bold text-[#36586d]">{typeConfig(document.document_type).title}</td>
                  <td className="px-4 py-4"><div className="font-black text-[#173b52]">{document.recipient_company_name || '-'}</div><div className="mt-1 text-xs text-[#78909f]">{document.recipient_contact_name || ''}</div></td>
                  <td className="max-w-[320px] px-4 py-4 font-bold text-[#36586d]"><div className="truncate">{document.title || '제목 없음'}</div></td>
                  <td className="px-4 py-4"><span className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${STATUS_STYLES[document.status]}`}>{STATUS_LABELS[document.status]}</span></td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap justify-center gap-1.5">
                      <button type="button" onClick={() => openDocument(document)} className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-black text-sky-800">{['DRAFT', 'REVIEW', 'APPROVED'].includes(document.status) ? '열기' : '보기'}</button>
                      <button type="button" onClick={() => printDocument(document)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-[#36586d]">인쇄</button>
                      <button type="button" onClick={() => void copyDocument(document)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-[#36586d]">복사</button>
                      {document.status === 'REVIEW' && <button type="button" onClick={() => void runAction(document, 'approve')} className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-black text-blue-800">승인</button>}
                      {document.status === 'APPROVED' && <button type="button" onClick={() => void runAction(document, 'issue')} className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-black text-violet-800">발행</button>}
                      {document.status === 'ISSUED' && <button type="button" onClick={() => void runAction(document, 'mark_sent')} className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-800">발송완료</button>}
                      {document.status === 'DRAFT' && <button type="button" onClick={() => void deleteDraft(document)} className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-black text-rose-700">삭제</button>}
                      {['ISSUED', 'SENT'].includes(document.status) && <button type="button" onClick={() => void cancelDocument(document)} className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-black text-rose-700">취소</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {editorOpen && (
        <div className="fixed inset-0 z-[1300] overflow-auto bg-[#0e2a3d]/70 p-4 backdrop-blur-[2px] lg:p-7">
          <div className="mx-auto min-h-full max-w-[1520px] rounded-[28px] border border-white/60 bg-[#edf5fa] shadow-[0_30px_90px_rgba(0,25,42,0.35)]">
            <div className="sticky top-0 z-20 flex flex-col gap-4 rounded-t-[28px] border-b border-[#d5e4ed] bg-white/95 px-6 py-5 backdrop-blur lg:flex-row lg:items-center lg:justify-between lg:px-8">
              <div>
                <div className="text-xs font-black tracking-[0.16em] text-sky-700">{editor.id ? editor.document_no || '임시 공문' : 'NEW DOCUMENT'}</div>
                <h2 className="mt-1 text-2xl font-black text-[#173b52]">{editor.id ? editor.title || '공문 수정' : '새 대외 공문 작성'}</h2>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {[1, 2, 3].map((number) => <button key={number} type="button" onClick={() => setStep(number)} className={`rounded-full border px-4 py-2 text-xs font-black ${step === number ? 'border-sky-600 bg-sky-600 text-white' : 'border-[#cedde6] bg-white text-[#526f81]'}`}>{number}. {number === 1 ? '유형' : number === 2 ? '작성' : '검토'}</button>)}
                <button type="button" onClick={() => setEditorOpen(false)} className="ml-1 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700">닫기</button>
              </div>
            </div>

            <div className="p-5 lg:p-8">
              {step === 1 && (
                <div className="rounded-[24px] border border-sky-100 bg-white p-6 lg:p-8">
                  <div className="text-xs font-black tracking-[0.16em] text-sky-700">STEP 1</div>
                  <h3 className="mt-2 text-2xl font-black text-[#173b52]">공문 목적을 선택해 주세요.</h3>
                  <p className="mt-2 text-sm text-[#6a8495]">선택한 목적에 맞춰 기본 제목과 문장 구조를 제안합니다.</p>
                  <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {TYPE_CONFIG.map((item, index) => (
                      <button key={item.key} type="button" disabled={locked} onClick={() => updateEditor('document_type', item.key)} className={`rounded-2xl border p-5 text-left transition ${editor.document_type === item.key ? 'border-sky-500 bg-sky-50 shadow-[0_10px_28px_rgba(14,116,174,0.12)]' : 'border-[#d9e9f4] bg-[#f8fbfd] hover:border-sky-300'}`}>
                        <div className="flex items-center gap-3"><span className={`flex h-9 w-9 items-center justify-center rounded-xl text-sm font-black ${editor.document_type === item.key ? 'bg-sky-600 text-white' : 'bg-sky-100 text-sky-800'}`}>{index + 1}</span><span className="font-black text-[#173b52]">{item.title}</span></div>
                        <p className="mt-3 text-sm leading-6 text-[#6a8495]">{item.description}</p>
                      </button>
                    ))}
                  </div>
                  <div className="mt-7 flex justify-end"><button type="button" onClick={() => setStep(2)} className="rounded-xl bg-sky-700 px-6 py-3 text-sm font-black text-white">다음: 공문 작성</button></div>
                </div>
              )}

              {step === 2 && (
                <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
                  <div className="rounded-[24px] border border-sky-100 bg-white p-6 lg:p-8">
                    <div className="flex items-center justify-between gap-4"><div><div className="text-xs font-black tracking-[0.16em] text-sky-700">STEP 2</div><h3 className="mt-2 text-2xl font-black text-[#173b52]">공문 내용 작성</h3></div>{editor.status && <span className={`rounded-full border px-3 py-1 text-xs font-black ${STATUS_STYLES[editor.status]}`}>{STATUS_LABELS[editor.status]}</span>}</div>

                    <fieldset disabled={locked || saving} className="mt-7 space-y-6 disabled:opacity-75">
                      <div className="grid gap-4 md:grid-cols-2">
                        <label className="block"><span className="text-sm font-black text-[#36586d]">시행일자</span><input type="date" value={editor.document_date} onChange={(event) => updateEditor('document_date', event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-[#cfdee7] px-4 text-sm outline-none focus:border-sky-500" /></label>
                        <label className="block"><span className="text-sm font-black text-[#36586d]">등록 거래처 불러오기</span><select value={editor.recipient_client_id || ''} onChange={(event) => applyClient(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-[#cfdee7] bg-white px-4 text-sm outline-none focus:border-sky-500"><option value="">직접 입력</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.company_name}</option>)}</select></label>
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        <label className="block"><span className="text-sm font-black text-[#36586d]">수신 회사 *</span><input value={editor.recipient_company_name} onChange={(event) => updateEditor('recipient_company_name', event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-[#cfdee7] px-4 text-sm outline-none focus:border-sky-500" /></label>
                        <label className="block"><span className="text-sm font-black text-[#36586d]">수신 담당자</span><input value={editor.recipient_contact_name} onChange={(event) => updateEditor('recipient_contact_name', event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-[#cfdee7] px-4 text-sm outline-none focus:border-sky-500" /></label>
                      </div>
                      <label className="block"><span className="text-sm font-black text-[#36586d]">수신처 주소</span><input value={editor.recipient_address} onChange={(event) => updateEditor('recipient_address', event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-[#cfdee7] px-4 text-sm outline-none focus:border-sky-500" /></label>
                      <div className="grid gap-4 md:grid-cols-2">
                        <label className="block"><span className="text-sm font-black text-[#36586d]">이메일</span><input value={editor.recipient_email} onChange={(event) => updateEditor('recipient_email', event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-[#cfdee7] px-4 text-sm outline-none focus:border-sky-500" /></label>
                        <label className="block"><span className="text-sm font-black text-[#36586d]">전화번호</span><input value={editor.recipient_phone} onChange={(event) => updateEditor('recipient_phone', event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-[#cfdee7] px-4 text-sm outline-none focus:border-sky-500" /></label>
                      </div>
                      <label className="block"><span className="text-sm font-black text-[#36586d]">공문 제목 *</span><div className="mt-2 flex gap-2"><input value={editor.title} onChange={(event) => updateEditor('title', event.target.value)} className="h-11 min-w-0 flex-1 rounded-xl border border-[#cfdee7] px-4 text-sm outline-none focus:border-sky-500" /><button type="button" onClick={() => updateEditor('title', currentType.titleSuggestion)} className="shrink-0 rounded-xl border border-sky-200 bg-sky-50 px-4 text-xs font-black text-sky-800">제목 제안</button></div></label>
                      <label className="block"><span className="text-sm font-black text-[#36586d]">{currentType.referenceLabel}</span><textarea value={editor.reference_text} onChange={(event) => updateEditor('reference_text', event.target.value)} rows={2} className="mt-2 w-full rounded-xl border border-[#cfdee7] px-4 py-3 text-sm leading-6 outline-none focus:border-sky-500" /></label>
                      <label className="block"><span className="text-sm font-black text-[#36586d]">본문 *</span><div className="mt-2 flex justify-end"><button type="button" onClick={() => updateEditor('body', currentType.bodyTemplate)} className="mb-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-800">기본문구 적용</button></div><textarea value={editor.body} onChange={(event) => updateEditor('body', event.target.value)} rows={14} className="w-full rounded-xl border border-[#cfdee7] px-4 py-3 text-sm leading-7 outline-none focus:border-sky-500" /></label>
                      <label className="block"><span className="text-sm font-black text-[#36586d]">{currentType.summaryLabel}</span><textarea value={editor.request_summary} onChange={(event) => updateEditor('request_summary', event.target.value)} rows={3} className="mt-2 w-full rounded-xl border border-[#cfdee7] px-4 py-3 text-sm leading-6 outline-none focus:border-sky-500" /></label>
                      <label className="block"><span className="text-sm font-black text-[#36586d]">첨부자료명</span><textarea value={editor.attachment_names.join('\n')} onChange={(event) => updateEditor('attachment_names', event.target.value.split('\n').map((item) => item.trim()).filter(Boolean))} rows={3} placeholder={'첨부자료가 여러 개면 한 줄에 하나씩 입력'} className="mt-2 w-full rounded-xl border border-[#cfdee7] px-4 py-3 text-sm leading-6 outline-none focus:border-sky-500" /></label>
                      <div className="grid gap-4 md:grid-cols-2">
                        <label className="block"><span className="text-sm font-black text-[#36586d]">작성자</span><input value={editor.author_name} onChange={(event) => updateEditor('author_name', event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-[#cfdee7] px-4 text-sm outline-none focus:border-sky-500" /></label>
                        <label className="block"><span className="text-sm font-black text-[#36586d]">승인자</span><input value={editor.approver_name} onChange={(event) => updateEditor('approver_name', event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-[#cfdee7] px-4 text-sm outline-none focus:border-sky-500" /></label>
                      </div>
                      <label className="flex items-center gap-3 rounded-xl border border-[#d8e5ed] bg-[#f8fbfd] px-4 py-3"><input type="checkbox" checked={editor.use_signature} onChange={(event) => updateEditor('use_signature', event.target.checked)} className="h-4 w-4" /><span className="text-sm font-bold text-[#36586d]">대표자 서명 이미지 표시</span></label>
                    </fieldset>

                    <div className="mt-7 flex flex-wrap justify-between gap-3"><button type="button" onClick={() => setStep(1)} className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700">이전</button><div className="flex flex-wrap gap-2">{!locked && <button type="button" disabled={saving} onClick={() => void saveEditor()} className="rounded-xl border border-sky-200 bg-sky-50 px-5 py-3 text-sm font-black text-sky-800 disabled:opacity-50">임시저장</button>}<button type="button" onClick={() => setStep(3)} className="rounded-xl bg-sky-700 px-5 py-3 text-sm font-black text-white">다음: 미리보기</button></div></div>
                  </div>

                  <aside className="rounded-[24px] border border-sky-100 bg-white p-5">
                    <div className="text-xs font-black tracking-[0.14em] text-sky-700">LIVE PREVIEW</div>
                    <div className="mt-4 origin-top scale-[0.48] sm:scale-[0.52] xl:scale-[0.49]" style={{ width: '794px' }}><DocumentPreview document={editor} company={company} /></div>
                  </aside>
                </div>
              )}

              {step === 3 && (
                <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_330px]">
                  <div className="overflow-auto rounded-[24px] border border-sky-100 bg-[#dce9f1] p-5 lg:p-8"><DocumentPreview document={editor} company={company} /></div>
                  <aside className="h-fit rounded-[24px] border border-sky-100 bg-white p-6 xl:sticky xl:top-28">
                    <div className="text-xs font-black tracking-[0.16em] text-sky-700">STEP 3</div><h3 className="mt-2 text-xl font-black text-[#173b52]">검토·발행</h3>
                    <div className="mt-5 space-y-3 text-sm text-[#526f81]"><div className="rounded-xl border border-[#dce7ed] bg-[#f8fbfd] px-4 py-3"><b className="text-[#36586d]">문서번호</b><div className="mt-1">{editor.document_no || '최종 발행 시 자동부여'}</div></div><div className="rounded-xl border border-[#dce7ed] bg-[#f8fbfd] px-4 py-3"><b className="text-[#36586d]">상태</b><div className="mt-1">{editor.status ? STATUS_LABELS[editor.status] : '아직 저장되지 않음'}</div></div></div>
                    <div className="mt-6 grid gap-2"><button type="button" onClick={() => setStep(2)} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700">내용 수정</button>{!locked && <button type="button" disabled={saving} onClick={() => void saveEditor()} className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-black text-sky-800 disabled:opacity-50">임시저장</button>}{(!editor.status || editor.status === 'DRAFT') && <button type="button" disabled={saving} onClick={() => void submitReview()} className="rounded-xl bg-amber-500 px-4 py-3 text-sm font-black text-white disabled:opacity-50">저장 후 검토 요청</button>}{editor.status === 'REVIEW' && <button type="button" disabled={saving} onClick={() => void runAction(editor, 'approve')} className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-black text-white disabled:opacity-50">승인 완료</button>}{editor.status === 'APPROVED' && <button type="button" disabled={saving} onClick={() => void runAction(editor, 'issue')} className="rounded-xl bg-violet-600 px-4 py-3 text-sm font-black text-white disabled:opacity-50">공문번호 부여·발행</button>}{editor.status === 'ISSUED' && <button type="button" disabled={saving} onClick={() => void runAction(editor, 'mark_sent')} className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-black text-white disabled:opacity-50">발송 완료 처리</button>}<button type="button" onClick={() => printDocument()} className="rounded-xl border border-[#294f66] bg-[#294f66] px-4 py-3 text-sm font-black text-white">PDF 저장 / 인쇄</button></div>
                    <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-6 text-amber-800">발행 완료 후에는 원문을 수정하지 않습니다. 변경이 필요하면 기존 공문을 복사해 새 공문으로 발행합니다.</div>
                  </aside>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        @media print {
          body * { visibility: hidden !important; }
          [data-official-document-print], [data-official-document-print] * { visibility: visible !important; }
          [data-official-document-print] {
            position: absolute !important;
            inset: 0 auto auto 0 !important;
            width: 210mm !important;
            min-height: 297mm !important;
            max-width: none !important;
            margin: 0 !important;
            padding: 16mm !important;
            box-shadow: none !important;
            print-color-adjust: exact !important;
            -webkit-print-color-adjust: exact !important;
          }
          @page { size: A4 portrait; margin: 0; }
        }
      `}</style>
    </div>
  )
}

export default function DocumentManagementWorkspace() {
  const [view, setView] = useState<DocumentView>(null)

  useEffect(() => {
    const sync = () => setView(readView())
    sync()
    window.addEventListener('popstate', sync)
    return () => window.removeEventListener('popstate', sync)
  }, [])

  if (!view) return null

  return (
    <div data-document-management-workspace className="absolute inset-0 z-[800] overflow-auto bg-[radial-gradient(circle_at_86%_0%,rgba(134,207,255,0.16),transparent_28%),linear-gradient(145deg,rgba(246,251,255,0.98),rgba(231,242,252,0.98))]">
      {view === 'quotes' ? <QuoteWorkspace /> : <OfficialWorkspace />}
    </div>
  )
}
