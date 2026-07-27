'use client'

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'

type SalesUnit = string
type Client = { id: string; company_name: string; status: 'active' | 'inactive' }
type Variant = {
  id: string
  product_id: string
  product_name: string
  product_code?: string | null
  product_spec?: string | null
  variant_name: string
  sales_unit: SalesUnit
  unit_weight_g?: number | null
  box_units?: number | null
  default_unit_price: number
  moq_quantity: number
  is_default: boolean
  active: boolean
}
type Term = { id: string; client_id: string; variant_id: string; active: boolean; unit_price: number; moq_quantity: number }
type OrderItem = {
  id?: string
  product_id?: string | null
  product_name: string
  specification?: string | null
  sales_variant_id?: string | null
  sales_variant_name?: string | null
  quantity: number
  unit: SalesUnit
  unit_price: number
  supply_amount: number
  quantity_kg?: number | null
}
type Order = {
  id: string
  statement_number: string
  sale_date: string
  due_date?: string | null
  client_id?: string | null
  manual_client_name?: string | null
  status: 'draft' | 'confirmed' | 'cancelled'
  payment_status: 'unpaid' | 'partial' | 'paid'
  vat_rate: number
  supply_amount: number
  vat_amount: number
  total_amount: number
  note?: string | null
  posted_receipt_amount: number
  financial_locked: boolean
  source_type?: string | null
  source_reference?: string | null
  currency?: string | null
  items: OrderItem[]
}
type Payload = {
  ok: boolean
  error?: string
  range: { month: string; start: string; end: string }
  clients: Client[]
  variants: Variant[]
  client_variant_terms: Term[]
  orders: Order[]
  summary: { order_count: number; supply_amount: number; vat_amount: number; total_amount: number; locked_order_count: number }
}
type DraftItem = { sales_variant_id: string; quantity: string; unit_price: string }
type OrderDraft = { sale_date: string; client_id: string; status: 'draft' | 'confirmed'; vat_rate: string; note: string; items: DraftItem[] }
type OtherDraftItem = { product_name: string; quantity: string; unit: string; unit_price: string }
type OtherDraft = { sale_date: string; customer_name: string; vat_applied: boolean; note: string; items: OtherDraftItem[] }

const inputClass = 'w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-blue-500 disabled:cursor-not-allowed disabled:opacity-50'
const secondaryButton = 'rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-200 hover:border-slate-500 hover:text-white disabled:opacity-40'
const primaryButton = 'rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-black text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40'
const redButton = 'rounded-lg border border-red-400/50 bg-red-500/10 px-3 py-2 text-xs font-black text-red-300 hover:bg-red-500/20 disabled:opacity-40'

function todayKst() { return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date()) }
function monthNow() { return todayKst().slice(0, 7) }
function money(value: unknown) { return `${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 }).format(Math.round(Number(value ?? 0)))}원` }
function currencyMoney(value: unknown, currency = 'KRW') {
  const amount = Number(value ?? 0)
  const safe = Number.isFinite(amount) ? amount : 0
  if (currency === 'KRW') return `KRW ${Math.round(safe).toLocaleString('ko-KR')}`
  return `${currency} ${safe.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
function orderMoney(row: Order, value: unknown) {
  return String(row.source_type || '').toUpperCase() === 'EXPORT'
    ? currencyMoney(value, String(row.currency || 'KRW').toUpperCase())
    : money(value)
}
function qty(value: unknown, digits = 3) { return new Intl.NumberFormat('ko-KR', { maximumFractionDigits: digits }).format(Number(value ?? 0)) }
function unitLabel(unit: SalesUnit) {
  const normalized = String(unit || '').toLowerCase()
  if (normalized === 'box') return 'BOX'
  if (normalized === 'ea') return 'EA'
  if (normalized === 'kg') return 'kg'
  return String(unit || '-')
}
function paymentLabel(value: Order['payment_status']) { return value === 'paid' ? '수금완료' : value === 'partial' ? '부분입금' : '미입금' }
function escapeHtml(value: unknown) { return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;') }
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="block text-sm text-slate-300"><span className="mb-1.5 block">{label}</span>{children}</label> }
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) { return <div className="fixed inset-0 z-[1300] flex items-center justify-center bg-black/75 p-4"><div className="max-h-[94vh] w-full max-w-6xl overflow-hidden rounded-3xl border border-slate-700 bg-[#0f1b2d] shadow-2xl"><div className="flex items-center justify-between border-b border-slate-700 px-6 py-4"><h2 className="text-xl font-black">{title}</h2><button type="button" onClick={onClose} className={secondaryButton}>닫기</button></div><div className="max-h-[calc(94vh-78px)] overflow-y-auto p-6">{children}</div></div></div> }
function Summary({ label, value, note, tone = 'default' }: { label: string; value: string; note?: string; tone?: 'default' | 'success' | 'warning' }) {
  const cls = tone === 'success' ? 'border-emerald-500/30 bg-emerald-500/[0.06] text-emerald-100' : tone === 'warning' ? 'border-amber-500/30 bg-amber-500/[0.06] text-amber-100' : 'border-slate-700 bg-slate-900/60 text-white'
  return <div className={`rounded-2xl border p-5 ${cls}`}><div className="text-xs font-black uppercase tracking-[0.12em] opacity-60">{label}</div><div className="mt-2 text-2xl font-black">{value}</div>{note && <div className="mt-1 text-xs opacity-60">{note}</div>}</div>
}

function emptyDraft(): OrderDraft { return { sale_date: todayKst(), client_id: '', status: 'confirmed', vat_rate: '10', note: '', items: [] } }
function emptyOtherDraft(): OtherDraft { return { sale_date: todayKst(), customer_name: '', vat_applied: true, note: '', items: [{ product_name: '', quantity: '1', unit: '개', unit_price: '0' }] } }
function sourceKind(row: Order): 'product' | 'export' | 'other' {
  const source = String(row.source_type || 'MANUAL').toUpperCase()
  if (source === 'EXPORT') return 'export'
  if (source === 'OTHER') return 'other'
  return 'product'
}
function KindBadge({ kind }: { kind: 'product' | 'export' | 'other' }) {
  const style = kind === 'export'
    ? 'border-blue-400/40 bg-blue-500/10 text-blue-300'
    : kind === 'other'
      ? 'border-amber-400/40 bg-amber-500/10 text-amber-300'
      : 'border-emerald-400/40 bg-emerald-500/10 text-emerald-300'
  const label = kind === 'export' ? '수출' : kind === 'other' ? '상품' : '제품'
  return <span className={`inline-flex min-w-[44px] items-center justify-center rounded-full border px-2 py-1 text-[11px] font-black ${style}`}>{label}</span>
}

export default function SalesOrderV4Module({ mode: _mode = 'sales' }: { mode?: 'sales' | 'statements' }) {
  const [month, setMonth] = useState(monthNow())
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [modal, setModal] = useState(false)
  const [editingId, setEditingId] = useState('')
  const [draft, setDraft] = useState<OrderDraft>(emptyDraft())
  const [otherModal, setOtherModal] = useState(false)
  const [otherEditingId, setOtherEditingId] = useState('')
  const [otherDraft, setOtherDraft] = useState<OtherDraft>(emptyOtherDraft())
  const [cancelOrderId, setCancelOrderId] = useState('')
  const [cancelReason, setCancelReason] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`/api/moni/sales-orders-v4?month=${encodeURIComponent(month)}&_=${Date.now()}`, { cache: 'no-store' })
      const payload = await response.json() as Payload
      if (!response.ok || !payload.ok) throw new Error(payload.error || '판매 데이터를 불러오지 못했습니다.')
      setData(payload)
    } catch (e) {
      setError(e instanceof Error ? e.message : '판매 데이터를 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [month])

  useEffect(() => { void load() }, [load])

  const clients = data?.clients ?? []
  const variants = data?.variants ?? []
  const terms = data?.client_variant_terms ?? []
  const orders = data?.orders ?? []
  const visibleOrders = orders.filter((row) => row.status !== 'cancelled')
  const variantById = useMemo(() => new Map(variants.map((row) => [row.id, row])), [variants])
  const clientById = useMemo(() => new Map(clients.map((row) => [row.id, row])), [clients])
  const termByKey = useMemo(() => new Map(terms.map((row) => [`${row.client_id}:${row.variant_id}`, row])), [terms])

  function customerName(row: Order) {
    return sourceKind(row) === 'other'
      ? String(row.manual_client_name || '').trim() || '-'
      : clientById.get(String(row.client_id || ''))?.company_name || '-'
  }

  function pricing(clientId: string, variantId: string) {
    const variant = variantById.get(variantId)
    const term = termByKey.get(`${clientId}:${variantId}`)
    return { price: Number(term?.unit_price ?? variant?.default_unit_price ?? 0), moq: Number(term?.moq_quantity ?? variant?.moq_quantity ?? 0) }
  }
  function convertedKg(item: DraftItem) {
    const variant = variantById.get(item.sales_variant_id)
    const quantity = Number(item.quantity || 0)
    if (!variant || quantity <= 0) return 0
    if (String(variant.sales_unit).toLowerCase() === 'kg') return quantity
    const weight = Number(variant.unit_weight_g || 0)
    if (String(variant.sales_unit).toLowerCase() === 'ea') return quantity * weight / 1000
    return quantity * Number(variant.box_units || 0) * weight / 1000
  }
  function lineAmount(item: DraftItem) { return Number(item.quantity || 0) * Number(item.unit_price || 0) }
  function otherLineAmount(item: OtherDraftItem) { return Number(item.quantity || 0) * Number(item.unit_price || 0) }

  const draftSupply = draft.items.reduce((sum, item) => sum + lineAmount(item), 0)
  const draftVat = draftSupply * Number(draft.vat_rate || 0) / 100
  const otherSupply = otherDraft.items.reduce((sum, item) => sum + otherLineAmount(item), 0)
  const otherVat = otherDraft.vat_applied ? otherSupply * 0.1 : 0

  async function post(action: string, bodyData: Record<string, unknown>, id = '') {
    const response = await fetch('/api/moni/sales-orders-v4', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, id: id || undefined, data: bodyData }) })
    const result = await response.json()
    if (!response.ok || !result.ok) throw new Error(result.error || '저장에 실패했습니다.')
    return result
  }

  async function postOther(bodyData: Record<string, unknown>, id = '') {
    const response = await fetch('/api/moni/sales-other-orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'save_other_order', id: id || undefined, data: bodyData }) })
    const result = await response.json()
    if (!response.ok || !result.ok) throw new Error(result.error || '상품 판매 저장에 실패했습니다.')
    return result
  }

  function firstActiveClient() { return clients.find((row) => row.status === 'active')?.id || '' }

  function openNewProduct() {
    setEditingId('')
    setDraft({ ...emptyDraft(), client_id: firstActiveClient() })
    setModal(true)
    setError('')
  }

  function openNewOther() {
    setOtherEditingId('')
    setOtherDraft(emptyOtherDraft())
    setOtherModal(true)
    setError('')
  }

  function openEdit(row: Order) {
    const kind = sourceKind(row)
    if (kind === 'export' && row.source_reference) {
      window.location.href = `/sales-management/export/documents?edit=${encodeURIComponent(String(row.source_reference))}`
      return
    }
    if (row.financial_locked) {
      setError('실제 입금이 등록된 판매건은 금액·품목을 수정할 수 없습니다. 수금·미수금 화면에서 입금을 먼저 확인해 주세요.')
      return
    }
    if (kind === 'other') {
      setOtherEditingId(row.id)
      setOtherDraft({
        sale_date: row.sale_date,
        customer_name: String(row.manual_client_name || ''),
        vat_applied: Number(row.vat_rate || 0) > 0,
        note: row.note ?? '',
        items: row.items.map((item) => ({
          product_name: item.product_name || '',
          quantity: String(item.quantity),
          unit: String(item.unit || ''),
          unit_price: String(item.unit_price),
        })),
      })
      setOtherModal(true)
      setError('')
      return
    }
    if (row.items.some((item) => !item.sales_variant_id)) {
      setError('이 판매건은 이전 판매 구조로 등록되어 다중규격 화면에서 직접 수정할 수 없습니다. 기존 기록은 보존됩니다.')
      return
    }
    setEditingId(row.id)
    setDraft({ sale_date: row.sale_date, client_id: String(row.client_id || ''), status: row.status === 'draft' ? 'draft' : 'confirmed', vat_rate: String(row.vat_rate), note: row.note ?? '', items: row.items.map((item) => ({ sales_variant_id: item.sales_variant_id || '', quantity: String(item.quantity), unit_price: String(item.unit_price) })) })
    setModal(true)
    setError('')
  }

  function changeClient(clientId: string) {
    setDraft((current) => ({ ...current, client_id: clientId, items: current.items.map((item) => { const next = pricing(clientId, item.sales_variant_id); return { ...item, unit_price: String(next.price) } }) }))
  }
  function addItem() { setDraft((current) => ({ ...current, items: [...current.items, { sales_variant_id: '', quantity: '1', unit_price: '0' }] })) }
  function removeItem(index: number) { setDraft((current) => ({ ...current, items: current.items.filter((_, i) => i !== index) })) }
  function selectVariant(index: number, variantId: string) { const p = pricing(draft.client_id, variantId); setDraft((current) => ({ ...current, items: current.items.map((item, i) => i === index ? { ...item, sales_variant_id: variantId, unit_price: String(p.price) } : item) })) }
  function patchItem(index: number, patch: Partial<DraftItem>) { setDraft((current) => ({ ...current, items: current.items.map((item, i) => i === index ? { ...item, ...patch } : item) })) }
  function addOtherItem() { setOtherDraft((current) => ({ ...current, items: [...current.items, { product_name: '', quantity: '1', unit: '개', unit_price: '0' }] })) }
  function removeOtherItem(index: number) { setOtherDraft((current) => ({ ...current, items: current.items.filter((_, i) => i !== index) })) }
  function patchOtherItem(index: number, patch: Partial<OtherDraftItem>) { setOtherDraft((current) => ({ ...current, items: current.items.map((item, i) => i === index ? { ...item, ...patch } : item) })) }

  async function saveOrder() {
    if (!draft.client_id) { setError('거래처를 선택해 주세요.'); return }
    if (!draft.items.length) { setError('판매 품목을 추가해 주세요.'); return }
    setSaving(true); setError(''); setNotice('')
    try {
      await post('save_order', { sale_date: draft.sale_date, client_id: draft.client_id, status: draft.status, vat_rate: Number(draft.vat_rate), note: draft.note, items: draft.items.map((item) => ({ sales_variant_id: item.sales_variant_id, quantity: Number(item.quantity), unit_price: Number(item.unit_price) })) }, editingId)
      setModal(false)
      setNotice(editingId ? '제품 판매건을 수정했습니다.' : '제품 판매를 등록했습니다.')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : '판매 저장에 실패했습니다.')
    } finally { setSaving(false) }
  }

  async function saveOtherOrder() {
    if (!otherDraft.customer_name.trim()) { setError('거래처를 입력해 주세요.'); return }
    if (!otherDraft.items.length) { setError('상품을 한 개 이상 입력해 주세요.'); return }
    setSaving(true); setError(''); setNotice('')
    try {
      await postOther({
        sale_date: otherDraft.sale_date,
        customer_name: otherDraft.customer_name,
        vat_applied: otherDraft.vat_applied,
        note: otherDraft.note,
        items: otherDraft.items.map((item) => ({ product_name: item.product_name, quantity: Number(item.quantity), unit: item.unit, unit_price: Number(item.unit_price) })),
      }, otherEditingId)
      setOtherModal(false)
      setNotice(otherEditingId ? '기타 상품 판매건을 수정했습니다.' : '기타 상품 판매를 등록했습니다. 재고에는 영향을 주지 않고 매출·수금에만 반영됩니다.')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : '상품 판매 저장에 실패했습니다.')
    } finally { setSaving(false) }
  }

  async function cancelOrder() {
    if (!cancelOrderId) return
    setSaving(true); setError(''); setNotice('')
    try {
      await post('cancel_order', { reason: cancelReason }, cancelOrderId)
      setCancelOrderId(''); setCancelReason('')
      setNotice('거래명세표 목록에서 삭제했습니다.')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : '판매 삭제에 실패했습니다.')
    } finally { setSaving(false) }
  }

  function printStatement(row: Order) {
    const lines = row.items.map((item, index) => `<tr><td>${index + 1}</td><td class="left">${escapeHtml(item.product_name)}</td><td>${escapeHtml(item.sales_variant_name || item.specification || '-')}</td><td>${escapeHtml(qty(item.quantity))}</td><td>${escapeHtml(unitLabel(item.unit))}</td><td class="money">${escapeHtml(money(item.unit_price))}</td><td class="money">${escapeHtml(money(item.supply_amount))}</td></tr>`).join('')
    const popup = window.open('', '_blank', 'width=1100,height=850')
    if (!popup) { setError('팝업이 차단되어 거래명세표를 열지 못했습니다.'); return }
    popup.document.write(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>거래명세표</title><style>@page{size:A4 portrait;margin:12mm}body{font-family:Arial,sans-serif;color:#111}h1{text-align:center}.party,.items,.totals{width:100%;border-collapse:collapse;margin-bottom:14px}.party th,.party td,.items th,.items td,.totals th,.totals td{border:1px solid #222;padding:7px;font-size:12px}.items td{text-align:center}.left{text-align:left!important}.money{text-align:right!important}.totals{width:45%;margin-left:auto}</style></head><body><h1>거 래 명 세 표</h1><p>거래일: <b>${escapeHtml(row.sale_date)}</b>${row.due_date ? ` / 입금예정일: <b>${escapeHtml(row.due_date)}</b>` : ''}</p><table class="party"><tr><th>공급자</th><td>두배</td><th>사업자번호</th><td>123-38-14284</td></tr><tr><th>공급받는 자</th><td>${escapeHtml(customerName(row))}</td><th>비고</th><td>${escapeHtml(row.note || '-')}</td></tr></table><table class="items"><thead><tr><th>No.</th><th>품목</th><th>판매규격</th><th>수량</th><th>단위</th><th>단가</th><th>공급가액</th></tr></thead><tbody>${lines}</tbody></table><table class="totals"><tr><th>공급가액</th><td class="money">${escapeHtml(money(row.supply_amount))}</td></tr><tr><th>부가세</th><td class="money">${escapeHtml(money(row.vat_amount))}</td></tr><tr><th>합계</th><td class="money"><b>${escapeHtml(money(row.total_amount))}</b></td></tr></table><script>window.onload=()=>window.print()</script></body></html>`)
    popup.document.close()
  }

  function printOrder(row: Order) {
    if (sourceKind(row) === 'export' && row.source_reference) {
      window.open(`/sales-management/export/documents/${encodeURIComponent(String(row.source_reference))}/statement?auto=1`, '_blank')
      return
    }
    printStatement(row)
  }

  if (loading) return <main className="min-h-screen bg-[#071426] px-5 py-8 text-slate-100"><div className="mx-auto max-w-[1600px] rounded-3xl border border-slate-700 bg-[#0b1b30] p-16 text-center text-slate-400">판매 데이터를 불러오는 중입니다.</div></main>

  return <main className="min-h-screen bg-[#071426] px-4 py-6 text-slate-100 md:px-8"><div className="mx-auto max-w-[1600px] space-y-5">
    <header className="rounded-3xl border border-slate-700 bg-[#0b1b30] p-6"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm font-black text-emerald-300">MONI SALES V4</p><h1 className="mt-1 text-3xl font-black">거래명세표</h1><p className="mt-2 text-sm leading-6 text-slate-400">제품 판매와 재고에 영향을 주지 않는 기타 상품 판매를 등록하고, 생성된 거래명세표를 한 화면에서 관리합니다.</p></div><div className="flex flex-wrap items-end gap-2"><Field label="조회 월"><input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className={inputClass} /></Field><button type="button" onClick={openNewProduct} className={primaryButton}>+ 제품 판매등록</button><button type="button" onClick={openNewOther} className={secondaryButton}>+ 기타 판매</button></div></div></header>

    {error && <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">{error}</div>}
    {notice && <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm text-emerald-200">{notice}</div>}

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Summary label="확정 판매" value={`${data?.summary.order_count ?? 0}건`} /><Summary label="공급가액" value={money(data?.summary.supply_amount)} tone="success" /><Summary label="부가세" value={money(data?.summary.vat_amount)} /><Summary label="합계 매출" value={money(data?.summary.total_amount)} note={`입금 발생 잠금 ${data?.summary.locked_order_count ?? 0}건`} /></div>

    <section className="overflow-hidden rounded-3xl border border-slate-700 bg-slate-900/55"><div className="border-b border-slate-700 p-5"><h2 className="text-xl font-black">명세표 출력 목록</h2><p className="mt-1 text-sm text-slate-400">일반 제품·기타 상품 판매는 여기서 수정·삭제하고, 수출 판매건은 원본 수출서류에서 수정합니다.</p></div><div className="overflow-x-auto"><table className="min-w-[1180px] w-full text-sm"><thead className="bg-slate-800 text-slate-400"><tr><th className="w-[68px] px-2 py-3 text-center">구분</th>{['판매일', '거래처', '판매 kg', '공급가액', '부가세', '합계', '수금상태', '입금예정일', '관리'].map((label) => <th key={label} className="px-4 py-3 text-left">{label}</th>)}</tr></thead><tbody>{visibleOrders.map((row) => {
      const kind = sourceKind(row)
      const totalKg = row.items.reduce((sum, item) => sum + Number(item.quantity_kg || 0), 0)
      return <tr key={row.id} className="border-t border-slate-800"><td className="px-2 py-4 text-center"><KindBadge kind={kind} /></td><td className="px-4 py-4">{row.sale_date}</td><td className="px-4 py-4 font-bold">{customerName(row)}</td><td className="px-4 py-4">{kind === 'other' ? <span className="text-slate-500">-</span> : `${qty(totalKg)}kg`}</td><td className="px-4 py-4">{orderMoney(row, row.supply_amount)}</td><td className="px-4 py-4">{orderMoney(row, row.vat_amount)}</td><td className="px-4 py-4 font-black text-emerald-200">{orderMoney(row, row.total_amount)}</td><td className="px-4 py-4"><button type="button" onClick={() => window.location.href = '/business-management?tab=sales-management&view=receivables'} className="rounded-lg border border-slate-700 px-2 py-1 text-xs hover:border-blue-500">{paymentLabel(row.payment_status)}{row.posted_receipt_amount > 0 ? ` · ${orderMoney(row, row.posted_receipt_amount)}` : ''}</button></td><td className="px-4 py-4">{row.due_date || <span className="text-slate-500">미설정</span>}</td><td className="px-4 py-4 whitespace-nowrap"><button type="button" onClick={() => printOrder(row)} className="mr-3 underline">출력</button>{kind === 'export' ? <button type="button" onClick={() => window.location.href = `/sales-management/export/documents?edit=${encodeURIComponent(String(row.source_reference))}`} className="rounded-lg border border-blue-400/50 bg-blue-500/10 px-3 py-1.5 text-xs font-black text-blue-300 hover:bg-blue-500/20">수출서류 수정</button> : <><button type="button" onClick={() => openEdit(row)} disabled={row.financial_locked} className="mr-3 underline disabled:opacity-30">수정</button><button type="button" onClick={() => { if (row.financial_locked) { setError('실제 입금이 등록된 판매건은 먼저 입금을 취소해야 삭제할 수 있습니다.'); return } setCancelOrderId(row.id); setCancelReason('거래명세표 목록에서 삭제') }} disabled={row.financial_locked} className="underline disabled:opacity-30">삭제</button></>}</td></tr>
    })}{!visibleOrders.length && <tr><td colSpan={10} className="px-5 py-14 text-center text-slate-500">조회 월에 등록된 판매가 없습니다.</td></tr>}</tbody></table></div></section>
  </div>

  {modal && <Modal title={editingId ? '제품 판매 수정' : '제품 판매등록'} onClose={() => setModal(false)}><div className="grid gap-4 md:grid-cols-4"><Field label="판매일"><input type="date" value={draft.sale_date} onChange={(e) => setDraft((current) => ({ ...current, sale_date: e.target.value }))} className={inputClass} /></Field><Field label="거래처"><select value={draft.client_id} onChange={(e) => changeClient(e.target.value)} className={inputClass}><option value="">선택</option>{clients.filter((row) => row.status === 'active').map((row) => <option key={row.id} value={row.id}>{row.company_name}</option>)}</select></Field><Field label="상태"><select value={draft.status} onChange={(e) => setDraft((current) => ({ ...current, status: e.target.value as 'draft' | 'confirmed' }))} className={inputClass}><option value="confirmed">확정</option><option value="draft">작성중</option></select></Field><Field label="부가세율(%)"><input type="number" min="0" max="100" value={draft.vat_rate} onChange={(e) => setDraft((current) => ({ ...current, vat_rate: e.target.value }))} className={inputClass} /></Field></div><div className="mt-4"><Field label="비고"><input value={draft.note} onChange={(e) => setDraft((current) => ({ ...current, note: e.target.value }))} className={inputClass} /></Field></div>
    <div className="mt-6 overflow-hidden rounded-2xl border border-slate-700"><div className="flex items-center justify-between bg-slate-800 px-4 py-3"><b>판매 품목</b><button type="button" onClick={addItem} className={secondaryButton}>+ 품목 추가</button></div><div className="overflow-x-auto"><table className="min-w-[1050px] w-full text-sm"><thead className="bg-slate-900 text-slate-500"><tr><th className="px-3 py-3 text-left">제품 · 판매규격</th><th className="px-3 py-3 text-left">수량</th><th className="px-3 py-3 text-left">단위</th><th className="px-3 py-3 text-left">적용단가</th><th className="px-3 py-3 text-left">MOQ</th><th className="px-3 py-3 text-left">환산 kg</th><th className="px-3 py-3 text-left">공급가액</th><th className="px-3 py-3"></th></tr></thead><tbody>{draft.items.map((item, index) => { const variant = variantById.get(item.sales_variant_id); const p = pricing(draft.client_id, item.sales_variant_id); return <tr key={index} className="border-t border-slate-800"><td className="px-3 py-3"><select value={item.sales_variant_id} onChange={(e) => selectVariant(index, e.target.value)} className={`${inputClass} min-w-[320px]`}><option value="">판매규격 선택</option>{variants.map((row) => <option key={row.id} value={row.id}>{row.product_name} · {row.variant_name} · {unitLabel(row.sales_unit)}</option>)}</select></td><td className="px-3 py-3"><input type="number" min="0" step="0.001" value={item.quantity} onChange={(e) => patchItem(index, { quantity: e.target.value })} className={`${inputClass} w-28`} /></td><td className="px-3 py-3 font-bold">{variant ? unitLabel(variant.sales_unit) : '-'}</td><td className="px-3 py-3"><input type="number" min="0" value={item.unit_price} onChange={(e) => patchItem(index, { unit_price: e.target.value })} className={`${inputClass} w-36`} /><div className="mt-1 text-[10px] text-slate-500">기준 {money(p.price)}</div></td><td className="px-3 py-3">{variant ? `${qty(p.moq)} ${unitLabel(variant.sales_unit)}` : '-'}</td><td className="px-3 py-3">{qty(convertedKg(item))}kg</td><td className="px-3 py-3 font-black text-emerald-200">{money(lineAmount(item))}</td><td className="px-3 py-3"><button type="button" onClick={() => removeItem(index)} className="text-red-300 underline">삭제</button></td></tr> })}{!draft.items.length && <tr><td colSpan={8} className="px-5 py-10 text-center text-slate-500">품목을 추가해 주세요.</td></tr>}</tbody></table></div></div>
    <div className="mt-5 grid gap-3 sm:grid-cols-3"><Summary label="공급가액" value={money(draftSupply)} /><Summary label="부가세" value={money(draftVat)} /><Summary label="합계" value={money(draftSupply + draftVat)} tone="success" /></div><div className="mt-6 flex justify-end gap-3"><button type="button" onClick={() => setModal(false)} className={secondaryButton}>취소</button><button type="button" disabled={saving} onClick={() => void saveOrder()} className={primaryButton}>{saving ? '저장 중...' : '저장'}</button></div>
  </Modal>}

  {otherModal && <Modal title={otherEditingId ? '기타 상품 판매 수정' : '기타 상품 판매'} onClose={() => setOtherModal(false)}><div className="grid gap-4 md:grid-cols-3"><Field label="판매일"><input type="date" value={otherDraft.sale_date} onChange={(e) => setOtherDraft((current) => ({ ...current, sale_date: e.target.value }))} className={inputClass} /></Field><Field label="거래처"><input value={otherDraft.customer_name} onChange={(e) => setOtherDraft((current) => ({ ...current, customer_name: e.target.value }))} placeholder="거래처 직접 입력" autoComplete="off" className={inputClass} /></Field><Field label="VAT"><select value={otherDraft.vat_applied ? 'applied' : 'none'} onChange={(e) => setOtherDraft((current) => ({ ...current, vat_applied: e.target.value === 'applied' }))} className={inputClass}><option value="applied">VAT 적용</option><option value="none">VAT 미적용</option></select></Field></div><div className="mt-4"><Field label="비고"><input value={otherDraft.note} onChange={(e) => setOtherDraft((current) => ({ ...current, note: e.target.value }))} className={inputClass} /></Field></div>
    <div className="mt-6 overflow-hidden rounded-2xl border border-slate-700"><div className="flex items-center justify-between bg-slate-800 px-4 py-3"><div><b>상품 입력</b><div className="mt-1 text-xs text-slate-400">제품 마스터·거래처 마스터·재고와 연결되지 않는 독립 판매입니다.</div></div><button type="button" onClick={addOtherItem} className={secondaryButton}>+ 상품 추가</button></div><div className="overflow-x-auto"><table className="min-w-[900px] w-full text-sm"><thead className="bg-slate-900 text-slate-500"><tr><th className="px-3 py-3 text-left">상품명</th><th className="px-3 py-3 text-left">수량</th><th className="px-3 py-3 text-left">단위</th><th className="px-3 py-3 text-left">단가</th><th className="px-3 py-3 text-left">공급가액</th><th className="w-[92px] px-3 py-3"></th></tr></thead><tbody>{otherDraft.items.map((item, index) => <tr key={index} className="border-t border-slate-800"><td className="px-3 py-3"><input value={item.product_name} onChange={(e) => patchOtherItem(index, { product_name: e.target.value })} placeholder="상품명 직접 입력" className={`${inputClass} min-w-[260px]`} /></td><td className="px-3 py-3"><input type="number" min="0" step="0.001" value={item.quantity} onChange={(e) => patchOtherItem(index, { quantity: e.target.value })} className={`${inputClass} w-28`} /></td><td className="px-3 py-3"><input value={item.unit} onChange={(e) => patchOtherItem(index, { unit: e.target.value })} placeholder="개, BOX 등" className={`${inputClass} w-28`} /></td><td className="px-3 py-3"><input type="number" min="0" value={item.unit_price} onChange={(e) => patchOtherItem(index, { unit_price: e.target.value })} className={`${inputClass} w-36`} /></td><td className="px-3 py-3"><input value={money(otherLineAmount(item))} readOnly className={`${inputClass} w-40 font-black text-emerald-200`} /></td><td className="px-3 py-3 text-center"><button type="button" onClick={() => removeOtherItem(index)} className={redButton}>삭제</button></td></tr>)}{!otherDraft.items.length && <tr><td colSpan={6} className="px-5 py-10 text-center text-slate-500">상품을 추가해 주세요.</td></tr>}</tbody></table></div></div>
    <div className="mt-5 grid gap-3 sm:grid-cols-3"><Summary label="공급가액" value={money(otherSupply)} /><Summary label="부가세" value={money(otherVat)} /><Summary label="합계" value={money(otherSupply + otherVat)} tone="success" /></div><div className="mt-6 flex justify-end gap-3"><button type="button" onClick={() => setOtherModal(false)} className={secondaryButton}>취소</button><button type="button" disabled={saving} onClick={() => void saveOtherOrder()} className={primaryButton}>{saving ? '저장 중...' : '저장'}</button></div>
  </Modal>}

  {cancelOrderId && <Modal title="거래명세표 삭제" onClose={() => { setCancelOrderId(''); setCancelReason('') }}><p className="mb-5 text-sm leading-6 text-slate-300">목록에서는 삭제되며 판매 이력은 보존됩니다. 실제 입금이 있는 건은 삭제할 수 없습니다.</p><Field label="삭제 사유"><input value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} className={inputClass} /></Field><div className="mt-6 flex justify-end gap-3"><button type="button" onClick={() => { setCancelOrderId(''); setCancelReason('') }} className={secondaryButton}>닫기</button><button type="button" disabled={saving} onClick={() => void cancelOrder()} className="rounded-xl bg-red-600 px-5 py-2.5 text-sm font-black text-white hover:bg-red-500 disabled:opacity-40">삭제</button></div></Modal>}
</main>
}
