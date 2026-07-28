'use client'

import { useEffect, useMemo, useState } from 'react'

type View = 'official' | 'quotes' | null
type Status = 'DRAFT' | 'REVIEW' | 'APPROVED' | 'ISSUED' | 'SENT' | 'CANCELLED'
type DocType = 'GENERAL' | 'REQUEST' | 'CHANGE' | 'REPLY' | 'APOLOGY' | 'FREE'

type Client = { id: string; company_name: string; contact_name?: string | null; phone?: string | null; email?: string | null; address?: string | null }
type Company = Record<string, any>
type OfficialDocument = {
  id: string; document_no: string | null; status: Status; document_type: DocType; document_date: string
  recipient_client_id: string | null; recipient_company_name: string; recipient_contact_name: string
  recipient_address: string; recipient_email: string; recipient_phone: string; title: string; greeting: string
  reference_text: string; body: string; request_summary: string; attachment_names: string[]
  sender_snapshot: Company; author_name: string; approver_name: string; use_signature: boolean
  cancel_reason?: string; created_at?: string; updated_at?: string
}
type Draft = {
  id?: string; document_no?: string | null; status?: Status; sender_snapshot?: Company
  document_type: DocType; document_date: string; recipient_client_id: string | null
  recipient_company_name: string; recipient_contact_name: string; recipient_address: string
  recipient_email: string; recipient_phone: string; title: string; greeting: string
  reference_text: string; body: string; request_summary: string; attachment_names: string[]
  author_name: string; approver_name: string; use_signature: boolean; cancel_reason?: string
}
type ApiResult = { ok: boolean; error?: string; documents?: OfficialDocument[]; document?: OfficialDocument; clients?: Client[]; company_profile?: Company | null }

const TYPES: Array<{ key: DocType; title: string; description: string; refLabel: string; summaryLabel: string; suggestedTitle: string; template: string }> = [
  { key: 'GENERAL', title: '일반 안내', description: '일정·정책·운영방식 안내', refLabel: '관련 일정·근거', summaryLabel: '핵심 안내사항', suggestedTitle: '업무 관련 안내의 건', template: '귀사의 무궁한 발전을 기원합니다.\n\n아래와 같이 안내드리오니 업무에 참고하여 주시기 바랍니다.\n\n1. 안내 내용\n- \n\n2. 시행일\n- ' },
  { key: 'REQUEST', title: '요청·협조', description: '자료·일정·업무 협조 요청', refLabel: '요청 배경·관련 근거', summaryLabel: '요청사항·회신기한', suggestedTitle: '업무 협조 요청의 건', template: '귀사의 무궁한 발전을 기원합니다.\n\n원활한 업무 진행을 위하여 아래 사항에 대한 협조를 요청드립니다.\n\n1. 요청사항\n- \n\n2. 요청기한\n- \n\n3. 회신방법\n- ' },
  { key: 'CHANGE', title: '통보·변경', description: '가격·납기·조건 변경 통보', refLabel: '변경 사유·관련 계약', summaryLabel: '변경 전·후 및 적용일', suggestedTitle: '업무 조건 변경 안내의 건', template: '귀사의 무궁한 발전을 기원합니다.\n\n아래와 같이 업무 조건이 변경됨을 안내드립니다.\n\n1. 변경 전\n- \n\n2. 변경 후\n- \n\n3. 적용일\n- ' },
  { key: 'REPLY', title: '회신·확인', description: '요청 답변 또는 사실 확인', refLabel: '상대방 요청·기존 문서번호', summaryLabel: '회신 결론·확인사항', suggestedTitle: '요청사항 회신의 건', template: '귀사에서 요청하신 사항에 대하여 아래와 같이 회신드립니다.\n\n1. 요청내용\n- \n\n2. 당사 회신\n- \n\n3. 추가 확인사항\n- ' },
  { key: 'APOLOGY', title: '사과·정정', description: '오류·지연·품질 문제 정정', refLabel: '문제 발생일·관련 문서', summaryLabel: '정정내용·재발방지', suggestedTitle: '업무 오류 사과 및 정정 안내의 건', template: '귀사에 불편을 드린 점 진심으로 사과드립니다.\n\n확인된 내용과 조치사항을 아래와 같이 안내드립니다.\n\n1. 발생 내용\n- \n\n2. 원인\n- \n\n3. 정정 및 조치사항\n- ' },
  { key: 'FREE', title: '자유 형식', description: '특수 목적의 자유 공문', refLabel: '관련 근거·참고사항', summaryLabel: '핵심 결론', suggestedTitle: '', template: '귀사의 무궁한 발전을 기원합니다.\n\n아래와 같이 알려드립니다.\n\n1. 주요 내용\n- ' },
]

const STATUS_LABEL: Record<Status, string> = { DRAFT: '작성 중', REVIEW: '검토 대기', APPROVED: '승인 완료', ISSUED: '발행 완료', SENT: '발송 완료', CANCELLED: '취소' }
const STATUS_STYLE: Record<Status, string> = {
  DRAFT: 'border-slate-200 bg-slate-50 text-slate-700', REVIEW: 'border-amber-200 bg-amber-50 text-amber-800',
  APPROVED: 'border-blue-200 bg-blue-50 text-blue-800', ISSUED: 'border-violet-200 bg-violet-50 text-violet-800',
  SENT: 'border-emerald-200 bg-emerald-50 text-emerald-800', CANCELLED: 'border-rose-200 bg-rose-50 text-rose-800',
}

function today() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date()) }
function currentView(): View {
  if (window.location.pathname !== '/business-management') return null
  const params = new URLSearchParams(window.location.search)
  if (params.get('tab') !== 'document-management') return null
  return params.get('view') === 'quotes' ? 'quotes' : 'official'
}
function config(type: DocType) { return TYPES.find((item) => item.key === type) || TYPES[0] }
function blank(company: Company | null): Draft {
  return { document_type: 'GENERAL', document_date: today(), recipient_client_id: null, recipient_company_name: '', recipient_contact_name: '', recipient_address: '', recipient_email: '', recipient_phone: '', title: '', greeting: '귀사의 무궁한 발전을 기원합니다.', reference_text: '', body: '', request_summary: '', attachment_names: [], author_name: '', approver_name: String(company?.representative_name_ko || ''), use_signature: true }
}
function toDraft(doc: OfficialDocument): Draft {
  return { id: doc.id, document_no: doc.document_no, status: doc.status, sender_snapshot: doc.sender_snapshot, document_type: doc.document_type, document_date: doc.document_date, recipient_client_id: doc.recipient_client_id, recipient_company_name: doc.recipient_company_name, recipient_contact_name: doc.recipient_contact_name, recipient_address: doc.recipient_address, recipient_email: doc.recipient_email, recipient_phone: doc.recipient_phone, title: doc.title, greeting: doc.greeting, reference_text: doc.reference_text, body: doc.body, request_summary: doc.request_summary, attachment_names: Array.isArray(doc.attachment_names) ? doc.attachment_names : [], author_name: doc.author_name, approver_name: doc.approver_name, use_signature: doc.use_signature, cancel_reason: doc.cancel_reason }
}

function Preview({ doc, company }: { doc: Draft; company: Company | null }) {
  const sender = doc.sender_snapshot || company || {}
  return (
    <article data-official-document-print className="relative mx-auto min-h-[1123px] w-full max-w-[794px] bg-white px-[62px] py-[54px] text-[#172f3f] shadow-[0_18px_50px_rgba(31,69,96,0.16)]">
      <header className="border-b-2 border-[#244c65] pb-5"><div className="flex items-start justify-between gap-6"><div><div className="text-3xl font-black tracking-[0.32em]">공 문</div><div className="mt-2 text-xs font-bold tracking-[0.12em] text-[#7a919f]">OFFICIAL DOCUMENT</div></div><div className="text-right text-xs leading-6 text-[#526f81]"><div className="text-lg font-black text-[#173b52]">{sender.company_name_ko || '두배'}</div><div>{sender.address_ko || ''}</div><div>{sender.company_phone || ''} · {sender.company_email || ''}</div></div></div></header>
      <section className="mt-7 grid grid-cols-[118px_1fr] border-y border-[#bbced9] text-sm">
        {[
          ['문서번호', doc.document_no || '발행 시 자동부여'], ['시행일자', doc.document_date || '-'],
          ['수신', `${doc.recipient_company_name || '-'}${doc.recipient_contact_name ? ` / ${doc.recipient_contact_name}` : ''}`], ['제목', doc.title || '제목을 입력해 주세요.'],
        ].map(([label, value]) => <div key={label} className="contents"><div className="border-b border-r border-[#d5e1e8] bg-[#f4f8fa] px-4 py-3 font-black text-[#36586d]">{label}</div><div className="border-b border-[#d5e1e8] px-4 py-3 font-bold">{value}</div></div>)}
      </section>
      <section className="mt-10 text-[14px] leading-8"><p className="font-bold">{doc.greeting}</p>{doc.reference_text && <div className="mt-5 rounded-lg border border-[#dbe6ec] bg-[#f8fafb] px-4 py-3 text-[13px] text-[#526f81]"><b>관련 근거:</b> {doc.reference_text}</div>}<div className="mt-7 whitespace-pre-wrap">{doc.body || '공문 본문이 여기에 표시됩니다.'}</div>{doc.request_summary && <div className="mt-7 border-l-4 border-[#2c789f] bg-[#f1f7fa] px-5 py-4 whitespace-pre-wrap"><b className="block text-[#245f7d]">요청·결론</b>{doc.request_summary}</div>}</section>
      {doc.attachment_names.length > 0 && <section className="mt-9 border-t border-[#d8e3e9] pt-5 text-sm"><div className="font-black text-[#36586d]">첨부</div><ol className="mt-2 list-decimal space-y-1 pl-5">{doc.attachment_names.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ol></section>}
      <footer className="mt-16 flex items-end justify-between gap-8 border-t border-[#d8e3e9] pt-7"><div className="text-xs leading-6 text-[#6d8492]"><div>작성자: {doc.author_name || '-'}</div><div>승인자: {doc.approver_name || sender.representative_name_ko || '-'}</div></div><div className="relative min-w-[220px] text-right"><div className="text-xl font-black tracking-[0.12em] text-[#173b52]">{sender.company_name_ko || '두배'}</div><div className="mt-2 text-sm font-bold text-[#526f81]">대표 {sender.representative_name_ko || ''}</div>{doc.use_signature && sender.signature_data_url && <img src={sender.signature_data_url} alt="대표자 서명" className="absolute -bottom-5 right-0 h-20 max-w-48 object-contain opacity-90" />}</div></footer>
      {doc.status === 'CANCELLED' && <div className="pointer-events-none absolute inset-0 flex items-center justify-center"><div className="rotate-[-18deg] rounded-xl border-4 border-rose-500 px-10 py-4 text-5xl font-black text-rose-500/60">취소</div></div>}
    </article>
  )
}

function QuoteWorkspace() {
  return <div className="mx-auto w-full max-w-[1500px] px-6 py-8 lg:px-10"><div className="rounded-[28px] border border-sky-100 bg-white/90 p-9 shadow-xl"><div className="text-xs font-black tracking-[0.18em] text-sky-700">DOCUMENT MANAGEMENT</div><h1 className="mt-2 text-3xl font-black text-[#173b52]">견적서 관리</h1><p className="mt-3 text-sm leading-7 text-[#627f91]">견적서 작성·버전·유효기간·발송 이력 기능은 대외 공문 관리 다음 단계로 개발합니다.</p><div className="mt-8 rounded-2xl border border-dashed border-sky-200 bg-sky-50/70 px-6 py-10 text-center font-black text-[#36586d]">견적서 관리 메뉴 생성 완료</div></div></div>
}

function OfficialWorkspace() {
  const [documents, setDocuments] = useState<OfficialDocument[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [company, setCompany] = useState<Company | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'ALL' | Status>('ALL')
  const [modal, setModal] = useState(false)
  const [step, setStep] = useState(1)
  const [draft, setDraft] = useState<Draft>(() => blank(null))

  const load = async () => {
    setLoading(true); setError('')
    try {
      const response = await fetch('/api/moni/official-documents', { cache: 'no-store' })
      const result = await response.json() as ApiResult
      if (!response.ok || !result.ok) throw new Error(result.error || '공문 목록을 불러오지 못했습니다.')
      setDocuments(result.documents || []); setClients(result.clients || []); setCompany(result.company_profile || null)
    } catch (reason) { setError(reason instanceof Error ? reason.message : '공문 목록을 불러오지 못했습니다.') }
    finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [])

  const visible = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    return documents.filter((doc) => (filter === 'ALL' || doc.status === filter) && (!keyword || [doc.document_no, doc.title, doc.recipient_company_name, doc.recipient_contact_name].some((value) => String(value || '').toLowerCase().includes(keyword))))
  }, [documents, filter, search])
  const summary = useMemo(() => ({ total: documents.length, draft: documents.filter((d) => d.status === 'DRAFT').length, waiting: documents.filter((d) => ['REVIEW', 'APPROVED'].includes(d.status)).length, issued: documents.filter((d) => ['ISSUED', 'SENT'].includes(d.status)).length }), [documents])

  const openNew = () => { setDraft(blank(company)); setStep(1); setModal(true) }
  const openExisting = (doc: OfficialDocument, preview = false) => { setDraft(toDraft(doc)); setStep(preview ? 3 : 2); setModal(true) }
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => ({ ...current, [key]: value }))
  const chooseClient = (id: string) => {
    const client = clients.find((item) => item.id === id)
    setDraft((current) => ({ ...current, recipient_client_id: id || null, recipient_company_name: client?.company_name || current.recipient_company_name, recipient_contact_name: client?.contact_name || '', recipient_address: client?.address || '', recipient_email: client?.email || '', recipient_phone: client?.phone || '' }))
  }

  const save = async () => {
    setBusy(true); setError('')
    try {
      const response = await fetch('/api/moni/official-documents', { method: draft.id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...draft, action: draft.id ? 'save' : 'create' }) })
      const result = await response.json() as ApiResult
      if (!response.ok || !result.ok || !result.document) throw new Error(result.error || '저장에 실패했습니다.')
      const saved = result.document
      setDraft(toDraft(saved)); await load(); return saved
    } catch (reason) { setError(reason instanceof Error ? reason.message : '저장에 실패했습니다.'); return null }
    finally { setBusy(false) }
  }

  const action = async (doc: { id?: string }, name: string, extra: Record<string, unknown> = {}) => {
    if (!doc.id) return null
    setBusy(true); setError('')
    try {
      const response = await fetch('/api/moni/official-documents', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: doc.id, action: name, ...extra }) })
      const result = await response.json() as ApiResult
      if (!response.ok || !result.ok || !result.document) throw new Error(result.error || '처리에 실패했습니다.')
      const updated = result.document
      if (draft.id === updated.id) setDraft(toDraft(updated))
      await load(); return updated
    } catch (reason) { setError(reason instanceof Error ? reason.message : '처리에 실패했습니다.'); return null }
    finally { setBusy(false) }
  }

  const review = async () => { const saved = await save(); if (saved) { const updated = await action(saved, 'submit_review'); if (updated) setStep(3) } }
  const copy = async (doc: OfficialDocument) => {
    setBusy(true)
    try {
      const response = await fetch('/api/moni/official-documents', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'copy', id: doc.id }) })
      const result = await response.json() as ApiResult
      if (!response.ok || !result.ok || !result.document) throw new Error(result.error || '복사에 실패했습니다.')
      await load(); openExisting(result.document)
    } catch (reason) { setError(reason instanceof Error ? reason.message : '복사에 실패했습니다.') }
    finally { setBusy(false) }
  }
  const remove = async (doc: OfficialDocument) => {
    if (!window.confirm(`작성 중인 공문 “${doc.title || '제목 없음'}”을 삭제하시겠습니까?`)) return
    const response = await fetch(`/api/moni/official-documents?id=${encodeURIComponent(doc.id)}`, { method: 'DELETE' })
    const result = await response.json() as ApiResult
    if (!response.ok || !result.ok) setError(result.error || '삭제에 실패했습니다.'); else await load()
  }
  const cancel = async (doc: OfficialDocument) => { const reason = window.prompt('취소 사유를 입력해 주세요.'); if (reason?.trim()) await action(doc, 'cancel', { cancel_reason: reason.trim() }) }
  const print = (doc?: OfficialDocument) => { if (doc) openExisting(doc, true); window.setTimeout(() => window.print(), doc ? 200 : 40) }

  const type = config(draft.document_type)
  const locked = draft.status ? !['DRAFT', 'REVIEW', 'APPROVED'].includes(draft.status) : false

  return <div className="mx-auto w-full max-w-[1600px] px-5 py-7 lg:px-9">
    <header className="rounded-[28px] border border-sky-100 bg-white/92 p-8 shadow-xl"><div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between"><div><div className="text-xs font-black tracking-[0.18em] text-sky-700">DOCUMENT MANAGEMENT</div><h1 className="mt-2 text-3xl font-black text-[#173b52]">대외 공문 관리</h1><p className="mt-3 text-sm leading-7 text-[#627f91]">작성·검토·승인·발행·발송 이력을 한 화면에서 관리합니다.</p></div><button onClick={openNew} className="rounded-2xl bg-emerald-600 px-6 py-3 text-sm font-black text-white">+ 새 공문 작성</button></div><div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[['전체 공문', summary.total], ['작성 중', summary.draft], ['검토·승인 대기', summary.waiting], ['발행·발송 완료', summary.issued]].map(([label, count]) => <div key={String(label)} className="rounded-2xl border border-[#dce9f1] bg-[#f8fbfd] px-5 py-4"><div className="text-xs font-bold text-[#78909f]">{label}</div><div className="mt-1 text-2xl font-black text-[#173b52]">{count}건</div></div>)}</div></header>
    {error && <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm font-bold text-rose-700">{error}</div>}
    <section className="mt-6 overflow-hidden rounded-[28px] border border-sky-100 bg-white/92 shadow-xl"><div className="flex flex-col gap-3 border-b border-sky-100 px-7 py-5 lg:flex-row lg:items-center lg:justify-between"><div><div className="text-xs font-black tracking-[0.16em] text-sky-700">DOCUMENT LIST</div><h2 className="mt-1 text-xl font-black text-[#173b52]">공문 목록</h2></div><div className="flex flex-col gap-2 sm:flex-row"><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="문서번호·제목·수신처 검색" className="h-11 min-w-[270px] rounded-xl border border-[#cfdee7] px-4 text-sm"/><select value={filter} onChange={(e) => setFilter(e.target.value as 'ALL' | Status)} className="h-11 rounded-xl border border-[#cfdee7] bg-white px-4 text-sm font-bold"><option value="ALL">전체 상태</option>{Object.entries(STATUS_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[1120px] text-left text-sm"><thead className="bg-[#eef5f9] text-xs font-black text-[#5c788a]"><tr><th className="px-6 py-4">문서번호</th><th className="px-4 py-4">시행일</th><th className="px-4 py-4">유형</th><th className="px-4 py-4">수신처</th><th className="px-4 py-4">제목</th><th className="px-4 py-4">상태</th><th className="px-6 py-4 text-center">관리</th></tr></thead><tbody className="divide-y divide-[#e3edf3]">{loading ? <tr><td colSpan={7} className="px-6 py-16 text-center font-bold text-[#7b93a2]">불러오는 중입니다.</td></tr> : visible.length === 0 ? <tr><td colSpan={7} className="px-6 py-16 text-center font-black text-[#36586d]">등록된 공문이 없습니다.</td></tr> : visible.map((doc) => <tr key={doc.id} className="hover:bg-[#f9fcfe]"><td className="px-6 py-4 font-black text-[#173b52]">{doc.document_no || '미발행'}</td><td className="px-4 py-4">{doc.document_date}</td><td className="px-4 py-4 font-bold">{config(doc.document_type).title}</td><td className="px-4 py-4"><div className="font-black">{doc.recipient_company_name || '-'}</div><div className="text-xs text-[#78909f]">{doc.recipient_contact_name}</div></td><td className="max-w-[300px] px-4 py-4"><div className="truncate font-bold">{doc.title || '제목 없음'}</div></td><td className="px-4 py-4"><span className={`rounded-full border px-3 py-1 text-xs font-black ${STATUS_STYLE[doc.status]}`}>{STATUS_LABEL[doc.status]}</span></td><td className="px-6 py-4"><div className="flex flex-wrap justify-center gap-1.5"><button onClick={() => openExisting(doc)} className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-black text-sky-800">{['DRAFT','REVIEW','APPROVED'].includes(doc.status) ? '열기' : '보기'}</button><button onClick={() => print(doc)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black">인쇄</button><button onClick={() => void copy(doc)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black">복사</button>{doc.status === 'REVIEW' && <button onClick={() => void action(doc,'approve')} className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-black text-blue-800">승인</button>}{doc.status === 'APPROVED' && <button onClick={() => void action(doc,'issue')} className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-black text-violet-800">발행</button>}{doc.status === 'ISSUED' && <button onClick={() => void action(doc,'mark_sent')} className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-800">발송완료</button>}{doc.status === 'DRAFT' && <button onClick={() => void remove(doc)} className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-black text-rose-700">삭제</button>}{['ISSUED','SENT'].includes(doc.status) && <button onClick={() => void cancel(doc)} className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-black text-rose-700">취소</button>}</div></td></tr>)}</tbody></table></div>
    </section>

    {modal && <div className="fixed inset-0 z-[1300] overflow-auto bg-[#0e2a3d]/70 p-4 backdrop-blur-[2px] lg:p-7"><div className="mx-auto min-h-full max-w-[1520px] rounded-[28px] bg-[#edf5fa] shadow-2xl"><div className="sticky top-0 z-20 flex flex-col gap-4 rounded-t-[28px] border-b border-[#d5e4ed] bg-white/95 px-6 py-5 lg:flex-row lg:items-center lg:justify-between"><div><div className="text-xs font-black tracking-[0.16em] text-sky-700">{draft.document_no || 'NEW DOCUMENT'}</div><h2 className="mt-1 text-2xl font-black text-[#173b52]">{draft.title || '새 대외 공문 작성'}</h2></div><div className="flex flex-wrap gap-2">{[1,2,3].map((n) => <button key={n} onClick={() => setStep(n)} className={`rounded-full border px-4 py-2 text-xs font-black ${step === n ? 'border-sky-600 bg-sky-600 text-white' : 'border-[#cedde6] bg-white text-[#526f81]'}`}>{n}. {n===1?'유형':n===2?'작성':'검토'}</button>)}<button onClick={() => setModal(false)} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-black">닫기</button></div></div>
      <div className="p-5 lg:p-8">
        {step === 1 && <div className="rounded-[24px] bg-white p-7"><div className="text-xs font-black tracking-[0.16em] text-sky-700">STEP 1</div><h3 className="mt-2 text-2xl font-black text-[#173b52]">공문 목적 선택</h3><div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{TYPES.map((item,index) => <button key={item.key} disabled={locked} onClick={() => set('document_type',item.key)} className={`rounded-2xl border p-5 text-left ${draft.document_type===item.key?'border-sky-500 bg-sky-50':'border-[#d9e9f4] bg-[#f8fbfd]'}`}><div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-100 font-black text-sky-800">{index+1}</span><b className="text-[#173b52]">{item.title}</b></div><p className="mt-3 text-sm text-[#6a8495]">{item.description}</p></button>)}</div><div className="mt-7 text-right"><button onClick={() => setStep(2)} className="rounded-xl bg-sky-700 px-6 py-3 text-sm font-black text-white">다음: 공문 작성</button></div></div>}
        {step === 2 && <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_400px]"><div className="rounded-[24px] bg-white p-7"><div className="flex justify-between"><div><div className="text-xs font-black tracking-[0.16em] text-sky-700">STEP 2</div><h3 className="mt-2 text-2xl font-black text-[#173b52]">공문 내용 작성</h3></div>{draft.status && <span className={`h-fit rounded-full border px-3 py-1 text-xs font-black ${STATUS_STYLE[draft.status]}`}>{STATUS_LABEL[draft.status]}</span>}</div><fieldset disabled={locked || busy} className="mt-7 space-y-5 disabled:opacity-70"><div className="grid gap-4 md:grid-cols-2"><Field label="시행일자"><input type="date" value={draft.document_date} onChange={(e)=>set('document_date',e.target.value)} className="input"/></Field><Field label="등록 거래처 불러오기"><select value={draft.recipient_client_id||''} onChange={(e)=>chooseClient(e.target.value)} className="input bg-white"><option value="">직접 입력</option>{clients.map((c)=><option key={c.id} value={c.id}>{c.company_name}</option>)}</select></Field></div><div className="grid gap-4 md:grid-cols-2"><Field label="수신 회사 *"><input value={draft.recipient_company_name} onChange={(e)=>set('recipient_company_name',e.target.value)} className="input"/></Field><Field label="수신 담당자"><input value={draft.recipient_contact_name} onChange={(e)=>set('recipient_contact_name',e.target.value)} className="input"/></Field></div><Field label="수신처 주소"><input value={draft.recipient_address} onChange={(e)=>set('recipient_address',e.target.value)} className="input"/></Field><div className="grid gap-4 md:grid-cols-2"><Field label="이메일"><input value={draft.recipient_email} onChange={(e)=>set('recipient_email',e.target.value)} className="input"/></Field><Field label="전화번호"><input value={draft.recipient_phone} onChange={(e)=>set('recipient_phone',e.target.value)} className="input"/></Field></div><Field label="공문 제목 *"><div className="flex gap-2"><input value={draft.title} onChange={(e)=>set('title',e.target.value)} className="input min-w-0 flex-1"/><button type="button" onClick={()=>set('title',type.suggestedTitle)} className="rounded-xl border border-sky-200 bg-sky-50 px-4 text-xs font-black text-sky-800">제목 제안</button></div></Field><Field label={type.refLabel}><textarea value={draft.reference_text} onChange={(e)=>set('reference_text',e.target.value)} rows={2} className="textarea"/></Field><Field label="본문 *"><div className="mb-2 text-right"><button type="button" onClick={()=>set('body',type.template)} className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-800">기본문구 적용</button></div><textarea value={draft.body} onChange={(e)=>set('body',e.target.value)} rows={13} className="textarea leading-7"/></Field><Field label={type.summaryLabel}><textarea value={draft.request_summary} onChange={(e)=>set('request_summary',e.target.value)} rows={3} className="textarea"/></Field><Field label="첨부자료명"><textarea value={draft.attachment_names.join('\n')} onChange={(e)=>set('attachment_names',e.target.value.split('\n').map(v=>v.trim()).filter(Boolean))} rows={3} placeholder="한 줄에 하나씩 입력" className="textarea"/></Field><div className="grid gap-4 md:grid-cols-2"><Field label="작성자"><input value={draft.author_name} onChange={(e)=>set('author_name',e.target.value)} className="input"/></Field><Field label="승인자"><input value={draft.approver_name} onChange={(e)=>set('approver_name',e.target.value)} className="input"/></Field></div><label className="flex items-center gap-3 rounded-xl border border-[#d8e5ed] bg-[#f8fbfd] px-4 py-3"><input type="checkbox" checked={draft.use_signature} onChange={(e)=>set('use_signature',e.target.checked)}/><span className="text-sm font-bold">대표자 서명 이미지 표시</span></label></fieldset><div className="mt-7 flex justify-between gap-3"><button onClick={()=>setStep(1)} className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-black">이전</button><div className="flex gap-2">{!locked && <button disabled={busy} onClick={()=>void save()} className="rounded-xl border border-sky-200 bg-sky-50 px-5 py-3 text-sm font-black text-sky-800">임시저장</button>}<button onClick={()=>setStep(3)} className="rounded-xl bg-sky-700 px-5 py-3 text-sm font-black text-white">다음: 미리보기</button></div></div></div><aside className="overflow-hidden rounded-[24px] bg-white p-5"><div className="text-xs font-black tracking-[0.14em] text-sky-700">LIVE PREVIEW</div><div className="mt-4 origin-top scale-[0.48]" style={{width:'794px'}}><Preview doc={draft} company={company}/></div></aside></div>}
        {step === 3 && <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_330px]"><div className="overflow-auto rounded-[24px] bg-[#dce9f1] p-5 lg:p-8"><Preview doc={draft} company={company}/></div><aside className="h-fit rounded-[24px] bg-white p-6 xl:sticky xl:top-28"><div className="text-xs font-black tracking-[0.16em] text-sky-700">STEP 3</div><h3 className="mt-2 text-xl font-black text-[#173b52]">검토·발행</h3><div className="mt-5 rounded-xl border border-[#dce7ed] bg-[#f8fbfd] px-4 py-3 text-sm"><b>문서번호</b><div className="mt-1">{draft.document_no||'발행 시 자동부여'}</div><b className="mt-3 block">상태</b><div className="mt-1">{draft.status?STATUS_LABEL[draft.status]:'아직 저장되지 않음'}</div></div><div className="mt-6 grid gap-2"><button onClick={()=>setStep(2)} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-black">내용 수정</button>{!locked && <button disabled={busy} onClick={()=>void save()} className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-black text-sky-800">임시저장</button>}{(!draft.status||draft.status==='DRAFT')&&<button disabled={busy} onClick={()=>void review()} className="rounded-xl bg-amber-500 px-4 py-3 text-sm font-black text-white">저장 후 검토 요청</button>}{draft.status==='REVIEW'&&<button disabled={busy} onClick={()=>void action(draft,'approve')} className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-black text-white">승인 완료</button>}{draft.status==='APPROVED'&&<button disabled={busy} onClick={()=>void action(draft,'issue')} className="rounded-xl bg-violet-600 px-4 py-3 text-sm font-black text-white">공문번호 부여·발행</button>}{draft.status==='ISSUED'&&<button disabled={busy} onClick={()=>void action(draft,'mark_sent')} className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-black text-white">발송 완료 처리</button>}<button onClick={()=>print()} className="rounded-xl bg-[#294f66] px-4 py-3 text-sm font-black text-white">PDF 저장 / 인쇄</button></div><div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-6 text-amber-800">발행 완료 후 원문은 잠깁니다. 변경 시 기존 공문을 복사해 새로 발행합니다.</div></aside></div>}
      </div></div></div>}
    <style jsx global>{`
      [data-document-management-workspace] .input { height: 44px; width: 100%; border-radius: 12px; border: 1px solid #cfdee7; padding: 0 14px; font-size: 14px; outline: none; }
      [data-document-management-workspace] .textarea { width: 100%; border-radius: 12px; border: 1px solid #cfdee7; padding: 12px 14px; font-size: 14px; outline: none; }
      [data-document-management-workspace] .input:focus, [data-document-management-workspace] .textarea:focus { border-color: #0ea5e9; }
      @media print { body * { visibility: hidden !important; } [data-official-document-print], [data-official-document-print] * { visibility: visible !important; } [data-official-document-print] { position: absolute !important; inset: 0 auto auto 0 !important; width: 210mm !important; min-height: 297mm !important; max-width: none !important; margin: 0 !important; padding: 16mm !important; box-shadow: none !important; print-color-adjust: exact !important; -webkit-print-color-adjust: exact !important; } @page { size: A4 portrait; margin: 0; } }
    `}</style>
  </div>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-2 block text-sm font-black text-[#36586d]">{label}</span>{children}</label> }

export default function DocumentManagementWorkspace() {
  const [view, setView] = useState<View>(null)
  useEffect(() => { const sync = () => setView(currentView()); sync(); window.addEventListener('popstate', sync); return () => window.removeEventListener('popstate', sync) }, [])
  if (!view) return null
  return <div data-document-management-workspace className="absolute inset-0 z-[800] overflow-auto bg-[radial-gradient(circle_at_86%_0%,rgba(134,207,255,0.16),transparent_28%),linear-gradient(145deg,rgba(246,251,255,0.98),rgba(231,242,252,0.98))]">{view === 'quotes' ? <QuoteWorkspace/> : <OfficialWorkspace/>}</div>
}
