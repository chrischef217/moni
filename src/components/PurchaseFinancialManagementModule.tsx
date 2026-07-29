'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReceiptView } from '@/components/purchase-receipts/types'

type Supplier = {
  id: string
  company_name: string
  business_registration_number?: string | null
  representative_name?: string | null
  contact_name?: string | null
  phone?: string | null
  email?: string | null
  address?: string | null
  supply_type: string
  default_due_type: string
  default_due_days?: number | null
  default_due_day?: number | null
  default_payment_method: string
  default_payment_account?: string | null
  default_card_name?: string | null
  default_installment_months: number
  tax_invoice_required: boolean
  tax_type: string
  status: string
  notes?: string | null
  this_month_purchase_amount: number
  this_month_remaining: number
  previous_month_paid: number
  review_required_amount: number
  review_required_count: number
  unpriced_review_count: number
  total_outstanding: number
  latest_purchase_date: string
  next_due_date: string
  purchase_count: number
}

type Payable = {
  id: string
  supplier_id: string
  supplier_name_snapshot: string
  purchase_date: string
  receipt_date?: string | null
  item_name: string
  total_amount: number
  estimated_total_amount?: number | null
  paid_amount: number
  outstanding_amount: number
  due_date?: string | null
  planned_payment_method: string
  planned_payment_account?: string | null
  planned_card_name?: string | null
  planned_installment_months: number
  verification_status: string
  payment_state: string
  amount_basis?: string | null
  notes?: string | null
}

type Summary = {
  supplier_count: number
  total_outstanding: number
  this_month_due: number
  previous_month_paid: number
  review_required_amount: number
  review_required_count: number
  unpriced_review_count: number
}

type Payload = {
  ok: boolean
  error?: string
  period: { today: string; current_month: string; previous_month: string }
  suppliers: Supplier[]
  payables: Payable[]
  summary: Summary
}

type SupplierDraft = {
  id: string
  company_name: string
  business_registration_number: string
  representative_name: string
  contact_name: string
  phone: string
  email: string
  address: string
  supply_type: string
  default_due_type: string
  default_due_days: number
  default_due_day: number
  default_payment_method: string
  default_payment_account: string
  default_card_name: string
  default_installment_months: number
  tax_invoice_required: boolean
  tax_type: string
  status: string
  notes: string
}

type PayableDraft = {
  id: string
  mode: string
  amount: number
  due_date: string
  payment_method: string
  payment_account: string
  card_name: string
  installment_months: number
  payment_date: string
  reference: string
  notes: string
}

const emptySupplier: SupplierDraft = {
  id: '', company_name: '', business_registration_number: '', representative_name: '', contact_name: '', phone: '', email: '', address: '',
  supply_type: 'BOTH', default_due_type: 'DIRECT', default_due_days: 30, default_due_day: 15, default_payment_method: 'OTHER',
  default_payment_account: '', default_card_name: '', default_installment_months: 1, tax_invoice_required: false, tax_type: 'TAXABLE', status: 'ACTIVE', notes: '',
}

function won(value: unknown) {
  const parsed = Number(value ?? 0)
  return `${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 }).format(Number.isFinite(parsed) ? Math.round(parsed) : 0)}원`
}

function monthDay(value?: string | null) {
  if (!value) return '-'
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  return match ? `${match[2]}/${match[3]}` : value
}

function normalize(value: unknown) {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

function paymentLabel(value: string) {
  return ({ BANK_TRANSFER: '계좌이체', CARD: '카드', CASH: '현금', OTHER: '미설정' } as Record<string, string>)[value] || value
}

function statusMeta(row: Payable) {
  if (row.verification_status === 'REVIEW_REQUIRED') return { label: row.estimated_total_amount ? '지급 확인 필요' : '금액 미등록', className: 'border-amber-200 bg-amber-50 text-amber-800' }
  if (row.payment_state === 'OVERDUE') return { label: '연체', className: 'border-rose-200 bg-rose-50 text-rose-700' }
  if (row.payment_state === 'DUE_TODAY') return { label: '오늘 지급', className: 'border-orange-200 bg-orange-50 text-orange-800' }
  if (row.payment_state === 'DUE_SOON') return { label: '7일 내 지급', className: 'border-amber-200 bg-amber-50 text-amber-800' }
  if (row.payment_state === 'PARTIAL') return { label: '일부 지급', className: 'border-blue-200 bg-blue-50 text-blue-800' }
  if (row.payment_state === 'NO_DUE_DATE') return { label: '예정일 미설정', className: 'border-slate-200 bg-slate-50 text-slate-700' }
  return { label: '지급 예정', className: 'border-emerald-200 bg-emerald-50 text-emerald-800' }
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-xs font-extrabold text-[#637d8d]">{label}</span>{children}</label>
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[1600] flex items-center justify-center bg-slate-950/60 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div className="max-h-[92vh] w-full max-w-4xl overflow-auto rounded-[22px] border border-[#d6e4ec] bg-white p-7 shadow-2xl">
        <div className="mb-6 flex items-center justify-between"><h2 className="text-2xl font-black text-[#173b52]">{title}</h2><button type="button" onClick={onClose} className="pf-secondary">닫기</button></div>
        {children}
      </div>
    </div>
  )
}

export default function PurchaseFinancialManagementModule({ view, onNavigate }: { view: 'suppliers' | 'payables'; onNavigate: (view: ReceiptView) => void }) {
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [search, setSearch] = useState('')
  const [supplierDraft, setSupplierDraft] = useState<SupplierDraft | null>(null)
  const [payableRow, setPayableRow] = useState<Payable | null>(null)
  const [payableDraft, setPayableDraft] = useState<PayableDraft | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/moni/purchase-financials', { cache: 'no-store' })
      const result = await response.json() as Payload
      if (!response.ok || !result.ok) throw new Error(result.error || '매입 재무정보를 불러오지 못했습니다.')
      setData(result)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '매입 재무정보를 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const post = async (body: Record<string, unknown>) => {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const response = await fetch('/api/moni/purchase-financials', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const result = await response.json()
      if (!response.ok || !result.ok) throw new Error(result.error || '처리에 실패했습니다.')
      await load()
      return result
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '처리에 실패했습니다.')
      return null
    } finally {
      setBusy(false)
    }
  }

  const query = normalize(search)
  const suppliers = useMemo(() => (data?.suppliers ?? []).filter((row) => normalize([row.company_name, row.contact_name, row.phone].join(' ')).includes(query)), [data?.suppliers, query])
  const payables = useMemo(() => (data?.payables ?? []).filter((row) => normalize([row.supplier_name_snapshot, row.item_name, statusMeta(row).label].join(' ')).includes(query)), [data?.payables, query])

  const openSupplier = (row?: Supplier) => {
    if (!row) { setSupplierDraft({ ...emptySupplier }); return }
    setSupplierDraft({
      id: row.id,
      company_name: row.company_name,
      business_registration_number: row.business_registration_number || '',
      representative_name: row.representative_name || '',
      contact_name: row.contact_name || '',
      phone: row.phone || '',
      email: row.email || '',
      address: row.address || '',
      supply_type: row.supply_type || 'BOTH',
      default_due_type: row.default_due_type || 'DIRECT',
      default_due_days: row.default_due_days ?? 30,
      default_due_day: row.default_due_day ?? 15,
      default_payment_method: row.default_payment_method || 'OTHER',
      default_payment_account: row.default_payment_account || '',
      default_card_name: row.default_card_name || '',
      default_installment_months: row.default_installment_months || 1,
      tax_invoice_required: Boolean(row.tax_invoice_required),
      tax_type: row.tax_type || 'TAXABLE',
      status: row.status || 'ACTIVE',
      notes: row.notes || '',
    })
  }

  const saveSupplier = async () => {
    if (!supplierDraft) return
    const result = await post({ action: 'save_supplier', ...supplierDraft })
    if (result) { setSupplierDraft(null); setMessage('매입처 정보를 저장했습니다.') }
  }

  const openPayable = (row: Payable) => {
    setPayableRow(row)
    setPayableDraft({
      id: row.id,
      mode: row.verification_status === 'REVIEW_REQUIRED' ? 'REVIEW_REQUIRED' : 'CONFIRMED_UNPAID',
      amount: Number(row.verification_status === 'REVIEW_REQUIRED' ? row.estimated_total_amount ?? 0 : row.total_amount),
      due_date: row.due_date || '',
      payment_method: row.planned_payment_method || 'OTHER',
      payment_account: row.planned_payment_account || '',
      card_name: row.planned_card_name || '',
      installment_months: row.planned_installment_months || 1,
      payment_date: data?.period.today || '',
      reference: '',
      notes: row.notes || '',
    })
  }

  const savePayable = async () => {
    if (!payableDraft) return
    const result = await post({ action: 'update_payable', ...payableDraft })
    if (result) { setPayableDraft(null); setPayableRow(null); setMessage('지급 확인 정보를 저장했습니다.') }
  }

  const summary = data?.summary
  const currentMonthLabel = data?.period.current_month ? `${Number(data.period.current_month.slice(5, 7))}월` : '이번달'
  const previousMonthLabel = data?.period.previous_month ? `${Number(data.period.previous_month.slice(5, 7))}월` : '전월'

  return (
    <main data-purchase-financial-management className="min-h-screen bg-[#f3f6f8] p-4 text-[#173b52] lg:p-6">
      <div className="mx-auto max-w-[1700px] overflow-hidden rounded-[22px] border border-[#d6e4ec] bg-white shadow-[0_14px_38px_rgba(29,62,82,0.12)]">
        <header className="px-7 pb-5 pt-7 lg:px-9 lg:pt-8">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <h1 className="text-[26px] font-black tracking-[-0.03em]">매입관리</h1>
              <p className="mt-2 text-sm font-medium text-[#657f90]">매입처별 지급예정액, 실제 지급액, 미지급금과 확인이 필요한 과거 매입을 관리합니다.</p>
            </div>
            <div className="flex w-full flex-col gap-2 sm:flex-row xl:w-auto">
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="매입처·품목 검색" className="pf-input min-w-0 sm:w-[290px]" />
              <button type="button" onClick={() => void load()} className="pf-secondary">조회</button>
            </div>
          </div>

          <div className="mt-7 flex w-full max-w-[650px] rounded-[20px] border border-[#cfe0ea] bg-[#f2f7fa] p-1.5 shadow-[0_8px_18px_rgba(31,67,89,0.06)]">
            <button type="button" onClick={() => onNavigate('suppliers')} className={`flex-1 rounded-[15px] px-4 py-3 text-sm font-black transition ${view === 'suppliers' ? 'bg-[#20c77a] text-white shadow-[0_8px_18px_rgba(32,199,122,0.24)]' : 'text-[#415f72]'}`}>매입처 관리</button>
            <button type="button" onClick={() => onNavigate('purchases')} className="flex-1 rounded-[15px] px-4 py-3 text-sm font-black text-[#415f72]">매입·입고 관리</button>
            <button type="button" onClick={() => onNavigate('payables')} className={`flex-1 rounded-[15px] px-4 py-3 text-sm font-black transition ${view === 'payables' ? 'bg-[#20c77a] text-white shadow-[0_8px_18px_rgba(32,199,122,0.24)]' : 'text-[#415f72]'}`}>지급·미지급금</button>
          </div>
        </header>

        <section className="grid border-y border-[#e4edf2] bg-[#f8fafb] sm:grid-cols-2 xl:grid-cols-6">
          <div className="pf-summary"><span>등록 매입처</span><b>{summary?.supplier_count ?? 0}곳</b></div>
          <div className="pf-summary"><span>{currentMonthLabel} 지급예정</span><b className="text-[#a56d00]">{won(summary?.this_month_due)}</b></div>
          <div className="pf-summary"><span>총 확정 미지급</span><b>{won(summary?.total_outstanding)}</b></div>
          <div className="pf-summary"><span>{previousMonthLabel} 실제 지급</span><b className="text-[#20c77a]">{won(summary?.previous_month_paid)}</b></div>
          <div className="pf-summary"><span>지급 확인 필요</span><b className="text-[#a56d00]">{won(summary?.review_required_amount)}</b></div>
          <div className="pf-summary"><span>단가 미등록</span><b className="text-[#a56d00]">{summary?.unpriced_review_count ?? 0}건</b></div>
        </section>

        {error ? <div className="mx-7 mt-5 rounded-xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm font-bold text-rose-700">{error}</div> : null}
        {message ? <div className="mx-7 mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-bold text-emerald-800">{message}</div> : null}

        {loading ? <div className="px-7 py-20 text-center text-base font-black">불러오는 중입니다.</div> : null}

        {!loading && view === 'suppliers' ? (
          <section>
            <div className="flex items-center justify-between px-7 py-5 lg:px-9"><div><h2 className="text-xl font-black">매입처 목록</h2><p className="mt-1 text-xs font-bold text-[#78909d]">과거 실제 입고자료에서 자동 등록된 매입처입니다. 추가 정보는 수정 버튼에서 입력합니다.</p></div><button type="button" onClick={() => openSupplier()} className="pf-primary">+ 매입처 등록</button></div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] table-fixed text-left text-sm">
                <colgroup><col className="w-[20%]" /><col className="w-[14%]" /><col className="w-[14%]" /><col className="w-[14%]" /><col className="w-[16%]" /><col className="w-[12%]" /><col className="w-[10%]" /></colgroup>
                <thead className="bg-[#edf5fa] text-xs font-black text-[#5f7a8c]"><tr><th className="px-6 py-4">매입처</th><th className="px-4 py-4 text-right">{currentMonthLabel} 매입액</th><th className="px-4 py-4 text-right">{currentMonthLabel} 남은 지급액</th><th className="px-4 py-4 text-right">{previousMonthLabel} 실제 지급액</th><th className="px-4 py-4 text-right">지급 확인 필요</th><th className="px-4 py-4 text-center">최근 매입일</th><th className="px-4 py-4 text-center">관리</th></tr></thead>
                <tbody className="divide-y divide-[#e7eef2]">
                  {suppliers.map((row) => <tr key={row.id} className="hover:bg-[#fbfdfd]"><td className="px-6 py-4"><button type="button" onClick={() => openSupplier(row)} className="font-black text-[#0d7a4f] underline decoration-[#88cbb0] underline-offset-4">{row.company_name}</button><div className="mt-1 text-xs font-bold text-[#8296a2]">입고 {row.purchase_count}건{row.unpriced_review_count ? ` · 단가 미등록 ${row.unpriced_review_count}건` : ''}</div></td><td className="px-4 py-4 text-right font-bold tabular-nums text-[#20b96e]">{won(row.this_month_purchase_amount)}</td><td className="px-4 py-4 text-right font-black tabular-nums text-[#9a6800]">{won(row.this_month_remaining)}</td><td className="px-4 py-4 text-right font-bold tabular-nums">{won(row.previous_month_paid)}</td><td className="px-4 py-4 text-right"><div className="font-black tabular-nums text-[#9a6800]">{won(row.review_required_amount)}</div><div className="mt-1 text-[11px] font-bold text-[#8799a4]">{row.review_required_count}건 확인</div></td><td className="px-4 py-4 text-center font-bold tabular-nums">{monthDay(row.latest_purchase_date)}</td><td className="px-4 py-4 text-center"><button type="button" onClick={() => openSupplier(row)} className="pf-row-button">수정</button></td></tr>)}
                  {!suppliers.length ? <tr><td colSpan={7} className="px-6 py-16 text-center font-black">조회되는 매입처가 없습니다.</td></tr> : null}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {!loading && view === 'payables' ? (
          <section>
            <div className="px-7 py-5 lg:px-9"><h2 className="text-xl font-black">지급·미지급금</h2><p className="mt-1 text-xs font-bold text-[#78909d]">과거 자동이관 내역은 지급여부를 확인하기 전까지 실제 미지급금 합계에 포함되지 않습니다.</p></div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1250px] table-fixed text-left text-sm">
                <colgroup><col className="w-[11%]" /><col className="w-[8%]" /><col className="w-[15%]" /><col className="w-[20%]" /><col className="w-[12%]" /><col className="w-[10%]" /><col className="w-[11%]" /><col className="w-[8%]" /><col className="w-[5%]" /></colgroup>
                <thead className="bg-[#edf5fa] text-xs font-black text-[#5f7a8c]"><tr><th className="px-4 py-4">상태</th><th className="px-3 py-4 text-center">지급예정</th><th className="px-4 py-4">매입처</th><th className="px-4 py-4">품목</th><th className="px-4 py-4 text-right">매입금액</th><th className="px-4 py-4 text-right">지급액</th><th className="px-4 py-4 text-right">남은금액</th><th className="px-4 py-4">결제수단</th><th className="px-3 py-4 text-center">관리</th></tr></thead>
                <tbody className="divide-y divide-[#e7eef2]">
                  {payables.map((row) => { const meta = statusMeta(row); const shownAmount = row.verification_status === 'REVIEW_REQUIRED' ? Number(row.estimated_total_amount ?? 0) : Number(row.total_amount); return <tr key={row.id} className="hover:bg-[#fbfdfd]"><td className="px-4 py-4"><span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-black ${meta.className}`}>{meta.label}</span></td><td className="px-3 py-4 text-center font-bold tabular-nums">{row.verification_status === 'REVIEW_REQUIRED' ? '-' : monthDay(row.due_date)}</td><td className="break-words px-4 py-4 font-black text-[#0d7a4f]">{row.supplier_name_snapshot}</td><td className="break-words px-4 py-4 font-bold">{row.item_name}<div className="mt-1 text-[11px] font-bold text-[#8a9ba5]">{monthDay(row.receipt_date || row.purchase_date)}</div></td><td className="px-4 py-4 text-right font-black tabular-nums">{won(shownAmount)}{row.verification_status === 'REVIEW_REQUIRED' ? <div className="mt-1 text-[10px] font-bold text-[#9a6800]">예상금액</div> : null}</td><td className="px-4 py-4 text-right font-bold tabular-nums text-[#20b96e]">{won(row.paid_amount)}</td><td className="px-4 py-4 text-right font-black tabular-nums text-[#9a6800]">{row.verification_status === 'REVIEW_REQUIRED' ? '확인 필요' : won(row.outstanding_amount)}</td><td className="px-4 py-4 font-bold">{paymentLabel(row.planned_payment_method)}</td><td className="px-3 py-4 text-center"><button type="button" onClick={() => openPayable(row)} className="pf-row-button">수정</button></td></tr> })}
                  {!payables.length ? <tr><td colSpan={9} className="px-6 py-16 text-center font-black">조회되는 지급내역이 없습니다.</td></tr> : null}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}
      </div>

      {supplierDraft ? <Modal title={supplierDraft.id ? '매입처 정보 수정' : '매입처 등록'} onClose={() => setSupplierDraft(null)}><div className="grid gap-4 md:grid-cols-2"><Field label="매입처명 *"><input className="pf-input" value={supplierDraft.company_name} onChange={(event) => setSupplierDraft({ ...supplierDraft, company_name: event.target.value })} /></Field><Field label="사업자등록번호"><input className="pf-input" value={supplierDraft.business_registration_number} onChange={(event) => setSupplierDraft({ ...supplierDraft, business_registration_number: event.target.value })} /></Field><Field label="대표자"><input className="pf-input" value={supplierDraft.representative_name} onChange={(event) => setSupplierDraft({ ...supplierDraft, representative_name: event.target.value })} /></Field><Field label="담당자"><input className="pf-input" value={supplierDraft.contact_name} onChange={(event) => setSupplierDraft({ ...supplierDraft, contact_name: event.target.value })} /></Field><Field label="전화번호"><input className="pf-input" value={supplierDraft.phone} onChange={(event) => setSupplierDraft({ ...supplierDraft, phone: event.target.value })} /></Field><Field label="이메일"><input className="pf-input" value={supplierDraft.email} onChange={(event) => setSupplierDraft({ ...supplierDraft, email: event.target.value })} /></Field></div><Field label="주소"><input className="pf-input" value={supplierDraft.address} onChange={(event) => setSupplierDraft({ ...supplierDraft, address: event.target.value })} /></Field><div className="grid gap-4 md:grid-cols-3"><Field label="공급 구분"><select className="pf-input" value={supplierDraft.supply_type} onChange={(event) => setSupplierDraft({ ...supplierDraft, supply_type: event.target.value })}><option value="RAW_MATERIAL">원재료</option><option value="PACKAGING">부재료</option><option value="BOTH">원재료·부재료</option><option value="OTHER">기타</option></select></Field><Field label="지급기한 기준"><select className="pf-input" value={supplierDraft.default_due_type} onChange={(event) => setSupplierDraft({ ...supplierDraft, default_due_type: event.target.value })}><option value="DIRECT">건별 직접 지정</option><option value="IMMEDIATE">즉시 지급</option><option value="DAYS">매입일 + N일</option><option value="NEXT_MONTH_DAY">익월 지정일</option><option value="MONTH_END">익월 말일</option></select></Field><Field label={supplierDraft.default_due_type === 'NEXT_MONTH_DAY' ? '익월 지급일' : '지급 유예일'}><input type="number" className="pf-input" value={supplierDraft.default_due_type === 'NEXT_MONTH_DAY' ? supplierDraft.default_due_day : supplierDraft.default_due_days} onChange={(event) => supplierDraft.default_due_type === 'NEXT_MONTH_DAY' ? setSupplierDraft({ ...supplierDraft, default_due_day: Number(event.target.value) }) : setSupplierDraft({ ...supplierDraft, default_due_days: Number(event.target.value) })} /></Field></div><div className="grid gap-4 md:grid-cols-3"><Field label="기본 결제수단"><select className="pf-input" value={supplierDraft.default_payment_method} onChange={(event) => setSupplierDraft({ ...supplierDraft, default_payment_method: event.target.value })}><option value="OTHER">미설정</option><option value="BANK_TRANSFER">계좌이체</option><option value="CARD">카드</option><option value="CASH">현금</option></select></Field><Field label="출금계좌·카드"><input className="pf-input" value={supplierDraft.default_payment_method === 'CARD' ? supplierDraft.default_card_name : supplierDraft.default_payment_account} onChange={(event) => supplierDraft.default_payment_method === 'CARD' ? setSupplierDraft({ ...supplierDraft, default_card_name: event.target.value }) : setSupplierDraft({ ...supplierDraft, default_payment_account: event.target.value })} /></Field><Field label="카드 할부 개월"><input type="number" min="1" max="36" disabled={supplierDraft.default_payment_method !== 'CARD'} className="pf-input" value={supplierDraft.default_installment_months} onChange={(event) => setSupplierDraft({ ...supplierDraft, default_installment_months: Number(event.target.value) })} /></Field></div><div className="grid gap-4 md:grid-cols-2"><Field label="세금계산서"><select className="pf-input" value={supplierDraft.tax_invoice_required ? 'YES' : 'NO'} onChange={(event) => setSupplierDraft({ ...supplierDraft, tax_invoice_required: event.target.value === 'YES' })}><option value="NO">확인 전</option><option value="YES">수취 대상</option></select></Field><Field label="사용 상태"><select className="pf-input" value={supplierDraft.status} onChange={(event) => setSupplierDraft({ ...supplierDraft, status: event.target.value })}><option value="ACTIVE">사용</option><option value="INACTIVE">사용 안 함</option></select></Field></div><Field label="비고"><input className="pf-input" value={supplierDraft.notes} onChange={(event) => setSupplierDraft({ ...supplierDraft, notes: event.target.value })} /></Field><div className="mt-6 text-right"><button type="button" disabled={busy} onClick={() => void saveSupplier()} className="pf-primary">{busy ? '저장 중...' : '저장'}</button></div></Modal> : null}

      {payableDraft && payableRow ? <Modal title="지급정보 확인·수정" onClose={() => { setPayableDraft(null); setPayableRow(null) }}><div className="mb-5 rounded-xl border border-[#d8e7ee] bg-[#f6fafc] px-5 py-4 text-sm"><b>{payableRow.supplier_name_snapshot}</b> · {payableRow.item_name}<div className="mt-1 text-xs font-bold text-[#718997]">과거 자동이관 자료는 실제 지급여부를 확인한 뒤 미지급금에 반영됩니다.</div></div><div className="grid gap-4 md:grid-cols-2"><Field label="지급 확인 상태"><select className="pf-input" value={payableDraft.mode} onChange={(event) => setPayableDraft({ ...payableDraft, mode: event.target.value })}><option value="REVIEW_REQUIRED">확인 필요 유지</option><option value="CONFIRMED_UNPAID">미지급 확정</option><option value="CONFIRMED_PAID">지급완료 확정</option><option value="EXCLUDED">매입·지급 대상에서 제외</option></select></Field><Field label="확정 또는 예상 매입금액"><input type="number" min="0" className="pf-input" value={payableDraft.amount} onChange={(event) => setPayableDraft({ ...payableDraft, amount: Number(event.target.value) })} /></Field><Field label="지급 예정일"><input type="date" className="pf-input" value={payableDraft.due_date} onChange={(event) => setPayableDraft({ ...payableDraft, due_date: event.target.value })} /></Field><Field label="결제수단"><select className="pf-input" value={payableDraft.payment_method} onChange={(event) => setPayableDraft({ ...payableDraft, payment_method: event.target.value })}><option value="OTHER">미설정</option><option value="BANK_TRANSFER">계좌이체</option><option value="CARD">카드</option><option value="CASH">현금</option></select></Field><Field label="출금계좌"><input className="pf-input" value={payableDraft.payment_account} onChange={(event) => setPayableDraft({ ...payableDraft, payment_account: event.target.value })} /></Field><Field label="카드명"><input className="pf-input" value={payableDraft.card_name} onChange={(event) => setPayableDraft({ ...payableDraft, card_name: event.target.value })} /></Field><Field label="카드 할부 개월"><input type="number" min="1" max="36" className="pf-input" value={payableDraft.installment_months} onChange={(event) => setPayableDraft({ ...payableDraft, installment_months: Number(event.target.value) })} /></Field>{payableDraft.mode === 'CONFIRMED_PAID' ? <Field label="실제 지급일"><input type="date" className="pf-input" value={payableDraft.payment_date} onChange={(event) => setPayableDraft({ ...payableDraft, payment_date: event.target.value })} /></Field> : <div />}</div><Field label="이체메모·승인번호"><input className="pf-input" value={payableDraft.reference} onChange={(event) => setPayableDraft({ ...payableDraft, reference: event.target.value })} /></Field><Field label="비고"><input className="pf-input" value={payableDraft.notes} onChange={(event) => setPayableDraft({ ...payableDraft, notes: event.target.value })} /></Field><div className="mt-6 text-right"><button type="button" disabled={busy} onClick={() => void savePayable()} className="pf-primary">{busy ? '저장 중...' : '저장'}</button></div></Modal> : null}

      <style jsx global>{`
        [data-purchase-financial-management] .pf-input{height:48px;width:100%;border-radius:14px;border:1px solid #d2e1ea;background:#fff;padding:0 15px;font-size:14px;font-weight:700;color:#173b52;outline:none}
        [data-purchase-financial-management] .pf-input:focus{border-color:#20c77a;box-shadow:0 0 0 3px rgba(32,199,122,.11)}
        [data-purchase-financial-management] .pf-input:disabled{background:#eef3f5;color:#8497a2}
        [data-purchase-financial-management] .pf-primary{display:inline-flex;min-height:44px;align-items:center;justify-content:center;border-radius:13px;background:#20c77a;padding:0 19px;font-size:13px;font-weight:900;color:white;box-shadow:0 8px 18px rgba(32,199,122,.18)}
        [data-purchase-financial-management] .pf-primary:disabled{opacity:.55}
        [data-purchase-financial-management] .pf-secondary{display:inline-flex;min-height:48px;align-items:center;justify-content:center;border-radius:14px;border:1px solid #d2e1ea;background:white;padding:0 20px;font-size:13px;font-weight:900;color:#24485f}
        [data-purchase-financial-management] .pf-row-button{border-radius:10px;border:1px solid #bfe0ee;background:#f4fbff;padding:8px 12px;font-size:11px;font-weight:900;color:#0b6e98}
        [data-purchase-financial-management] .pf-summary{min-width:0;border-right:1px solid #e5edf1;padding:18px 18px}
        [data-purchase-financial-management] .pf-summary:last-child{border-right:0}
        [data-purchase-financial-management] .pf-summary span{display:block;font-size:12px;font-weight:900;color:#6d8594}
        [data-purchase-financial-management] .pf-summary b{margin-top:7px;display:block;font-size:18px;line-height:1.2;font-weight:900;letter-spacing:-.03em}
      `}</style>
    </main>
  )
}
