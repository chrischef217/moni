'use client'

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'

type DueType = 'none' | 'days_after_sale' | 'next_month_day'
type ReceiptMethod = 'bank' | 'cash' | 'card' | 'other'
type CollectionFilter = 'open' | 'overdue' | 'due-soon' | 'no-due' | 'paid' | 'all'

type Client = {
  id: string
  company_name: string
  status: 'active' | 'inactive'
  payment_terms?: string | null
  payment_due_type?: DueType | null
  payment_due_days?: number | null
  payment_due_day?: number | null
}

type Receipt = {
  id: string
  order_id: string
  receipt_date: string
  amount: number
  method: ReceiptMethod
  reference_no?: string | null
  note?: string | null
  status: 'posted' | 'reversed'
  reversed_at?: string | null
  reversal_reason?: string | null
  created_at?: string | null
}

type ReceivableOrder = {
  id: string
  statement_number: string
  sale_date: string
  due_date?: string | null
  client_id: string
  client_name: string
  status: 'draft' | 'confirmed' | 'cancelled'
  payment_status: 'unpaid' | 'partial' | 'paid'
  total_amount: number
  receipts: Receipt[]
  verified_received_amount: number
  received_amount: number
  outstanding_amount: number
  collection_source: string
  unverified_partial: boolean
  collection_state: 'paid' | 'no_due_date' | 'overdue' | 'due_today' | 'due_soon' | 'scheduled'
  collection_label: string
  d_day: number | null
}

type Payload = {
  ok: boolean
  error?: string
  today: string
  clients: Client[]
  orders: ReceivableOrder[]
  receipts: Receipt[]
  summary: {
    confirmed_sales_amount: number
    outstanding_amount: number
    overdue_amount: number
    overdue_count: number
    due_soon_amount: number
    due_soon_count: number
    no_due_date_count: number
    received_this_month: number
    verified_receipt_total: number
    open_order_count: number
  }
}

type ReceiptForm = {
  receipt_date: string
  amount: string
  method: ReceiptMethod
  reference_no: string
  note: string
}

type DueRuleDraft = {
  payment_due_type: DueType
  payment_due_days: string
  payment_due_day: string
}

const inputClass = 'w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-blue-500'
const secondaryButton = 'rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-200 hover:border-slate-500 hover:text-white disabled:opacity-40'
const primaryButton = 'rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50'

function todayKst() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date())
}

function money(value: unknown) {
  const numeric = Number(value ?? 0)
  return `${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 }).format(Math.round(Number.isFinite(numeric) ? numeric : 0))}원`
}

function methodLabel(value: ReceiptMethod) {
  if (value === 'cash') return '현금'
  if (value === 'card') return '카드'
  if (value === 'other') return '기타'
  return '계좌입금'
}

function dueRuleLabel(client: Client) {
  if (client.payment_due_type === 'days_after_sale') return `판매일 + ${client.payment_due_days ?? 0}일`
  if (client.payment_due_type === 'next_month_day') return `익월 ${client.payment_due_day ?? 1}일`
  return '자동 계산 안 함'
}

function collectionTone(row: ReceivableOrder) {
  if (row.collection_state === 'overdue') return 'border-red-500/30 bg-red-500/10 text-red-200'
  if (row.collection_state === 'due_today' || row.collection_state === 'due_soon') return 'border-amber-500/30 bg-amber-500/10 text-amber-200'
  if (row.collection_state === 'paid') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
  if (row.collection_state === 'no_due_date') return 'border-slate-600 bg-slate-800 text-slate-300'
  return 'border-blue-500/30 bg-blue-500/10 text-blue-200'
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block text-sm text-slate-300"><span className="mb-1.5 block">{label}</span>{children}</label>
}

function SummaryCard({ label, value, note, tone = 'default' }: { label: string; value: string; note?: string; tone?: 'default' | 'danger' | 'warning' | 'success' }) {
  const toneClass = tone === 'danger'
    ? 'border-red-500/30 bg-red-500/[0.08] text-red-100'
    : tone === 'warning'
      ? 'border-amber-500/30 bg-amber-500/[0.07] text-amber-100'
      : tone === 'success'
        ? 'border-emerald-500/30 bg-emerald-500/[0.07] text-emerald-100'
        : 'border-slate-700 bg-slate-900/60 text-white'
  return <div className={`rounded-2xl border p-5 ${toneClass}`}><div className="text-xs font-bold uppercase tracking-[0.12em] opacity-65">{label}</div><div className="mt-2 text-2xl font-black">{value}</div>{note && <div className="mt-1 text-xs leading-5 opacity-65">{note}</div>}</div>
}

function Modal({ title, onClose, children, maxWidth = 'max-w-4xl' }: { title: string; onClose: () => void; children: ReactNode; maxWidth?: string }) {
  return <div className="fixed inset-0 z-[1300] flex items-center justify-center bg-black/75 p-4"><div className={`max-h-[94vh] w-full ${maxWidth} overflow-hidden rounded-3xl border border-slate-700 bg-[#0f1b2d] shadow-2xl`}><div className="flex items-center justify-between border-b border-slate-700 px-6 py-4"><h2 className="text-xl font-black text-white">{title}</h2><button type="button" onClick={onClose} className={secondaryButton}>닫기</button></div><div className="max-h-[calc(94vh-78px)] overflow-y-auto p-6">{children}</div></div></div>
}

export default function SalesReceivablesModule() {
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [filter, setFilter] = useState<CollectionFilter>('open')
  const [search, setSearch] = useState('')
  const [receiptOrderId, setReceiptOrderId] = useState('')
  const [receiptForm, setReceiptForm] = useState<ReceiptForm>({ receipt_date: todayKst(), amount: '', method: 'bank', reference_no: '', note: '' })
  const [reverseReceiptId, setReverseReceiptId] = useState('')
  const [reversalReason, setReversalReason] = useState('')
  const [dueDateOrderId, setDueDateOrderId] = useState('')
  const [dueDateDraft, setDueDateDraft] = useState('')
  const [ruleClientId, setRuleClientId] = useState('')
  const [ruleDraft, setRuleDraft] = useState<DueRuleDraft>({ payment_due_type: 'none', payment_due_days: '30', payment_due_day: '10' })

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`/api/moni/receivables?_=${Date.now()}`, { cache: 'no-store' })
      const payload = await response.json() as Payload
      if (!response.ok || !payload.ok) throw new Error(payload.error || '수금·미수금 데이터를 불러오지 못했습니다.')
      setData(payload)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '수금·미수금 데이터를 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const orderById = useMemo(() => new Map((data?.orders ?? []).map((row) => [row.id, row])), [data])
  const receiptOrder = receiptOrderId ? orderById.get(receiptOrderId) : undefined

  const filteredOrders = useMemo(() => {
    const query = search.trim().toLowerCase()
    return (data?.orders ?? []).filter((row) => {
      const stateMatch = filter === 'all'
        || (filter === 'open' && row.outstanding_amount > 0)
        || (filter === 'overdue' && row.collection_state === 'overdue')
        || (filter === 'due-soon' && (row.collection_state === 'due_today' || row.collection_state === 'due_soon'))
        || (filter === 'no-due' && row.collection_state === 'no_due_date' && row.outstanding_amount > 0)
        || (filter === 'paid' && row.outstanding_amount <= 0)
      if (!stateMatch) return false
      if (!query) return true
      return `${row.client_name} ${row.statement_number} ${row.sale_date} ${row.due_date ?? ''}`.toLowerCase().includes(query)
    })
  }, [data, filter, search])

  async function post(action: string, bodyData: Record<string, unknown>, id = '') {
    const response = await fetch('/api/moni/receivables', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, id: id || undefined, data: bodyData }),
    })
    const result = await response.json()
    if (!response.ok || !result.ok) throw new Error(result.error || '저장에 실패했습니다.')
    return result
  }

  function openReceipt(row: ReceivableOrder) {
    setReceiptOrderId(row.id)
    setReceiptForm({ receipt_date: todayKst(), amount: row.outstanding_amount > 0 ? String(row.outstanding_amount) : '', method: 'bank', reference_no: '', note: '' })
    setReverseReceiptId('')
    setReversalReason('')
    setError('')
  }

  async function saveReceipt() {
    if (!receiptOrder) return
    setSaving(true); setError(''); setNotice('')
    try {
      await post('save_receipt', {
        order_id: receiptOrder.id,
        receipt_date: receiptForm.receipt_date,
        amount: Number(receiptForm.amount),
        method: receiptForm.method,
        reference_no: receiptForm.reference_no,
        note: receiptForm.note,
      })
      setNotice(`${receiptOrder.client_name} 입금 ${money(receiptForm.amount)}을 기록했습니다.`)
      await load()
      const refreshed = orderById.get(receiptOrder.id)
      if (refreshed?.outstanding_amount === 0) setReceiptOrderId('')
      else setReceiptForm((current) => ({ ...current, amount: '' }))
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '입금 등록에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  async function reverseReceipt(receiptId: string) {
    setSaving(true); setError(''); setNotice('')
    try {
      await post('reverse_receipt', { reversal_reason: reversalReason }, receiptId)
      setReverseReceiptId('')
      setReversalReason('')
      setNotice('입금기록을 취소 처리했습니다. 원기록은 삭제하지 않고 이력으로 보존됩니다.')
      await load()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '입금 취소에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  function openDueDate(row: ReceivableOrder) {
    setDueDateOrderId(row.id)
    setDueDateDraft(row.due_date ?? '')
  }

  async function saveDueDate() {
    setSaving(true); setError(''); setNotice('')
    try {
      await post('set_order_due_date', { due_date: dueDateDraft }, dueDateOrderId)
      setDueDateOrderId('')
      setNotice('판매건의 입금예정일을 저장했습니다.')
      await load()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '입금예정일 저장에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  function openRule(client: Client) {
    setRuleClientId(client.id)
    setRuleDraft({
      payment_due_type: client.payment_due_type ?? 'none',
      payment_due_days: String(client.payment_due_days ?? 30),
      payment_due_day: String(client.payment_due_day ?? 10),
    })
  }

  async function saveRule() {
    setSaving(true); setError(''); setNotice('')
    try {
      await post('save_client_due_rule', {
        payment_due_type: ruleDraft.payment_due_type,
        payment_due_days: Number(ruleDraft.payment_due_days),
        payment_due_day: Number(ruleDraft.payment_due_day),
      }, ruleClientId)
      setRuleClientId('')
      setNotice('거래처의 기본 수금조건을 저장했습니다. 이후 신규 판매건부터 입금예정일이 자동 계산됩니다.')
      await load()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '기본 수금조건 저장에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <main className="min-h-screen bg-[#071426] px-4 py-6 text-slate-100 md:px-8"><div className="mx-auto max-w-[1600px] rounded-3xl border border-slate-700 bg-[#0b1b30] p-16 text-center text-slate-400">수금·미수금 데이터를 불러오는 중입니다.</div></main>
  }

  return (
    <main className="min-h-screen bg-[#071426] px-4 py-6 text-slate-100 md:px-8">
      <div className="mx-auto max-w-[1600px] space-y-5">
        <header className="rounded-3xl border border-slate-700 bg-[#0b1b30] p-6 shadow-xl">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-bold text-emerald-300">MONI RECEIVABLES</p>
              <h1 className="mt-1 text-3xl font-black">수금·미수금</h1>
              <p className="mt-2 text-sm leading-6 text-slate-400">판매금액이 아니라 실제 입금기록을 기준으로 남은 받을 돈과 수금기일을 관리합니다.</p>
            </div>
            <button type="button" onClick={() => void load()} className={secondaryButton}>새로고침</button>
          </div>
        </header>

        {error && <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">{error}</div>}
        {notice && <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm text-emerald-200">{notice}</div>}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard label="총 미수금" value={money(data?.summary.outstanding_amount)} note={`수금이 끝나지 않은 판매 ${data?.summary.open_order_count ?? 0}건`} tone={(data?.summary.outstanding_amount ?? 0) > 0 ? 'warning' : 'success'} />
          <SummaryCard label="연체" value={money(data?.summary.overdue_amount)} note={`${data?.summary.overdue_count ?? 0}건 · 입금예정일 경과`} tone={(data?.summary.overdue_count ?? 0) > 0 ? 'danger' : 'success'} />
          <SummaryCard label="3일 내 수금예정" value={money(data?.summary.due_soon_amount)} note={`${data?.summary.due_soon_count ?? 0}건 · D-3~D-Day`} tone={(data?.summary.due_soon_count ?? 0) > 0 ? 'warning' : 'default'} />
          <SummaryCard label="이번 달 실제 입금" value={money(data?.summary.received_this_month)} note="sales_receipts 실제 기록 기준" tone="success" />
        </div>

        <section className="overflow-hidden rounded-3xl border border-slate-700 bg-slate-900/55">
          <div className="border-b border-slate-700 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><h2 className="text-xl font-black">매출채권 관리</h2><p className="mt-1 text-sm text-slate-400">입금예정일과 실제 입금내역을 기준으로 D-Day와 정확한 미수잔액을 계산합니다.</p></div>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="거래처·명세표 검색" className="w-full max-w-[300px] rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-blue-500" />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {([
                ['open','받을 돈'],['overdue','연체'],['due-soon','D-3 이내'],['no-due','예정일 미설정'],['paid','수금완료'],['all','전체'],
              ] as Array<[CollectionFilter,string]>).map(([key,label]) => <button key={key} type="button" onClick={() => setFilter(key)} className={`rounded-xl px-3 py-2 text-xs font-bold ${filter === key ? 'bg-blue-600 text-white' : 'border border-slate-700 bg-slate-900 text-slate-400 hover:text-white'}`}>{label}</button>)}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-[1250px] w-full text-sm">
              <thead className="bg-slate-800 text-slate-400"><tr>{['상태','판매일','입금예정일','거래처','명세표','매출액','실제 입금','남은 미수금','관리'].map((label) => <th key={label} className="px-4 py-3 text-left">{label}</th>)}</tr></thead>
              <tbody>
                {filteredOrders.map((row) => <tr key={row.id} className="border-t border-slate-800 align-top">
                  <td className="px-4 py-4"><span className={`inline-flex rounded-lg border px-2.5 py-1 text-xs font-black ${collectionTone(row)}`}>{row.collection_label}</span>{row.unverified_partial && <div className="mt-1 max-w-[160px] text-[10px] leading-4 text-amber-300">기존 일부입금 상태만 있고 실제 입금액 기록 없음</div>}</td>
                  <td className="px-4 py-4 text-slate-400">{row.sale_date}</td>
                  <td className="px-4 py-4"><div className={row.due_date ? 'font-bold text-white' : 'text-slate-500'}>{row.due_date || '미설정'}</div><button type="button" onClick={() => openDueDate(row)} className="mt-1 text-xs text-blue-300 underline">일자 설정</button></td>
                  <td className="px-4 py-4 font-bold text-white">{row.client_name}</td>
                  <td className="px-4 py-4 text-blue-300">{row.statement_number}</td>
                  <td className="px-4 py-4 font-bold text-white">{money(row.total_amount)}</td>
                  <td className="px-4 py-4"><div className="font-bold text-emerald-300">{money(row.received_amount)}</div>{row.collection_source !== 'receipts' && row.received_amount > 0 && <div className="mt-1 text-[10px] text-slate-500">기존 상태 호환값</div>}</td>
                  <td className="px-4 py-4 text-lg font-black text-amber-200">{money(row.outstanding_amount)}</td>
                  <td className="px-4 py-4"><button type="button" onClick={() => openReceipt(row)} className={row.outstanding_amount > 0 ? primaryButton : secondaryButton}>{row.outstanding_amount > 0 ? '입금 등록 / 내역' : '입금 내역'}</button></td>
                </tr>)}
                {!filteredOrders.length && <tr><td colSpan={9} className="px-5 py-14 text-center text-slate-500">조건에 맞는 판매건이 없습니다.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="border-t border-slate-800 px-5 py-3 text-xs leading-5 text-slate-500">`일부입금` 상태만 수동으로 남아 있고 실제 입금액 이력이 없는 과거 건은 임의 금액을 계산하지 않습니다. 실제 입금내역이 입력되는 시점부터 정확한 잔액을 사용합니다.</div>
        </section>

        <section className="overflow-hidden rounded-3xl border border-slate-700 bg-slate-900/55">
          <div className="border-b border-slate-700 p-5"><h2 className="text-xl font-black">거래처 기본 수금조건</h2><p className="mt-1 text-sm leading-6 text-slate-400">거래처별 규칙을 한 번 설정하면 이후 새 판매건의 입금예정일을 자동 계산합니다. 기존 자유입력 `결제조건` 문구는 그대로 보존하며 자동 해석하지 않습니다.</p></div>
          <div className="overflow-x-auto"><table className="min-w-[900px] w-full text-sm"><thead className="bg-slate-800 text-slate-400"><tr><th className="px-4 py-3 text-left">거래처</th><th className="px-4 py-3 text-left">기존 결제조건 메모</th><th className="px-4 py-3 text-left">자동 수금규칙</th><th className="px-4 py-3 text-left">관리</th></tr></thead><tbody>{(data?.clients ?? []).map((client) => <tr key={client.id} className="border-t border-slate-800"><td className="px-4 py-4 font-bold text-white">{client.company_name}</td><td className="px-4 py-4 text-slate-400">{client.payment_terms || '-'}</td><td className="px-4 py-4 font-bold text-slate-200">{dueRuleLabel(client)}</td><td className="px-4 py-4"><button type="button" onClick={() => openRule(client)} className={secondaryButton}>수금조건 설정</button></td></tr>)}</tbody></table></div>
        </section>
      </div>

      {receiptOrder && <Modal title={`${receiptOrder.client_name} · 입금 관리`} onClose={() => setReceiptOrderId('')} maxWidth="max-w-5xl">
        <div className="grid gap-3 sm:grid-cols-4"><SummaryCard label="매출액" value={money(receiptOrder.total_amount)} /><SummaryCard label="실제 입금" value={money(receiptOrder.verified_received_amount)} tone="success" /><SummaryCard label="미수금" value={money(receiptOrder.outstanding_amount)} tone={receiptOrder.outstanding_amount > 0 ? 'warning' : 'success'} /><SummaryCard label="입금예정일" value={receiptOrder.due_date || '미설정'} note={receiptOrder.collection_label} tone={receiptOrder.collection_state === 'overdue' ? 'danger' : 'default'} /></div>

        {receiptOrder.outstanding_amount > 0 && <div className="mt-5 rounded-2xl border border-slate-700 bg-slate-950/40 p-5"><h3 className="font-black text-white">입금 등록</h3><div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-5"><Field label="입금일"><input type="date" value={receiptForm.receipt_date} onChange={(e) => setReceiptForm((current) => ({ ...current, receipt_date: e.target.value }))} className={inputClass} /></Field><Field label="입금액"><input type="number" min="1" max={receiptOrder.outstanding_amount} value={receiptForm.amount} onChange={(e) => setReceiptForm((current) => ({ ...current, amount: e.target.value }))} className={inputClass} /></Field><Field label="입금방법"><select value={receiptForm.method} onChange={(e) => setReceiptForm((current) => ({ ...current, method: e.target.value as ReceiptMethod }))} className={inputClass}><option value="bank">계좌입금</option><option value="cash">현금</option><option value="card">카드</option><option value="other">기타</option></select></Field><Field label="참조번호"><input value={receiptForm.reference_no} onChange={(e) => setReceiptForm((current) => ({ ...current, reference_no: e.target.value }))} placeholder="선택" className={inputClass} /></Field><Field label="비고"><input value={receiptForm.note} onChange={(e) => setReceiptForm((current) => ({ ...current, note: e.target.value }))} className={inputClass} /></Field></div><div className="mt-4 flex justify-end"><button type="button" disabled={saving} onClick={() => void saveReceipt()} className={primaryButton}>{saving ? '저장 중...' : '입금 확정'}</button></div></div>}

        <div className="mt-5 overflow-hidden rounded-2xl border border-slate-700"><div className="bg-slate-800 px-4 py-3 font-black">입금 이력</div><div className="overflow-x-auto"><table className="min-w-[850px] w-full text-sm"><thead className="bg-slate-900 text-slate-500"><tr><th className="px-4 py-3 text-left">상태</th><th className="px-4 py-3 text-left">입금일</th><th className="px-4 py-3 text-left">금액</th><th className="px-4 py-3 text-left">방법</th><th className="px-4 py-3 text-left">참조/비고</th><th className="px-4 py-3 text-left">관리</th></tr></thead><tbody>{receiptOrder.receipts.map((receipt) => <tr key={receipt.id} className={`border-t border-slate-800 ${receipt.status === 'reversed' ? 'opacity-45' : ''}`}><td className="px-4 py-3">{receipt.status === 'posted' ? <span className="text-emerald-300">정상</span> : <span className="text-slate-400">취소</span>}</td><td className="px-4 py-3">{receipt.receipt_date}</td><td className="px-4 py-3 font-black">{money(receipt.amount)}</td><td className="px-4 py-3">{methodLabel(receipt.method)}</td><td className="px-4 py-3 text-slate-400">{receipt.reference_no || receipt.note || '-'}{receipt.status === 'reversed' && receipt.reversal_reason && <div className="mt-1 text-xs text-red-300">취소사유: {receipt.reversal_reason}</div>}</td><td className="px-4 py-3">{receipt.status === 'posted' && <button type="button" onClick={() => { setReverseReceiptId(receipt.id); setReversalReason('') }} className="text-xs text-red-300 underline">입금 취소</button>}</td></tr>)}{!receiptOrder.receipts.length && <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">등록된 실제 입금이 없습니다.</td></tr>}</tbody></table></div></div>

        {reverseReceiptId && <div className="mt-5 rounded-2xl border border-red-500/30 bg-red-500/[0.06] p-5"><h3 className="font-black text-red-100">입금 취소</h3><p className="mt-1 text-sm text-slate-400">입금기록은 삭제하지 않고 `취소됨`으로 보존합니다.</p><div className="mt-4 flex flex-col gap-3 md:flex-row"><input value={reversalReason} onChange={(e) => setReversalReason(e.target.value)} placeholder="취소 사유를 입력해 주세요" className={inputClass} /><button type="button" disabled={saving || !reversalReason.trim()} onClick={() => void reverseReceipt(reverseReceiptId)} className="shrink-0 rounded-xl bg-red-600 px-5 py-2.5 text-sm font-black text-white disabled:opacity-40">취소 확정</button><button type="button" onClick={() => { setReverseReceiptId(''); setReversalReason('') }} className={secondaryButton}>닫기</button></div></div>}
      </Modal>}

      {dueDateOrderId && <Modal title="입금예정일 설정" onClose={() => setDueDateOrderId('')} maxWidth="max-w-lg"><Field label="입금예정일"><input type="date" value={dueDateDraft} onChange={(e) => setDueDateDraft(e.target.value)} className={inputClass} /></Field><p className="mt-3 text-xs leading-5 text-slate-500">빈 값으로 저장하면 예정일 미설정 상태가 됩니다. 거래처 기본 수금규칙은 신규 판매건의 자동 계산에만 사용합니다.</p><div className="mt-6 flex justify-end gap-3"><button type="button" onClick={() => setDueDateOrderId('')} className={secondaryButton}>취소</button><button type="button" disabled={saving} onClick={() => void saveDueDate()} className={primaryButton}>저장</button></div></Modal>}

      {ruleClientId && <Modal title={`${(data?.clients ?? []).find((row) => row.id === ruleClientId)?.company_name ?? '거래처'} · 기본 수금조건`} onClose={() => setRuleClientId('')} maxWidth="max-w-xl"><Field label="자동 입금예정일 규칙"><select value={ruleDraft.payment_due_type} onChange={(e) => setRuleDraft((current) => ({ ...current, payment_due_type: e.target.value as DueType }))} className={inputClass}><option value="none">자동 계산 안 함</option><option value="days_after_sale">판매일 기준 N일 후</option><option value="next_month_day">익월 N일</option></select></Field>{ruleDraft.payment_due_type === 'days_after_sale' && <div className="mt-4"><Field label="판매일 이후 일수"><input type="number" min="0" max="365" value={ruleDraft.payment_due_days} onChange={(e) => setRuleDraft((current) => ({ ...current, payment_due_days: e.target.value }))} className={inputClass} /></Field></div>}{ruleDraft.payment_due_type === 'next_month_day' && <div className="mt-4"><Field label="익월 입금일"><input type="number" min="1" max="31" value={ruleDraft.payment_due_day} onChange={(e) => setRuleDraft((current) => ({ ...current, payment_due_day: e.target.value }))} className={inputClass} /></Field><p className="mt-2 text-xs text-slate-500">해당 월에 없는 날짜(예: 2월 31일)는 그 달의 말일로 자동 조정합니다.</p></div>}<div className="mt-6 flex justify-end gap-3"><button type="button" onClick={() => setRuleClientId('')} className={secondaryButton}>취소</button><button type="button" disabled={saving} onClick={() => void saveRule()} className={primaryButton}>저장</button></div></Modal>}
    </main>
  )
}
