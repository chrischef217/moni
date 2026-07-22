'use client'

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'

type View = 'clients' | 'sales' | 'statements' | 'statistics' | 'tax-invoices'

type Client = {
  id: string
  company_name: string
  business_registration_number?: string | null
  representative_name?: string | null
  address?: string | null
  contact_name?: string | null
  phone?: string | null
  email?: string | null
  payment_terms?: string | null
  assigned_person_id?: string | null
  status: 'active' | 'inactive'
  note?: string | null
}

type Person = {
  id: string
  name: string
  person_type: string
  status: string
  commission_rate: number
}

type Product = {
  id: string
  product_name: string
  product_code?: string | null
  product_spec?: string | null
  weight_g?: number | null
}

type OrderItem = {
  id?: string
  product_id?: string | null
  product_name: string
  specification?: string | null
  quantity: number
  unit: string
  unit_price: number
  supply_amount?: number
}

type Order = {
  id: string
  statement_number: string
  sale_date: string
  client_id: string
  assigned_person_id?: string | null
  status: 'draft' | 'confirmed' | 'cancelled'
  payment_status: 'unpaid' | 'partial' | 'paid'
  vat_rate: number
  supply_amount: number
  vat_amount: number
  total_amount: number
  note?: string | null
  items: OrderItem[]
}

type Statistics = {
  summary: {
    order_count: number
    supply_amount: number
    vat_amount: number
    total_amount: number
    unpaid_amount: number
  }
  by_client: Array<{ client_id: string; client_name: string; order_count: number; total_amount: number }>
  by_person: Array<{ person_id: string; person_name: string; order_count: number; total_amount: number }>
  by_product: Array<{ product_id: string; product_name: string; quantity: number; total_amount: number }>
}

type Payload = {
  ok: boolean
  error?: string
  range: { month: string; start: string; end: string }
  clients: Client[]
  people: Person[]
  products: Product[]
  orders: Order[]
  statistics: Statistics
}

type ClientForm = Omit<Client, 'id'>

type OrderForm = {
  sale_date: string
  client_id: string
  assigned_person_id: string
  status: 'draft' | 'confirmed'
  payment_status: 'unpaid' | 'partial' | 'paid'
  vat_rate: number
  note: string
  items: OrderItem[]
}

const inputClass = 'mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-blue-500'
const secondaryButton = 'rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-200 hover:border-slate-500 hover:text-white'
const primaryButton = 'rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50'

function todayKst() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date())
}

function thisMonth() {
  return todayKst().slice(0, 7)
}

function money(value: unknown) {
  return `${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 }).format(Math.round(Number(value ?? 0)))}원`
}

function quantity(value: unknown) {
  return new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 3 }).format(Number(value ?? 0))
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function emptyClient(): ClientForm {
  return {
    company_name: '', business_registration_number: '', representative_name: '', address: '',
    contact_name: '', phone: '', email: '', payment_terms: '', assigned_person_id: '',
    status: 'active', note: '',
  }
}

function emptyItem(): OrderItem {
  return { product_id: '', product_name: '', specification: '', quantity: 1, unit: 'kg', unit_price: 0 }
}

function emptyOrder(): OrderForm {
  return {
    sale_date: todayKst(), client_id: '', assigned_person_id: '', status: 'confirmed',
    payment_status: 'unpaid', vat_rate: 10, note: '', items: [emptyItem()],
  }
}

function paymentLabel(value: Order['payment_status']) {
  if (value === 'paid') return '입금완료'
  if (value === 'partial') return '일부입금'
  return '미입금'
}

function statusLabel(value: Order['status']) {
  if (value === 'draft') return '작성중'
  if (value === 'cancelled') return '취소'
  return '확정'
}

function Field({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return <label className={`block text-sm text-slate-300 ${className}`}><span>{label}</span>{children}</label>
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/75 p-4">
      <div className="max-h-[94vh] w-full max-w-6xl overflow-hidden rounded-3xl border border-slate-700 bg-[#0f1b2d] shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-700 px-6 py-4">
          <h2 className="text-xl font-black text-white">{title}</h2>
          <button type="button" onClick={onClose} className={secondaryButton}>닫기</button>
        </div>
        <div className="max-h-[calc(94vh-78px)] overflow-y-auto p-6">{children}</div>
      </div>
    </div>
  )
}

function SummaryCard({ label, value, note, tone = 'blue' }: { label: string; value: string; note?: string; tone?: 'blue' | 'green' | 'amber' | 'red' }) {
  const toneClass = tone === 'green' ? 'border-green-500/30 bg-green-500/10 text-green-200'
    : tone === 'amber' ? 'border-amber-500/30 bg-amber-500/10 text-amber-200'
      : tone === 'red' ? 'border-red-500/30 bg-red-500/10 text-red-200'
        : 'border-blue-500/30 bg-blue-500/10 text-blue-200'
  return <div className={`rounded-2xl border p-5 ${toneClass}`}><div className="text-sm opacity-80">{label}</div><div className="mt-2 text-2xl font-black">{value}</div>{note && <div className="mt-1 text-xs opacity-70">{note}</div>}</div>
}

export default function SalesManagementModule({ initialView = 'clients' }: { initialView?: string }) {
  const router = useRouter()
  const safeInitial = (['clients', 'sales', 'statements', 'statistics', 'tax-invoices'].includes(initialView) ? initialView : 'clients') as View
  const [view, setView] = useState<View>(safeInitial)
  const [month, setMonth] = useState(thisMonth())
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [clientModalOpen, setClientModalOpen] = useState(false)
  const [clientEditingId, setClientEditingId] = useState('')
  const [clientForm, setClientForm] = useState<ClientForm>(emptyClient())
  const [orderModalOpen, setOrderModalOpen] = useState(false)
  const [orderEditingId, setOrderEditingId] = useState('')
  const [orderForm, setOrderForm] = useState<OrderForm>(emptyOrder())

  useEffect(() => setView(safeInitial), [safeInitial])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`/api/moni/sales-management?month=${month}&_=${Date.now()}`, { cache: 'no-store' })
      const payload = (await response.json()) as Payload
      if (!response.ok || !payload.ok) throw new Error(payload.error || '판매관리 데이터를 불러오지 못했습니다.')
      setData(payload)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '판매관리 데이터를 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [month])

  useEffect(() => { void load() }, [load])

  const clients = data?.clients ?? []
  const activeClients = useMemo(() => clients.filter((row) => row.status === 'active'), [clients])
  const salesPeople = useMemo(() => (data?.people ?? []).filter((row) => row.person_type === 'sales_freelancer' && row.status === 'active'), [data?.people])
  const products = data?.products ?? []
  const orders = data?.orders ?? []
  const clientById = useMemo(() => new Map(clients.map((row) => [row.id, row])), [clients])
  const personById = useMemo(() => new Map((data?.people ?? []).map((row) => [row.id, row])), [data?.people])
  const productById = useMemo(() => new Map(products.map((row) => [row.id, row])), [products])

  const orderTotals = useMemo(() => {
    const supply = orderForm.items.reduce((sum, item) => sum + Math.max(0, Number(item.quantity || 0)) * Math.max(0, Number(item.unit_price || 0)), 0)
    const vat = supply * (Math.max(0, Number(orderForm.vat_rate || 0)) / 100)
    return { supply, vat, total: supply + vat }
  }, [orderForm.items, orderForm.vat_rate])

  function navigate(nextView: View) {
    setView(nextView)
    router.push(`/sales-management?view=${nextView}`)
  }

  function openClient(row?: Client) {
    setError('')
    setClientEditingId(row?.id ?? '')
    setClientForm(row ? {
      company_name: row.company_name,
      business_registration_number: row.business_registration_number ?? '',
      representative_name: row.representative_name ?? '',
      address: row.address ?? '',
      contact_name: row.contact_name ?? '',
      phone: row.phone ?? '',
      email: row.email ?? '',
      payment_terms: row.payment_terms ?? '',
      assigned_person_id: row.assigned_person_id ?? '',
      status: row.status,
      note: row.note ?? '',
    } : emptyClient())
    setClientModalOpen(true)
  }

  async function saveClient() {
    if (!clientForm.company_name.trim()) return setError('거래처명을 입력해 주세요.')
    setSaving(true)
    setError('')
    try {
      const response = await fetch('/api/moni/sales-management', {
        method: clientEditingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity: 'client', id: clientEditingId || undefined, data: clientForm }),
      })
      const result = await response.json()
      if (!response.ok || !result.ok) throw new Error(result.error || '거래처 저장에 실패했습니다.')
      setClientModalOpen(false)
      setNotice(clientEditingId ? '거래처 정보를 수정했습니다.' : '거래처를 등록했습니다.')
      await load()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '거래처 저장에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  async function toggleClient(row: Client) {
    setSaving(true)
    setError('')
    try {
      const response = await fetch('/api/moni/sales-management', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity: 'client', id: row.id, data: { ...row, status: row.status === 'active' ? 'inactive' : 'active' } }),
      })
      const result = await response.json()
      if (!response.ok || !result.ok) throw new Error(result.error || '거래처 상태 변경에 실패했습니다.')
      setNotice(row.status === 'active' ? '거래처를 거래중지 처리했습니다.' : '거래처를 재활성했습니다.')
      await load()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '거래처 상태 변경에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  function openOrder(row?: Order) {
    setError('')
    setOrderEditingId(row?.id ?? '')
    setOrderForm(row ? {
      sale_date: row.sale_date,
      client_id: row.client_id,
      assigned_person_id: row.assigned_person_id ?? '',
      status: row.status === 'draft' ? 'draft' : 'confirmed',
      payment_status: row.payment_status,
      vat_rate: Number(row.vat_rate ?? 10),
      note: row.note ?? '',
      items: row.items.map((item) => ({
        product_id: item.product_id ?? '', product_name: item.product_name,
        specification: item.specification ?? '', quantity: Number(item.quantity),
        unit: item.unit || 'kg', unit_price: Number(item.unit_price),
      })),
    } : emptyOrder())
    setOrderModalOpen(true)
  }

  function selectClient(clientId: string) {
    const client = clientById.get(clientId)
    setOrderForm((current) => ({ ...current, client_id: clientId, assigned_person_id: client?.assigned_person_id ?? current.assigned_person_id }))
  }

  function changeItem(index: number, patch: Partial<OrderItem>) {
    setOrderForm((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item),
    }))
  }

  function selectProduct(index: number, productId: string) {
    const product = productById.get(productId)
    changeItem(index, {
      product_id: productId,
      product_name: product?.product_name ?? '',
      specification: product?.product_spec || (product?.weight_g ? `${quantity(product.weight_g)}g` : ''),
    })
  }

  function addItem() {
    setOrderForm((current) => ({ ...current, items: [...current.items, emptyItem()] }))
  }

  function removeItem(index: number) {
    setOrderForm((current) => ({ ...current, items: current.items.length === 1 ? current.items : current.items.filter((_, itemIndex) => itemIndex !== index) }))
  }

  async function saveOrder() {
    if (!orderForm.client_id) return setError('거래처를 선택해 주세요.')
    if (!orderForm.items.length || orderForm.items.some((item) => !item.product_name || Number(item.quantity) <= 0)) return setError('판매 품목과 수량을 확인해 주세요.')
    setSaving(true)
    setError('')
    try {
      const response = await fetch('/api/moni/sales-management', {
        method: orderEditingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity: 'order', id: orderEditingId || undefined, data: orderForm }),
      })
      const result = await response.json()
      if (!response.ok || !result.ok) throw new Error(result.error || '판매정보 저장에 실패했습니다.')
      setOrderModalOpen(false)
      setNotice(orderEditingId ? '판매정보를 수정했습니다.' : `판매를 등록했습니다. 거래명세표 번호: ${result.order?.statement_number ?? ''}`)
      await load()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '판매정보 저장에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  async function cancelOrder(row: Order) {
    if (!window.confirm(`${row.statement_number} 판매 건을 취소 처리하시겠습니까?`)) return
    setSaving(true)
    setError('')
    try {
      const response = await fetch('/api/moni/sales-management', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity: 'order', id: row.id, action: 'cancel', data: {} }),
      })
      const result = await response.json()
      if (!response.ok || !result.ok) throw new Error(result.error || '판매 취소에 실패했습니다.')
      setNotice('판매 건을 취소 처리했습니다. 기록은 삭제하지 않았습니다.')
      await load()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '판매 취소에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  async function updatePayment(row: Order, paymentStatus: Order['payment_status']) {
    setSaving(true)
    setError('')
    try {
      const response = await fetch('/api/moni/sales-management', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity: 'order', id: row.id, data: { ...row, payment_status: paymentStatus } }),
      })
      const result = await response.json()
      if (!response.ok || !result.ok) throw new Error(result.error || '입금상태 변경에 실패했습니다.')
      setNotice('입금상태를 변경했습니다.')
      await load()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '입금상태 변경에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  function printStatement(row: Order) {
    if (row.status === 'cancelled') return setError('취소된 판매 건은 거래명세표를 출력할 수 없습니다.')
    const client = clientById.get(row.client_id)
    const itemRows = row.items.map((item, index) => `
      <tr><td>${index + 1}</td><td class="left">${escapeHtml(item.product_name)}</td><td>${escapeHtml(item.specification || '-')}</td><td>${escapeHtml(quantity(item.quantity))}</td><td>${escapeHtml(item.unit)}</td><td class="money">${escapeHtml(money(item.unit_price))}</td><td class="money">${escapeHtml(money(item.supply_amount ?? Number(item.quantity) * Number(item.unit_price)))}</td></tr>
    `).join('')
    const popup = window.open('', '_blank', 'width=1100,height=850')
    if (!popup) return setError('팝업이 차단되어 거래명세표를 열지 못했습니다.')
    popup.document.write(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>거래명세표 ${escapeHtml(row.statement_number)}</title><style>
      @page{size:A4 portrait;margin:12mm}*{box-sizing:border-box}body{font-family:Arial,'Noto Sans KR',sans-serif;color:#111;margin:0}.page{width:100%;padding:3mm}h1{text-align:center;font-size:28px;letter-spacing:8px;margin:0 0 18px}.meta{display:flex;justify-content:space-between;font-size:12px;margin-bottom:8px}.party{width:100%;border-collapse:collapse;margin-bottom:14px;font-size:12px}.party th,.party td{border:1px solid #222;padding:7px}.party th{background:#f1f5f9;width:12%}.items{width:100%;border-collapse:collapse;font-size:11px}.items th,.items td{border:1px solid #222;padding:7px;text-align:center}.items th{background:#e2e8f0}.items .left{text-align:left}.items .money{text-align:right}.totals{margin-left:auto;margin-top:12px;width:45%;border-collapse:collapse;font-size:13px}.totals th,.totals td{border:1px solid #222;padding:8px}.totals th{background:#f1f5f9;text-align:left}.totals td{text-align:right;font-weight:bold}.note{margin-top:14px;border:1px solid #222;min-height:55px;padding:8px;font-size:12px}.footer{display:flex;justify-content:space-between;margin-top:42px;font-size:12px}
    </style></head><body><div class="page"><h1>거 래 명 세 표</h1><div class="meta"><span>거래명세표 번호: <b>${escapeHtml(row.statement_number)}</b></span><span>거래일자: <b>${escapeHtml(row.sale_date)}</b></span></div>
      <table class="party"><tr><th>공급자</th><td><b>두배</b></td><th>사업자번호</th><td>123-38-14284</td></tr><tr><th>주소</th><td colspan="3">경기도 여주시 점동면 청안로 154-24 외 1필지</td></tr><tr><th>공급받는 자</th><td><b>${escapeHtml(client?.company_name || '-')}</b></td><th>사업자번호</th><td>${escapeHtml(client?.business_registration_number || '-')}</td></tr><tr><th>대표자</th><td>${escapeHtml(client?.representative_name || '-')}</td><th>담당자</th><td>${escapeHtml(client?.contact_name || '-')}</td></tr><tr><th>주소</th><td colspan="3">${escapeHtml(client?.address || '-')}</td></tr></table>
      <table class="items"><thead><tr><th>No.</th><th>품목</th><th>규격</th><th>수량</th><th>단위</th><th>단가</th><th>공급가액</th></tr></thead><tbody>${itemRows}</tbody></table>
      <table class="totals"><tr><th>공급가액</th><td>${escapeHtml(money(row.supply_amount))}</td></tr><tr><th>부가세 (${escapeHtml(row.vat_rate)}%)</th><td>${escapeHtml(money(row.vat_amount))}</td></tr><tr><th>합계금액</th><td>${escapeHtml(money(row.total_amount))}</td></tr></table>
      <div class="note"><b>비고</b><br>${escapeHtml(row.note || '')}</div><div class="footer"><span>공급자 확인: __________________</span><span>공급받는 자 확인: __________________</span></div></div><script>window.onload=()=>window.print()<\/script></body></html>`)
    popup.document.close()
  }

  const viewButton = (key: View, label: string) => (
    <button type="button" onClick={() => navigate(key)} className={`rounded-xl px-4 py-2.5 text-sm font-bold ${view === key ? 'bg-blue-600 text-white' : 'border border-slate-700 text-slate-300 hover:border-slate-500'}`}>{label}</button>
  )

  function renderClients() {
    return <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-3"><SummaryCard label="전체 거래처" value={`${clients.length}곳`} /><SummaryCard label="거래 중" value={`${activeClients.length}곳`} tone="green" /><SummaryCard label="담당 미지정" value={`${activeClients.filter((row) => !row.assigned_person_id).length}곳`} tone="amber" /></div>
      <section className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-900/60"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700 p-5"><div><h2 className="text-xl font-black">거래처 관리</h2><p className="mt-1 text-sm text-slate-400">영업관리 고객사와 동일한 거래처 정보를 사용하며 담당 프리랜서를 지정합니다.</p></div><button type="button" onClick={() => openClient()} className={primaryButton}>+ 거래처 등록</button></div>
        {!clients.length ? <div className="p-10 text-center text-slate-400">등록된 거래처가 없습니다.</div> : <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-slate-800 text-slate-300"><tr>{['상태','거래처','사업자번호','대표자·담당자','담당 프리랜서','결제조건','연락처','관리'].map((label) => <th key={label} className="whitespace-nowrap px-4 py-3">{label}</th>)}</tr></thead><tbody>{clients.map((row) => <tr key={row.id} className="border-t border-slate-800"><td className="px-4 py-3"><span className={`rounded-md px-2 py-1 font-bold ${row.status === 'active' ? 'bg-green-500/15 text-green-300' : 'bg-slate-700 text-slate-400'}`}>{row.status === 'active' ? '거래 중' : '거래중지'}</span></td><td className="px-4 py-3 font-bold text-white">{row.company_name}</td><td className="whitespace-nowrap px-4 py-3">{row.business_registration_number || '-'}</td><td className="px-4 py-3">{row.representative_name || '-'}<div className="text-xs text-slate-500">{row.contact_name || '-'}</div></td><td className="px-4 py-3">{personById.get(row.assigned_person_id || '')?.name || '-'}</td><td className="px-4 py-3">{row.payment_terms || '-'}</td><td className="px-4 py-3">{row.phone || row.email || '-'}</td><td className="whitespace-nowrap px-4 py-3"><button onClick={() => openClient(row)} className="mr-3 underline">수정</button><button disabled={saving} onClick={() => void toggleClient(row)} className="underline">{row.status === 'active' ? '거래중지' : '재활성'}</button></td></tr>)}</tbody></table></div>}
      </section>
    </div>
  }

  function renderOrders(showPrintOnly = false) {
    return <div className="space-y-5">
      {!showPrintOnly && <div className="grid gap-3 md:grid-cols-4"><SummaryCard label="이번 달 판매" value={`${data?.statistics.summary.order_count ?? 0}건`} /><SummaryCard label="공급가액" value={money(data?.statistics.summary.supply_amount)} tone="green" /><SummaryCard label="합계 매출" value={money(data?.statistics.summary.total_amount)} /><SummaryCard label="미입금" value={money(data?.statistics.summary.unpaid_amount)} tone="red" /></div>}
      <section className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-900/60"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700 p-5"><div><h2 className="text-xl font-black">{showPrintOnly ? '거래명세표' : '판매 등록 및 내역'}</h2><p className="mt-1 text-sm text-slate-400">{showPrintOnly ? '판매 건별 거래명세표를 출력하거나 PDF로 저장합니다.' : '판매일자·거래처·담당 프리랜서·제품·수량·단가를 등록합니다.'}</p></div>{!showPrintOnly && <button type="button" onClick={() => openOrder()} className={primaryButton}>+ 판매 등록</button>}</div>
        {!orders.length ? <div className="p-10 text-center text-slate-400">조회 월에 등록된 판매가 없습니다.</div> : <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-slate-800 text-slate-300"><tr>{['상태','거래일','명세표 번호','거래처','담당 프리랜서','공급가액','부가세','합계','입금상태','관리'].map((label) => <th key={label} className="whitespace-nowrap px-4 py-3">{label}</th>)}</tr></thead><tbody>{orders.map((row) => <tr key={row.id} className={`border-t border-slate-800 ${row.status === 'cancelled' ? 'opacity-45' : ''}`}><td className="px-4 py-3">{statusLabel(row.status)}</td><td className="whitespace-nowrap px-4 py-3">{row.sale_date}</td><td className="whitespace-nowrap px-4 py-3 font-bold text-blue-300">{row.statement_number}</td><td className="px-4 py-3 font-bold">{clientById.get(row.client_id)?.company_name || '-'}</td><td className="px-4 py-3">{personById.get(row.assigned_person_id || '')?.name || '-'}</td><td className="whitespace-nowrap px-4 py-3">{money(row.supply_amount)}</td><td className="whitespace-nowrap px-4 py-3">{money(row.vat_amount)}</td><td className="whitespace-nowrap px-4 py-3 font-bold text-green-300">{money(row.total_amount)}</td><td className="px-4 py-3">{row.status === 'cancelled' ? '-' : <select value={row.payment_status} disabled={saving} onChange={(event) => void updatePayment(row, event.target.value as Order['payment_status'])} className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1"><option value="unpaid">미입금</option><option value="partial">일부입금</option><option value="paid">입금완료</option></select>}</td><td className="whitespace-nowrap px-4 py-3"><button disabled={row.status === 'cancelled'} onClick={() => printStatement(row)} className="mr-3 underline">출력</button>{!showPrintOnly && <><button disabled={row.status === 'cancelled'} onClick={() => openOrder(row)} className="mr-3 underline">수정</button><button disabled={row.status === 'cancelled' || saving} onClick={() => void cancelOrder(row)} className="underline">취소</button></>}</td></tr>)}</tbody></table></div>}
      </section>
    </div>
  }

  function renderStatistics() {
    const stats = data?.statistics
    return <div className="space-y-5"><div className="grid gap-3 md:grid-cols-4"><SummaryCard label="판매 건수" value={`${stats?.summary.order_count ?? 0}건`} /><SummaryCard label="공급가액" value={money(stats?.summary.supply_amount)} tone="green" /><SummaryCard label="부가세" value={money(stats?.summary.vat_amount)} tone="amber" /><SummaryCard label="미입금" value={money(stats?.summary.unpaid_amount)} tone="red" /></div>
      <div className="grid gap-5 xl:grid-cols-3">{[
        { title: '거래처별 매출', rows: stats?.by_client ?? [], columns: ['client_name','order_count','total_amount'], labels: ['거래처','건수','매출'] },
        { title: '제품별 판매', rows: stats?.by_product ?? [], columns: ['product_name','quantity','total_amount'], labels: ['제품','수량','공급가액'] },
        { title: '프리랜서별 담당 매출', rows: stats?.by_person ?? [], columns: ['person_name','order_count','total_amount'], labels: ['담당자','건수','매출'] },
      ].map((group) => <section key={group.title} className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-900/60"><div className="border-b border-slate-700 p-5"><h2 className="text-lg font-black">{group.title}</h2></div><div className="overflow-x-auto"><table className="min-w-full text-sm"><thead className="bg-slate-800 text-slate-300"><tr>{group.labels.map((label) => <th key={label} className="px-4 py-3 text-left">{label}</th>)}</tr></thead><tbody>{group.rows.slice(0, 20).map((raw, index) => { const row = raw as unknown as Record<string, unknown>; return <tr key={index} className="border-t border-slate-800"><td className="px-4 py-3 font-bold">{String(row[group.columns[0]] ?? '-')}</td><td className="px-4 py-3">{group.columns[1] === 'quantity' ? quantity(row[group.columns[1]]) : `${quantity(row[group.columns[1]])}건`}</td><td className="whitespace-nowrap px-4 py-3 text-green-300">{money(row[group.columns[2]])}</td></tr>})}</tbody></table></div></section>)}</div>
    </div>
  }

  return (
    <main className="min-h-screen bg-[#071426] px-4 py-6 text-slate-100 md:px-8">
      <div className="mx-auto max-w-[1600px] space-y-5">
        <header className="rounded-3xl border border-slate-700 bg-[#0b1b30] p-6 shadow-xl"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm font-bold text-blue-300">MONI SALES MANAGEMENT</p><h1 className="mt-1 text-3xl font-black">판매관리</h1><p className="mt-2 text-sm text-slate-400">거래처 등록부터 판매·거래명세표·판매통계까지 한곳에서 관리합니다.</p></div><div className="flex items-center gap-2"><label className="text-sm text-slate-400">조회 월</label><input type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white" /><button type="button" onClick={() => void load()} className={secondaryButton}>새로고침</button></div></div>
          <div className="mt-5 flex flex-wrap gap-2">{viewButton('clients','거래처 관리')}{viewButton('sales','판매 등록')}{viewButton('statements','거래명세표')}{viewButton('statistics','판매 통계')}{viewButton('tax-invoices','세금계산서')}</div>
        </header>

        {error && <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-red-200">{error}</div>}
        {notice && <div className="rounded-2xl border border-green-500/40 bg-green-500/10 p-4 text-green-200">{notice}</div>}
        {loading ? <div className="rounded-2xl border border-slate-700 p-16 text-center text-slate-400">판매관리 데이터를 불러오는 중입니다.</div> : view === 'clients' ? renderClients() : view === 'sales' ? renderOrders(false) : view === 'statements' ? renderOrders(true) : view === 'statistics' ? renderStatistics() : <section className="rounded-3xl border border-dashed border-slate-600 bg-slate-900/40 p-16 text-center"><div className="text-5xl">🧾</div><h2 className="mt-5 text-2xl font-black">세금계산서</h2><p className="mt-3 text-slate-400">전자세금계산서 기능 준비 중</p><p className="mt-1 text-sm text-slate-500">추후 인증된 전자세금계산서 API 연동을 검토합니다. 현재는 메뉴만 등록되어 있습니다.</p></section>}
      </div>

      {clientModalOpen && <Modal title={clientEditingId ? '거래처 수정' : '거래처 등록'} onClose={() => setClientModalOpen(false)}><div className="grid gap-4 md:grid-cols-2"><Field label="거래처명 *"><input value={clientForm.company_name} onChange={(event) => setClientForm((current) => ({ ...current, company_name: event.target.value }))} className={inputClass} /></Field><Field label="사업자등록번호"><input value={clientForm.business_registration_number ?? ''} onChange={(event) => setClientForm((current) => ({ ...current, business_registration_number: event.target.value }))} className={inputClass} /></Field><Field label="대표자"><input value={clientForm.representative_name ?? ''} onChange={(event) => setClientForm((current) => ({ ...current, representative_name: event.target.value }))} className={inputClass} /></Field><Field label="거래처 담당자"><input value={clientForm.contact_name ?? ''} onChange={(event) => setClientForm((current) => ({ ...current, contact_name: event.target.value }))} className={inputClass} /></Field><Field label="전화번호"><input value={clientForm.phone ?? ''} onChange={(event) => setClientForm((current) => ({ ...current, phone: event.target.value }))} className={inputClass} /></Field><Field label="이메일"><input type="email" value={clientForm.email ?? ''} onChange={(event) => setClientForm((current) => ({ ...current, email: event.target.value }))} className={inputClass} /></Field><Field label="담당 영업 프리랜서"><select value={clientForm.assigned_person_id ?? ''} onChange={(event) => setClientForm((current) => ({ ...current, assigned_person_id: event.target.value }))} className={inputClass}><option value="">미지정</option>{salesPeople.map((row) => <option key={row.id} value={row.id}>{row.name} · 커미션 {row.commission_rate}%</option>)}</select></Field><Field label="결제조건"><input placeholder="예: 월말 마감 후 익월 10일" value={clientForm.payment_terms ?? ''} onChange={(event) => setClientForm((current) => ({ ...current, payment_terms: event.target.value }))} className={inputClass} /></Field><Field label="주소" className="md:col-span-2"><input value={clientForm.address ?? ''} onChange={(event) => setClientForm((current) => ({ ...current, address: event.target.value }))} className={inputClass} /></Field><Field label="비고" className="md:col-span-2"><textarea rows={3} value={clientForm.note ?? ''} onChange={(event) => setClientForm((current) => ({ ...current, note: event.target.value }))} className={inputClass} /></Field></div><div className="mt-6 flex justify-end gap-3"><button type="button" onClick={() => setClientModalOpen(false)} className={secondaryButton}>취소</button><button type="button" disabled={saving} onClick={() => void saveClient()} className={primaryButton}>{saving ? '저장 중...' : '저장'}</button></div></Modal>}

      {orderModalOpen && <Modal title={orderEditingId ? '판매 수정' : '판매 등록'} onClose={() => setOrderModalOpen(false)}><div className="grid gap-4 md:grid-cols-4"><Field label="판매일자 *"><input type="date" value={orderForm.sale_date} onChange={(event) => setOrderForm((current) => ({ ...current, sale_date: event.target.value }))} className={inputClass} /></Field><Field label="거래처 *"><select value={orderForm.client_id} onChange={(event) => selectClient(event.target.value)} className={inputClass}><option value="">선택</option>{activeClients.map((row) => <option key={row.id} value={row.id}>{row.company_name}</option>)}</select></Field><Field label="담당 프리랜서"><select value={orderForm.assigned_person_id} onChange={(event) => setOrderForm((current) => ({ ...current, assigned_person_id: event.target.value }))} className={inputClass}><option value="">미지정</option>{salesPeople.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></Field><Field label="입금상태"><select value={orderForm.payment_status} onChange={(event) => setOrderForm((current) => ({ ...current, payment_status: event.target.value as OrderForm['payment_status'] }))} className={inputClass}><option value="unpaid">미입금</option><option value="partial">일부입금</option><option value="paid">입금완료</option></select></Field><Field label="문서상태"><select value={orderForm.status} onChange={(event) => setOrderForm((current) => ({ ...current, status: event.target.value as OrderForm['status'] }))} className={inputClass}><option value="confirmed">확정</option><option value="draft">작성중</option></select></Field><Field label="부가세"><select value={orderForm.vat_rate} onChange={(event) => setOrderForm((current) => ({ ...current, vat_rate: Number(event.target.value) }))} className={inputClass}><option value={10}>부가세 10%</option><option value={0}>부가세 없음</option></select></Field><Field label="비고" className="md:col-span-2"><input value={orderForm.note} onChange={(event) => setOrderForm((current) => ({ ...current, note: event.target.value }))} className={inputClass} /></Field></div>
        <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-700"><table className="min-w-[980px] w-full text-sm"><thead className="bg-slate-800 text-slate-300"><tr>{['제품 *','규격','수량 *','단위','단가 *','공급가액','관리'].map((label) => <th key={label} className="px-3 py-3 text-left">{label}</th>)}</tr></thead><tbody>{orderForm.items.map((item, index) => <tr key={index} className="border-t border-slate-700"><td className="min-w-[260px] p-2"><select value={item.product_id ?? ''} onChange={(event) => selectProduct(index, event.target.value)} className={inputClass}><option value="">제품 선택</option>{products.map((row) => <option key={row.id} value={row.id}>{row.product_name}</option>)}</select></td><td className="p-2"><input value={item.specification ?? ''} onChange={(event) => changeItem(index, { specification: event.target.value })} className={inputClass} /></td><td className="p-2"><input type="number" min="0.001" step="0.001" value={item.quantity} onChange={(event) => changeItem(index, { quantity: Number(event.target.value) })} className={inputClass} /></td><td className="p-2"><select value={item.unit} onChange={(event) => changeItem(index, { unit: event.target.value })} className={inputClass}><option value="kg">kg</option><option value="ea">ea</option><option value="box">box</option><option value="set">set</option></select></td><td className="p-2"><input type="number" min="0" step="1" value={item.unit_price} onChange={(event) => changeItem(index, { unit_price: Number(event.target.value) })} className={inputClass} /></td><td className="whitespace-nowrap p-3 text-right font-bold text-green-300">{money(Number(item.quantity) * Number(item.unit_price))}</td><td className="p-3"><button type="button" onClick={() => removeItem(index)} className="underline">삭제</button></td></tr>)}</tbody></table></div><button type="button" onClick={addItem} className={`mt-3 ${secondaryButton}`}>+ 품목 추가</button>
        <div className="mt-6 ml-auto grid max-w-lg gap-2 rounded-2xl border border-slate-700 bg-slate-950/70 p-5 text-sm"><div className="flex justify-between"><span>공급가액</span><b>{money(orderTotals.supply)}</b></div><div className="flex justify-between"><span>부가세</span><b>{money(orderTotals.vat)}</b></div><div className="flex justify-between border-t border-slate-700 pt-3 text-lg"><span>합계금액</span><b className="text-green-300">{money(orderTotals.total)}</b></div></div><div className="mt-6 flex justify-end gap-3"><button type="button" onClick={() => setOrderModalOpen(false)} className={secondaryButton}>취소</button><button type="button" disabled={saving} onClick={() => void saveOrder()} className={primaryButton}>{saving ? '저장 중...' : '판매 저장'}</button></div></Modal>}
    </main>
  )
}
