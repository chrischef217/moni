'use client'

import { useEffect, useMemo, useState } from 'react'

type Product = {
  id: string
  product_name: string
  product_code?: string | null
  report_number?: string | null
  product_type?: string | null
  product_spec?: string | null
  weight_g?: number | null
  is_active?: boolean | null
}

type ExportSetting = {
  id: string
  product_id: string
  english_name: string
  default_unit_price: number | string
  currency: string
  units_per_carton: number | string
  net_weight_kg: number | string
  gross_weight_kg: number | string
  cbm: number | string
  is_active: boolean
  products: Product
}

type FormState = {
  id: string
  product_id: string
  english_name: string
  default_unit_price: string
  currency: string
  units_per_carton: string
  net_weight_kg: string
  gross_weight_kg: string
  cbm: string
  is_active: boolean
}

const EMPTY_FORM: FormState = {
  id: '', product_id: '', english_name: '', default_unit_price: '', currency: 'USD',
  units_per_carton: '', net_weight_kg: '', gross_weight_kg: '', cbm: '', is_active: true,
}

function numberText(value: number | string, digits = 3) {
  const parsed = Number(value || 0)
  return new Intl.NumberFormat('ko-KR', { maximumFractionDigits: digits }).format(Number.isFinite(parsed) ? parsed : 0)
}

function priceText(value: number | string, currency: string) {
  const parsed = Number(value || 0)
  return `${currency} ${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(Number.isFinite(parsed) ? parsed : 0)}`
}

export default function ExportProductSettingsPage() {
  const [settings, setSettings] = useState<ExportSetting[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [productSearch, setProductSearch] = useState('')
  const [form, setForm] = useState<FormState>(EMPTY_FORM)

  async function loadSettings() {
    setError('')
    try {
      const response = await fetch(`/api/moni/export-products?_=${Date.now()}`, { cache: 'no-store' })
      const payload = await response.json()
      if (!response.ok || !payload.ok) throw new Error(payload.error || '수출품목 설정을 불러오지 못했습니다.')
      setSettings(payload.settings || [])
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '수출품목 설정을 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadSettings() }, [])

  async function loadProducts() {
    if (products.length) return
    const response = await fetch(`/api/moni/products?include_inactive=1&_=${Date.now()}`, { cache: 'no-store' })
    const payload = await response.json()
    if (!response.ok || !payload.ok) throw new Error(payload.error || '완제품 목록을 불러오지 못했습니다.')
    setProducts((payload.products || []).filter((item: Product) => item.product_type === '완제품' && item.is_active !== false))
  }

  function openCreate() {
    setForm(EMPTY_FORM)
    setProductSearch('')
    setError('')
    setModalOpen(true)
    void loadProducts().catch((loadError) => setError(loadError instanceof Error ? loadError.message : '완제품 목록을 불러오지 못했습니다.'))
  }

  function openEdit(setting: ExportSetting) {
    setForm({
      id: setting.id,
      product_id: setting.product_id,
      english_name: setting.english_name || '',
      default_unit_price: String(setting.default_unit_price ?? ''),
      currency: setting.currency || 'USD',
      units_per_carton: setting.units_per_carton ? String(setting.units_per_carton) : '',
      net_weight_kg: String(setting.net_weight_kg ?? ''),
      gross_weight_kg: String(setting.gross_weight_kg ?? ''),
      cbm: String(setting.cbm ?? ''),
      is_active: setting.is_active !== false,
    })
    setProductSearch(setting.products?.product_name || '')
    setError('')
    setModalOpen(true)
  }

  function closeModal() {
    if (saving) return
    setModalOpen(false)
    setForm(EMPTY_FORM)
    setProductSearch('')
    setError('')
  }

  const registeredProductIds = useMemo(() => new Set(settings.map((setting) => setting.product_id)), [settings])
  const searchResults = useMemo(() => {
    const query = productSearch.trim().toLocaleLowerCase('ko-KR')
    if (!query || form.id) return []
    return products
      .filter((product) => !registeredProductIds.has(product.id))
      .filter((product) => `${product.product_name} ${product.report_number || ''} ${product.product_code || ''}`.toLocaleLowerCase('ko-KR').includes(query))
      .slice(0, 8)
  }, [form.id, productSearch, products, registeredProductIds])

  const selectedProduct = useMemo(
    () => products.find((product) => product.id === form.product_id) || settings.find((setting) => setting.product_id === form.product_id)?.products || null,
    [form.product_id, products, settings],
  )

  const unitsPerCarton = Number(form.units_per_carton || 0)
  const stockDeductionKgPerCarton = selectedProduct?.weight_g && selectedProduct.weight_g > 0 && Number.isInteger(unitsPerCarton) && unitsPerCarton > 0
    ? (selectedProduct.weight_g * unitsPerCarton) / 1000
    : null

  function selectProduct(product: Product) {
    setForm((current) => ({ ...current, product_id: product.id }))
    setProductSearch(product.product_name)
  }

  function changeUnits(value: string) {
    const parsedUnits = Number(value)
    const cartonNetKg = selectedProduct?.weight_g && selectedProduct.weight_g > 0 && Number.isInteger(parsedUnits) && parsedUnits > 0
      ? (selectedProduct.weight_g * parsedUnits) / 1000
      : null
    setForm((current) => ({
      ...current,
      units_per_carton: value,
      net_weight_kg: cartonNetKg !== null ? String(cartonNetKg) : current.net_weight_kg,
    }))
  }

  async function save() {
    setError('')
    if (!form.product_id) return setError('기존 완제품을 검색해서 선택해 주세요.')
    if (!form.english_name.trim()) return setError('완제품 영문이름을 입력해 주세요.')
    if (form.default_unit_price.trim() === '') return setError('기본 Unit Price / CTN을 입력해 주세요.')
    if (!Number.isInteger(Number(form.units_per_carton)) || Number(form.units_per_carton) < 1) return setError('실제 카톤 입수량을 1개 이상의 정수로 입력해 주세요.')
    if (form.net_weight_kg.trim() === '') return setError('Net Weight / CTN을 입력해 주세요.')
    if (form.gross_weight_kg.trim() === '') return setError('Gross Weight / CTN을 입력해 주세요.')
    if (form.cbm.trim() === '') return setError('CBM / CTN을 입력해 주세요.')

    setSaving(true)
    try {
      const response = await fetch('/api/moni/export-products', {
        method: form.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const payload = await response.json()
      if (!response.ok || !payload.ok) throw new Error(payload.error || '수출품목 저장에 실패했습니다.')
      setSettings(payload.settings || [])
      setModalOpen(false)
      setForm(EMPTY_FORM)
      setProductSearch('')
      setError('')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '수출품목 저장에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  async function remove(setting: ExportSetting) {
    if (!window.confirm(`${setting.products?.product_name || setting.english_name} 수출품목 설정을 삭제하시겠습니까?`)) return
    setError('')
    try {
      const response = await fetch(`/api/moni/export-products?id=${encodeURIComponent(setting.id)}`, { method: 'DELETE' })
      const payload = await response.json()
      if (!response.ok || !payload.ok) throw new Error(payload.error || '삭제에 실패했습니다.')
      setSettings(payload.settings || [])
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : '삭제에 실패했습니다.')
    }
  }

  if (loading) {
    return <main className="min-h-screen bg-transparent px-4 py-6 md:px-6"><div className="mx-auto max-w-[1500px] rounded-[26px] border border-[#d1e2ec] bg-white/95 p-16 text-center text-[#6f8796] shadow-[0_12px_34px_rgba(44,84,108,0.07)]">수출품목 설정을 불러오는 중입니다.</div></main>
  }

  return <main className="min-h-screen bg-transparent px-4 py-5 text-[#17384d] md:px-6">
    <div className="mx-auto max-w-[1500px] space-y-5">
      <header className="rounded-[26px] border border-[#cfe1eb] bg-white/95 p-6 shadow-[0_14px_36px_rgba(43,84,109,0.08)] lg:p-8">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.17em] text-[#2b9b76]">EXPORT ITEM MASTER</p>
            <h1 className="mt-2 text-3xl font-black tracking-[-0.035em] text-[#17384d]">수출품목 설정</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#6b8392]">수출할 완제품만 등록하고, 제품별 실제 1카톤(CTN)의 입수량·단가·중량·CBM을 설정합니다. 입수량은 제품마다 다르므로 시스템이 임의로 기본값을 넣지 않습니다.</p>
          </div>
          <button type="button" onClick={openCreate} className="h-11 rounded-xl bg-[#16b981] px-5 text-sm font-black text-white shadow-[0_6px_18px_rgba(22,185,129,0.18)]">+ 수출 품목 등록</button>
        </div>
        <div className="mt-5 rounded-2xl border border-[#d5e5ed] bg-[#f7fbfd] px-5 py-4 text-sm leading-6 text-[#637d8c]">
          <b className="text-[#315469]">재고 차감 기준:</b> 실제 수출 출고 시 <b>출고 CTN 수 × 해당 품목 입수량 × 단품중량</b>으로 완제품 재고를 자동 차감합니다. 수출품목을 설정하는 것만으로는 재고가 차감되지 않습니다.
        </div>
      </header>

      {error && !modalOpen && <div className="rounded-2xl border border-[#efb9bf] bg-[#fff6f7] p-4 text-sm font-semibold text-[#a94752]">{error}</div>}

      <section className="overflow-hidden rounded-[26px] border border-[#cfe1eb] bg-white/95 shadow-[0_12px_34px_rgba(43,84,109,0.07)]">
        <div className="flex items-center justify-between border-b border-[#deebf2] px-6 py-5">
          <div><p className="text-xs font-black uppercase tracking-[0.15em] text-[#5d91ad]">REGISTERED EXPORT ITEMS</p><h2 className="mt-1 text-xl font-black">등록된 수출품목</h2></div>
          <span className="rounded-xl bg-[#eef7f3] px-3 py-2 text-xs font-black text-[#27785a]">{settings.length}개</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1280px] border-collapse text-sm">
            <thead><tr className="bg-[#f1f7fb] text-left text-xs font-bold text-[#667f8f]"><th className="px-6 py-4">완제품</th><th className="px-4 py-4">영문이름</th><th className="px-4 py-4 text-center">입수량</th><th className="px-4 py-4">Unit Price / CTN</th><th className="px-4 py-4 text-right">Net Weight / CTN</th><th className="px-4 py-4 text-right">Gross Weight / CTN</th><th className="px-4 py-4 text-right">CBM / CTN</th><th className="px-4 py-4">상태</th><th className="px-6 py-4 text-center">관리</th></tr></thead>
            <tbody>
              {settings.map((setting) => <tr key={setting.id} className="border-t border-[#e7eff4] bg-white hover:bg-[#f9fcfd]">
                <td className="px-6 py-4"><div className="font-black text-[#17384d]">{setting.products?.product_name || '-'}</div><div className="mt-1 text-xs text-[#8296a3]">품목제조번호 {setting.products?.report_number || '미등록'} · {setting.products?.product_spec || '규격 미등록'}</div></td>
                <td className="px-4 py-4 font-bold text-[#31546a]">{setting.english_name}</td>
                <td className="px-4 py-4 text-center"><span className="rounded-lg bg-[#eef7f3] px-3 py-1.5 font-black text-[#227a59]">{setting.units_per_carton ? `${setting.units_per_carton} EA / CTN` : '-'}</span></td>
                <td className="px-4 py-4 font-black text-[#176f99]">{priceText(setting.default_unit_price, setting.currency)}</td>
                <td className="px-4 py-4 text-right font-semibold">{numberText(setting.net_weight_kg)} kg</td>
                <td className="px-4 py-4 text-right font-semibold">{numberText(setting.gross_weight_kg)} kg</td>
                <td className="px-4 py-4 text-right font-semibold">{numberText(setting.cbm, 6)}</td>
                <td className="px-4 py-4"><span className={`rounded-lg px-2.5 py-1.5 text-xs font-black ${setting.is_active ? 'bg-[#eaf8f2] text-[#16825d]' : 'bg-[#f1f4f6] text-[#7c8c96]'}`}>{setting.is_active ? '사용' : '미사용'}</span></td>
                <td className="px-6 py-4"><div className="flex justify-center gap-2"><button type="button" onClick={() => openEdit(setting)} className="rounded-lg border border-[#bfd5e1] bg-white px-3 py-2 text-xs font-black text-[#315d75]">수정</button><button type="button" onClick={() => void remove(setting)} className="rounded-lg border border-[#efb9bf] bg-[#fffafa] px-3 py-2 text-xs font-black text-[#b44f58]">삭제</button></div></td>
              </tr>)}
              {!settings.length && <tr><td colSpan={9} className="px-6 py-16 text-center"><div className="text-lg font-black text-[#31546a]">등록된 수출품목이 없습니다.</div><div className="mt-2 text-sm text-[#8296a3]">우측 상단의 ‘수출 품목 등록’을 눌러 필요한 완제품만 등록하세요.</div></td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>

    {modalOpen && <div className="fixed inset-0 z-[1300] flex items-center justify-center bg-[rgba(12,31,44,0.34)] p-4 backdrop-blur-[3px]" onMouseDown={(event) => { if (event.currentTarget === event.target) closeModal() }}>
      <div className="flex max-h-[90vh] w-full max-w-[980px] flex-col overflow-hidden rounded-[26px] border border-[#cfe1eb] bg-white shadow-[0_28px_80px_rgba(22,52,72,0.24)]">
        <div className="flex items-start justify-between gap-4 border-b border-[#dce9f0] px-6 py-5">
          <div><p className="text-xs font-black uppercase tracking-[0.14em] text-[#2b9b76]">EXPORT ITEM</p><h2 className="mt-1 text-2xl font-black">{form.id ? '수출품목 수정' : '수출 품목 등록'}</h2><p className="mt-1 text-sm text-[#718896]">기존 완제품을 연결하고 해당 제품의 실제 1카톤(CTN) 포장정보를 설정합니다.</p></div>
          <button type="button" onClick={closeModal} className="rounded-xl border border-[#d0e0e8] bg-white px-4 py-2.5 text-sm font-bold text-[#587283]">닫기</button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {error && <div className="mb-4 rounded-xl border border-[#efb9bf] bg-[#fff6f7] px-4 py-3 text-sm font-semibold text-[#a94752]">{error}</div>}
          <div className="rounded-2xl border border-[#d5e5ed] bg-[#f7fbfd] p-4">
            <label className="block text-sm font-black text-[#315469]">기존 완제품 검색</label>
            <p className="mt-1 text-xs text-[#7c919e]">제품명, 품목제조번호 또는 제품코드로 검색합니다. 검색 전에는 전체 목록을 표시하지 않습니다.</p>
            <input disabled={Boolean(form.id)} value={productSearch} onChange={(event) => { setProductSearch(event.target.value); setForm((current) => ({ ...current, product_id: '' })) }} placeholder="예: HH 소스 / 품목제조번호" className="mt-3 h-12 w-full rounded-xl border border-[#cfe0e9] bg-white px-4 text-sm font-semibold outline-none focus:border-[#7fb9d1] disabled:bg-[#eef3f6]" />
            {!form.id && productSearch.trim() && !form.product_id && <div className="mt-2 overflow-hidden rounded-xl border border-[#d6e5ed] bg-white">
              {searchResults.map((product) => <button key={product.id} type="button" onClick={() => selectProduct(product)} className="flex w-full items-center justify-between gap-4 border-b border-[#e7eff4] px-4 py-3 text-left last:border-b-0 hover:bg-[#f3f9fc]"><span><b className="block text-sm text-[#17384d]">{product.product_name}</b><small className="mt-0.5 block text-[#8296a3]">품목제조번호 {product.report_number || '미등록'} · {product.product_spec || '규격 미등록'}</small></span><span className="shrink-0 text-xs font-black text-[#2d8c6c]">선택</span></button>)}
              {!searchResults.length && <div className="px-4 py-4 text-sm text-[#8195a2]">검색되는 미등록 완제품이 없습니다.</div>}
            </div>}
            {selectedProduct && <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 rounded-xl border border-[#afe0cc] bg-[#effaf5] px-4 py-3"><b className="text-[#176f53]">선택: {selectedProduct.product_name}</b><span className="text-xs text-[#638475]">품목제조번호 {selectedProduct.report_number || '미등록'}</span><span className="text-xs text-[#638475]">{selectedProduct.product_spec || '규격 미등록'}</span>{selectedProduct.weight_g ? <span className="text-xs font-bold text-[#4d7565]">단품중량 {numberText(selectedProduct.weight_g / 1000)}kg</span> : null}</div>}
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <label className="md:col-span-2"><span className="mb-1.5 block text-sm font-bold text-[#5f7888]">완제품 영문이름</span><input value={form.english_name} onChange={(event) => setForm((current) => ({ ...current, english_name: event.target.value }))} placeholder="English product name" className="h-12 w-full rounded-xl border border-[#cfe0e9] bg-white px-4 font-semibold outline-none focus:border-[#7fb9d1]" /></label>
            <label><span className="mb-1.5 block text-sm font-bold text-[#5f7888]">입수량 (EA / CTN)</span><input type="number" min="1" step="1" value={form.units_per_carton} onChange={(event) => changeUnits(event.target.value)} placeholder="실제 카톤 입수량" className="h-12 w-full rounded-xl border border-[#cfe0e9] bg-white px-4 text-lg font-black text-[#176f53] outline-none focus:border-[#7fb9d1]" /><small className="mt-1 block text-[#8598a3]">제품별 실제 1카톤 입수량을 입력</small></label>
            <label><span className="mb-1.5 block text-sm font-bold text-[#5f7888]">기본 Unit Price / CTN</span><div className="flex"><select value={form.currency} onChange={(event) => setForm((current) => ({ ...current, currency: event.target.value }))} className="h-12 rounded-l-xl border border-r-0 border-[#cfe0e9] bg-[#f5f9fb] px-3 text-sm font-black text-[#31546a]"><option>USD</option><option>THB</option><option>KRW</option><option>EUR</option></select><input type="number" min="0" step="0.0001" value={form.default_unit_price} onChange={(event) => setForm((current) => ({ ...current, default_unit_price: event.target.value }))} placeholder="0.00" className="h-12 min-w-0 flex-1 rounded-r-xl border border-[#cfe0e9] bg-white px-4 font-semibold outline-none focus:border-[#7fb9d1]" /></div><small className="mt-1 block text-[#8598a3]">1카톤 기준 기본 수출단가</small></label>
            {selectedProduct && <div className="md:col-span-2 rounded-2xl border border-[#b7e0d1] bg-[#f1fbf6] px-4 py-3 text-sm text-[#436d5d]"><b className="text-[#176f53]">재고 차감 공식</b> · 1 CTN = {form.units_per_carton || '?'}EA{stockDeductionKgPerCarton !== null ? ` → 완제품 재고 ${numberText(stockDeductionKgPerCarton)}kg 차감` : ' · 입수량과 단품중량이 확정되면 자동 계산'}</div>}
            <label><span className="mb-1.5 block text-sm font-bold text-[#5f7888]">Net Weight / CTN (kg)</span><input type="number" min="0" step="0.001" value={form.net_weight_kg} onChange={(event) => setForm((current) => ({ ...current, net_weight_kg: event.target.value }))} placeholder="카톤 순중량" className="h-12 w-full rounded-xl border border-[#cfe0e9] bg-white px-4 font-semibold outline-none focus:border-[#7fb9d1]" /><small className="mt-1 block text-[#8598a3]">단품중량이 등록된 경우 입수량 입력 시 자동 계산</small></label>
            <label><span className="mb-1.5 block text-sm font-bold text-[#5f7888]">Gross Weight / CTN (kg)</span><input type="number" min="0" step="0.001" value={form.gross_weight_kg} onChange={(event) => setForm((current) => ({ ...current, gross_weight_kg: event.target.value }))} placeholder="카톤 총중량" className="h-12 w-full rounded-xl border border-[#cfe0e9] bg-white px-4 font-semibold outline-none focus:border-[#7fb9d1]" /><small className="mt-1 block text-[#8598a3]">제품 + 카톤박스/포장재 포함 총중량</small></label>
            <label><span className="mb-1.5 block text-sm font-bold text-[#5f7888]">CBM / CTN (m³)</span><input type="number" min="0" step="0.000001" value={form.cbm} onChange={(event) => setForm((current) => ({ ...current, cbm: event.target.value }))} placeholder="0.000000" className="h-12 w-full rounded-xl border border-[#cfe0e9] bg-white px-4 font-semibold outline-none focus:border-[#7fb9d1]" /><small className="mt-1 block text-[#8598a3]">수출 포장 단위 1카톤박스 기준 CBM</small></label>
            <label><span className="mb-1.5 block text-sm font-bold text-[#5f7888]">상태</span><select value={form.is_active ? 'active' : 'inactive'} onChange={(event) => setForm((current) => ({ ...current, is_active: event.target.value === 'active' }))} className="h-12 w-full rounded-xl border border-[#cfe0e9] bg-white px-4 font-semibold outline-none"><option value="active">사용</option><option value="inactive">미사용</option></select></label>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-[#dce9f0] bg-[#f8fbfd] px-6 py-4">
          <p className="text-xs leading-5 text-[#728a98]">실제 수출등록에서는 CTN 수량 × 이 품목의 입수량으로 완제품 재고를 자동 차감하고, 특별단가는 <b>해당 출고 건에만</b> 적용합니다.</p>
          <div className="flex shrink-0 gap-2"><button type="button" onClick={closeModal} disabled={saving} className="rounded-xl border border-[#d0e0e8] bg-white px-5 py-2.5 text-sm font-bold text-[#587283]">취소</button><button type="button" onClick={() => void save()} disabled={saving} className="rounded-xl bg-[#16b981] px-5 py-2.5 text-sm font-black text-white disabled:opacity-50">{saving ? '저장 중...' : '저장'}</button></div>
        </div>
      </div>
    </div>}
  </main>
}
