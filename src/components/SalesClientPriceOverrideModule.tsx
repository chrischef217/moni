'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

type SalesUnit = 'kg' | 'ea' | 'box'
type Product = { id: string; product_name: string; product_code?: string | null }
type Variant = { id: string; product_id: string; variant_name: string; sales_unit: SalesUnit; default_unit_price: number; moq_quantity: number; active: boolean; is_default: boolean }
type Client = { id: string; company_name: string; status: 'active' | 'inactive'; assigned_person_ids: string[] }
type Person = { id: string; name: string; status: string }
type AgentRate = { person_id: string; settlement_rate_per_kg: number }
type Term = { id: string; client_id: string; variant_id: string; active: boolean; unit_price: number; moq_quantity: number; note?: string | null; agent_rates: AgentRate[] }
type Payload = { ok: boolean; error?: string; products: Product[]; variants: Variant[]; clients: Client[]; people: Person[]; client_variant_terms: Term[] }

type FormState = {
  client_id: string
  variant_id: string
  unit_price: string
  moq_quantity: string
  active: boolean
  note: string
  agent_rates: Record<string, string>
}

const inputClass = 'w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-blue-500'
const secondaryButton = 'rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-200 hover:border-slate-500 hover:text-white disabled:opacity-40'
const primaryButton = 'rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-black text-white hover:bg-blue-500 disabled:opacity-40'

function money(value: unknown) { return `${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 }).format(Math.round(Number(value ?? 0)))}원` }
function qty(value: unknown) { return new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 3 }).format(Number(value ?? 0)) }
function unitLabel(unit: SalesUnit) { return unit === 'box' ? 'BOX' : unit === 'ea' ? 'EA' : 'kg' }

export default function SalesClientPriceOverrideModule() {
  const [data, setData] = useState<Payload | null>(null)
  const [selectedClientId, setSelectedClientId] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState<FormState>({ client_id: '', variant_id: '', unit_price: '0', moq_quantity: '0', active: true, note: '', agent_rates: {} })

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`/api/moni/sales-pricing-v4?_=${Date.now()}`, { cache: 'no-store' })
      const payload = await response.json() as Payload
      if (!response.ok || !payload.ok) throw new Error(payload.error || '거래처별 판매단가 데이터를 불러오지 못했습니다.')
      setData(payload)
    } catch (e) {
      setError(e instanceof Error ? e.message : '거래처별 판매단가 데이터를 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    const hideLegacy = () => {
      const sections = Array.from(document.querySelectorAll<HTMLElement>('section'))
      const legacy = sections.find((section) => String(section.querySelector('h2')?.textContent || '').trim() === '거래처별 판매단가')
      if (legacy) legacy.dataset.moniLegacyClientPricing = 'true'
    }
    hideLegacy()
    const observer = new MutationObserver(hideLegacy)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [])

  const products = data?.products ?? []
  const variants = data?.variants ?? []
  const clients = data?.clients ?? []
  const people = data?.people ?? []
  const terms = data?.client_variant_terms ?? []
  const productById = useMemo(() => new Map(products.map((row) => [row.id, row])), [products])
  const personById = useMemo(() => new Map(people.map((row) => [row.id, row])), [people])
  const termByKey = useMemo(() => new Map(terms.map((row) => [`${row.client_id}:${row.variant_id}`, row])), [terms])
  const selectedClient = clients.find((row) => row.id === selectedClientId)
  const activeVariants = variants.filter((row) => row.active)

  function openOverride(variant: Variant) {
    if (!selectedClientId) return
    const existing = termByKey.get(`${selectedClientId}:${variant.id}`)
    const rates: Record<string, string> = {}
    for (const row of existing?.agent_rates ?? []) rates[row.person_id] = String(row.settlement_rate_per_kg ?? 0)
    setForm({
      client_id: selectedClientId,
      variant_id: variant.id,
      unit_price: String(existing?.unit_price ?? variant.default_unit_price ?? 0),
      moq_quantity: String(existing?.moq_quantity ?? variant.moq_quantity ?? 0),
      active: existing?.active !== false,
      note: existing?.note ?? '',
      agent_rates: rates,
    })
    setModalOpen(true)
  }

  async function saveOverride(nextActive = form.active) {
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const response = await fetch('/api/moni/sales-pricing-v4', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_client_variant_term',
          data: {
            ...form,
            active: nextActive,
            unit_price: Number(form.unit_price || 0),
            moq_quantity: Number(form.moq_quantity || 0),
            agent_rates: Object.entries(form.agent_rates).map(([person_id, settlement_rate_per_kg]) => ({ person_id, settlement_rate_per_kg: Number(settlement_rate_per_kg || 0) })),
          },
        }),
      })
      const result = await response.json()
      if (!response.ok || !result.ok) throw new Error(result.error || '거래처 예외단가 저장에 실패했습니다.')
      setModalOpen(false)
      setNotice(nextActive ? `${selectedClient?.company_name || '선택 거래처'}에만 예외단가를 적용했습니다.` : `${selectedClient?.company_name || '선택 거래처'}의 예외단가를 중지하고 기본단가로 되돌렸습니다.`)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : '거래처 예외단가 저장에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const modalVariant = variants.find((row) => row.id === form.variant_id)
  const modalProduct = modalVariant ? productById.get(modalVariant.product_id) : undefined
  const modalExisting = selectedClientId && modalVariant ? termByKey.get(`${selectedClientId}:${modalVariant.id}`) : undefined
  const assignedPeople = selectedClient?.assigned_person_ids ?? []

  return <>
    <section data-moni-client-price-purpose="true" className="mx-auto mt-5 max-w-[1600px] overflow-hidden rounded-3xl border border-slate-700 bg-slate-900/55 text-slate-100">
      <div className="border-b border-slate-700 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.12em] text-emerald-300">거래처별 예외단가</p>
            <h2 className="mt-1 text-xl font-black">거래처별 판매단가</h2>
            <p className="mt-1 max-w-4xl text-sm leading-6 text-slate-400">거래처를 선택하지 않으면 모든 거래처에 제품 기본단가가 적용됩니다. 특정 거래처에만 다른 납품단가가 필요한 경우 그 거래처를 선택한 뒤 해당 제품의 예외단가만 설정합니다.</p>
          </div>
          <button type="button" onClick={() => void load()} className={secondaryButton}>새로고침</button>
        </div>
        <div className="mt-4 max-w-[520px]">
          <label className="block text-sm text-slate-300">
            <span className="mb-1.5 block">거래처</span>
            <select value={selectedClientId} onChange={(e) => setSelectedClientId(e.target.value)} className={inputClass}>
              <option value="">선택 안 함 · 모든 거래처 기본단가 적용</option>
              {clients.filter((row) => row.status === 'active').map((row) => <option key={row.id} value={row.id}>{row.company_name}</option>)}
            </select>
          </label>
        </div>
      </div>

      {error && <div className="m-5 rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">{error}</div>}
      {notice && <div className="m-5 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm text-emerald-200">{notice}</div>}

      {loading ? <div className="p-12 text-center text-slate-500">판매단가를 불러오는 중입니다.</div> : <>
        <div className={`mx-5 mt-5 rounded-2xl border p-4 text-sm ${selectedClientId ? 'border-blue-500/30 bg-blue-500/[0.06] text-blue-100' : 'border-emerald-500/30 bg-emerald-500/[0.06] text-emerald-100'}`}>
          {selectedClientId
            ? <><b>{selectedClient?.company_name}</b> 기준입니다. 예외단가가 설정된 항목만 그 가격을 사용하고, 나머지는 자동으로 기본단가를 사용합니다.</>
            : <><b>전체 기본단가 적용 상태입니다.</b> 거래처별 예외가격을 따로 설정하지 않은 모든 판매는 아래 기본단가를 그대로 사용합니다.</>}
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="min-w-[1120px] w-full text-sm">
            <thead className="bg-slate-800 text-slate-400">
              <tr>{['제품', '판매규격', '기본단가', '현재 적용단가', 'MOQ', '적용 기준', '관리'].map((label) => <th key={label} className="px-4 py-3 text-left">{label}</th>)}</tr>
            </thead>
            <tbody>
              {activeVariants.map((variant) => {
                const product = productById.get(variant.product_id)
                const term = selectedClientId ? termByKey.get(`${selectedClientId}:${variant.id}`) : undefined
                const overrideActive = Boolean(term && term.active)
                const appliedPrice = overrideActive ? Number(term?.unit_price || 0) : Number(variant.default_unit_price || 0)
                const appliedMoq = overrideActive ? Number(term?.moq_quantity || 0) : Number(variant.moq_quantity || 0)
                return <tr key={variant.id} className="border-t border-slate-800">
                  <td className="px-4 py-3 font-bold">{product?.product_name || '제품'}</td>
                  <td className="px-4 py-3"><b>{variant.variant_name}</b>{variant.is_default && <span className="ml-2 rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-black text-emerald-300">기본규격</span>}<div className="mt-0.5 text-xs text-slate-500">{unitLabel(variant.sales_unit)} 판매</div></td>
                  <td className="px-4 py-3">{money(variant.default_unit_price)} / {unitLabel(variant.sales_unit)}</td>
                  <td className={`px-4 py-3 font-black ${overrideActive ? 'text-amber-300' : 'text-emerald-300'}`}>{money(appliedPrice)} / {unitLabel(variant.sales_unit)}</td>
                  <td className="px-4 py-3">{qty(appliedMoq)} {unitLabel(variant.sales_unit)}</td>
                  <td className="px-4 py-3">{!selectedClientId
                    ? <span className="font-bold text-emerald-300">전체 거래처 기본단가</span>
                    : overrideActive
                      ? <span className="font-bold text-amber-300">{selectedClient?.company_name} 예외단가</span>
                      : <span className="font-bold text-blue-300">기본단가 자동 적용</span>}</td>
                  <td className="px-4 py-3">{selectedClientId
                    ? <button type="button" onClick={() => openOverride(variant)} className={secondaryButton}>{overrideActive ? '예외단가 수정' : '이 거래처 가격 설정'}</button>
                    : <span className="text-xs text-slate-500">거래처 선택 시 설정 가능</span>}</td>
                </tr>
              })}
            </tbody>
          </table>
        </div>
      </>}
    </section>

    {modalOpen && modalVariant && <div className="fixed inset-0 z-[1500] flex items-center justify-center bg-black/75 p-4 text-slate-100">
      <div className="max-h-[94vh] w-full max-w-4xl overflow-hidden rounded-3xl border border-slate-700 bg-[#0f1b2d] shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-700 px-6 py-4">
          <div><p className="text-xs font-black text-amber-300">특정 거래처만 예외 적용</p><h2 className="mt-1 text-xl font-black">거래처별 판매조건</h2></div>
          <button type="button" onClick={() => setModalOpen(false)} className={secondaryButton}>닫기</button>
        </div>
        <div className="max-h-[calc(94vh-80px)] overflow-y-auto p-6">
          <div className="grid gap-3 rounded-2xl border border-slate-700 bg-slate-950/40 p-4 md:grid-cols-3">
            <div><span className="text-xs text-slate-500">거래처</span><div className="mt-1 font-black">{selectedClient?.company_name}</div></div>
            <div><span className="text-xs text-slate-500">제품 · 규격</span><div className="mt-1 font-black">{modalProduct?.product_name} · {modalVariant.variant_name}</div></div>
            <div><span className="text-xs text-slate-500">기본단가</span><div className="mt-1 font-black text-emerald-300">{money(modalVariant.default_unit_price)} / {unitLabel(modalVariant.sales_unit)}</div></div>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <label className="block text-sm text-slate-300"><span className="mb-1.5 block">이 거래처 판매단가</span><input type="number" min="0" value={form.unit_price} onChange={(e) => setForm((current) => ({ ...current, unit_price: e.target.value }))} className={inputClass} /></label>
            <label className="block text-sm text-slate-300"><span className="mb-1.5 block">이 거래처 MOQ</span><input type="number" min="0" value={form.moq_quantity} onChange={(e) => setForm((current) => ({ ...current, moq_quantity: e.target.value }))} className={inputClass} /></label>
            <label className="block text-sm text-slate-300"><span className="mb-1.5 block">비고</span><input value={form.note} onChange={(e) => setForm((current) => ({ ...current, note: e.target.value }))} className={inputClass} /></label>
            <label className="mt-7 flex items-center gap-2 text-sm"><input type="checkbox" checked={form.active} onChange={(e) => setForm((current) => ({ ...current, active: e.target.checked }))} /> 이 거래처에 예외단가 사용</label>
          </div>

          {assignedPeople.length > 0 && <div className="mt-6 border-t border-slate-700 pt-5">
            <h3 className="font-black">영업 프리랜서 정산단가</h3>
            <p className="mt-1 text-xs text-slate-500">해당 거래처에 연결된 영업 프리랜서만 표시합니다. 단위는 원/kg입니다.</p>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {assignedPeople.map((id) => <label key={id} className="block text-sm text-slate-300"><span className="mb-1.5 block">{personById.get(id)?.name || '담당자'} (원/kg)</span><input type="number" min="0" value={form.agent_rates[id] ?? ''} onChange={(e) => setForm((current) => ({ ...current, agent_rates: { ...current.agent_rates, [id]: e.target.value } }))} className={inputClass} /></label>)}
            </div>
          </div>}

          <div className="mt-6 flex flex-wrap justify-end gap-3">
            {modalExisting?.active && <button type="button" disabled={saving} onClick={() => void saveOverride(false)} className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-sm font-black text-amber-200 hover:bg-amber-500/20 disabled:opacity-40">기본단가로 되돌리기</button>}
            <button type="button" onClick={() => setModalOpen(false)} className={secondaryButton}>취소</button>
            <button type="button" disabled={saving} onClick={() => void saveOverride(true)} className={primaryButton}>이 거래처만 적용</button>
          </div>
        </div>
      </div>
    </div>}

    <style jsx global>{`
      section[data-moni-legacy-client-pricing='true'] { display: none !important; }
    `}</style>
  </>
}
