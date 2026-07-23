'use client'

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'

type FlowStatus = 'planned' | 'posted' | 'reversed'
type FlowType = 'inflow' | 'outflow'
type FlowCategory = 'purchase' | 'operating_expense' | 'payroll' | 'tax' | 'financing' | 'investment' | 'transfer' | 'other'
type CashEntry = {
  id: string
  type: FlowType
  status: FlowStatus
  category: FlowCategory
  counterpart?: string | null
  amount: number
  due_date?: string | null
  actual_date?: string | null
  reference_no?: string | null
  vat_amount: number
  vat_deductible: boolean
  tax_invoice_date?: string | null
  note?: string | null
  reversal_reason?: string | null
}
type Account = {
  id: string
  account_name: string
  account_type: 'bank' | 'cash'
  institution_name?: string | null
  masked_account_no?: string | null
  active: boolean
  note?: string | null
  latest_balance: number | null
  balance_date: string | null
  stale_days: number | null
}
type Settlement = {
  id: string
  person_id: string
  person_name: string
  settlement_month: string
  source_type: string
  gross_amount: number
  withholding_rate: number
  withholding_amount: number
  net_amount: number
  status: 'draft' | 'confirmed' | 'paid'
  due_date?: string | null
  paid_date?: string | null
}
type TimelineRow = { source: string; id?: string; type: FlowType; date: string; amount: number; label: string; category?: string; reference_no?: string | null }
type Payload = {
  ok: boolean
  error?: string
  range: { month: string; start: string; end: string }
  today: string
  forecast_end: string
  summary: {
    actual_inflow: number
    actual_outflow: number
    actual_net_movement: number
    sales_receipt_inflow: number
    manual_inflow: number
    manual_outflow: number
    paid_settlement_outflow: number
    planned_30d_inflow: number
    planned_30d_outflow: number
    planned_30d_net: number
    registered_account_balance: number | null
    active_account_count: number
    accounts_without_balance: number
    stale_balance_accounts: number
    paid_settlement_without_date_count: number
  }
  tax: {
    output_vat: number
    registered_input_vat: number
    registered_vat_difference: number
    freelancer_withholding_reference: number
    basis: string
  }
  cash_entries: CashEntry[]
  accounts: Account[]
  settlements: Settlement[]
  actual_rows: TimelineRow[]
  forecast_rows: TimelineRow[]
}

type CashForm = {
  type: FlowType
  status: 'planned' | 'posted'
  category: FlowCategory
  counterpart: string
  amount: string
  due_date: string
  actual_date: string
  reference_no: string
  vat_amount: string
  vat_deductible: boolean
  tax_invoice_date: string
  note: string
}

type AccountForm = { account_name: string; account_type: 'bank' | 'cash'; institution_name: string; masked_account_no: string; active: boolean; note: string }

const inputClass = 'w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-blue-500 disabled:opacity-45'
const secondaryButton = 'rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-200 hover:border-slate-500 disabled:opacity-40'
const primaryButton = 'rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-black text-white hover:bg-blue-500 disabled:opacity-40'

function monthNow() { return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7) }
function todayKst() { return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date()) }
function money(value: unknown) { return `${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 }).format(Math.round(Number(value ?? 0)))}원` }
function categoryLabel(value: FlowCategory | string) {
  if (value === 'purchase') return '매입/구매'
  if (value === 'operating_expense') return '운영비'
  if (value === 'payroll') return '급여/인건비'
  if (value === 'tax') return '세금'
  if (value === 'financing') return '차입/상환'
  if (value === 'investment') return '투자'
  if (value === 'transfer') return '계좌이체'
  return '기타'
}
function settlementSource(value: string) { return value === 'sales' ? '영업' : value === 'production' ? '생산' : '수동' }
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="block text-sm text-slate-300"><span className="mb-1.5 block">{label}</span>{children}</label> }
function Modal({ title, onClose, children, maxWidth = 'max-w-3xl' }: { title: string; onClose: () => void; children: ReactNode; maxWidth?: string }) { return <div className="fixed inset-0 z-[1400] flex items-center justify-center bg-black/75 p-4"><div className={`max-h-[94vh] w-full ${maxWidth} overflow-hidden rounded-3xl border border-slate-700 bg-[#0f1b2d] shadow-2xl`}><div className="flex items-center justify-between border-b border-slate-700 px-6 py-4"><h2 className="text-xl font-black">{title}</h2><button type="button" onClick={onClose} className={secondaryButton}>닫기</button></div><div className="max-h-[calc(94vh-78px)] overflow-y-auto p-6">{children}</div></div></div> }
function Card({ label, value, note, tone = 'default' }: { label: string; value: string; note?: string; tone?: 'default' | 'success' | 'warning' | 'danger' | 'pending' }) {
  const cls = tone === 'success' ? 'border-emerald-500/30 bg-emerald-500/[0.06] text-emerald-100' : tone === 'warning' ? 'border-amber-500/30 bg-amber-500/[0.06] text-amber-100' : tone === 'danger' ? 'border-red-500/30 bg-red-500/[0.06] text-red-100' : tone === 'pending' ? 'border-violet-500/30 bg-violet-500/[0.05] text-violet-100' : 'border-slate-700 bg-slate-900/60 text-white'
  return <div className={`rounded-2xl border p-5 ${cls}`}><div className="text-xs font-black uppercase tracking-[0.12em] opacity-60">{label}</div><div className="mt-2 text-2xl font-black">{value}</div>{note && <div className="mt-1 text-xs leading-5 opacity-65">{note}</div>}</div>
}

function emptyCash(): CashForm { return { type: 'outflow', status: 'planned', category: 'operating_expense', counterpart: '', amount: '', due_date: todayKst(), actual_date: todayKst(), reference_no: '', vat_amount: '0', vat_deductible: false, tax_invoice_date: '', note: '' } }
function emptyAccount(): AccountForm { return { account_name: '', account_type: 'bank', institution_name: '', masked_account_no: '', active: true, note: '' } }

export default function FinancialControlModule() {
  const [month, setMonth] = useState(monthNow())
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [cashModal, setCashModal] = useState(false)
  const [cashId, setCashId] = useState('')
  const [cashForm, setCashForm] = useState<CashForm>(emptyCash())
  const [reverseCashId, setReverseCashId] = useState('')
  const [reverseReason, setReverseReason] = useState('')
  const [accountModal, setAccountModal] = useState(false)
  const [accountId, setAccountId] = useState('')
  const [accountForm, setAccountForm] = useState<AccountForm>(emptyAccount())
  const [balanceAccountId, setBalanceAccountId] = useState('')
  const [balanceDate, setBalanceDate] = useState(todayKst())
  const [balanceAmount, setBalanceAmount] = useState('')
  const [settlementDueId, setSettlementDueId] = useState('')
  const [settlementDueDate, setSettlementDueDate] = useState('')
  const [settlementPayId, setSettlementPayId] = useState('')
  const [settlementPaidDate, setSettlementPaidDate] = useState(todayKst())
  const [settlementReverseId, setSettlementReverseId] = useState('')
  const [settlementReverseReason, setSettlementReverseReason] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const response = await fetch(`/api/moni/financial-control?month=${encodeURIComponent(month)}&_=${Date.now()}`, { cache: 'no-store' })
      const payload = await response.json() as Payload
      if (!response.ok || !payload.ok) throw new Error(payload.error || '재무 데이터를 불러오지 못했습니다.')
      setData(payload)
    } catch (e) { setError(e instanceof Error ? e.message : '재무 데이터를 불러오지 못했습니다.') }
    finally { setLoading(false) }
  }, [month])
  useEffect(() => { void load() }, [load])

  const summary = data?.summary
  const tax = data?.tax
  const monthSettlements = useMemo(() => (data?.settlements ?? []).filter((row) => String(row.settlement_month).startsWith(month)), [data, month])

  async function post(action: string, bodyData: Record<string, unknown>, id = '') {
    const response = await fetch('/api/moni/financial-control', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, id: id || undefined, data: bodyData }) })
    const result = await response.json()
    if (!response.ok || !result.ok) throw new Error(result.error || '저장에 실패했습니다.')
    return result
  }

  function openNewCash(type: FlowType = 'outflow') { setCashId(''); setCashForm({ ...emptyCash(), type }); setCashModal(true); setError('') }
  function openEditCash(row: CashEntry) {
    if (row.status !== 'planned') { setError('실제 반영되거나 취소된 입출금은 수정할 수 없습니다. 취소 후 새로 등록해 주세요.'); return }
    setCashId(row.id); setCashForm({ type: row.type, status: 'planned', category: row.category, counterpart: row.counterpart ?? '', amount: String(row.amount), due_date: row.due_date ?? '', actual_date: todayKst(), reference_no: row.reference_no ?? '', vat_amount: String(row.vat_amount ?? 0), vat_deductible: row.vat_deductible === true, tax_invoice_date: row.tax_invoice_date ?? '', note: row.note ?? '' }); setCashModal(true)
  }
  async function saveCash() {
    setSaving(true); setError(''); setNotice('')
    try {
      await post('save_cash_entry', { ...cashForm, amount: Number(cashForm.amount), vat_amount: Number(cashForm.vat_amount || 0) }, cashId)
      setCashModal(false); setNotice(cashForm.status === 'posted' ? '실제 입출금을 기록했습니다.' : '예정 입출금을 저장했습니다.'); await load()
    } catch (e) { setError(e instanceof Error ? e.message : '입출금 저장에 실패했습니다.') } finally { setSaving(false) }
  }
  async function reverseCash() {
    setSaving(true); setError(''); setNotice('')
    try { await post('reverse_cash_entry', { reversal_reason: reverseReason }, reverseCashId); setReverseCashId(''); setReverseReason(''); setNotice('실제 입출금을 취소 처리했습니다. 원기록은 삭제하지 않습니다.'); await load() }
    catch (e) { setError(e instanceof Error ? e.message : '입출금 취소에 실패했습니다.') } finally { setSaving(false) }
  }

  function openNewAccount() { setAccountId(''); setAccountForm(emptyAccount()); setAccountModal(true) }
  function openEditAccount(row: Account) { setAccountId(row.id); setAccountForm({ account_name: row.account_name, account_type: row.account_type, institution_name: row.institution_name ?? '', masked_account_no: row.masked_account_no ?? '', active: row.active, note: row.note ?? '' }); setAccountModal(true) }
  async function saveAccount() {
    setSaving(true); setError(''); setNotice('')
    try { await post('save_account', accountForm, accountId); setAccountModal(false); setNotice('계좌/현금함 정보를 저장했습니다.'); await load() }
    catch (e) { setError(e instanceof Error ? e.message : '계좌 저장에 실패했습니다.') } finally { setSaving(false) }
  }
  async function saveBalance() {
    setSaving(true); setError(''); setNotice('')
    try { await post('save_balance_snapshot', { account_id: balanceAccountId, balance_date: balanceDate, balance_amount: Number(balanceAmount) }); setBalanceAccountId(''); setBalanceAmount(''); setNotice('잔액 Snapshot을 저장했습니다.'); await load() }
    catch (e) { setError(e instanceof Error ? e.message : '잔액 저장에 실패했습니다.') } finally { setSaving(false) }
  }

  async function saveSettlementDue() {
    setSaving(true); setError(''); setNotice('')
    try { await post('set_settlement_due_date', { due_date: settlementDueDate }, settlementDueId); setSettlementDueId(''); setNotice('프리랜서 지급예정일을 저장했습니다.'); await load() }
    catch (e) { setError(e instanceof Error ? e.message : '지급예정일 저장에 실패했습니다.') } finally { setSaving(false) }
  }
  async function markSettlementPaid() {
    setSaving(true); setError(''); setNotice('')
    try { await post('mark_settlement_paid', { paid_date: settlementPaidDate }, settlementPayId); setSettlementPayId(''); setNotice('프리랜서 정산 지급완료를 기록했습니다. 지급 이벤트 이력도 보존됩니다.'); await load() }
    catch (e) { setError(e instanceof Error ? e.message : '정산 지급처리에 실패했습니다.') } finally { setSaving(false) }
  }
  async function reverseSettlementPayment() {
    setSaving(true); setError(''); setNotice('')
    try { await post('reverse_settlement_payment', { reason: settlementReverseReason }, settlementReverseId); setSettlementReverseId(''); setSettlementReverseReason(''); setNotice('정산 지급완료를 취소하고 이력을 보존했습니다.'); await load() }
    catch (e) { setError(e instanceof Error ? e.message : '정산 지급취소에 실패했습니다.') } finally { setSaving(false) }
  }

  if (loading) return <main className="min-h-screen bg-[#071426] px-5 py-8 text-slate-100"><div className="mx-auto max-w-[1650px] rounded-3xl border border-slate-700 bg-[#0b1b30] p-16 text-center text-slate-400">재무·세무 데이터를 불러오는 중입니다.</div></main>

  return <main className="min-h-screen bg-[#071426] px-4 py-6 text-slate-100 md:px-8"><div className="mx-auto max-w-[1650px] space-y-5">
    <header className="rounded-3xl border border-slate-700 bg-[#0b1b30] p-6"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm font-black text-emerald-300">MONI FINANCIAL CONTROL V6</p><h1 className="mt-1 text-3xl font-black">현금흐름·세무 관리</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">실제 수금, 실제 지출, 30일 예정자금, 등록 계좌잔액을 구분합니다. 원재료 사용원가는 현금지출로 간주하지 않습니다.</p></div><div className="flex items-end gap-2"><Field label="조회 월"><input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className={inputClass}/></Field><button type="button" onClick={() => void load()} className={secondaryButton}>새로고침</button></div></div></header>
    {error && <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">{error}</div>}{notice && <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm text-emerald-200">{notice}</div>}

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Card label="이번 달 실제 입금" value={money(summary?.actual_inflow)} note={`판매수금 ${money(summary?.sales_receipt_inflow)} + 기타 실제입금 ${money(summary?.manual_inflow)}`} tone="success"/><Card label="이번 달 실제 지출" value={money(summary?.actual_outflow)} note={`직접지출 ${money(summary?.manual_outflow)} + 정산지급 ${money(summary?.paid_settlement_outflow)}`} tone={(summary?.actual_outflow ?? 0) > 0 ? 'warning' : 'default'}/><Card label="이번 달 순현금증감" value={money(summary?.actual_net_movement)} note="실제 입금 - 실제 지출 · 은행잔고와는 별개" tone={(summary?.actual_net_movement ?? 0) >= 0 ? 'success' : 'danger'}/><Card label="등록 계좌잔액" value={summary?.registered_account_balance === null ? '미등록' : money(summary?.registered_account_balance)} note={`활성 계좌/현금함 ${summary?.active_account_count ?? 0}개 · 7일 초과 잔액 ${summary?.stale_balance_accounts ?? 0}개`} tone={summary?.registered_account_balance === null ? 'pending' : (summary?.stale_balance_accounts ?? 0) > 0 ? 'warning' : 'success'}/></div>

    <section className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
      <div className="rounded-3xl border border-slate-700 bg-slate-900/55 p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.15em] text-blue-300">30 DAY CASH PLAN</p><h2 className="mt-1 text-xl font-black">향후 30일 예정자금</h2></div><span className="text-xs text-slate-500">{data?.today} ~ {data?.forecast_end}</span></div><div className="mt-4 grid gap-3 sm:grid-cols-3"><Card label="예정 유입" value={money(summary?.planned_30d_inflow)} note="입금예정 매출채권 + 직접 예정입금" tone="success"/><Card label="예정 유출" value={money(summary?.planned_30d_outflow)} note="직접 예정지출 + 확정 정산 지급예정" tone="warning"/><Card label="예정 순증감" value={money(summary?.planned_30d_net)} note="현재 등록 예정자료 기준" tone={(summary?.planned_30d_net ?? 0) >= 0 ? 'success' : 'danger'}/></div><div className="mt-5 max-h-[360px] overflow-y-auto rounded-2xl border border-slate-700"><table className="w-full min-w-[700px] text-sm"><thead className="sticky top-0 bg-slate-800 text-slate-400"><tr><th className="px-4 py-3 text-left">일자</th><th className="px-4 py-3 text-left">유형</th><th className="px-4 py-3 text-left">내용</th><th className="px-4 py-3 text-right">금액</th></tr></thead><tbody>{(data?.forecast_rows ?? []).map((row, index) => <tr key={`${row.source}-${row.id ?? index}`} className="border-t border-slate-800"><td className="px-4 py-3">{row.date}</td><td className={`px-4 py-3 font-bold ${row.type === 'inflow' ? 'text-emerald-300' : 'text-amber-300'}`}>{row.type === 'inflow' ? '유입' : '유출'}</td><td className="px-4 py-3">{row.label}</td><td className="px-4 py-3 text-right font-black">{money(row.amount)}</td></tr>)}{!(data?.forecast_rows ?? []).length && <tr><td colSpan={4} className="px-4 py-10 text-center text-slate-500">30일 내 등록된 예정자금이 없습니다.</td></tr>}</tbody></table></div></div>
      <div className="rounded-3xl border border-slate-700 bg-slate-900/55 p-5"><p className="text-xs font-black uppercase tracking-[0.15em] text-violet-300">TAX REFERENCE</p><h2 className="mt-1 text-xl font-black">세무 참고</h2><div className="mt-4 grid gap-3 sm:grid-cols-2"><Card label="매출 VAT" value={money(tax?.output_vat)} note="확정 판매의 VAT"/><Card label="등록 매입 VAT" value={money(tax?.registered_input_vat)} note="VAT 공제대상으로 직접 등록한 지출"/><Card label="등록자료 VAT 차액" value={money(tax?.registered_vat_difference)} note="매출 VAT - 등록 매입 VAT" tone={(tax?.registered_vat_difference ?? 0) > 0 ? 'warning' : 'default'}/><Card label="프리랜서 원천징수" value={money(tax?.freelancer_withholding_reference)} note="확정/지급 정산의 등록 원천징수액"/></div><div className="mt-4 rounded-2xl border border-amber-500/25 bg-amber-500/[0.05] p-4 text-xs leading-5 text-amber-100"><b>주의:</b> {tax?.basis}. 신고기한·공제요건·최종 신고세액은 세무 검토 영역이며 이 화면 숫자만으로 확정하지 않습니다.</div></div>
    </section>

    <section className="overflow-hidden rounded-3xl border border-slate-700 bg-slate-900/55"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700 p-5"><div><h2 className="text-xl font-black">계좌·현금함 잔액 Snapshot</h2><p className="mt-1 text-sm text-slate-400">은행 연동 전에는 자동 잔고를 추측하지 않습니다. 확인한 잔액을 기준일과 함께 저장합니다.</p></div><button type="button" onClick={openNewAccount} className={primaryButton}>+ 계좌/현금함</button></div><div className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-3">{(data?.accounts ?? []).map((account) => <div key={account.id} className={`rounded-2xl border p-4 ${account.active ? 'border-slate-700 bg-slate-950/30' : 'border-slate-800 opacity-45'}`}><div className="flex justify-between gap-3"><div><b>{account.account_name}</b><div className="mt-1 text-xs text-slate-500">{account.account_type === 'bank' ? `${account.institution_name || '은행'} ${account.masked_account_no || ''}` : '현금함'}</div></div><button type="button" onClick={() => openEditAccount(account)} className="text-xs text-blue-300 underline">설정</button></div><div className="mt-4 text-2xl font-black">{account.latest_balance === null ? '잔액 미등록' : money(account.latest_balance)}</div><div className="mt-1 text-xs text-slate-500">기준일 {account.balance_date || '-'}{account.stale_days !== null && account.stale_days > 7 ? ` · ${account.stale_days}일 경과` : ''}</div><button type="button" onClick={() => { setBalanceAccountId(account.id); setBalanceDate(todayKst()); setBalanceAmount(account.latest_balance === null ? '' : String(account.latest_balance)) }} className="mt-3 text-sm font-bold text-emerald-300 underline">잔액 입력</button></div>)}{!(data?.accounts ?? []).length && <div className="col-span-full rounded-2xl border border-dashed border-slate-700 p-10 text-center text-slate-500">등록된 계좌/현금함이 없습니다. 현재 Control Tower는 은행잔고를 표시하지 않습니다.</div>}</div></section>

    <section className="overflow-hidden rounded-3xl border border-slate-700 bg-slate-900/55"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700 p-5"><div><h2 className="text-xl font-black">직접 입출금 원장</h2><p className="mt-1 text-sm text-slate-400">판매대금 수금과 프리랜서 정산은 각 원장에서 자동 반영되므로 같은 돈을 여기 다시 입력하지 마세요.</p></div><div className="flex gap-2"><button type="button" onClick={() => openNewCash('inflow')} className={secondaryButton}>+ 기타 입금</button><button type="button" onClick={() => openNewCash('outflow')} className={primaryButton}>+ 지출/예정</button></div></div><div className="overflow-x-auto"><table className="min-w-[1150px] w-full text-sm"><thead className="bg-slate-800 text-slate-400"><tr><th className="px-4 py-3 text-left">상태</th><th className="px-4 py-3 text-left">예정/실제일</th><th className="px-4 py-3 text-left">유형</th><th className="px-4 py-3 text-left">분류</th><th className="px-4 py-3 text-left">상대처</th><th className="px-4 py-3 text-right">금액</th><th className="px-4 py-3 text-right">VAT</th><th className="px-4 py-3 text-left">관리</th></tr></thead><tbody>{(data?.cash_entries ?? []).map((row) => <tr key={row.id} className={`border-t border-slate-800 ${row.status === 'reversed' ? 'opacity-40' : ''}`}><td className="px-4 py-4"><span className={row.status === 'posted' ? 'text-emerald-300' : row.status === 'planned' ? 'text-amber-300' : 'text-slate-500'}>{row.status === 'posted' ? '실제' : row.status === 'planned' ? '예정' : '취소'}</span></td><td className="px-4 py-4">{row.status === 'posted' ? row.actual_date : row.due_date}</td><td className={`px-4 py-4 font-bold ${row.type === 'inflow' ? 'text-emerald-300' : 'text-amber-300'}`}>{row.type === 'inflow' ? '입금' : '지출'}</td><td className="px-4 py-4">{categoryLabel(row.category)}</td><td className="px-4 py-4">{row.counterpart || row.note || '-'}</td><td className="px-4 py-4 text-right font-black">{money(row.amount)}</td><td className="px-4 py-4 text-right">{row.vat_deductible ? `${money(row.vat_amount)} 공제등록` : money(row.vat_amount)}</td><td className="px-4 py-4">{row.status === 'planned' && <button type="button" onClick={() => openEditCash(row)} className="mr-3 underline">수정/실제처리</button>}{row.status === 'posted' && <button type="button" onClick={() => { setReverseCashId(row.id); setReverseReason('') }} className="text-red-300 underline">취소</button>}</td></tr>)}{!(data?.cash_entries ?? []).length && <tr><td colSpan={8} className="px-4 py-12 text-center text-slate-500">직접 등록된 입출금이 없습니다.</td></tr>}</tbody></table></div></section>

    <section className="overflow-hidden rounded-3xl border border-slate-700 bg-slate-900/55"><div className="border-b border-slate-700 p-5"><h2 className="text-xl font-black">프리랜서 정산 지급</h2><p className="mt-1 text-sm text-slate-400">정산 금액은 기존 회계 모듈에서 확정하고, 이 화면에서는 지급예정일과 실제 지급일만 관리합니다.</p></div><div className="overflow-x-auto"><table className="min-w-[1000px] w-full text-sm"><thead className="bg-slate-800 text-slate-400"><tr><th className="px-4 py-3 text-left">담당자</th><th className="px-4 py-3 text-left">구분</th><th className="px-4 py-3 text-right">총액</th><th className="px-4 py-3 text-right">원천징수</th><th className="px-4 py-3 text-right">실지급</th><th className="px-4 py-3 text-left">상태</th><th className="px-4 py-3 text-left">지급예정/지급일</th><th className="px-4 py-3 text-left">관리</th></tr></thead><tbody>{monthSettlements.map((row) => <tr key={row.id} className="border-t border-slate-800"><td className="px-4 py-4 font-bold">{row.person_name}</td><td className="px-4 py-4">{settlementSource(row.source_type)}</td><td className="px-4 py-4 text-right">{money(row.gross_amount)}</td><td className="px-4 py-4 text-right">{money(row.withholding_amount)}</td><td className="px-4 py-4 text-right font-black">{money(row.net_amount)}</td><td className="px-4 py-4">{row.status === 'paid' ? <span className="text-emerald-300">지급완료</span> : row.status === 'confirmed' ? <span className="text-amber-300">확정</span> : <span className="text-slate-500">작성중</span>}</td><td className="px-4 py-4">{row.status === 'paid' ? row.paid_date || '지급일 미기록' : row.due_date || '미설정'}</td><td className="px-4 py-4 whitespace-nowrap"><button type="button" onClick={() => { setSettlementDueId(row.id); setSettlementDueDate(row.due_date ?? '') }} disabled={row.status === 'paid'} className="mr-3 underline disabled:opacity-30">예정일</button>{row.status === 'confirmed' && <button type="button" onClick={() => { setSettlementPayId(row.id); setSettlementPaidDate(todayKst()) }} className="mr-3 text-emerald-300 underline">지급완료</button>}{row.status === 'paid' && <button type="button" onClick={() => { setSettlementReverseId(row.id); setSettlementReverseReason('') }} className="text-red-300 underline">지급취소</button>}</td></tr>)}{!monthSettlements.length && <tr><td colSpan={8} className="px-4 py-12 text-center text-slate-500">조회 월의 프리랜서 정산이 없습니다.</td></tr>}</tbody></table></div></section>
  </div>

  {cashModal && <Modal title={cashId ? '예정 입출금 수정 / 실제처리' : '입출금 등록'} onClose={() => setCashModal(false)} maxWidth="max-w-4xl"><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"><Field label="입출금"><select value={cashForm.type} onChange={(e) => setCashForm((current) => ({ ...current, type: e.target.value as FlowType, vat_deductible: e.target.value === 'outflow' ? current.vat_deductible : false }))} className={inputClass}><option value="outflow">지출</option><option value="inflow">입금</option></select></Field><Field label="상태"><select value={cashForm.status} onChange={(e) => setCashForm((current) => ({ ...current, status: e.target.value as 'planned' | 'posted' }))} className={inputClass}><option value="planned">예정</option><option value="posted">실제 반영</option></select></Field><Field label="분류"><select value={cashForm.category} onChange={(e) => setCashForm((current) => ({ ...current, category: e.target.value as FlowCategory }))} className={inputClass}><option value="purchase">매입/구매</option><option value="operating_expense">운영비</option><option value="payroll">급여/인건비</option><option value="tax">세금</option><option value="financing">차입/상환</option><option value="investment">투자</option><option value="transfer">계좌이체</option><option value="other">기타</option></select></Field><Field label="상대처"><input value={cashForm.counterpart} onChange={(e) => setCashForm((current) => ({ ...current, counterpart: e.target.value }))} placeholder="업체/기관/대상" className={inputClass}/></Field><Field label="금액(원)"><input type="number" min="1" value={cashForm.amount} onChange={(e) => setCashForm((current) => ({ ...current, amount: e.target.value }))} className={inputClass}/></Field>{cashForm.status === 'planned' ? <Field label="예정일"><input type="date" value={cashForm.due_date} onChange={(e) => setCashForm((current) => ({ ...current, due_date: e.target.value }))} className={inputClass}/></Field> : <Field label="실제 입출금일"><input type="date" value={cashForm.actual_date} onChange={(e) => setCashForm((current) => ({ ...current, actual_date: e.target.value }))} className={inputClass}/></Field>}<Field label="참조번호"><input value={cashForm.reference_no} onChange={(e) => setCashForm((current) => ({ ...current, reference_no: e.target.value }))} placeholder="이체번호/문서번호 등" className={inputClass}/></Field><Field label="VAT 금액"><input type="number" min="0" value={cashForm.vat_amount} onChange={(e) => setCashForm((current) => ({ ...current, vat_amount: e.target.value }))} className={inputClass}/></Field><Field label="세금계산서 기준일"><input type="date" value={cashForm.tax_invoice_date} onChange={(e) => setCashForm((current) => ({ ...current, tax_invoice_date: e.target.value }))} className={inputClass}/></Field><Field label="비고"><input value={cashForm.note} onChange={(e) => setCashForm((current) => ({ ...current, note: e.target.value }))} className={inputClass}/></Field></div>{cashForm.type === 'outflow' && <label className="mt-5 flex items-center gap-2 text-sm"><input type="checkbox" checked={cashForm.vat_deductible} onChange={(e) => setCashForm((current) => ({ ...current, vat_deductible: e.target.checked }))}/> 등록 매입 VAT를 세무 참고에 포함</label>}<div className="mt-6 flex justify-end gap-3"><button type="button" onClick={() => setCashModal(false)} className={secondaryButton}>취소</button><button type="button" disabled={saving} onClick={() => void saveCash()} className={primaryButton}>저장</button></div></Modal>}

  {accountModal && <Modal title={accountId ? '계좌/현금함 수정' : '계좌/현금함 등록'} onClose={() => setAccountModal(false)} maxWidth="max-w-xl"><div className="space-y-4"><Field label="이름"><input value={accountForm.account_name} onChange={(e) => setAccountForm((current) => ({ ...current, account_name: e.target.value }))} placeholder="예: 국민은행 운영계좌 / 사무실 현금" className={inputClass}/></Field><Field label="구분"><select value={accountForm.account_type} onChange={(e) => setAccountForm((current) => ({ ...current, account_type: e.target.value as 'bank' | 'cash' }))} className={inputClass}><option value="bank">은행계좌</option><option value="cash">현금함</option></select></Field>{accountForm.account_type === 'bank' && <><Field label="금융기관"><input value={accountForm.institution_name} onChange={(e) => setAccountForm((current) => ({ ...current, institution_name: e.target.value }))} className={inputClass}/></Field><Field label="표시용 계좌번호"><input value={accountForm.masked_account_no} onChange={(e) => setAccountForm((current) => ({ ...current, masked_account_no: e.target.value }))} placeholder="전체 번호 대신 일부만 권장" className={inputClass}/></Field></>}<Field label="비고"><input value={accountForm.note} onChange={(e) => setAccountForm((current) => ({ ...current, note: e.target.value }))} className={inputClass}/></Field><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={accountForm.active} onChange={(e) => setAccountForm((current) => ({ ...current, active: e.target.checked }))}/> 사용</label></div><div className="mt-6 flex justify-end gap-3"><button type="button" onClick={() => setAccountModal(false)} className={secondaryButton}>취소</button><button type="button" disabled={saving} onClick={() => void saveAccount()} className={primaryButton}>저장</button></div></Modal>}

  {balanceAccountId && <Modal title="잔액 Snapshot 입력" onClose={() => setBalanceAccountId('')} maxWidth="max-w-lg"><div className="space-y-4"><Field label="잔액 기준일"><input type="date" value={balanceDate} onChange={(e) => setBalanceDate(e.target.value)} className={inputClass}/></Field><Field label="확인 잔액(원)"><input type="number" min="0" value={balanceAmount} onChange={(e) => setBalanceAmount(e.target.value)} className={inputClass}/></Field></div><p className="mt-4 text-xs leading-5 text-slate-500">이 값은 은행 API 자동연동 값이 아니라 사용자가 직접 확인하여 입력한 Snapshot입니다.</p><div className="mt-6 flex justify-end gap-3"><button type="button" onClick={() => setBalanceAccountId('')} className={secondaryButton}>취소</button><button type="button" disabled={saving} onClick={() => void saveBalance()} className={primaryButton}>저장</button></div></Modal>}

  {reverseCashId && <Modal title="실제 입출금 취소" onClose={() => setReverseCashId('')} maxWidth="max-w-lg"><Field label="취소 사유"><input value={reverseReason} onChange={(e) => setReverseReason(e.target.value)} className={inputClass}/></Field><p className="mt-3 text-xs text-slate-500">원기록을 삭제하지 않고 취소 상태와 사유를 보존합니다.</p><div className="mt-6 flex justify-end gap-3"><button type="button" onClick={() => setReverseCashId('')} className={secondaryButton}>닫기</button><button type="button" disabled={saving || !reverseReason.trim()} onClick={() => void reverseCash()} className="rounded-xl bg-red-600 px-5 py-2.5 text-sm font-black text-white disabled:opacity-40">취소 확정</button></div></Modal>}

  {settlementDueId && <Modal title="프리랜서 지급예정일" onClose={() => setSettlementDueId('')} maxWidth="max-w-lg"><Field label="지급예정일"><input type="date" value={settlementDueDate} onChange={(e) => setSettlementDueDate(e.target.value)} className={inputClass}/></Field><div className="mt-6 flex justify-end gap-3"><button type="button" onClick={() => setSettlementDueId('')} className={secondaryButton}>취소</button><button type="button" disabled={saving} onClick={() => void saveSettlementDue()} className={primaryButton}>저장</button></div></Modal>}

  {settlementPayId && <Modal title="프리랜서 정산 지급완료" onClose={() => setSettlementPayId('')} maxWidth="max-w-lg"><Field label="실제 지급일"><input type="date" value={settlementPaidDate} onChange={(e) => setSettlementPaidDate(e.target.value)} className={inputClass}/></Field><p className="mt-3 text-xs leading-5 text-slate-500">지급완료 처리 후 이번 달 실제 지출에 반영됩니다. 지급 이벤트 이력이 별도로 남습니다.</p><div className="mt-6 flex justify-end gap-3"><button type="button" onClick={() => setSettlementPayId('')} className={secondaryButton}>취소</button><button type="button" disabled={saving} onClick={() => void markSettlementPaid()} className={primaryButton}>지급완료</button></div></Modal>}

  {settlementReverseId && <Modal title="정산 지급완료 취소" onClose={() => setSettlementReverseId('')} maxWidth="max-w-lg"><Field label="취소 사유"><input value={settlementReverseReason} onChange={(e) => setSettlementReverseReason(e.target.value)} className={inputClass}/></Field><p className="mt-3 text-xs text-slate-500">지급완료 상태는 확정 상태로 돌아가며 지급취소 이벤트가 보존됩니다.</p><div className="mt-6 flex justify-end gap-3"><button type="button" onClick={() => setSettlementReverseId('')} className={secondaryButton}>닫기</button><button type="button" disabled={saving || !settlementReverseReason.trim()} onClick={() => void reverseSettlementPayment()} className="rounded-xl bg-red-600 px-5 py-2.5 text-sm font-black text-white disabled:opacity-40">지급취소</button></div></Modal>}
  </main>
}
