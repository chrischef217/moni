'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'

type MainTab = 'hr' | 'sales' | 'accounting'
type SalesTab = 'clients' | 'pipeline' | 'activities'
type Entity = 'people' | 'clients' | 'opportunities' | 'activities' | 'work_logs' | 'settlements'

type Person = {
  id: string
  name: string
  person_type: 'sales_freelancer' | 'production_freelancer' | 'employee'
  status: 'active' | 'inactive'
  phone?: string | null
  email?: string | null
  contract_start?: string | null
  contract_end?: string | null
  commission_rate: number
  pay_type: 'commission' | 'hourly' | 'daily' | 'fixed'
  pay_rate: number
  withholding_rate: number
  contract_document_ready: boolean
  id_document_ready: boolean
  bank_document_ready: boolean
  bank_name?: string | null
  bank_account_holder?: string | null
  bank_account_number?: string | null
  note?: string | null
}

type Client = {
  id: string
  company_name: string
  contact_name?: string | null
  phone?: string | null
  email?: string | null
  status: 'active' | 'inactive'
  assigned_person_id?: string | null
  note?: string | null
}

type Opportunity = {
  id: string
  client_id?: string | null
  title: string
  stage: 'lead' | 'contacted' | 'proposal' | 'negotiation' | 'won' | 'lost'
  expected_amount: number
  won_amount: number
  close_date?: string | null
  next_action_date?: string | null
  assigned_person_id?: string | null
  note?: string | null
}

type Activity = {
  id: string
  client_id?: string | null
  opportunity_id?: string | null
  activity_date: string
  activity_type: string
  summary: string
  next_action?: string | null
  next_action_date?: string | null
  assigned_person_id?: string | null
}

type WorkLog = {
  id: string
  person_id: string
  work_date: string
  hours: number
  pay_amount_override?: number | null
  source_type: string
  note?: string | null
}

type SavedSettlement = {
  id: string
  status: 'draft' | 'confirmed' | 'paid'
  memo?: string | null
}

type SettlementPreview = {
  person_id: string
  person_name: string
  person_type: Person['person_type']
  source_type: 'sales' | 'production'
  gross_amount: number
  withholding_rate: number
  withholding_amount: number
  net_amount: number
  detail: Record<string, unknown>
  saved?: SavedSettlement | null
}

type Payload = {
  ok: boolean
  error?: string
  range: { month: string; start: string; end: string }
  people: Person[]
  clients: Client[]
  opportunities: Opportunity[]
  activities: Activity[]
  work_logs: WorkLog[]
  settlements: SavedSettlement[]
  settlement_preview: SettlementPreview[]
  production_warning?: string
}

type PersonForm = Omit<Person, 'id'>
type ClientForm = Omit<Client, 'id'>
type OpportunityForm = Omit<Opportunity, 'id'>
type ActivityForm = Omit<Activity, 'id'>
type WorkLogForm = Omit<WorkLog, 'id'>

type ModalState =
  | { type: 'person'; id?: string }
  | { type: 'client'; id?: string }
  | { type: 'opportunity'; id?: string }
  | { type: 'activity'; id?: string }
  | { type: 'work_log'; id?: string }
  | null

const inputClass = 'mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-blue-500'
const buttonClass = 'rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-200 hover:border-slate-500 hover:text-white'

function today() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date())
}

function thisMonth() {
  return today().slice(0, 7)
}

function money(value: number | null | undefined) {
  return `${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 }).format(Math.round(Number(value ?? 0)))}원`
}

function number(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function personTypeLabel(value: Person['person_type']) {
  if (value === 'sales_freelancer') return '영업 프리랜서'
  if (value === 'production_freelancer') return '생산 프리랜서'
  return '직원'
}

function payTypeLabel(value: Person['pay_type']) {
  if (value === 'commission') return '커미션'
  if (value === 'daily') return '일당'
  if (value === 'fixed') return '고정액'
  return '시급'
}

function stageLabel(value: Opportunity['stage']) {
  return ({ lead: '신규', contacted: '접촉', proposal: '제안', negotiation: '협상', won: '성공', lost: '실패' } as const)[value]
}

function emptyPerson(): PersonForm {
  return {
    name: '', person_type: 'sales_freelancer', status: 'active', phone: '', email: '',
    contract_start: '', contract_end: '', commission_rate: 0, pay_type: 'commission', pay_rate: 0,
    withholding_rate: 3.3, contract_document_ready: false, id_document_ready: false,
    bank_document_ready: false, bank_name: '', bank_account_holder: '', bank_account_number: '', note: '',
  }
}

function emptyClient(): ClientForm {
  return { company_name: '', contact_name: '', phone: '', email: '', status: 'active', assigned_person_id: '', note: '' }
}

function emptyOpportunity(): OpportunityForm {
  return { client_id: '', title: '', stage: 'lead', expected_amount: 0, won_amount: 0, close_date: '', next_action_date: '', assigned_person_id: '', note: '' }
}

function emptyActivity(): ActivityForm {
  return { client_id: '', opportunity_id: '', activity_date: today(), activity_type: '상담', summary: '', next_action: '', next_action_date: '', assigned_person_id: '' }
}

function emptyWorkLog(): WorkLogForm {
  return { person_id: '', work_date: today(), hours: 0, pay_amount_override: null, source_type: 'manual', note: '' }
}

function Field({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return <label className={`block text-sm text-slate-300 ${className}`}><span>{label}</span>{children}</label>
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
      <div className="max-h-[92vh] w-full max-w-4xl overflow-hidden rounded-3xl border border-slate-700 bg-[#0f1b2d] shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-700 px-6 py-4">
          <h2 className="text-xl font-black text-white">{title}</h2>
          <button type="button" onClick={onClose} className={buttonClass}>닫기</button>
        </div>
        <div className="max-h-[calc(92vh-78px)] overflow-y-auto p-6">{children}</div>
      </div>
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-2xl border border-dashed border-slate-700 p-10 text-center text-slate-400">{text}</div>
}

export default function BusinessManagementModule({ initialTab = 'hr' }: { initialTab?: MainTab }) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<MainTab>(initialTab)
  const [salesTab, setSalesTab] = useState<SalesTab>('clients')
  const [month, setMonth] = useState(thisMonth())
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [modal, setModal] = useState<ModalState>(null)
  const [personForm, setPersonForm] = useState<PersonForm>(emptyPerson())
  const [clientForm, setClientForm] = useState<ClientForm>(emptyClient())
  const [opportunityForm, setOpportunityForm] = useState<OpportunityForm>(emptyOpportunity())
  const [activityForm, setActivityForm] = useState<ActivityForm>(emptyActivity())
  const [workLogForm, setWorkLogForm] = useState<WorkLogForm>(emptyWorkLog())

  async function load() {
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`/api/moni/business-management?month=${month}`, { cache: 'no-store' })
      const payload = (await response.json()) as Payload
      if (!response.ok || !payload.ok) throw new Error(payload.error || '데이터를 불러오지 못했습니다.')
      setData(payload)
    } catch (err) {
      setError(err instanceof Error ? err.message : '데이터를 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [month])

  const people = data?.people ?? []
  const salesPeople = useMemo(() => people.filter((row) => row.person_type === 'sales_freelancer' && row.status === 'active'), [people])
  const productionPeople = useMemo(() => people.filter((row) => row.person_type === 'production_freelancer' && row.status === 'active'), [people])
  const activeClients = useMemo(() => (data?.clients ?? []).filter((row) => row.status === 'active'), [data?.clients])
  const clientById = useMemo(() => new Map((data?.clients ?? []).map((row) => [row.id, row])), [data?.clients])
  const personById = useMemo(() => new Map(people.map((row) => [row.id, row])), [people])
  const opportunityById = useMemo(() => new Map((data?.opportunities ?? []).map((row) => [row.id, row])), [data?.opportunities])
  const missingDocumentCount = people.filter((row) => row.status === 'active' && !(row.contract_document_ready && row.id_document_ready && row.bank_document_ready)).length
  const previews = data?.settlement_preview ?? []
  const totalGross = previews.reduce((sum, row) => sum + row.gross_amount, 0)
  const totalWithholding = previews.reduce((sum, row) => sum + row.withholding_amount, 0)
  const totalNet = previews.reduce((sum, row) => sum + row.net_amount, 0)

  async function request(method: 'POST' | 'PATCH' | 'DELETE', entity: Entity, body?: unknown, id?: string) {
    setSaving(true)
    setError('')
    try {
      const url = method === 'DELETE'
        ? `/api/moni/business-management?entity=${entity}&id=${encodeURIComponent(id || '')}`
        : '/api/moni/business-management'
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: method === 'DELETE' ? undefined : JSON.stringify(method === 'PATCH' ? { entity, id, data: body } : { entity, data: body }),
      })
      const result = await response.json()
      if (!response.ok || !result.ok) throw new Error(result.error || '처리에 실패했습니다.')
      setModal(null)
      setNotice(method === 'DELETE' ? '삭제했습니다.' : '저장했습니다.')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : '처리에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  function openPerson(row?: Person) {
    setPersonForm(row ? { ...row } : emptyPerson())
    setModal({ type: 'person', id: row?.id })
  }

  function openClient(row?: Client) {
    setClientForm(row ? { ...row } : emptyClient())
    setModal({ type: 'client', id: row?.id })
  }

  function openOpportunity(row?: Opportunity) {
    setOpportunityForm(row ? { ...row } : emptyOpportunity())
    setModal({ type: 'opportunity', id: row?.id })
  }

  function openActivity(row?: Activity) {
    setActivityForm(row ? { ...row } : emptyActivity())
    setModal({ type: 'activity', id: row?.id })
  }

  function openWorkLog() {
    setWorkLogForm({ ...emptyWorkLog(), person_id: productionPeople[0]?.id ?? '' })
    setModal({ type: 'work_log' })
  }

  async function saveCurrent() {
    if (!modal) return
    if (modal.type === 'person') {
      if (!personForm.name.trim()) return setError('이름을 입력해 주세요.')
      await request(modal.id ? 'PATCH' : 'POST', 'people', personForm, modal.id)
    } else if (modal.type === 'client') {
      if (!clientForm.company_name.trim()) return setError('고객사명을 입력해 주세요.')
      await request(modal.id ? 'PATCH' : 'POST', 'clients', clientForm, modal.id)
    } else if (modal.type === 'opportunity') {
      if (!opportunityForm.title.trim()) return setError('영업기회명을 입력해 주세요.')
      await request(modal.id ? 'PATCH' : 'POST', 'opportunities', opportunityForm, modal.id)
    } else if (modal.type === 'activity') {
      if (!activityForm.summary.trim()) return setError('상담 또는 영업활동 내용을 입력해 주세요.')
      await request(modal.id ? 'PATCH' : 'POST', 'activities', activityForm, modal.id)
    } else if (modal.type === 'work_log') {
      if (!workLogForm.person_id) return setError('생산 프리랜서를 선택해 주세요.')
      await request('POST', 'work_logs', workLogForm)
    }
  }

  async function patch(entity: Entity, id: string, body: unknown) {
    await request('PATCH', entity, body, id)
  }

  async function saveSettlements() {
    setSaving(true)
    setError('')
    try {
      const response = await fetch('/api/moni/business-management', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save_settlements', month }),
      })
      const result = await response.json()
      if (!response.ok || !result.ok) throw new Error(result.error || '정산 저장에 실패했습니다.')
      setNotice(`${result.saved ?? 0}명의 정산을 저장했습니다.`)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : '정산 저장에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  function settlementDetail(row: SettlementPreview) {
    if (row.source_type === 'sales') {
      return `성공 ${number(row.detail.won_count)}건 · 실적기준 ${money(number(row.detail.sales_base))} · 커미션 ${number(row.detail.commission_rate)}%`
    }
    return `생산기록 ${number(row.detail.production_record_count)}건 · ${number(row.detail.production_hours).toFixed(2)}시간 · 수동보정 ${number(row.detail.manual_log_count)}건`
  }

  function printRows(rows: SettlementPreview[]) {
    const printable = rows.filter((row) => row.gross_amount > 0)
    if (!printable.length) return setError('출력할 정산내역이 없습니다.')
    const pages = printable.map((row) => `
      <section class="page">
        <h1>프리랜서 정산내역서</h1>
        <p class="sub">정산월: ${escapeHtml(month)} · 구분: ${escapeHtml(personTypeLabel(row.person_type))}</p>
        <table>
          <tr><th>성명</th><td>${escapeHtml(row.person_name)}</td><th>원천징수율</th><td>${row.withholding_rate}%</td></tr>
          <tr><th>지급 전 금액</th><td>${escapeHtml(money(row.gross_amount))}</td><th>원천징수액</th><td>${escapeHtml(money(row.withholding_amount))}</td></tr>
          <tr><th>최종 지급액</th><td colspan="3"><b>${escapeHtml(money(row.net_amount))}</b></td></tr>
          <tr><th>산정 근거</th><td colspan="3">${escapeHtml(settlementDetail(row))}</td></tr>
        </table>
        <div class="sign"><span>작성자: __________________</span><span>확인자: __________________</span><span>지급 대상자: __________________</span></div>
      </section>`).join('')
    const win = window.open('', '_blank', 'width=1000,height=800')
    if (!win) return setError('팝업이 차단되어 출력창을 열지 못했습니다.')
    win.document.write(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>프리랜서 정산내역서</title><style>
      @page{size:A4 portrait;margin:14mm}body{font-family:Arial,'Noto Sans KR',sans-serif;color:#111;margin:0}.page{page-break-after:always;padding:4mm}.page:last-child{page-break-after:auto}h1{text-align:center;font-size:26px;margin:0 0 8px}.sub{text-align:center;color:#555;margin:0 0 24px}table{width:100%;border-collapse:collapse;font-size:14px}th,td{border:1px solid #222;padding:12px}th{background:#f1f5f9;width:18%;text-align:left}.sign{display:flex;justify-content:space-between;margin-top:70px;font-size:14px}b{font-size:18px}
    </style></head><body>${pages}<script>window.onload=()=>window.print()<\/script></body></html>`)
    win.document.close()
  }

  function renderHr() {
    return (
      <div className="space-y-5">
        <div className="grid gap-3 md:grid-cols-3">
          <SummaryCard label="활동 중 영업 프리랜서" value={`${salesPeople.length}명`} tone="blue" />
          <SummaryCard label="활동 중 생산 프리랜서" value={`${productionPeople.length}명`} tone="green" />
          <SummaryCard label="서류 확인 필요" value={`${missingDocumentCount}명`} tone="amber" />
        </div>
        <section className="rounded-2xl border border-slate-700 bg-slate-900/60">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700 p-5">
            <div><h2 className="text-xl font-black">프리랜서 인력관리</h2><p className="mt-1 text-sm text-slate-400">현재는 영업·생산 프리랜서와 정산조건만 관리합니다.</p></div>
            <button type="button" onClick={() => openPerson()} className="rounded-xl bg-blue-600 px-5 py-3 font-bold hover:bg-blue-500">+ 인력 등록</button>
          </div>
          {!people.length ? <div className="p-5"><Empty text="등록된 인력이 없습니다." /></div> : (
            <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-slate-800 text-slate-300"><tr>{['상태','이름','구분','계약기간','정산조건','3.3%','필수서류','연락처','관리'].map((x) => <th key={x} className="px-4 py-3">{x}</th>)}</tr></thead><tbody>
              {people.map((row) => {
                const docs = [row.contract_document_ready, row.id_document_ready, row.bank_document_ready].filter(Boolean).length
                return <tr key={row.id} className="border-t border-slate-800"><td className="px-4 py-3"><span className={`rounded-md px-2 py-1 font-bold ${row.status === 'active' ? 'bg-green-500/15 text-green-300' : 'bg-slate-700 text-slate-400'}`}>{row.status === 'active' ? '활동 중' : '종료'}</span></td><td className="px-4 py-3 font-bold text-white">{row.name}</td><td className="px-4 py-3">{personTypeLabel(row.person_type)}</td><td className="px-4 py-3 whitespace-nowrap">{row.contract_start || '-'} ~ {row.contract_end || '-'}</td><td className="px-4 py-3 whitespace-nowrap">{row.person_type === 'sales_freelancer' ? `커미션 ${row.commission_rate}%` : `${payTypeLabel(row.pay_type)} ${money(row.pay_rate)}`}</td><td className="px-4 py-3">{row.withholding_rate}%</td><td className={`px-4 py-3 font-bold ${docs === 3 ? 'text-green-300' : 'text-amber-300'}`}>{docs}/3</td><td className="px-4 py-3">{row.phone || '-'}</td><td className="px-4 py-3"><div className="flex gap-2"><button onClick={() => openPerson(row)} className="underline">수정</button><button onClick={() => void patch('people', row.id, { status: row.status === 'active' ? 'inactive' : 'active' })} className="underline">{row.status === 'active' ? '활동 종료' : '재활성'}</button></div></td></tr>
              })}
            </tbody></table></div>
          )}
        </section>
      </div>
    )
  }

  function renderSales() {
    const tabButton = (key: SalesTab, label: string) => <button onClick={() => setSalesTab(key)} className={`rounded-xl px-5 py-2.5 font-bold ${salesTab === key ? 'bg-blue-600 text-white' : 'border border-slate-700 text-slate-300'}`}>{label}</button>
    return (
      <div className="space-y-5">
        <div className="flex flex-wrap gap-2">{tabButton('clients', '고객사')}{tabButton('pipeline', '영업 파이프라인')}{tabButton('activities', '영업활동·상담기록')}</div>
        {salesTab === 'clients' && <section className="rounded-2xl border border-slate-700 bg-slate-900/60"><SectionHeader title="고객사 및 담당자" description="고객사와 담당 영업 프리랜서를 연결합니다." action="+ 고객사 등록" onAction={() => openClient()} />{!(data?.clients.length) ? <div className="p-5"><Empty text="등록된 고객사가 없습니다." /></div> : <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-slate-800"><tr>{['상태','고객사','담당자','연락처','담당 영업','메모','관리'].map((x) => <th key={x} className="px-4 py-3">{x}</th>)}</tr></thead><tbody>{data?.clients.map((row) => <tr key={row.id} className="border-t border-slate-800"><td className="px-4 py-3">{row.status === 'active' ? '활성' : '비활성'}</td><td className="px-4 py-3 font-bold">{row.company_name}</td><td className="px-4 py-3">{row.contact_name || '-'}</td><td className="px-4 py-3">{row.phone || row.email || '-'}</td><td className="px-4 py-3">{personById.get(row.assigned_person_id || '')?.name || '-'}</td><td className="max-w-xs truncate px-4 py-3">{row.note || '-'}</td><td className="px-4 py-3"><button onClick={() => openClient(row)} className="mr-3 underline">수정</button><button onClick={() => void patch('clients', row.id, { status: row.status === 'active' ? 'inactive' : 'active' })} className="underline">{row.status === 'active' ? '비활성' : '활성'}</button></td></tr>)}</tbody></table></div>}</section>}
        {salesTab === 'pipeline' && <section className="rounded-2xl border border-slate-700 bg-slate-900/60"><SectionHeader title="영업기회 파이프라인" description="성공 처리된 실적은 영업 프리랜서 정산 근거로 연결됩니다." action="+ 영업기회 등록" onAction={() => openOpportunity()} />{!(data?.opportunities.length) ? <div className="p-5"><Empty text="등록된 영업기회가 없습니다." /></div> : <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-slate-800"><tr>{['단계','영업기회','고객사','담당 영업','예상금액','성공금액','성공일','다음 행동일','관리'].map((x) => <th key={x} className="px-4 py-3">{x}</th>)}</tr></thead><tbody>{data?.opportunities.map((row) => <tr key={row.id} className="border-t border-slate-800"><td className="px-4 py-3"><span className={`rounded-md px-2 py-1 font-bold ${row.stage === 'won' ? 'bg-green-500/15 text-green-300' : row.stage === 'lost' ? 'bg-red-500/15 text-red-300' : 'bg-blue-500/15 text-blue-300'}`}>{stageLabel(row.stage)}</span></td><td className="px-4 py-3 font-bold">{row.title}</td><td className="px-4 py-3">{clientById.get(row.client_id || '')?.company_name || '-'}</td><td className="px-4 py-3">{personById.get(row.assigned_person_id || '')?.name || '-'}</td><td className="px-4 py-3">{money(row.expected_amount)}</td><td className="px-4 py-3 font-bold text-green-300">{money(row.won_amount)}</td><td className="px-4 py-3">{row.close_date || '-'}</td><td className="px-4 py-3">{row.next_action_date || '-'}</td><td className="px-4 py-3"><button onClick={() => openOpportunity(row)} className="mr-3 underline">수정</button><button onClick={() => void request('DELETE', 'opportunities', undefined, row.id)} className="underline">삭제</button></td></tr>)}</tbody></table></div>}</section>}
        {salesTab === 'activities' && <section className="rounded-2xl border border-slate-700 bg-slate-900/60"><SectionHeader title="영업활동 및 상담기록" description="상담내용과 다음 행동을 기록합니다." action="+ 활동 기록" onAction={() => openActivity()} />{!(data?.activities.length) ? <div className="p-5"><Empty text="등록된 영업활동이 없습니다." /></div> : <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-slate-800"><tr>{['일자','유형','고객사','영업기회','담당 영업','활동내용','다음 행동','관리'].map((x) => <th key={x} className="px-4 py-3">{x}</th>)}</tr></thead><tbody>{data?.activities.map((row) => <tr key={row.id} className="border-t border-slate-800"><td className="px-4 py-3 whitespace-nowrap">{row.activity_date}</td><td className="px-4 py-3">{row.activity_type}</td><td className="px-4 py-3">{clientById.get(row.client_id || '')?.company_name || '-'}</td><td className="px-4 py-3">{opportunityById.get(row.opportunity_id || '')?.title || '-'}</td><td className="px-4 py-3">{personById.get(row.assigned_person_id || '')?.name || '-'}</td><td className="max-w-sm px-4 py-3">{row.summary}</td><td className="px-4 py-3">{row.next_action || '-'} {row.next_action_date ? `(${row.next_action_date})` : ''}</td><td className="px-4 py-3"><button onClick={() => openActivity(row)} className="mr-3 underline">수정</button><button onClick={() => void request('DELETE', 'activities', undefined, row.id)} className="underline">삭제</button></td></tr>)}</tbody></table></div>}</section>}
      </div>
    )
  }

  function renderAccounting() {
    return (
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-700 bg-slate-900/60 p-4">
          <div className="flex items-center gap-3"><b>정산월</b><input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2" /></div>
          <div className="flex flex-wrap gap-2"><button onClick={openWorkLog} className={buttonClass}>+ 생산 근무보정</button><button onClick={() => printRows(previews)} className={buttonClass}>전체 정산서 출력</button><button onClick={() => void saveSettlements()} disabled={saving} className="rounded-xl bg-blue-600 px-5 py-2.5 font-bold hover:bg-blue-500 disabled:opacity-50">현재 월 정산 저장</button></div>
        </div>
        <div className="grid gap-3 md:grid-cols-3"><SummaryCard label="지급 전 금액" value={money(totalGross)} tone="blue" /><SummaryCard label="3.3% 원천징수" value={money(totalWithholding)} tone="amber" /><SummaryCard label="최종 지급액" value={money(totalNet)} tone="green" /></div>
        {data?.production_warning && <div className="rounded-xl border border-amber-700/50 bg-amber-950/30 p-3 text-sm text-amber-200">생산기록 연결 경고: {data.production_warning}</div>}
        <section className="rounded-2xl border border-slate-700 bg-slate-900/60"><SectionHeader title="프리랜서 월별 정산" description="영업 성공실적과 생산기록·근무보정을 기준으로 3.3%를 계산합니다." />{!previews.length ? <div className="p-5"><Empty text="정산 대상자가 없습니다." /></div> : <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-slate-800"><tr>{['저장상태','성명','구분','산정근거','지급 전','3.3%','최종 지급','관리'].map((x) => <th key={x} className="px-4 py-3">{x}</th>)}</tr></thead><tbody>{previews.map((row) => <tr key={`${row.person_id}-${row.source_type}`} className="border-t border-slate-800"><td className="px-4 py-3">{row.saved ? <select value={row.saved.status} onChange={(e) => void patch('settlements', row.saved!.id, { status: e.target.value })} className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1"><option value="draft">작성</option><option value="confirmed">확정</option><option value="paid">지급완료</option></select> : <span className="text-slate-500">미저장</span>}</td><td className="px-4 py-3 font-bold">{row.person_name}</td><td className="px-4 py-3">{personTypeLabel(row.person_type)}</td><td className="max-w-md px-4 py-3 text-slate-300">{settlementDetail(row)}</td><td className="px-4 py-3">{money(row.gross_amount)}</td><td className="px-4 py-3 text-amber-300">{money(row.withholding_amount)}</td><td className="px-4 py-3 font-bold text-green-300">{money(row.net_amount)}</td><td className="px-4 py-3"><button onClick={() => printRows([row])} className="underline">개별 출력</button></td></tr>)}</tbody></table></div>}</section>
        <section className="rounded-2xl border border-slate-700 bg-slate-900/60"><SectionHeader title="생산 프리랜서 근무보정" description="생산기록의 작업시간이 없거나 별도 금액을 반영해야 할 때만 사용합니다." action="+ 보정 등록" onAction={openWorkLog} />{!(data?.work_logs.length) ? <div className="p-5"><Empty text="등록된 근무보정이 없습니다." /></div> : <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-slate-800"><tr>{['일자','생산 프리랜서','시간','별도금액','메모','관리'].map((x) => <th key={x} className="px-4 py-3">{x}</th>)}</tr></thead><tbody>{data?.work_logs.map((row) => <tr key={row.id} className="border-t border-slate-800"><td className="px-4 py-3">{row.work_date}</td><td className="px-4 py-3">{personById.get(row.person_id)?.name || '-'}</td><td className="px-4 py-3">{row.hours}시간</td><td className="px-4 py-3">{row.pay_amount_override === null ? '-' : money(row.pay_amount_override)}</td><td className="px-4 py-3">{row.note || '-'}</td><td className="px-4 py-3"><button onClick={() => void request('DELETE', 'work_logs', undefined, row.id)} className="underline">삭제</button></td></tr>)}</tbody></table></div>}</section>
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-[#071426] text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-[1800px]">
        <aside className="hidden w-64 shrink-0 border-r border-slate-700/70 bg-[#06172d] p-5 lg:block">
          <button onClick={() => router.push('/')} className="mb-8 flex items-center gap-3 text-left"><span className="text-3xl">🏭</span><span><b className="block text-2xl">MONI</b><span className="text-sm text-slate-400">통합 업무관리</span></span></button>
          <button onClick={() => router.push('/')} className="mb-2 block w-full rounded-xl px-4 py-3 text-left text-slate-300 hover:bg-slate-800">생산관리로 돌아가기</button>
          <div className="my-4 border-t border-slate-800" />
          {([['hr','인사관리'],['sales','영업관리'],['accounting','회계·세무관리']] as Array<[MainTab,string]>).map(([key,label]) => <button key={key} onClick={() => setActiveTab(key)} className={`mb-2 block w-full rounded-xl px-4 py-3 text-left font-bold ${activeTab === key ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800'}`}>{label}</button>)}
        </aside>
        <section className="min-w-0 flex-1 p-4 md:p-7">
          <header className="mb-6 flex flex-wrap items-center justify-between gap-4"><div><h1 className="text-3xl font-black">{activeTab === 'hr' ? '인사관리' : activeTab === 'sales' ? '영업관리' : '회계·세무관리'}</h1><p className="mt-1 text-sm text-slate-400">대카테고리는 확장 가능하게 유지하고, 현재 필요한 프리랜서 업무만 구현했습니다.</p></div><div className="flex gap-2 lg:hidden">{(['hr','sales','accounting'] as MainTab[]).map((key) => <button key={key} onClick={() => setActiveTab(key)} className={`rounded-lg px-3 py-2 text-sm ${activeTab === key ? 'bg-blue-600' : 'border border-slate-700'}`}>{key === 'hr' ? '인사' : key === 'sales' ? '영업' : '회계·세무'}</button>)}</div></header>
          {error && <div className="mb-4 rounded-xl border border-red-500/50 bg-red-500/10 p-3 text-red-200">{error}</div>}
          {notice && <div className="mb-4 rounded-xl border border-green-500/40 bg-green-500/10 p-3 text-green-200">{notice}</div>}
          {loading ? <div className="rounded-2xl border border-slate-700 p-12 text-center text-slate-400">불러오는 중...</div> : activeTab === 'hr' ? renderHr() : activeTab === 'sales' ? renderSales() : renderAccounting()}
        </section>
      </div>

      {modal?.type === 'person' && <Modal title={modal.id ? '인력정보 수정' : '인력 등록'} onClose={() => setModal(null)}><div className="grid gap-4 md:grid-cols-2"><Field label="이름"><input value={personForm.name} onChange={(e) => setPersonForm({ ...personForm, name: e.target.value })} className={inputClass} /></Field><Field label="구분"><select value={personForm.person_type} onChange={(e) => { const value = e.target.value as Person['person_type']; setPersonForm({ ...personForm, person_type: value, pay_type: value === 'sales_freelancer' ? 'commission' : 'hourly' }) }} className={inputClass}><option value="sales_freelancer">영업 프리랜서</option><option value="production_freelancer">생산 프리랜서</option><option value="employee">직원(향후 확장용)</option></select></Field><Field label="활동상태"><select value={personForm.status} onChange={(e) => setPersonForm({ ...personForm, status: e.target.value as Person['status'] })} className={inputClass}><option value="active">활동 중</option><option value="inactive">종료</option></select></Field><Field label="연락처"><input value={personForm.phone || ''} onChange={(e) => setPersonForm({ ...personForm, phone: e.target.value })} className={inputClass} /></Field><Field label="이메일"><input value={personForm.email || ''} onChange={(e) => setPersonForm({ ...personForm, email: e.target.value })} className={inputClass} /></Field><Field label="계약 시작일"><input type="date" value={personForm.contract_start || ''} onChange={(e) => setPersonForm({ ...personForm, contract_start: e.target.value })} className={inputClass} /></Field><Field label="계약 종료일"><input type="date" value={personForm.contract_end || ''} onChange={(e) => setPersonForm({ ...personForm, contract_end: e.target.value })} className={inputClass} /></Field>{personForm.person_type === 'sales_freelancer' ? <Field label="영업 커미션율(%)"><input type="number" min="0" step="0.1" value={personForm.commission_rate} onChange={(e) => setPersonForm({ ...personForm, commission_rate: number(e.target.value) })} className={inputClass} /></Field> : <><Field label="지급기준"><select value={personForm.pay_type} onChange={(e) => setPersonForm({ ...personForm, pay_type: e.target.value as Person['pay_type'] })} className={inputClass}><option value="hourly">시급</option><option value="daily">일당</option><option value="fixed">고정액</option></select></Field><Field label="기준금액"><input type="number" min="0" value={personForm.pay_rate} onChange={(e) => setPersonForm({ ...personForm, pay_rate: number(e.target.value) })} className={inputClass} /></Field></>}<Field label="원천징수율(%)"><input type="number" min="0" step="0.1" value={personForm.withholding_rate} onChange={(e) => setPersonForm({ ...personForm, withholding_rate: number(e.target.value) })} className={inputClass} /></Field><Field label="은행명"><input value={personForm.bank_name || ''} onChange={(e) => setPersonForm({ ...personForm, bank_name: e.target.value })} className={inputClass} /></Field><Field label="예금주"><input value={personForm.bank_account_holder || ''} onChange={(e) => setPersonForm({ ...personForm, bank_account_holder: e.target.value })} className={inputClass} /></Field><Field label="계좌번호"><input value={personForm.bank_account_number || ''} onChange={(e) => setPersonForm({ ...personForm, bank_account_number: e.target.value })} className={inputClass} /></Field><div className="md:col-span-2 rounded-xl border border-slate-700 bg-slate-950/50 p-4"><b>정산 필수서류 보유 여부</b><div className="mt-3 flex flex-wrap gap-5"><label><input type="checkbox" checked={personForm.contract_document_ready} onChange={(e) => setPersonForm({ ...personForm, contract_document_ready: e.target.checked })} className="mr-2" />프리랜서 계약서</label><label><input type="checkbox" checked={personForm.id_document_ready} onChange={(e) => setPersonForm({ ...personForm, id_document_ready: e.target.checked })} className="mr-2" />신분증 서류</label><label><input type="checkbox" checked={personForm.bank_document_ready} onChange={(e) => setPersonForm({ ...personForm, bank_document_ready: e.target.checked })} className="mr-2" />통장 사본</label></div></div><Field label="메모" className="md:col-span-2"><textarea rows={3} value={personForm.note || ''} onChange={(e) => setPersonForm({ ...personForm, note: e.target.value })} className={inputClass} /></Field></div><SaveBar saving={saving} onCancel={() => setModal(null)} onSave={() => void saveCurrent()} /></Modal>}

      {modal?.type === 'client' && <Modal title={modal.id ? '고객사 수정' : '고객사 등록'} onClose={() => setModal(null)}><div className="grid gap-4 md:grid-cols-2"><Field label="고객사명"><input value={clientForm.company_name} onChange={(e) => setClientForm({ ...clientForm, company_name: e.target.value })} className={inputClass} /></Field><Field label="담당자"><input value={clientForm.contact_name || ''} onChange={(e) => setClientForm({ ...clientForm, contact_name: e.target.value })} className={inputClass} /></Field><Field label="연락처"><input value={clientForm.phone || ''} onChange={(e) => setClientForm({ ...clientForm, phone: e.target.value })} className={inputClass} /></Field><Field label="이메일"><input value={clientForm.email || ''} onChange={(e) => setClientForm({ ...clientForm, email: e.target.value })} className={inputClass} /></Field><Field label="담당 영업 프리랜서"><select value={clientForm.assigned_person_id || ''} onChange={(e) => setClientForm({ ...clientForm, assigned_person_id: e.target.value })} className={inputClass}><option value="">미지정</option>{salesPeople.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field><Field label="상태"><select value={clientForm.status} onChange={(e) => setClientForm({ ...clientForm, status: e.target.value as Client['status'] })} className={inputClass}><option value="active">활성</option><option value="inactive">비활성</option></select></Field><Field label="메모" className="md:col-span-2"><textarea rows={4} value={clientForm.note || ''} onChange={(e) => setClientForm({ ...clientForm, note: e.target.value })} className={inputClass} /></Field></div><SaveBar saving={saving} onCancel={() => setModal(null)} onSave={() => void saveCurrent()} /></Modal>}

      {modal?.type === 'opportunity' && <Modal title={modal.id ? '영업기회 수정' : '영업기회 등록'} onClose={() => setModal(null)}><div className="grid gap-4 md:grid-cols-2"><Field label="영업기회명"><input value={opportunityForm.title} onChange={(e) => setOpportunityForm({ ...opportunityForm, title: e.target.value })} className={inputClass} /></Field><Field label="고객사"><select value={opportunityForm.client_id || ''} onChange={(e) => setOpportunityForm({ ...opportunityForm, client_id: e.target.value })} className={inputClass}><option value="">미지정</option>{activeClients.map((c) => <option key={c.id} value={c.id}>{c.company_name}</option>)}</select></Field><Field label="담당 영업 프리랜서"><select value={opportunityForm.assigned_person_id || ''} onChange={(e) => setOpportunityForm({ ...opportunityForm, assigned_person_id: e.target.value })} className={inputClass}><option value="">미지정</option>{salesPeople.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field><Field label="단계"><select value={opportunityForm.stage} onChange={(e) => setOpportunityForm({ ...opportunityForm, stage: e.target.value as Opportunity['stage'] })} className={inputClass}><option value="lead">신규</option><option value="contacted">접촉</option><option value="proposal">제안</option><option value="negotiation">협상</option><option value="won">성공</option><option value="lost">실패</option></select></Field><Field label="예상금액"><input type="number" min="0" value={opportunityForm.expected_amount} onChange={(e) => setOpportunityForm({ ...opportunityForm, expected_amount: number(e.target.value) })} className={inputClass} /></Field><Field label="성공금액"><input type="number" min="0" value={opportunityForm.won_amount} onChange={(e) => setOpportunityForm({ ...opportunityForm, won_amount: number(e.target.value) })} className={inputClass} /></Field><Field label="성공일"><input type="date" value={opportunityForm.close_date || ''} onChange={(e) => setOpportunityForm({ ...opportunityForm, close_date: e.target.value })} className={inputClass} /></Field><Field label="다음 행동일"><input type="date" value={opportunityForm.next_action_date || ''} onChange={(e) => setOpportunityForm({ ...opportunityForm, next_action_date: e.target.value })} className={inputClass} /></Field><Field label="메모" className="md:col-span-2"><textarea rows={4} value={opportunityForm.note || ''} onChange={(e) => setOpportunityForm({ ...opportunityForm, note: e.target.value })} className={inputClass} /></Field></div><SaveBar saving={saving} onCancel={() => setModal(null)} onSave={() => void saveCurrent()} /></Modal>}

      {modal?.type === 'activity' && <Modal title={modal.id ? '영업활동 수정' : '영업활동 기록'} onClose={() => setModal(null)}><div className="grid gap-4 md:grid-cols-2"><Field label="활동일"><input type="date" value={activityForm.activity_date} onChange={(e) => setActivityForm({ ...activityForm, activity_date: e.target.value })} className={inputClass} /></Field><Field label="활동유형"><input value={activityForm.activity_type} onChange={(e) => setActivityForm({ ...activityForm, activity_type: e.target.value })} className={inputClass} /></Field><Field label="고객사"><select value={activityForm.client_id || ''} onChange={(e) => setActivityForm({ ...activityForm, client_id: e.target.value })} className={inputClass}><option value="">미지정</option>{activeClients.map((c) => <option key={c.id} value={c.id}>{c.company_name}</option>)}</select></Field><Field label="영업기회"><select value={activityForm.opportunity_id || ''} onChange={(e) => setActivityForm({ ...activityForm, opportunity_id: e.target.value })} className={inputClass}><option value="">미지정</option>{data?.opportunities.map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}</select></Field><Field label="담당 영업 프리랜서"><select value={activityForm.assigned_person_id || ''} onChange={(e) => setActivityForm({ ...activityForm, assigned_person_id: e.target.value })} className={inputClass}><option value="">미지정</option>{salesPeople.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field><Field label="다음 행동일"><input type="date" value={activityForm.next_action_date || ''} onChange={(e) => setActivityForm({ ...activityForm, next_action_date: e.target.value })} className={inputClass} /></Field><Field label="활동·상담 내용" className="md:col-span-2"><textarea rows={4} value={activityForm.summary} onChange={(e) => setActivityForm({ ...activityForm, summary: e.target.value })} className={inputClass} /></Field><Field label="다음 행동" className="md:col-span-2"><input value={activityForm.next_action || ''} onChange={(e) => setActivityForm({ ...activityForm, next_action: e.target.value })} className={inputClass} /></Field></div><SaveBar saving={saving} onCancel={() => setModal(null)} onSave={() => void saveCurrent()} /></Modal>}

      {modal?.type === 'work_log' && <Modal title="생산 프리랜서 근무보정 등록" onClose={() => setModal(null)}><div className="grid gap-4 md:grid-cols-2"><Field label="생산 프리랜서"><select value={workLogForm.person_id} onChange={(e) => setWorkLogForm({ ...workLogForm, person_id: e.target.value })} className={inputClass}><option value="">선택</option>{productionPeople.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field><Field label="근무일"><input type="date" value={workLogForm.work_date} onChange={(e) => setWorkLogForm({ ...workLogForm, work_date: e.target.value })} className={inputClass} /></Field><Field label="추가 근무시간"><input type="number" min="0" step="0.25" value={workLogForm.hours} onChange={(e) => setWorkLogForm({ ...workLogForm, hours: number(e.target.value) })} className={inputClass} /></Field><Field label="별도 지급금액(시간 대신 금액 직접 반영)"><input type="number" min="0" value={workLogForm.pay_amount_override ?? ''} onChange={(e) => setWorkLogForm({ ...workLogForm, pay_amount_override: e.target.value === '' ? null : number(e.target.value) })} className={inputClass} /></Field><Field label="메모" className="md:col-span-2"><textarea rows={3} value={workLogForm.note || ''} onChange={(e) => setWorkLogForm({ ...workLogForm, note: e.target.value })} className={inputClass} /></Field></div><div className="mt-4 rounded-xl border border-amber-700/50 bg-amber-950/30 p-3 text-sm text-amber-200">생산기록에 정상적으로 시작·종료시간이 있으면 별도 등록하지 않습니다. 누락이나 추가 지급분만 입력합니다.</div><SaveBar saving={saving} onCancel={() => setModal(null)} onSave={() => void saveCurrent()} /></Modal>}
    </main>
  )
}

function SectionHeader({ title, description, action, onAction }: { title: string; description?: string; action?: string; onAction?: () => void }) {
  return <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700 p-5"><div><h2 className="text-xl font-black">{title}</h2>{description && <p className="mt-1 text-sm text-slate-400">{description}</p>}</div>{action && onAction && <button onClick={onAction} className="rounded-xl bg-blue-600 px-5 py-3 font-bold hover:bg-blue-500">{action}</button>}</div>
}

function SummaryCard({ label, value, tone }: { label: string; value: string; tone: 'blue' | 'green' | 'amber' }) {
  const styles = tone === 'green' ? 'border-green-500/40 bg-green-500/10 text-green-200' : tone === 'amber' ? 'border-amber-500/40 bg-amber-500/10 text-amber-200' : 'border-blue-500/40 bg-blue-500/10 text-blue-200'
  return <div className={`rounded-2xl border p-5 ${styles}`}><p className="text-sm opacity-80">{label}</p><b className="mt-2 block text-2xl">{value}</b></div>
}

function SaveBar({ saving, onCancel, onSave }: { saving: boolean; onCancel: () => void; onSave: () => void }) {
  return <div className="mt-6 flex justify-end gap-3"><button onClick={onCancel} className={buttonClass}>취소</button><button onClick={onSave} disabled={saving} className="rounded-xl bg-blue-600 px-6 py-3 font-bold hover:bg-blue-500 disabled:opacity-50">{saving ? '저장 중...' : '저장'}</button></div>
}
