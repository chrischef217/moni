'use client'

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'

type SalesUnit = 'kg' | 'ea' | 'box'
type Product = {
  id: string
  product_name: string
  product_code?: string | null
  product_spec?: string | null
  weight_g?: number | null
}
type PackagingMaterial = {
  id: string
  material_name: string
  material_code?: string | null
  spec?: string | null
  material_type?: string | null
  ingredient_type?: string | null
  is_active?: boolean | null
}
type Variant = {
  id: string
  product_id: string
  packaging_material_id?: string | null
  variant_name: string
  sales_unit: SalesUnit
  unit_weight_g?: number | null
  box_units?: number | null
  default_unit_price: number
  moq_quantity: number
  is_default: boolean
  active: boolean
  sort_order: number
  note?: string | null
}
type Client = {
  id: string
  company_name: string
  status: 'active' | 'inactive'
  assigned_person_ids: string[]
}
type Person = { id: string; name: string; status: string }
type AgentRate = { person_id: string; settlement_rate_per_kg: number }
type Term = {
  id: string
  client_id: string
  variant_id: string
  active: boolean
  unit_price: number
  moq_quantity: number
  note?: string | null
  agent_rates: AgentRate[]
}
type Payload = {
  ok: boolean
  error?: string
  products: Product[]
  variants: Variant[]
  packaging_materials: PackagingMaterial[]
  clients: Client[]
  people: Person[]
  client_variant_terms: Term[]
}

type VariantForm = {
  product_id: string
  packaging_material_id: string
  sales_unit: SalesUnit
  unit_weight_g: string
  box_units: string
  default_unit_price: string
  moq_quantity: string
  is_default: boolean
  active: boolean
  note: string
}
type OverrideDraft = {
  key: string
  term_id?: string
  client_id: string
  unit_price: string
  moq_quantity: string
  active: boolean
  note: string
  agent_rates: Record<string, string>
}

const inputClass = 'w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-blue-500'
const secondaryButton = 'rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-200 hover:border-slate-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-40'
const primaryButton = 'rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-black text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40'

function money(value: unknown) {
  return `${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 }).format(Math.round(Number(value ?? 0)))}원`
}
function qty(value: unknown) {
  return new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 3 }).format(Number(value ?? 0))
}
function unitLabel(unit: SalesUnit) {
  return unit === 'box' ? 'BOX' : unit === 'ea' ? 'EA' : 'kg'
}
function variantSpec(row: Variant) {
  if (row.sales_unit === 'kg') return 'kg 단위 판매'
  if (row.sales_unit === 'ea') return `${qty(row.unit_weight_g)}g / EA`
  return `${qty(row.unit_weight_g)}g × ${qty(row.box_units)}EA / BOX`
}
function draftKey() {
  return `override-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block text-sm text-slate-300"><span className="mb-1.5 block">{label}</span>{children}</label>
}
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return <div className="fixed inset-0 z-[1500] flex items-center justify-center bg-black/75 p-4">
    <div className="max-h-[95vh] w-full max-w-5xl overflow-hidden rounded-3xl border border-slate-700 bg-[#0f1b2d] shadow-2xl">
      <div className="flex items-center justify-between border-b border-slate-700 px-6 py-4">
        <h2 className="text-xl font-black text-white">{title}</h2>
        <button type="button" onClick={onClose} className={secondaryButton}>닫기</button>
      </div>
      <div className="max-h-[calc(95vh-78px)] overflow-y-auto p-6">{children}</div>
    </div>
  </div>
}
function Summary({ label, value, note, tone = 'default' }: { label: string; value: string; note?: string; tone?: 'default' | 'warning' | 'success' }) {
  const cls = tone === 'warning'
    ? 'border-amber-500/30 bg-amber-500/[0.06] text-amber-100'
    : tone === 'success'
      ? 'border-emerald-500/30 bg-emerald-500/[0.06] text-emerald-100'
      : 'border-slate-700 bg-slate-900/60 text-white'
  return <div className={`rounded-2xl border p-5 ${cls}`}>
    <div className="text-xs font-black uppercase tracking-[0.12em] opacity-60">{label}</div>
    <div className="mt-2 text-2xl font-black">{value}</div>
    {note && <div className="mt-1 text-xs opacity-60">{note}</div>}
  </div>
}

function emptyVariant(productId = ''): VariantForm {
  return {
    product_id: productId,
    packaging_material_id: '',
    sales_unit: 'kg',
    unit_weight_g: '',
    box_units: '',
    default_unit_price: '0',
    moq_quantity: '0',
    is_default: false,
    active: true,
    note: '',
  }
}

export default function SalesVariantPricingModule() {
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [search, setSearch] = useState('')
  const [variantModal, setVariantModal] = useState(false)
  const [variantId, setVariantId] = useState('')
  const [variantForm, setVariantForm] = useState<VariantForm>(emptyVariant())
  const [packagingQuery, setPackagingQuery] = useState('')
  const [packagingOpen, setPackagingOpen] = useState(false)
  const [overrideDrafts, setOverrideDrafts] = useState<OverrideDraft[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`/api/moni/sales-pricing-v4?_=${Date.now()}`, { cache: 'no-store' })
      const payload = await response.json() as Payload
      if (!response.ok || !payload.ok) throw new Error(payload.error || '제품 규격 단가 데이터를 불러오지 못했습니다.')
      setData(payload)
    } catch (e) {
      setError(e instanceof Error ? e.message : '제품 규격 단가 데이터를 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const products = data?.products ?? []
  const variants = data?.variants ?? []
  const packagingMaterials = data?.packaging_materials ?? []
  const clients = data?.clients ?? []
  const people = data?.people ?? []
  const terms = data?.client_variant_terms ?? []

  const packagingById = useMemo(() => new Map(packagingMaterials.map((row) => [row.id, row])), [packagingMaterials])
  const clientById = useMemo(() => new Map(clients.map((row) => [row.id, row])), [clients])
  const personById = useMemo(() => new Map(people.map((row) => [row.id, row])), [people])
  const selectedPackaging = packagingById.get(variantForm.packaging_material_id)

  const packagingResults = useMemo(() => {
    const query = packagingQuery.trim().toLocaleLowerCase('ko-KR')
    const rows = packagingMaterials.filter((row) => row.is_active !== false)
    if (!query) return rows.slice(0, 30)
    return rows.filter((row) => `${row.material_name} ${row.material_code ?? ''} ${row.spec ?? ''} ${row.material_type ?? ''} ${row.ingredient_type ?? ''}`
      .toLocaleLowerCase('ko-KR')
      .includes(query))
      .slice(0, 30)
  }, [packagingMaterials, packagingQuery])

  const query = search.trim().toLocaleLowerCase('ko-KR')
  const visibleProducts = products.filter((product) =>
    !query
    || `${product.product_name} ${product.product_code ?? ''} ${product.product_spec ?? ''}`.toLocaleLowerCase('ko-KR').includes(query)
    || variants.some((variant) => variant.product_id === product.id && variant.variant_name.toLocaleLowerCase('ko-KR').includes(query)),
  )
  const multiVariantCount = products.filter((product) => variants.filter((variant) => variant.product_id === product.id).length > 1).length
  const missingPrice = variants.filter((variant) => variant.active && Number(variant.default_unit_price) <= 0).length
  const activeOverrideCount = terms.filter((term) => term.active).length

  async function post(action: string, bodyData: Record<string, unknown>, id = '') {
    const response = await fetch('/api/moni/sales-pricing-v4', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, id: id || undefined, data: bodyData }),
    })
    const result = await response.json()
    if (!response.ok || !result.ok) throw new Error(result.error || '저장에 실패했습니다.')
    return result as { ok: true; variant?: Variant; term?: Term }
  }

  function openVariant(productId: string, row?: Variant) {
    setError('')
    setVariantId(row?.id ?? '')
    setVariantForm(row ? {
      product_id: row.product_id,
      packaging_material_id: row.packaging_material_id ?? '',
      sales_unit: row.sales_unit,
      unit_weight_g: String(row.unit_weight_g ?? ''),
      box_units: String(row.box_units ?? ''),
      default_unit_price: String(row.default_unit_price ?? 0),
      moq_quantity: String(row.moq_quantity ?? 0),
      is_default: row.is_default,
      active: row.active,
      note: row.note ?? '',
    } : emptyVariant(productId))

    const linkedPackaging = row?.packaging_material_id ? packagingById.get(row.packaging_material_id) : undefined
    setPackagingQuery(linkedPackaging?.material_name ?? '')
    setPackagingOpen(false)
    setOverrideDrafts(row ? terms.filter((term) => term.variant_id === row.id).map((term) => {
      const rates: Record<string, string> = {}
      for (const rate of term.agent_rates ?? []) rates[rate.person_id] = String(rate.settlement_rate_per_kg ?? 0)
      return {
        key: term.id || draftKey(),
        term_id: term.id,
        client_id: term.client_id,
        unit_price: String(term.unit_price ?? row.default_unit_price ?? 0),
        moq_quantity: String(term.moq_quantity ?? row.moq_quantity ?? 0),
        active: term.active !== false,
        note: term.note ?? '',
        agent_rates: rates,
      }
    }) : [])
    setVariantModal(true)
  }

  function choosePackaging(row: PackagingMaterial) {
    setVariantForm((current) => ({ ...current, packaging_material_id: row.id }))
    setPackagingQuery(row.material_name)
    setPackagingOpen(false)
  }

  function addOverride() {
    const used = new Set(overrideDrafts.map((row) => row.client_id).filter(Boolean))
    const nextClient = clients.find((row) => row.status === 'active' && !used.has(row.id))
    if (!nextClient) {
      setError(clients.some((row) => row.status === 'active') ? '추가할 수 있는 거래처가 더 없습니다.' : '활성 거래처가 없습니다. 먼저 거래처 관리에서 등록해 주세요.')
      return
    }
    setError('')
    setOverrideDrafts((current) => [...current, {
      key: draftKey(),
      client_id: nextClient.id,
      unit_price: variantForm.default_unit_price || '0',
      moq_quantity: variantForm.moq_quantity || '0',
      active: true,
      note: '',
      agent_rates: {},
    }])
  }

  function patchOverride(key: string, patch: Partial<OverrideDraft>) {
    setOverrideDrafts((current) => current.map((row) => row.key === key ? { ...row, ...patch } : row))
  }

  function removeDraft(key: string) {
    setOverrideDrafts((current) => current.filter((row) => row.key !== key))
  }

  async function saveVariantBundle() {
    setSaving(true)
    setError('')
    setNotice('')
    try {
      if (!variantForm.product_id) throw new Error('제품을 선택해 주세요.')
      if (!variantForm.packaging_material_id) throw new Error('부재료 관리에 등록된 포장재를 선택해 주세요.')

      const clientIds = overrideDrafts.map((row) => row.client_id).filter(Boolean)
      if (new Set(clientIds).size !== clientIds.length) throw new Error('같은 거래처의 예외조건을 두 번 등록할 수 없습니다.')
      for (const row of overrideDrafts) {
        if (!row.client_id) throw new Error('거래처별 예외조건의 거래처를 선택해 주세요.')
        if (row.active && Number(row.unit_price || 0) <= 0) {
          throw new Error(`${clientById.get(row.client_id)?.company_name || '거래처'}의 예외 판매단가를 확인해 주세요.`)
        }
      }

      const result = await post('save_variant', {
        ...variantForm,
        unit_weight_g: Number(variantForm.unit_weight_g || 0),
        box_units: Number(variantForm.box_units || 0),
        default_unit_price: Number(variantForm.default_unit_price || 0),
        moq_quantity: Number(variantForm.moq_quantity || 0),
      }, variantId)
      const savedVariantId = String(result.variant?.id ?? variantId)
      if (!savedVariantId) throw new Error('저장된 판매규격 ID를 확인하지 못했습니다.')

      for (const row of overrideDrafts) {
        if (!row.term_id && !row.active) continue
        await post('save_client_variant_term', {
          client_id: row.client_id,
          variant_id: savedVariantId,
          unit_price: Number(row.unit_price || 0),
          moq_quantity: Number(row.moq_quantity || 0),
          active: row.active,
          note: row.note,
          agent_rates: Object.entries(row.agent_rates).map(([person_id, settlement_rate_per_kg]) => ({
            person_id,
            settlement_rate_per_kg: Number(settlement_rate_per_kg || 0),
          })),
        })
      }

      const activeOverrides = overrideDrafts.filter((row) => row.active).length
      setVariantModal(false)
      setNotice(`${variantId ? '판매규격 및 단가를 수정' : '판매규격 및 단가를 추가'}했습니다.${activeOverrides ? ` 거래처 예외조건 ${activeOverrides}건도 함께 적용했습니다.` : ''}`)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : '판매규격 및 단가 저장에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <main className="min-h-screen bg-[#071426] px-5 py-8 text-slate-100">
      <div className="mx-auto max-w-[1600px] rounded-3xl border border-slate-700 bg-[#0b1b30] p-16 text-center text-slate-400">제품 규격 단가 데이터를 불러오는 중입니다.</div>
    </main>
  }

  return <main className="min-h-screen bg-[#071426] px-4 py-6 text-slate-100 md:px-8">
    <div className="mx-auto max-w-[1600px] space-y-5">
      <header className="rounded-3xl border border-slate-700 bg-[#0b1b30] p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-black text-emerald-300">MONI PRODUCT SPEC PRICING</p>
            <h1 className="mt-1 text-3xl font-black">제품 규격 단가</h1>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-400">제품별 기본 판매규격과 기본단가를 한 곳에서 관리합니다. 특정 거래처만 가격·MOQ가 다르면 해당 규격 카드의 예외조건으로 추가하고, 예외가 없으면 기본단가가 자동 적용됩니다.</p>
          </div>
          <button type="button" onClick={() => void load()} className={secondaryButton}>새로고침</button>
        </div>
      </header>

      {error && <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">{error}</div>}
      {notice && <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm text-emerald-200">{notice}</div>}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Summary label="판매 대상 제품" value={`${products.length}개`} />
        <Summary label="판매규격 및 단가" value={`${variants.length}개`} note="제품 하나에 여러 포장 형태 가능" tone="success" />
        <Summary label="거래처 예외조건" value={`${activeOverrideCount}건`} note="예외가 없으면 기본단가 자동 적용" />
        <Summary label="기본단가 미설정" value={`${missingPrice}개`} note={`다중규격 제품 ${multiVariantCount}개`} tone={missingPrice ? 'warning' : 'success'} />
      </div>

      <section className="overflow-hidden rounded-3xl border border-slate-700 bg-slate-900/55">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700 p-5">
          <div>
            <h2 className="text-xl font-black">제품별 판매규격 및 단가</h2>
            <p className="mt-1 text-sm text-slate-400">포장재는 `부재료 관리`에 등록된 활성 부재료에서 선택합니다. 가격만 다른 거래처는 새 규격을 만들지 말고 기존 규격의 거래처 예외조건을 사용합니다.</p>
          </div>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="제품·포장재·규격 검색" className="w-full max-w-[320px] rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm outline-none focus:border-blue-500" />
        </div>

        <div className="divide-y divide-slate-800">
          {visibleProducts.map((product) => {
            const rows = variants.filter((variant) => variant.product_id === product.id)
            return <div key={product.id} className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-black">{product.product_name}</h3>
                    {product.product_code && <span className="text-xs text-slate-500">{product.product_code}</span>}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">{product.product_spec || '제품 규격 정보 없음'} · 판매규격 {rows.length}개</div>
                </div>
                <button type="button" onClick={() => openVariant(product.id)} className={primaryButton}>+ 판매규격 및 단가 추가</button>
              </div>

              <div className="mt-4 grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
                {rows.map((row) => {
                  const packaging = row.packaging_material_id ? packagingById.get(row.packaging_material_id) : undefined
                  const activeTerms = terms.filter((term) => term.variant_id === row.id && term.active)
                  return <button key={row.id} type="button" onClick={() => openVariant(product.id, row)} className={`rounded-2xl border p-4 text-left transition hover:border-slate-500 ${row.active ? 'border-slate-700 bg-slate-950/35' : 'border-slate-800 bg-slate-950/20 opacity-50'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-black text-white">{row.variant_name} {row.is_default && <span className="ml-1 rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-300">기본</span>}</div>
                        <div className="mt-1 text-xs text-slate-500">{packaging?.material_code ? `${packaging.material_code} · ` : ''}{packaging?.spec ? `포장재 규격 ${packaging.spec} · ` : ''}{variantSpec(row)}</div>
                      </div>
                      <span className={row.active ? 'text-xs text-emerald-300' : 'text-xs text-slate-500'}>{row.active ? '사용' : '중지'}</span>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                      <div><span className="text-slate-500">기본단가</span><div className="font-black text-emerald-200">{money(row.default_unit_price)} / {unitLabel(row.sales_unit)}</div></div>
                      <div><span className="text-slate-500">MOQ</span><div className="font-bold">{qty(row.moq_quantity)} {unitLabel(row.sales_unit)}</div></div>
                    </div>
                    <div className="mt-4 border-t border-slate-800 pt-3">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-bold text-slate-400">거래처 예외조건</span>
                        <span className={activeTerms.length ? 'font-black text-amber-300' : 'text-slate-500'}>{activeTerms.length ? `${activeTerms.length}건` : '없음 · 기본단가 사용'}</span>
                      </div>
                      {activeTerms.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">
                        {activeTerms.slice(0, 4).map((term) => <span key={term.id} className="rounded-lg border border-amber-500/20 bg-amber-500/[0.06] px-2 py-1 text-[11px] text-amber-100">{clientById.get(term.client_id)?.company_name || '거래처'} · {money(term.unit_price)}</span>)}
                        {activeTerms.length > 4 && <span className="px-2 py-1 text-[11px] text-slate-500">+{activeTerms.length - 4}</span>}
                      </div>}
                    </div>
                  </button>
                })}
                {!rows.length && <div className="rounded-2xl border border-dashed border-slate-700 p-5 text-sm text-slate-500">판매규격 및 단가가 없습니다.</div>}
              </div>
            </div>
          })}
          {!visibleProducts.length && <div className="p-12 text-center text-slate-500">검색되는 제품 또는 판매규격이 없습니다.</div>}
        </div>
      </section>
    </div>

    {variantModal && <Modal title={variantId ? '판매규격 및 단가 수정' : '판매규격 및 단가 추가'} onClose={() => setVariantModal(false)}>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="제품">
          <select value={variantForm.product_id} disabled={Boolean(variantId)} onChange={(e) => setVariantForm((current) => ({ ...current, product_id: e.target.value }))} className={inputClass}>
            <option value="">제품 선택</option>
            {products.map((row) => <option key={row.id} value={row.id}>{row.product_name}</option>)}
          </select>
        </Field>

        <Field label="포장재 · 부재료에서 선택">
          <div className="relative">
            <input
              value={packagingQuery}
              onFocus={() => setPackagingOpen(true)}
              onBlur={() => window.setTimeout(() => setPackagingOpen(false), 140)}
              onChange={(e) => {
                setPackagingQuery(e.target.value)
                setVariantForm((current) => ({ ...current, packaging_material_id: '' }))
                setPackagingOpen(true)
              }}
              placeholder="부재료명·코드·규격을 입력해 검색"
              autoComplete="off"
              className={inputClass}
            />
            {packagingOpen && <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-30 max-h-72 overflow-y-auto rounded-xl border border-slate-600 bg-[#0b1728] p-1 shadow-2xl">
              {packagingResults.map((row) => <button
                key={row.id}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choosePackaging(row)}
                className="block w-full rounded-lg px-3 py-2.5 text-left hover:bg-slate-800"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-black text-white">{row.material_name}</div>
                  {row.material_code && <div className="text-[11px] text-slate-500">{row.material_code}</div>}
                </div>
                <div className="mt-0.5 text-xs text-slate-400">{row.spec || '규격 미등록'}{row.material_type ? ` · ${row.material_type}` : ''}{row.ingredient_type ? ` · ${row.ingredient_type}` : ''}</div>
              </button>)}
              {!packagingResults.length && <div className="px-3 py-4 text-center text-xs text-slate-500">검색되는 활성 부재료가 없습니다.</div>}
            </div>}
          </div>
        </Field>

        <Field label="판매단위">
          <select value={variantForm.sales_unit} onChange={(e) => setVariantForm((current) => ({ ...current, sales_unit: e.target.value as SalesUnit }))} className={inputClass}>
            <option value="kg">kg</option>
            <option value="ea">EA</option>
            <option value="box">BOX</option>
          </select>
        </Field>

        <Field label="포장재 규격">
          <div className="min-h-[42px] rounded-xl border border-slate-700 bg-slate-950/55 px-3 py-2.5 text-sm font-bold text-slate-200">
            {selectedPackaging?.spec || (variantForm.packaging_material_id ? '규격 미등록' : '포장재를 선택하면 부재료 등록 규격이 표시됩니다.')}
          </div>
        </Field>

        {variantForm.sales_unit !== 'kg' && <Field label="개별 중량(g)">
          <input type="number" min="0" value={variantForm.unit_weight_g} onChange={(e) => setVariantForm((current) => ({ ...current, unit_weight_g: e.target.value }))} className={inputClass} />
        </Field>}

        {variantForm.sales_unit === 'box' && <Field label="BOX 입수량(EA)">
          <input type="number" min="0" value={variantForm.box_units} onChange={(e) => setVariantForm((current) => ({ ...current, box_units: e.target.value }))} className={inputClass} />
        </Field>}

        <Field label={`기본 판매단가(원/${unitLabel(variantForm.sales_unit)})`}>
          <input type="number" min="0" value={variantForm.default_unit_price} onChange={(e) => setVariantForm((current) => ({ ...current, default_unit_price: e.target.value }))} className={inputClass} />
        </Field>

        <Field label={`기본 MOQ(${unitLabel(variantForm.sales_unit)})`}>
          <input type="number" min="0" value={variantForm.moq_quantity} onChange={(e) => setVariantForm((current) => ({ ...current, moq_quantity: e.target.value }))} className={inputClass} />
        </Field>

        <Field label="비고">
          <input value={variantForm.note} onChange={(e) => setVariantForm((current) => ({ ...current, note: e.target.value }))} className={inputClass} />
        </Field>
      </div>

      <div className="mt-5 flex flex-wrap gap-5">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={variantForm.is_default} onChange={(e) => setVariantForm((current) => ({ ...current, is_default: e.target.checked }))} /> 제품 기본규격</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={variantForm.active} onChange={(e) => setVariantForm((current) => ({ ...current, active: e.target.checked }))} /> 판매 사용</label>
      </div>

      <section className="mt-7 rounded-2xl border border-slate-700 bg-slate-950/30">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-700 p-5">
          <div>
            <h3 className="font-black text-white">거래처별 예외 규격·단가 <span className="ml-1 text-xs font-medium text-slate-500">선택사항</span></h3>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-400">같은 포장규격인데 특정 거래처만 가격 또는 MOQ가 다를 때만 추가합니다. 등록하지 않은 거래처는 위 기본단가와 기본 MOQ를 자동 사용합니다. 실제 포장 형태가 다르면 별도 판매규격 카드로 추가하세요.</p>
          </div>
          <button type="button" onClick={addOverride} className={secondaryButton}>+ 거래처 예외 추가</button>
        </div>

        {!overrideDrafts.length
          ? <div className="p-6 text-center text-sm text-slate-500">등록된 거래처 예외조건이 없습니다. 모든 거래처에 기본단가가 적용됩니다.</div>
          : <div className="space-y-3 p-4">
            {overrideDrafts.map((draft, index) => {
              const client = clientById.get(draft.client_id)
              const assignedPeople = (client?.assigned_person_ids ?? [])
                .map((personId) => personById.get(personId))
                .filter((person): person is Person => Boolean(person && person.status === 'active'))
              const usedByOther = new Set(overrideDrafts.filter((row) => row.key !== draft.key).map((row) => row.client_id))
              return <div key={draft.key} className={`rounded-2xl border p-4 ${draft.active ? 'border-amber-500/25 bg-amber-500/[0.035]' : 'border-slate-800 bg-slate-950/30 opacity-70'}`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm font-black text-white">예외조건 {index + 1}{draft.term_id ? <span className="ml-2 text-[11px] font-medium text-slate-500">저장된 조건</span> : <span className="ml-2 text-[11px] font-medium text-blue-300">새 조건</span>}</div>
                  {!draft.term_id
                    ? <button type="button" onClick={() => removeDraft(draft.key)} className="text-xs font-bold text-red-300 hover:text-red-200">입력 삭제</button>
                    : <button type="button" onClick={() => patchOverride(draft.key, { active: !draft.active })} className="text-xs font-bold text-slate-300 hover:text-white">{draft.active ? '예외 사용 중지 · 기본단가 적용' : '예외 다시 사용'}</button>}
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                  <Field label="거래처">
                    <select value={draft.client_id} disabled={Boolean(draft.term_id)} onChange={(e) => patchOverride(draft.key, { client_id: e.target.value, agent_rates: {} })} className={inputClass}>
                      <option value="">거래처 선택</option>
                      {clients.filter((row) => row.status === 'active' || row.id === draft.client_id).map((row) => <option key={row.id} value={row.id} disabled={usedByOther.has(row.id)}>{row.company_name}{row.status !== 'active' ? ' · 거래중지' : ''}</option>)}
                    </select>
                  </Field>
                  <Field label={`예외 판매단가(원/${unitLabel(variantForm.sales_unit)})`}>
                    <input type="number" min="0" disabled={!draft.active} value={draft.unit_price} onChange={(e) => patchOverride(draft.key, { unit_price: e.target.value })} className={inputClass} />
                  </Field>
                  <Field label={`예외 MOQ(${unitLabel(variantForm.sales_unit)})`}>
                    <input type="number" min="0" disabled={!draft.active} value={draft.moq_quantity} onChange={(e) => patchOverride(draft.key, { moq_quantity: e.target.value })} className={inputClass} />
                  </Field>
                  <Field label="예외조건 비고">
                    <input disabled={!draft.active} value={draft.note} onChange={(e) => patchOverride(draft.key, { note: e.target.value })} placeholder="선택 입력" className={inputClass} />
                  </Field>
                </div>

                {assignedPeople.length > 0 && <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/40 p-3">
                  <div className="text-xs font-bold text-slate-400">이 거래처 연결 영업담당 정산단가 · 원/kg</div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {assignedPeople.map((person) => <Field key={person.id} label={person.name}>
                      <input type="number" min="0" disabled={!draft.active} value={draft.agent_rates[person.id] ?? ''} onChange={(e) => patchOverride(draft.key, { agent_rates: { ...draft.agent_rates, [person.id]: e.target.value } })} placeholder="0" className={inputClass} />
                    </Field>)}
                  </div>
                </div>}

                <div className="mt-3 text-xs text-slate-500">{draft.active
                  ? `${client?.company_name || '선택 거래처'}에만 예외조건이 적용됩니다. 다른 거래처는 기본단가를 사용합니다.`
                  : `${client?.company_name || '선택 거래처'} 예외조건은 중지 상태로 저장되며 기본단가가 적용됩니다.`}</div>
              </div>
            })}
          </div>}
      </section>

      <div className="mt-6 flex justify-end gap-3">
        <button type="button" onClick={() => setVariantModal(false)} disabled={saving} className={secondaryButton}>취소</button>
        <button type="button" onClick={() => void saveVariantBundle()} disabled={saving} className={primaryButton}>{saving ? '저장 중…' : '저장'}</button>
      </div>
    </Modal>}
  </main>
}
