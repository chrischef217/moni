'use client'

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'

type View = 'products' | 'clients' | 'terms' | 'sales' | 'statements' | 'settlements' | 'statistics' | 'tax-invoices'
type SalesUnit = 'kg' | 'ea' | 'box'

type Person = { id: string; name: string; status: string; phone?: string | null; email?: string | null }
type ProductSetting = {
  product_id: string
  is_sellable: boolean
  default_sales_unit: SalesUnit
  unit_weight_g?: number | null
  carton_units?: number | null
  default_unit_price: number
  moq_quantity: number
  note?: string | null
}
type Product = {
  id: string
  product_name: string
  product_code?: string | null
  product_spec?: string | null
  weight_g?: number | null
  sales_setting?: ProductSetting | null
}
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
  status: 'active' | 'inactive'
  note?: string | null
  assigned_person_ids: string[]
}
type AgentRate = { person_id: string; settlement_rate_per_kg: number }
type ClientTerm = {
  id: string
  client_id: string
  product_id: string
  active: boolean
  sales_unit: SalesUnit
  unit_price: number
  moq_quantity: number
  note?: string | null
  agent_rates: AgentRate[]
}
type OrderItem = {
  id?: string
  product_id: string
  product_name?: string
  specification?: string | null
  quantity: number
  unit: SalesUnit
  unit_price: number
  supply_amount?: number
  quantity_kg?: number | null
}
type Order = {
  id: string
  statement_number: string
  sale_date: string
  client_id: string
  status: 'draft' | 'confirmed' | 'cancelled'
  payment_status: 'unpaid' | 'partial' | 'paid'
  vat_rate: number
  supply_amount: number
  vat_amount: number
  total_amount: number
  note?: string | null
  items: OrderItem[]
}
type Settlement = {
  id: string
  order_id: string
  person_id: string
  person_name: string
  client_id: string
  client_name: string
  product_id?: string | null
  product_name: string
  sale_date: string
  quantity_kg: number
  settlement_rate_per_kg: number
  settlement_amount: number
}
type Payload = {
  ok: boolean
  error?: string
  range: { month: string; start: string; end: string }
  clients: Client[]
  people: Person[]
  products: Product[]
  client_product_terms: ClientTerm[]
  orders: Order[]
  settlements: Settlement[]
  summary: {
    order_count: number
    supply_amount: number
    total_amount: number
    unpaid_amount: number
    settlement_amount: number
    settlement_kg: number
    settlement_people: number
  }
}

type ClientForm = Omit<Client, 'id'>
type ProductDraft = {
  is_sellable: boolean
  default_sales_unit: SalesUnit
  unit_weight_g: number
  carton_units: number
  default_unit_price: number
  moq_quantity: number
  note: string
}
type TermForm = {
  client_id: string
  product_id: string
  active: boolean
  sales_unit: SalesUnit
  unit_price: number
  moq_quantity: number
  note: string
  agent_rates: Record<string, number>
}
type OrderForm = {
  sale_date: string
  client_id: string
  status: 'draft' | 'confirmed'
  payment_status: 'unpaid' | 'partial' | 'paid'
  vat_rate: number
  note: string
  items: OrderItem[]
}

const inputClass = 'mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-blue-500'
const secondaryButton = 'rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-200 hover:border-slate-500 hover:text-white disabled:opacity-40'
const primaryButton = 'rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50'

function todayKst() { return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date()) }
function thisMonth() { return todayKst().slice(0, 7) }
function money(value: unknown) { return `${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 }).format(Math.round(Number(value ?? 0)))}원` }
function qty(value: unknown, digits = 3) { return new Intl.NumberFormat('ko-KR', { maximumFractionDigits: digits }).format(Number(value ?? 0)) }
function unitLabel(value: SalesUnit) { return value === 'box' ? 'BOX' : value === 'ea' ? 'EA' : 'kg' }
function paymentLabel(value: Order['payment_status']) { return value === 'paid' ? '입금완료' : value === 'partial' ? '일부입금' : '미입금' }
function statusLabel(value: Order['status']) { return value === 'draft' ? '작성중' : value === 'cancelled' ? '취소' : '확정' }
function escapeHtml(value: unknown) { return String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;') }

function Field({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return <label className={`block text-sm text-slate-300 ${className}`}><span>{label}</span>{children}</label>
}

function Modal({ title, onClose, children, maxWidth = 'max-w-6xl' }: { title: string; onClose: () => void; children: ReactNode; maxWidth?: string }) {
  return <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/75 p-4"><div className={`max-h-[94vh] w-full ${maxWidth} overflow-hidden rounded-3xl border border-slate-700 bg-[#0f1b2d] shadow-2xl`}><div className="flex items-center justify-between border-b border-slate-700 px-6 py-4"><h2 className="text-xl font-black text-white">{title}</h2><button type="button" onClick={onClose} className={secondaryButton}>닫기</button></div><div className="max-h-[calc(94vh-78px)] overflow-y-auto p-6">{children}</div></div></div>
}

function SummaryCard({ label, value, note, tone = 'blue' }: { label: string; value: string; note?: string; tone?: 'blue' | 'green' | 'amber' | 'red' }) {
  const toneClass = tone === 'green' ? 'border-green-500/30 bg-green-500/10 text-green-200' : tone === 'amber' ? 'border-amber-500/30 bg-amber-500/10 text-amber-200' : tone === 'red' ? 'border-red-500/30 bg-red-500/10 text-red-200' : 'border-blue-500/30 bg-blue-500/10 text-blue-200'
  return <div className={`rounded-2xl border p-5 ${toneClass}`}><div className="text-sm opacity-80">{label}</div><div className="mt-2 text-2xl font-black">{value}</div>{note && <div className="mt-1 text-xs opacity-70">{note}</div>}</div>
}

function emptyClient(): ClientForm {
  return { company_name:'', business_registration_number:'', representative_name:'', address:'', contact_name:'', phone:'', email:'', payment_terms:'', status:'active', note:'', assigned_person_ids:[] }
}
function emptyOrder(): OrderForm {
  return { sale_date: todayKst(), client_id:'', status:'confirmed', payment_status:'unpaid', vat_rate:10, note:'', items:[] }
}

export default function SalesOperationsV2Module({ initialView = 'products' }: { initialView?: string }) {
  const allowed: View[] = ['products','clients','terms','sales','statements','settlements','statistics','tax-invoices']
  const view = (allowed.includes(initialView as View) ? initialView : 'products') as View
  const [month, setMonth] = useState(thisMonth())
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [productDrafts, setProductDrafts] = useState<Record<string, ProductDraft>>({})
  const [clientModal, setClientModal] = useState(false)
  const [clientEditingId, setClientEditingId] = useState('')
  const [clientForm, setClientForm] = useState<ClientForm>(emptyClient())
  const [selectedClientId, setSelectedClientId] = useState('')
  const [termModal, setTermModal] = useState(false)
  const [termForm, setTermForm] = useState<TermForm>({ client_id:'', product_id:'', active:true, sales_unit:'kg', unit_price:0, moq_quantity:0, note:'', agent_rates:{} })
  const [orderModal, setOrderModal] = useState(false)
  const [orderEditingId, setOrderEditingId] = useState('')
  const [orderForm, setOrderForm] = useState<OrderForm>(emptyOrder())

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const response = await fetch(`/api/moni/sales-operations?month=${month}&_=${Date.now()}`, { cache:'no-store' })
      const payload = await response.json() as Payload
      if (!response.ok || !payload.ok) throw new Error(payload.error || '판매관리 데이터를 불러오지 못했습니다.')
      setData(payload)
      setSelectedClientId((current) => current || payload.clients.find((row) => row.status === 'active')?.id || '')
      const drafts: Record<string, ProductDraft> = {}
      for (const product of payload.products) {
        const s = product.sales_setting
        drafts[product.id] = {
          is_sellable: s?.is_sellable !== false,
          default_sales_unit: s?.default_sales_unit ?? 'kg',
          unit_weight_g: Number(s?.unit_weight_g ?? product.weight_g ?? 0),
          carton_units: Number(s?.carton_units ?? 0),
          default_unit_price: Number(s?.default_unit_price ?? 0),
          moq_quantity: Number(s?.moq_quantity ?? 0),
          note: String(s?.note ?? ''),
        }
      }
      setProductDrafts(drafts)
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : '판매관리 데이터를 불러오지 못했습니다.') }
    finally { setLoading(false) }
  }, [month])

  useEffect(() => { void load() }, [load])

  const clients = data?.clients ?? []
  const people = (data?.people ?? []).filter((row) => row.status === 'active')
  const products = data?.products ?? []
  const terms = data?.client_product_terms ?? []
  const orders = data?.orders ?? []
  const settlements = data?.settlements ?? []
  const clientById = useMemo(() => new Map(clients.map((row) => [row.id,row])), [clients])
  const personById = useMemo(() => new Map(people.map((row) => [row.id,row])), [people])
  const productById = useMemo(() => new Map(products.map((row) => [row.id,row])), [products])
  const termByKey = useMemo(() => new Map(terms.map((row) => [`${row.client_id}:${row.product_id}`,row])), [terms])
  const selectedClient = clientById.get(selectedClientId)

  async function post(action: string, bodyData: Record<string, unknown>, id = '') {
    const response = await fetch('/api/moni/sales-operations', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ action, id:id || undefined, data:bodyData }) })
    const result = await response.json()
    if (!response.ok || !result.ok) throw new Error(result.error || '저장에 실패했습니다.')
    return result
  }

  function updateProductDraft(productId: string, patch: Partial<ProductDraft>) {
    setProductDrafts((current) => ({ ...current, [productId]: { ...current[productId], ...patch } }))
  }

  async function saveProduct(productId: string) {
    const draft = productDrafts[productId]
    if (!draft) return
    setSaving(true); setError(''); setNotice('')
    try { await post('save_product_setting', { product_id:productId, ...draft }); setNotice(`${productById.get(productId)?.product_name || '제품'} 판매설정을 저장했습니다.`); await load() }
    catch (saveError) { setError(saveError instanceof Error ? saveError.message : '제품 판매설정 저장에 실패했습니다.') }
    finally { setSaving(false) }
  }

  function openClient(row?: Client) {
    setClientEditingId(row?.id ?? '')
    setClientForm(row ? { company_name:row.company_name, business_registration_number:row.business_registration_number ?? '', representative_name:row.representative_name ?? '', address:row.address ?? '', contact_name:row.contact_name ?? '', phone:row.phone ?? '', email:row.email ?? '', payment_terms:row.payment_terms ?? '', status:row.status, note:row.note ?? '', assigned_person_ids:row.assigned_person_ids ?? [] } : emptyClient())
    setClientModal(true)
  }

  async function saveClient() {
    if (!clientForm.company_name.trim()) return setError('거래처명을 입력해 주세요.')
    setSaving(true); setError(''); setNotice('')
    try { await post('save_client', clientForm as unknown as Record<string, unknown>, clientEditingId); setClientModal(false); setNotice(clientEditingId ? '거래처 정보를 수정했습니다.' : '거래처를 등록했습니다.'); await load() }
    catch (saveError) { setError(saveError instanceof Error ? saveError.message : '거래처 저장에 실패했습니다.') }
    finally { setSaving(false) }
  }

  function openTerm(productId: string) {
    if (!selectedClientId) return setError('거래처를 먼저 선택해 주세요.')
    const product = productById.get(productId)
    const setting = product?.sales_setting
    const existing = termByKey.get(`${selectedClientId}:${productId}`)
    const rates: Record<string, number> = {}
    for (const rate of existing?.agent_rates ?? []) rates[rate.person_id] = Number(rate.settlement_rate_per_kg || 0)
    setTermForm({ client_id:selectedClientId, product_id:productId, active:existing?.active !== false, sales_unit:existing?.sales_unit ?? setting?.default_sales_unit ?? 'kg', unit_price:Number(existing?.unit_price ?? setting?.default_unit_price ?? 0), moq_quantity:Number(existing?.moq_quantity ?? setting?.moq_quantity ?? 0), note:String(existing?.note ?? ''), agent_rates:rates })
    setTermModal(true)
  }

  async function saveTerm() {
    setSaving(true); setError(''); setNotice('')
    try {
      await post('save_client_term', { ...termForm, agent_rates:Object.entries(termForm.agent_rates).map(([person_id,settlement_rate_per_kg]) => ({ person_id, settlement_rate_per_kg })) })
      setTermModal(false); setNotice('거래처별 판매조건을 저장했습니다.'); await load()
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : '거래조건 저장에 실패했습니다.') }
    finally { setSaving(false) }
  }

  function availableTerms(clientId = orderForm.client_id) { return terms.filter((row) => row.client_id === clientId && row.active && productById.get(row.product_id)?.sales_setting?.is_sellable !== false) }

  function openOrder(row?: Order) {
    setOrderEditingId(row?.id ?? '')
    setOrderForm(row ? { sale_date:row.sale_date, client_id:row.client_id, status:row.status === 'draft' ? 'draft' : 'confirmed', payment_status:row.payment_status, vat_rate:Number(row.vat_rate), note:row.note ?? '', items:row.items.map((item) => ({ ...item, product_id:item.product_id || '', quantity:Number(item.quantity), unit:item.unit || 'kg', unit_price:Number(item.unit_price) })) } : emptyOrder())
    setOrderModal(true)
  }

  function selectOrderClient(clientId: string) { setOrderForm((current) => ({ ...current, client_id:clientId, items:[] })) }
  function addOrderItem() { setOrderForm((current) => ({ ...current, items:[...current.items,{ product_id:'', quantity:1, unit:'kg', unit_price:0 }] })) }
  function removeOrderItem(index: number) { setOrderForm((current) => ({ ...current, items:current.items.filter((_,i) => i !== index) })) }
  function changeOrderItem(index: number, patch: Partial<OrderItem>) { setOrderForm((current) => ({ ...current, items:current.items.map((item,i) => i === index ? { ...item, ...patch } : item) })) }
  function selectOrderProduct(index: number, productId: string) {
    const term = termByKey.get(`${orderForm.client_id}:${productId}`)
    const product = productById.get(productId)
    changeOrderItem(index, { product_id:productId, product_name:product?.product_name, specification:product?.product_spec ?? '', unit:term?.sales_unit ?? 'kg', unit_price:Number(term?.unit_price ?? 0) })
  }

  function estimatedKg(item: OrderItem) {
    const setting = productById.get(item.product_id)?.sales_setting
    if (!setting) return 0
    if (item.unit === 'kg') return Number(item.quantity || 0)
    const weight = Number(setting.unit_weight_g || 0)
    if (item.unit === 'ea') return Number(item.quantity || 0) * weight / 1000
    return Number(item.quantity || 0) * Number(setting.carton_units || 0) * weight / 1000
  }

  async function saveOrder() {
    if (!orderForm.client_id) return setError('거래처를 선택해 주세요.')
    if (!orderForm.items.length) return setError('판매 품목을 추가해 주세요.')
    setSaving(true); setError(''); setNotice('')
    try { await post('save_order', orderForm as unknown as Record<string, unknown>, orderEditingId); setOrderModal(false); setNotice(orderEditingId ? '판매내역을 수정했습니다.' : '판매를 등록했습니다. 정산 Snapshot도 함께 생성했습니다.'); await load() }
    catch (saveError) { setError(saveError instanceof Error ? saveError.message : '판매 저장에 실패했습니다.') }
    finally { setSaving(false) }
  }

  async function cancelOrder(row: Order) {
    if (!window.confirm(`${row.statement_number} 판매건을 취소하시겠습니까?`)) return
    setSaving(true); setError('')
    try { await post('cancel_order', {}, row.id); setNotice('판매건을 취소했습니다. 해당 정산도 월 정산에서 제외됩니다.'); await load() }
    catch (saveError) { setError(saveError instanceof Error ? saveError.message : '판매 취소에 실패했습니다.') }
    finally { setSaving(false) }
  }

  async function updatePayment(row: Order, payment_status: Order['payment_status']) {
    setSaving(true); setError('')
    try { await post('update_payment', { payment_status }, row.id); await load() }
    catch (saveError) { setError(saveError instanceof Error ? saveError.message : '입금상태 변경에 실패했습니다.') }
    finally { setSaving(false) }
  }

  function printStatement(row: Order) {
    const client = clientById.get(row.client_id)
    const rows = row.items.map((item,index) => `<tr><td>${index+1}</td><td class="left">${escapeHtml(item.product_name || productById.get(item.product_id)?.product_name || '')}</td><td>${escapeHtml(item.specification || '-')}</td><td>${escapeHtml(qty(item.quantity))}</td><td>${escapeHtml(unitLabel(item.unit))}</td><td class="money">${escapeHtml(money(item.unit_price))}</td><td class="money">${escapeHtml(money(item.supply_amount ?? item.quantity*item.unit_price))}</td></tr>`).join('')
    const popup = window.open('', '_blank', 'width=1100,height=850'); if (!popup) return setError('팝업이 차단되어 거래명세표를 열지 못했습니다.')
    popup.document.write(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>거래명세표</title><style>@page{size:A4 portrait;margin:12mm}body{font-family:Arial,sans-serif;color:#111}h1{text-align:center}.party,.items,.totals{width:100%;border-collapse:collapse;margin-bottom:14px}.party th,.party td,.items th,.items td,.totals th,.totals td{border:1px solid #222;padding:7px;font-size:12px}.items td{text-align:center}.left{text-align:left!important}.money{text-align:right!important}.totals{width:45%;margin-left:auto}</style></head><body><h1>거 래 명 세 표</h1><p>번호: <b>${escapeHtml(row.statement_number)}</b> / 거래일: <b>${escapeHtml(row.sale_date)}</b></p><table class="party"><tr><th>공급자</th><td>두배</td><th>사업자번호</th><td>123-38-14284</td></tr><tr><th>공급받는 자</th><td>${escapeHtml(client?.company_name || '-')}</td><th>사업자번호</th><td>${escapeHtml(client?.business_registration_number || '-')}</td></tr></table><table class="items"><thead><tr><th>No.</th><th>품목</th><th>규격</th><th>수량</th><th>단위</th><th>단가</th><th>공급가액</th></tr></thead><tbody>${rows}</tbody></table><table class="totals"><tr><th>공급가액</th><td>${escapeHtml(money(row.supply_amount))}</td></tr><tr><th>부가세</th><td>${escapeHtml(money(row.vat_amount))}</td></tr><tr><th>합계</th><td>${escapeHtml(money(row.total_amount))}</td></tr></table><script>window.onload=()=>window.print()<\/script></body></html>`); popup.document.close()
  }

  function printSettlement(personId: string) {
    const personRows = settlements.filter((row) => row.person_id === personId)
    const personName = personRows[0]?.person_name || personById.get(personId)?.name || '영업 프리랜서'
    const total = personRows.reduce((sum,row) => sum + Number(row.settlement_amount),0)
    const rows = personRows.map((row,index) => `<tr><td>${index+1}</td><td>${escapeHtml(row.sale_date)}</td><td>${escapeHtml(row.client_name)}</td><td>${escapeHtml(row.product_name)}</td><td class="num">${escapeHtml(qty(row.quantity_kg))}kg</td><td class="num">${escapeHtml(money(row.settlement_rate_per_kg))}/kg</td><td class="num">${escapeHtml(money(row.settlement_amount))}</td></tr>`).join('')
    const popup = window.open('', '_blank', 'width=1100,height=850'); if (!popup) return setError('팝업이 차단되어 정산서를 열지 못했습니다.')
    popup.document.write(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${escapeHtml(month)} 정산서</title><style>@page{size:A4 portrait;margin:14mm}body{font-family:Arial,sans-serif;color:#111}h1{text-align:center}table{width:100%;border-collapse:collapse}th,td{border:1px solid #222;padding:7px;font-size:11px}th{background:#eee}.num{text-align:right}.total{margin-top:18px;text-align:right;font-size:18px;font-weight:bold}</style></head><body><h1>영업 프리랜서 월 정산서</h1><p>정산월: <b>${escapeHtml(month)}</b> / 성명: <b>${escapeHtml(personName)}</b></p><table><thead><tr><th>No.</th><th>판매일</th><th>거래처</th><th>제품</th><th>판매 kg</th><th>정산단가</th><th>정산액</th></tr></thead><tbody>${rows}</tbody></table><div class="total">최종 정산액: ${escapeHtml(money(total))}</div><script>window.onload=()=>window.print()<\/script></body></html>`); popup.document.close()
  }

  function renderProducts() {
    return <div className="space-y-5"><div className="grid gap-3 md:grid-cols-4"><SummaryCard label="생산 제품" value={`${products.length}개`} /><SummaryCard label="판매 가능" value={`${products.filter((p) => productDrafts[p.id]?.is_sellable).length}개`} tone="green" /><SummaryCard label="단가 미설정" value={`${products.filter((p) => Number(productDrafts[p.id]?.default_unit_price || 0) <= 0).length}개`} tone="amber" /><SummaryCard label="BOX 설정" value={`${products.filter((p) => productDrafts[p.id]?.default_sales_unit === 'box').length}개`} /></div><section className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-900/60"><div className="border-b border-slate-700 p-5"><h2 className="text-xl font-black">제품 판매설정</h2><p className="mt-1 text-sm text-slate-400">생산관리 제품목록을 그대로 사용합니다. 판매용 단위·중량·카톤입수량·기본단가만 추가 설정합니다.</p></div><div className="overflow-x-auto"><table className="min-w-[1180px] w-full text-sm"><thead className="bg-slate-800 text-slate-300"><tr>{['판매','제품','제품코드','기본단위','개별중량(g)','카톤 입수량','기본 판매단가','MOQ','관리'].map((label) => <th key={label} className="px-3 py-3 text-left">{label}</th>)}</tr></thead><tbody>{products.map((product) => { const d = productDrafts[product.id]; if (!d) return null; return <tr key={product.id} className="border-t border-slate-800"><td className="p-3"><input type="checkbox" checked={d.is_sellable} onChange={(e) => updateProductDraft(product.id,{is_sellable:e.target.checked})} /></td><td className="min-w-[230px] p-3"><b className="text-white">{product.product_name}</b><div className="text-xs text-slate-500">{product.product_spec || '-'}</div></td><td className="p-3">{product.product_code || '-'}</td><td className="p-2"><select value={d.default_sales_unit} onChange={(e) => updateProductDraft(product.id,{default_sales_unit:e.target.value as SalesUnit})} className={inputClass}><option value="kg">kg</option><option value="ea">EA</option><option value="box">BOX</option></select></td><td className="p-2"><input type="number" min="0" value={d.unit_weight_g || ''} onChange={(e) => updateProductDraft(product.id,{unit_weight_g:Number(e.target.value)})} className={inputClass} /></td><td className="p-2"><input type="number" min="0" value={d.carton_units || ''} onChange={(e) => updateProductDraft(product.id,{carton_units:Number(e.target.value)})} className={inputClass} disabled={d.default_sales_unit !== 'box'} /></td><td className="p-2"><input type="number" min="0" value={d.default_unit_price} onChange={(e) => updateProductDraft(product.id,{default_unit_price:Number(e.target.value)})} className={inputClass} /></td><td className="p-2"><input type="number" min="0" value={d.moq_quantity} onChange={(e) => updateProductDraft(product.id,{moq_quantity:Number(e.target.value)})} className={inputClass} /></td><td className="p-3"><button disabled={saving} onClick={() => void saveProduct(product.id)} className={primaryButton}>저장</button></td></tr>})}</tbody></table></div></section></div>
  }

  function renderClients() {
    return <div className="space-y-5"><div className="grid gap-3 md:grid-cols-3"><SummaryCard label="전체 거래처" value={`${clients.length}곳`} /><SummaryCard label="거래 중" value={`${clients.filter((c) => c.status === 'active').length}곳`} tone="green" /><SummaryCard label="영업담당 없음" value={`${clients.filter((c) => c.status === 'active' && !c.assigned_person_ids.length).length}곳`} tone="amber" /></div><section className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-900/60"><div className="flex items-center justify-between border-b border-slate-700 p-5"><div><h2 className="text-xl font-black">거래처 관리</h2><p className="mt-1 text-sm text-slate-400">영업 프리랜서는 0명·1명·여러 명 모두 연결할 수 있습니다.</p></div><button onClick={() => openClient()} className={primaryButton}>+ 거래처 등록</button></div><div className="overflow-x-auto"><table className="min-w-full text-sm"><thead className="bg-slate-800 text-slate-300"><tr>{['상태','거래처','담당자','영업 프리랜서','결제조건','연락처','관리'].map((label) => <th key={label} className="px-4 py-3 text-left">{label}</th>)}</tr></thead><tbody>{clients.map((row) => <tr key={row.id} className="border-t border-slate-800"><td className="px-4 py-3">{row.status === 'active' ? <span className="text-green-300">거래 중</span> : <span className="text-slate-500">중지</span>}</td><td className="px-4 py-3 font-bold text-white">{row.company_name}</td><td className="px-4 py-3">{row.contact_name || '-'}</td><td className="px-4 py-3">{row.assigned_person_ids.length ? <div className="flex flex-wrap gap-1">{row.assigned_person_ids.map((id) => <span key={id} className="rounded-lg bg-blue-500/15 px-2 py-1 text-xs text-blue-200">{personById.get(id)?.name || '담당자'}</span>)}</div> : <span className="text-slate-500">없음</span>}</td><td className="px-4 py-3">{row.payment_terms || '-'}</td><td className="px-4 py-3">{row.phone || row.email || '-'}</td><td className="px-4 py-3"><button onClick={() => openClient(row)} className="underline">수정</button></td></tr>)}</tbody></table></div></section></div>
  }

  function renderTerms() {
    const clientTerms = terms.filter((row) => row.client_id === selectedClientId)
    return <div className="space-y-5"><section className="rounded-2xl border border-slate-700 bg-slate-900/60 p-5"><div className="grid gap-4 lg:grid-cols-[minmax(280px,420px)_1fr] lg:items-end"><Field label="거래처 선택"><select value={selectedClientId} onChange={(e) => setSelectedClientId(e.target.value)} className={inputClass}><option value="">선택</option>{clients.filter((c) => c.status === 'active').map((c) => <option key={c.id} value={c.id}>{c.company_name}</option>)}</select></Field><div><div className="text-sm text-slate-400">연결 영업 프리랜서</div><div className="mt-2 flex flex-wrap gap-2">{selectedClient?.assigned_person_ids.length ? selectedClient.assigned_person_ids.map((id) => <span key={id} className="rounded-lg bg-blue-500/15 px-3 py-2 text-sm text-blue-200">{personById.get(id)?.name}</span>) : <span className="text-sm text-amber-300">담당 영업 프리랜서 없음 — 거래처 관리에서 먼저 연결할 수 있습니다.</span>}</div></div></div></section><section className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-900/60"><div className="border-b border-slate-700 p-5"><h2 className="text-xl font-black">거래처별 제품·판매조건</h2><p className="mt-1 text-sm text-slate-400">납품단가와 담당자별 영업 정산단가(원/kg)를 여기서 한 번만 설정하면 판매등록과 월 정산에 자동 적용됩니다.</p></div>{!selectedClientId ? <div className="p-12 text-center text-slate-400">거래처를 선택해 주세요.</div> : <div className="overflow-x-auto"><table className="min-w-[980px] w-full text-sm"><thead className="bg-slate-800 text-slate-300"><tr>{['제품','기본 판매설정','거래처 판매단가','MOQ','영업 정산단가','상태','관리'].map((label) => <th key={label} className="px-4 py-3 text-left">{label}</th>)}</tr></thead><tbody>{products.filter((p) => p.sales_setting?.is_sellable !== false).map((product) => { const term = termByKey.get(`${selectedClientId}:${product.id}`); return <tr key={product.id} className="border-t border-slate-800"><td className="px-4 py-3 font-bold text-white">{product.product_name}</td><td className="px-4 py-3 text-slate-400">{unitLabel(product.sales_setting?.default_sales_unit ?? 'kg')} · {money(product.sales_setting?.default_unit_price ?? 0)}</td><td className="px-4 py-3 font-bold text-green-300">{term ? `${money(term.unit_price)} / ${unitLabel(term.sales_unit)}` : '미설정'}</td><td className="px-4 py-3">{term ? `${qty(term.moq_quantity)} ${unitLabel(term.sales_unit)}` : '-'}</td><td className="px-4 py-3">{term?.agent_rates.length ? term.agent_rates.map((rate) => <div key={rate.person_id}>{personById.get(rate.person_id)?.name || '담당자'} · <b>{money(rate.settlement_rate_per_kg)}/kg</b></div>) : <span className="text-slate-500">없음</span>}</td><td className="px-4 py-3">{term ? (term.active ? <span className="text-green-300">사용</span> : <span className="text-slate-500">중지</span>) : '-'}</td><td className="px-4 py-3"><button onClick={() => openTerm(product.id)} className={secondaryButton}>{term ? '수정' : '설정'}</button></td></tr>})}</tbody></table></div>}<div className="border-t border-slate-800 p-4 text-xs text-slate-500">현재 설정 {clientTerms.filter((t) => t.active).length}개 제품</div></section></div>
  }

  function renderSales(showStatements = false) {
    const confirmed = orders.filter((o) => o.status === 'confirmed')
    return <div className="space-y-5">{!showStatements && <div className="grid gap-3 md:grid-cols-4"><SummaryCard label="이번 달 판매" value={`${data?.summary.order_count ?? 0}건`} /><SummaryCard label="공급가액" value={money(data?.summary.supply_amount)} tone="green" /><SummaryCard label="합계 매출" value={money(data?.summary.total_amount)} /><SummaryCard label="미입금" value={money(data?.summary.unpaid_amount)} tone="red" /></div>}<section className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-900/60"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700 p-5"><div><h2 className="text-xl font-black">{showStatements ? '거래명세표' : '판매 등록 및 내역'}</h2><p className="mt-1 text-sm text-slate-400">{showStatements ? '판매건별 거래명세표를 출력합니다.' : '거래처를 선택하면 등록된 제품조건과 영업 정산조건이 자동 적용됩니다.'}</p></div>{!showStatements && <button onClick={() => openOrder()} className={primaryButton}>+ 판매 등록</button>}</div><div className="overflow-x-auto"><table className="min-w-[1050px] w-full text-sm"><thead className="bg-slate-800 text-slate-300"><tr>{['상태','판매일','명세표','거래처','판매 kg','공급가액','합계','입금상태','관리'].map((label) => <th key={label} className="px-4 py-3 text-left">{label}</th>)}</tr></thead><tbody>{orders.map((row) => <tr key={row.id} className={`border-t border-slate-800 ${row.status === 'cancelled' ? 'opacity-40' : ''}`}><td className="px-4 py-3">{statusLabel(row.status)}</td><td className="px-4 py-3">{row.sale_date}</td><td className="px-4 py-3 font-bold text-blue-300">{row.statement_number}</td><td className="px-4 py-3 font-bold">{clientById.get(row.client_id)?.company_name || '-'}</td><td className="px-4 py-3">{qty(row.items.reduce((sum,item) => sum + Number(item.quantity_kg || 0),0))}kg</td><td className="px-4 py-3">{money(row.supply_amount)}</td><td className="px-4 py-3 font-bold text-green-300">{money(row.total_amount)}</td><td className="px-4 py-3">{row.status === 'cancelled' ? '-' : <select value={row.payment_status} disabled={saving || showStatements} onChange={(e) => void updatePayment(row,e.target.value as Order['payment_status'])} className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1"><option value="unpaid">미입금</option><option value="partial">일부입금</option><option value="paid">입금완료</option></select>}</td><td className="px-4 py-3 whitespace-nowrap"><button onClick={() => printStatement(row)} disabled={row.status === 'cancelled'} className="mr-3 underline">출력</button>{!showStatements && <><button onClick={() => openOrder(row)} disabled={row.status === 'cancelled'} className="mr-3 underline">수정</button><button onClick={() => void cancelOrder(row)} disabled={row.status === 'cancelled' || saving} className="underline">취소</button></>}</td></tr>)}</tbody></table>{!orders.length && <div className="p-12 text-center text-slate-400">조회 월에 등록된 판매가 없습니다.</div>}</div></section><div className="text-xs text-slate-500">확정 판매 {confirmed.length}건 기준</div></div>
  }

  function renderSettlements() {
    const personIds = Array.from(new Set(settlements.map((row) => row.person_id)))
    return <div className="space-y-5"><div className="grid gap-3 md:grid-cols-3"><SummaryCard label={`${month} 자동 정산액`} value={money(data?.summary.settlement_amount)} tone="green" /><SummaryCard label="정산 대상 판매량" value={`${qty(data?.summary.settlement_kg)}kg`} /><SummaryCard label="정산 대상 프리랜서" value={`${data?.summary.settlement_people ?? 0}명`} /></div>{!personIds.length ? <section className="rounded-2xl border border-slate-700 bg-slate-900/60 p-14 text-center text-slate-400">해당 월에 자동 생성된 영업 정산내역이 없습니다.<div className="mt-2 text-sm text-slate-500">거래처별 제품조건에 원/kg 정산단가를 설정한 뒤 판매를 등록하면 자동으로 생성됩니다.</div></section> : personIds.map((personId) => { const rows = settlements.filter((row) => row.person_id === personId); const total = rows.reduce((sum,row) => sum + Number(row.settlement_amount),0); const totalKg = rows.reduce((sum,row) => sum + Number(row.quantity_kg),0); return <section key={personId} className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-900/60"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700 p-5"><div><h2 className="text-xl font-black">{rows[0]?.person_name || personById.get(personId)?.name}</h2><p className="mt-1 text-sm text-slate-400">{qty(totalKg)}kg · 자동 정산 {money(total)}</p></div><button onClick={() => printSettlement(personId)} className={primaryButton}>정산서 출력</button></div><div className="overflow-x-auto"><table className="min-w-[900px] w-full text-sm"><thead className="bg-slate-800 text-slate-300"><tr>{['판매일','거래처','제품','판매 kg','정산단가','정산액'].map((label) => <th key={label} className="px-4 py-3 text-left">{label}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row.id} className="border-t border-slate-800"><td className="px-4 py-3">{row.sale_date}</td><td className="px-4 py-3 font-bold">{row.client_name}</td><td className="px-4 py-3">{row.product_name}</td><td className="px-4 py-3">{qty(row.quantity_kg)}kg</td><td className="px-4 py-3">{money(row.settlement_rate_per_kg)}/kg</td><td className="px-4 py-3 font-bold text-green-300">{money(row.settlement_amount)}</td></tr>)}</tbody></table></div></section> })}</div>
  }

  function renderStatistics() {
    const confirmed = orders.filter((o) => o.status === 'confirmed')
    const byClient = new Map<string,number>(); const byProduct = new Map<string,{name:string;amount:number;kg:number}>()
    for (const order of confirmed) { byClient.set(order.client_id,(byClient.get(order.client_id) || 0) + Number(order.supply_amount)); for (const item of order.items) { const key = item.product_id; const old = byProduct.get(key) || { name:item.product_name || productById.get(key)?.product_name || '제품', amount:0, kg:0 }; old.amount += Number(item.supply_amount || 0); old.kg += Number(item.quantity_kg || 0); byProduct.set(key,old) } }
    return <div className="space-y-5"><div className="grid gap-3 md:grid-cols-4"><SummaryCard label="판매 건수" value={`${data?.summary.order_count ?? 0}건`} /><SummaryCard label="공급가액" value={money(data?.summary.supply_amount)} tone="green" /><SummaryCard label="미입금" value={money(data?.summary.unpaid_amount)} tone="red" /><SummaryCard label="영업 정산액" value={money(data?.summary.settlement_amount)} tone="amber" /></div><div className="grid gap-5 xl:grid-cols-2"><section className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-900/60"><div className="border-b border-slate-700 p-5"><h2 className="text-lg font-black">거래처별 매출</h2></div>{Array.from(byClient.entries()).sort((a,b) => b[1]-a[1]).map(([id,amount]) => <div key={id} className="flex justify-between border-t border-slate-800 px-5 py-3"><span>{clientById.get(id)?.company_name || '거래처'}</span><b className="text-green-300">{money(amount)}</b></div>)}</section><section className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-900/60"><div className="border-b border-slate-700 p-5"><h2 className="text-lg font-black">제품별 판매</h2></div>{Array.from(byProduct.values()).sort((a,b) => b.amount-a.amount).map((row) => <div key={row.name} className="flex justify-between border-t border-slate-800 px-5 py-3"><span>{row.name}<span className="ml-2 text-xs text-slate-500">{qty(row.kg)}kg</span></span><b className="text-green-300">{money(row.amount)}</b></div>)}</section></div></div>
  }

  return <main className="min-h-screen bg-[#071426] px-4 py-6 text-slate-100 md:px-8"><div className="mx-auto max-w-[1600px] space-y-5"><header className="rounded-3xl border border-slate-700 bg-[#0b1b30] p-6 shadow-xl"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm font-bold text-blue-300">MONI SALES MANAGEMENT V2</p><h1 className="mt-1 text-3xl font-black">판매관리</h1><p className="mt-2 text-sm text-slate-400">제품 → 거래처 → 영업 프리랜서 → 실제 판매 → 월 정산을 하나의 흐름으로 연결합니다.</p></div><div className="flex items-center gap-2"><label className="text-sm text-slate-400">조회 월</label><input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white" /><button onClick={() => void load()} className={secondaryButton}>새로고침</button></div></div></header>{error && <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-red-200">{error}</div>}{notice && <div className="rounded-2xl border border-green-500/40 bg-green-500/10 p-4 text-green-200">{notice}</div>}{loading ? <div className="rounded-2xl border border-slate-700 p-16 text-center text-slate-400">판매관리 데이터를 불러오는 중입니다.</div> : view === 'products' ? renderProducts() : view === 'clients' ? renderClients() : view === 'terms' ? renderTerms() : view === 'sales' ? renderSales(false) : view === 'statements' ? renderSales(true) : view === 'settlements' ? renderSettlements() : view === 'statistics' ? renderStatistics() : <section className="rounded-3xl border border-dashed border-slate-600 bg-slate-900/40 p-16 text-center"><div className="text-5xl">🧾</div><h2 className="mt-5 text-2xl font-black">세금계산서</h2><p className="mt-3 text-slate-400">전자세금계산서 기능 준비 중</p></section>}</div>

    {clientModal && <Modal title={clientEditingId ? '거래처 수정' : '거래처 등록'} onClose={() => setClientModal(false)} maxWidth="max-w-4xl"><div className="grid gap-4 md:grid-cols-2"><Field label="거래처명 *"><input value={clientForm.company_name} onChange={(e) => setClientForm((c) => ({...c,company_name:e.target.value}))} className={inputClass} /></Field><Field label="사업자등록번호"><input value={clientForm.business_registration_number ?? ''} onChange={(e) => setClientForm((c) => ({...c,business_registration_number:e.target.value}))} className={inputClass} /></Field><Field label="대표자"><input value={clientForm.representative_name ?? ''} onChange={(e) => setClientForm((c) => ({...c,representative_name:e.target.value}))} className={inputClass} /></Field><Field label="거래처 담당자"><input value={clientForm.contact_name ?? ''} onChange={(e) => setClientForm((c) => ({...c,contact_name:e.target.value}))} className={inputClass} /></Field><Field label="전화번호"><input value={clientForm.phone ?? ''} onChange={(e) => setClientForm((c) => ({...c,phone:e.target.value}))} className={inputClass} /></Field><Field label="이메일"><input value={clientForm.email ?? ''} onChange={(e) => setClientForm((c) => ({...c,email:e.target.value}))} className={inputClass} /></Field><Field label="결제조건"><input value={clientForm.payment_terms ?? ''} onChange={(e) => setClientForm((c) => ({...c,payment_terms:e.target.value}))} placeholder="예: 월말 마감 후 익월 10일" className={inputClass} /></Field><Field label="상태"><select value={clientForm.status} onChange={(e) => setClientForm((c) => ({...c,status:e.target.value as ClientForm['status']}))} className={inputClass}><option value="active">거래 중</option><option value="inactive">거래중지</option></select></Field><Field label="주소" className="md:col-span-2"><input value={clientForm.address ?? ''} onChange={(e) => setClientForm((c) => ({...c,address:e.target.value}))} className={inputClass} /></Field><div className="md:col-span-2"><div className="text-sm text-slate-300">담당 영업 프리랜서 <span className="text-slate-500">(0명~여러 명 선택 가능)</span></div><div className="mt-2 grid gap-2 md:grid-cols-2">{people.map((person) => { const checked = clientForm.assigned_person_ids.includes(person.id); return <label key={person.id} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 ${checked ? 'border-blue-500 bg-blue-500/10' : 'border-slate-700'}`}><input type="checkbox" checked={checked} onChange={(e) => setClientForm((c) => ({...c,assigned_person_ids:e.target.checked ? [...c.assigned_person_ids,person.id] : c.assigned_person_ids.filter((id) => id !== person.id)}))} /><span className="font-bold">{person.name}</span></label> })}{!people.length && <div className="text-sm text-amber-300">등록된 활성 영업 프리랜서가 없습니다.</div>}</div></div><Field label="비고" className="md:col-span-2"><textarea rows={3} value={clientForm.note ?? ''} onChange={(e) => setClientForm((c) => ({...c,note:e.target.value}))} className={inputClass} /></Field></div><div className="mt-6 flex justify-end gap-3"><button onClick={() => setClientModal(false)} className={secondaryButton}>취소</button><button disabled={saving} onClick={() => void saveClient()} className={primaryButton}>{saving ? '저장 중...' : '저장'}</button></div></Modal>}

    {termModal && <Modal title={`${productById.get(termForm.product_id)?.product_name || '제품'} · ${clientById.get(termForm.client_id)?.company_name || '거래처'} 판매조건`} onClose={() => setTermModal(false)} maxWidth="max-w-3xl"><div className="grid gap-4 md:grid-cols-3"><Field label="판매단위"><select value={termForm.sales_unit} onChange={(e) => setTermForm((c) => ({...c,sales_unit:e.target.value as SalesUnit}))} className={inputClass}><option value="kg">kg</option><option value="ea">EA</option><option value="box">BOX</option></select></Field><Field label="거래처 판매단가"><input type="number" min="0" value={termForm.unit_price} onChange={(e) => setTermForm((c) => ({...c,unit_price:Number(e.target.value)}))} className={inputClass} /></Field><Field label="MOQ"><input type="number" min="0" value={termForm.moq_quantity} onChange={(e) => setTermForm((c) => ({...c,moq_quantity:Number(e.target.value)}))} className={inputClass} /></Field></div><div className="mt-6 rounded-2xl border border-slate-700 bg-slate-950/50 p-5"><h3 className="font-black">담당자별 영업 정산단가</h3><p className="mt-1 text-sm text-slate-400">판매가 확정되면 아래 원/kg 단가가 판매량(kg)에 곱해져 월 정산 Snapshot으로 저장됩니다.</p><div className="mt-4 space-y-3">{(selectedClient?.assigned_person_ids ?? []).map((personId) => <div key={personId} className="grid items-center gap-3 md:grid-cols-[1fr_220px]"><div className="font-bold">{personById.get(personId)?.name || '영업 프리랜서'}</div><div className="flex items-center gap-2"><input type="number" min="0" value={termForm.agent_rates[personId] ?? 0} onChange={(e) => setTermForm((c) => ({...c,agent_rates:{...c.agent_rates,[personId]:Number(e.target.value)}}))} className={inputClass} /><span className="mt-1 whitespace-nowrap text-sm text-slate-400">원/kg</span></div></div>)}{!(selectedClient?.assigned_person_ids.length) && <div className="text-sm text-amber-300">거래처에 연결된 영업 프리랜서가 없습니다. 거래처 관리에서 먼저 연결해 주세요.</div>}</div></div><Field label="비고" className="mt-4"><textarea rows={3} value={termForm.note} onChange={(e) => setTermForm((c) => ({...c,note:e.target.value}))} className={inputClass} /></Field><div className="mt-6 flex justify-end gap-3"><button onClick={() => setTermModal(false)} className={secondaryButton}>취소</button><button disabled={saving} onClick={() => void saveTerm()} className={primaryButton}>저장</button></div></Modal>}

    {orderModal && <Modal title={orderEditingId ? '판매 수정' : '판매 등록'} onClose={() => setOrderModal(false)}><div className="grid gap-4 md:grid-cols-4"><Field label="판매일자 *"><input type="date" value={orderForm.sale_date} onChange={(e) => setOrderForm((c) => ({...c,sale_date:e.target.value}))} className={inputClass} /></Field><Field label="거래처 *"><select value={orderForm.client_id} onChange={(e) => selectOrderClient(e.target.value)} className={inputClass}><option value="">선택</option>{clients.filter((c) => c.status === 'active').map((c) => <option key={c.id} value={c.id}>{c.company_name}</option>)}</select></Field><Field label="입금상태"><select value={orderForm.payment_status} onChange={(e) => setOrderForm((c) => ({...c,payment_status:e.target.value as OrderForm['payment_status']}))} className={inputClass}><option value="unpaid">미입금</option><option value="partial">일부입금</option><option value="paid">입금완료</option></select></Field><Field label="문서상태"><select value={orderForm.status} onChange={(e) => setOrderForm((c) => ({...c,status:e.target.value as OrderForm['status']}))} className={inputClass}><option value="confirmed">확정</option><option value="draft">작성중</option></select></Field><Field label="부가세"><select value={orderForm.vat_rate} onChange={(e) => setOrderForm((c) => ({...c,vat_rate:Number(e.target.value)}))} className={inputClass}><option value={10}>10%</option><option value={0}>없음</option></select></Field><Field label="비고" className="md:col-span-3"><input value={orderForm.note} onChange={(e) => setOrderForm((c) => ({...c,note:e.target.value}))} className={inputClass} /></Field></div><div className="mt-5 rounded-2xl border border-blue-500/25 bg-blue-500/5 p-4 text-sm text-blue-100">{orderForm.client_id ? <>이 거래처에 설정된 판매제품 <b>{availableTerms().length}개</b>만 선택할 수 있습니다. 제품 선택 시 판매단위·납품단가·영업 정산조건이 자동 적용됩니다.</> : '먼저 거래처를 선택해 주세요.'}</div><div className="mt-5 overflow-x-auto rounded-2xl border border-slate-700"><table className="min-w-[1150px] w-full text-sm"><thead className="bg-slate-800 text-slate-300"><tr>{['제품','수량','단위','판매단가','예상 kg','영업 정산조건','공급가액','관리'].map((label) => <th key={label} className="px-3 py-3 text-left">{label}</th>)}</tr></thead><tbody>{orderForm.items.map((item,index) => { const term = termByKey.get(`${orderForm.client_id}:${item.product_id}`); return <tr key={index} className="border-t border-slate-700"><td className="min-w-[240px] p-2"><select value={item.product_id} onChange={(e) => selectOrderProduct(index,e.target.value)} className={inputClass}><option value="">제품 선택</option>{availableTerms().map((termRow) => <option key={termRow.product_id} value={termRow.product_id}>{productById.get(termRow.product_id)?.product_name}</option>)}</select></td><td className="p-2"><input type="number" min="0.001" step="0.001" value={item.quantity} onChange={(e) => changeOrderItem(index,{quantity:Number(e.target.value)})} className={inputClass} /></td><td className="p-3 font-bold">{unitLabel(item.unit)}</td><td className="p-2"><input type="number" min="0" value={item.unit_price} onChange={(e) => changeOrderItem(index,{unit_price:Number(e.target.value)})} className={inputClass} /></td><td className="p-3 font-bold text-blue-300">{qty(estimatedKg(item))}kg</td><td className="min-w-[210px] p-3">{term?.agent_rates.length ? term.agent_rates.map((rate) => <div key={rate.person_id} className="text-xs">{personById.get(rate.person_id)?.name}: {money(rate.settlement_rate_per_kg)}/kg</div>) : <span className="text-xs text-slate-500">정산 없음</span>}</td><td className="p-3 font-bold text-green-300">{money(Number(item.quantity || 0)*Number(item.unit_price || 0))}</td><td className="p-3"><button onClick={() => removeOrderItem(index)} className="underline">삭제</button></td></tr>})}</tbody></table></div><button disabled={!orderForm.client_id || !availableTerms().length} onClick={addOrderItem} className={`mt-3 ${secondaryButton}`}>+ 품목 추가</button><div className="mt-6 ml-auto max-w-lg rounded-2xl border border-slate-700 bg-slate-950/60 p-5"><div className="flex justify-between"><span>공급가액</span><b>{money(orderForm.items.reduce((sum,item) => sum + Number(item.quantity || 0)*Number(item.unit_price || 0),0))}</b></div><div className="mt-2 flex justify-between text-sm text-slate-400"><span>예상 판매량</span><b>{qty(orderForm.items.reduce((sum,item) => sum + estimatedKg(item),0))}kg</b></div></div><div className="mt-6 flex justify-end gap-3"><button onClick={() => setOrderModal(false)} className={secondaryButton}>취소</button><button disabled={saving} onClick={() => void saveOrder()} className={primaryButton}>{saving ? '저장 중...' : '판매 저장'}</button></div></Modal>}
  </main>
}