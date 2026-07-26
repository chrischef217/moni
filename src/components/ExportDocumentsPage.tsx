'use client'

import { useEffect, useMemo, useState } from 'react'

type Destination = {
  id: string
  company_name: string
  address: string
  contact_name: string
  phone: string
  zip_code: string
  country: string
}

type ExportProduct = {
  id: string
  product_id: string
  english_name: string
  default_unit_price: number | string
  currency: string
  units_per_carton: number
  net_weight_kg: number | string
  gross_weight_kg: number | string
  cbm: number | string
  products: {
    id: string
    product_name: string
    product_code?: string | null
    report_number?: string | null
    product_spec?: string | null
    weight_g?: number | null
  }
}

type DocumentItem = {
  id?: string
  export_product_setting_id: string
  product_id?: string
  product_name_ko?: string
  product_name_en?: string
  cartons: number | string
  units_per_carton?: number
  unit_price: number | string
  currency?: string
  net_weight_per_carton_kg?: number | string
  gross_weight_per_carton_kg?: number | string
  cbm_per_carton?: number | string
  price_overridden: boolean
  price_override_reason: string
}

type ExportDocument = {
  id: string
  invoice_no: string
  packing_list_no: string
  document_date: string
  consignee_id: string
  consignee_snapshot: Destination
  bill_to: string
  port_of_loading: string
  final_destination: string
  vessel_flight: string
  sailing_date: string | null
  notify_party: string
  lc_enabled: boolean
  lc_no: string
  lc_date: string | null
  lc_issuing_bank: string
  terms_delivery_payment: string
  other_reference: string
  incoterm: string
  country_of_origin: string
  reason_for_export: string
  status: 'DRAFT' | 'GENERATED' | 'SHIPPED' | 'CANCELLED'
  shipped_at?: string | null
  export_document_items: Array<DocumentItem & {
    id: string
    product_name_ko: string
    product_name_en: string
    units_per_carton: number
    currency: string
    net_weight_per_carton_kg: number | string
    gross_weight_per_carton_kg: number | string
    cbm_per_carton: number | string
  }>
}

type FormState = {
  id: string
  invoice_no: string
  packing_list_no: string
  status: ExportDocument['status']
  document_date: string
  consignee_id: string
  bill_to: string
  port_of_loading: string
  final_destination: string
  vessel_flight: string
  sailing_date: string
  notify_party: string
  lc_enabled: boolean
  lc_no: string
  lc_date: string
  lc_issuing_bank: string
  terms_delivery_payment: string
  other_reference: string
  incoterm: string
  country_of_origin: string
  reason_for_export: string
  items: DocumentItem[]
}

function today() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

function emptyForm(): FormState {
  return {
    id: '', invoice_no: '', packing_list_no: '', status: 'DRAFT', document_date: today(), consignee_id: '',
    bill_to: 'SAME AS CONSIGNEE', port_of_loading: '', final_destination: '', vessel_flight: '', sailing_date: '', notify_party: '',
    lc_enabled: false, lc_no: '', lc_date: '', lc_issuing_bank: '', terms_delivery_payment: '', other_reference: '',
    incoterm: '', country_of_origin: 'Republic of Korea', reason_for_export: 'We ship the product for sale', items: [],
  }
}

function money(value: number, currency: string) {
  const digits = currency === 'KRW' ? 0 : 2
  return `${currency} ${new Intl.NumberFormat('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value)}`
}

function statusLabel(status: ExportDocument['status']) {
  if (status === 'GENERATED') return '서류생성'
  if (status === 'SHIPPED') return '출고확정'
  if (status === 'CANCELLED') return '취소'
  return '작성중'
}

function statusClass(status: ExportDocument['status']) {
  if (status === 'SHIPPED') return 'bg-[#eaf8f2] text-[#16825d]'
  if (status === 'GENERATED') return 'bg-[#edf6ff] text-[#2676a4]'
  if (status === 'CANCELLED') return 'bg-[#f2f4f6] text-[#7c8c96]'
  return 'bg-[#fff7e9] text-[#9b6b20]'
}

export default function ExportDocumentsPage() {
  const [documents, setDocuments] = useState<ExportDocument[]>([])
  const [destinations, setDestinations] = useState<Destination[]>([])
  const [products, setProducts] = useState<ExportProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState<FormState>(emptyForm())
  const [productSearch, setProductSearch] = useState('')

  async function load() {
    setError('')
    try {
      const response = await fetch(`/api/moni/export-documents?_=${Date.now()}`, { cache: 'no-store' })
      const payload = await response.json()
      if (!response.ok || !payload.ok) throw new Error(payload.error || '수출서류를 불러오지 못했습니다.')
      setDocuments(payload.documents || [])
      setDestinations(payload.destinations || [])
      setProducts(payload.export_products || [])
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '수출서류를 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  function openCreate() {
    setForm(emptyForm())
    setProductSearch('')
    setError('')
    setModalOpen(true)
  }

  function openEdit(document: ExportDocument) {
    setForm({
      id: document.id,
      invoice_no: document.invoice_no,
      packing_list_no: document.packing_list_no,
      status: document.status,
      document_date: document.document_date,
      consignee_id: document.consignee_id,
      bill_to: document.bill_to || 'SAME AS CONSIGNEE',
      port_of_loading: document.port_of_loading || '',
      final_destination: document.final_destination || '',
      vessel_flight: document.vessel_flight || '',
      sailing_date: document.sailing_date || '',
      notify_party: document.notify_party || '',
      lc_enabled: Boolean(document.lc_enabled),
      lc_no: document.lc_no || '',
      lc_date: document.lc_date || '',
      lc_issuing_bank: document.lc_issuing_bank || '',
      terms_delivery_payment: document.terms_delivery_payment || '',
      other_reference: document.other_reference || '',
      incoterm: document.incoterm || '',
      country_of_origin: document.country_of_origin || 'Republic of Korea',
      reason_for_export: document.reason_for_export || 'We ship the product for sale',
      items: document.export_document_items.map((item) => ({
        export_product_setting_id: item.export_product_setting_id,
        cartons: item.cartons,
        unit_price: item.unit_price,
        price_overridden: Boolean(item.price_overridden),
        price_override_reason: item.price_override_reason || '',
      })),
    })
    setProductSearch('')
    setError('')
    setModalOpen(true)
  }

  const addedIds = useMemo(() => new Set(form.items.map((item) => item.export_product_setting_id)), [form.items])
  const productResults = useMemo(() => {
    const query = productSearch.trim().toLocaleLowerCase('ko-KR')
    if (!query) return []
    return products.filter((product) => {
      if (addedIds.has(product.id)) return false
      const haystack = `${product.english_name} ${product.products?.product_name || ''} ${product.products?.report_number || ''}`.toLocaleLowerCase('ko-KR')
      return haystack.includes(query)
    }).slice(0, 8)
  }, [addedIds, productSearch, products])

  function addProduct(product: ExportProduct) {
    setForm((current) => ({
      ...current,
      items: [...current.items, {
        export_product_setting_id: product.id,
        cartons: 1,
        unit_price: product.default_unit_price,
        price_overridden: false,
        price_override_reason: '',
      }],
    }))
    setProductSearch('')
  }

  function productFor(item: DocumentItem) {
    return products.find((product) => product.id === item.export_product_setting_id) || null
  }

  function updateItem(index: number, patch: Partial<DocumentItem>) {
    setForm((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item),
    }))
  }

  function removeItem(index: number) {
    setForm((current) => ({ ...current, items: current.items.filter((_, itemIndex) => itemIndex !== index) }))
  }

  async function save(printAfter = false) {
    setError('')
    if (!form.consignee_id) return setError('Consignee(수출처)를 선택해 주세요.')
    if (!form.items.length) return setError('제품을 1개 이상 추가해 주세요.')

    const printWindow = printAfter ? window.open('', '_blank') : null
    setSaving(true)
    try {
      const desiredStatus = printAfter ? 'GENERATED' : (form.status === 'GENERATED' ? 'GENERATED' : 'DRAFT')
      const body = { ...form, status: desiredStatus }
      const response = await fetch('/api/moni/export-documents', {
        method: form.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const payload = await response.json()
      if (!response.ok || !payload.ok || !payload.document) throw new Error(payload.error || '수출서류 저장에 실패했습니다.')

      setModalOpen(false)
      await load()
      if (printAfter) {
        const url = `/sales-management/export/documents/${encodeURIComponent(payload.document.id)}/print?type=both&auto=1`
        if (printWindow) printWindow.location.href = url
        else window.open(url, '_blank')
      }
    } catch (saveError) {
      printWindow?.close()
      setError(saveError instanceof Error ? saveError.message : '수출서류 저장에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  async function changeStatus(document: ExportDocument, action: 'SHIP' | 'CANCEL') {
    const wording = action === 'SHIP' ? '출고확정하면 완제품 재고에서 자동 차감됩니다. 진행하시겠습니까?' : '출고를 취소하면 해당 수출 차감분이 재고에 다시 반영됩니다. 진행하시겠습니까?'
    if (!window.confirm(wording)) return
    setError('')
    try {
      const response = await fetch('/api/moni/export-documents', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: document.id, action }),
      })
      const payload = await response.json()
      if (!response.ok || !payload.ok) throw new Error(payload.error || '상태 변경에 실패했습니다.')
      await load()
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : '상태 변경에 실패했습니다.')
    }
  }

  async function remove(document: ExportDocument) {
    if (!window.confirm(`${document.invoice_no} 문서를 삭제하시겠습니까?`)) return
    setError('')
    try {
      const response = await fetch(`/api/moni/export-documents?id=${encodeURIComponent(document.id)}`, { method: 'DELETE' })
      const payload = await response.json()
      if (!response.ok || !payload.ok) throw new Error(payload.error || '삭제에 실패했습니다.')
      await load()
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : '삭제에 실패했습니다.')
    }
  }

  const totals = (document: ExportDocument) => {
    const cartons = document.export_document_items.reduce((sum, item) => sum + Number(item.cartons || 0), 0)
    const amounts = new Map<string, number>()
    for (const item of document.export_document_items) {
      const currency = item.currency || 'USD'
      amounts.set(currency, (amounts.get(currency) || 0) + Number(item.cartons || 0) * Number(item.unit_price || 0))
    }
    return { cartons, amountText: [...amounts.entries()].map(([currency, amount]) => money(amount, currency)).join(' / ') }
  }

  if (loading) return <main className="min-h-screen px-6 py-8"><div className="rounded-[26px] border border-[#cfe1eb] bg-white/95 p-16 text-center text-[#6f8796]">수출서류를 불러오는 중입니다.</div></main>

  return <main className="min-h-screen bg-transparent px-4 py-5 text-[#17384d] md:px-6">
    <div className="mx-auto max-w-[1500px] space-y-5">
      <header className="rounded-[26px] border border-[#cfe1eb] bg-white/95 p-6 shadow-[0_14px_36px_rgba(43,84,109,0.08)] lg:p-8">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div><p className="text-xs font-black uppercase tracking-[0.17em] text-[#2b9b76]">EXPORT DOCUMENTS</p><h1 className="mt-2 text-3xl font-black tracking-[-0.035em]">수출서류 관리</h1><p className="mt-2 text-sm leading-6 text-[#6b8392]">Commercial Invoice와 Packing List를 한 번의 입력으로 동시에 생성하고 관리합니다. 출고확정 시에만 완제품 재고가 차감됩니다.</p></div>
          <button type="button" onClick={openCreate} className="h-11 rounded-xl bg-[#16b981] px-5 text-sm font-black text-white shadow-[0_6px_18px_rgba(22,185,129,0.18)]">+ 수출서류 작성</button>
        </div>
      </header>

      {error && !modalOpen && <div className="rounded-2xl border border-[#efb9bf] bg-[#fff6f7] p-4 text-sm font-semibold text-[#a94752]">{error}</div>}

      <section className="overflow-hidden rounded-[26px] border border-[#cfe1eb] bg-white/95 shadow-[0_12px_34px_rgba(43,84,109,0.07)]">
        <div className="border-b border-[#deebf2] px-6 py-5"><p className="text-xs font-black uppercase tracking-[0.15em] text-[#5d91ad]">DOCUMENT LIST</p><h2 className="mt-1 text-xl font-black">생성된 수출서류</h2></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1120px] border-collapse text-sm">
            <thead><tr className="bg-[#f1f7fb] text-left text-xs font-bold text-[#667f8f]"><th className="px-5 py-4">Date</th><th className="px-4 py-4">Invoice No.</th><th className="px-4 py-4">Packing List No.</th><th className="px-4 py-4">Consignee</th><th className="px-4 py-4">Country</th><th className="px-4 py-4 text-center">CTN</th><th className="px-4 py-4">Amount</th><th className="px-4 py-4 text-center">상태</th><th className="px-5 py-4 text-center">관리</th></tr></thead>
            <tbody>{documents.map((document) => { const total = totals(document); return <tr key={document.id} className="border-t border-[#e7eff4] bg-white hover:bg-[#f9fcfd]"><td className="px-5 py-4 whitespace-nowrap">{document.document_date}</td><td className="px-4 py-4 whitespace-nowrap font-black text-[#31546a]">{document.invoice_no}</td><td className="px-4 py-4 whitespace-nowrap font-bold text-[#5c7685]">{document.packing_list_no}</td><td className="px-4 py-4 font-black">{document.consignee_snapshot?.company_name || '-'}</td><td className="px-4 py-4">{document.consignee_snapshot?.country || '-'}</td><td className="px-4 py-4 text-center font-black">{total.cartons}</td><td className="px-4 py-4 whitespace-nowrap font-black text-[#176f99]">{total.amountText || '-'}</td><td className="px-4 py-4 text-center"><span className={`inline-flex rounded-lg px-2.5 py-1.5 text-xs font-black ${statusClass(document.status)}`}>{statusLabel(document.status)}</span></td><td className="px-5 py-4"><div className="flex flex-wrap justify-center gap-1.5">{!['SHIPPED','CANCELLED'].includes(document.status) && <button type="button" onClick={() => openEdit(document)} className="rounded-lg border border-[#bfd5e1] bg-white px-2.5 py-2 text-xs font-black text-[#315d75]">수정</button>}<button type="button" onClick={() => window.open(`/sales-management/export/documents/${document.id}/print?type=invoice`, '_blank')} className="rounded-lg border border-[#c8d9e3] bg-white px-2.5 py-2 text-xs font-bold">Invoice</button><button type="button" onClick={() => window.open(`/sales-management/export/documents/${document.id}/print?type=packing`, '_blank')} className="rounded-lg border border-[#c8d9e3] bg-white px-2.5 py-2 text-xs font-bold">Packing</button><button type="button" onClick={() => window.open(`/sales-management/export/documents/${document.id}/print?type=both&auto=1`, '_blank')} className="rounded-lg bg-[#315d75] px-2.5 py-2 text-xs font-black text-white">PDF/인쇄</button>{document.status !== 'SHIPPED' && document.status !== 'CANCELLED' && <button type="button" onClick={() => void changeStatus(document, 'SHIP')} className="rounded-lg bg-[#16b981] px-2.5 py-2 text-xs font-black text-white">출고확정</button>}{document.status === 'SHIPPED' && <button type="button" onClick={() => void changeStatus(document, 'CANCEL')} className="rounded-lg border border-[#efc0c4] bg-[#fff7f7] px-2.5 py-2 text-xs font-black text-[#b24c55]">출고취소</button>}{document.status !== 'SHIPPED' && <button type="button" onClick={() => void remove(document)} className="rounded-lg border border-[#efc0c4] bg-white px-2.5 py-2 text-xs font-bold text-[#b24c55]">삭제</button>}</div></td></tr> })}{!documents.length && <tr><td colSpan={9} className="px-6 py-16 text-center text-[#8296a3]">작성된 수출서류가 없습니다.</td></tr>}</tbody>
          </table>
        </div>
      </section>
    </div>

    {modalOpen && <div className="fixed inset-0 z-[1300] flex items-center justify-center bg-[rgba(12,31,44,0.34)] p-4 backdrop-blur-[3px]" onMouseDown={(event) => { if (event.currentTarget === event.target && !saving) setModalOpen(false) }}>
      <div className="flex max-h-[94vh] w-full max-w-[1180px] flex-col overflow-hidden rounded-[26px] border border-[#cfe1eb] bg-white shadow-[0_28px_80px_rgba(22,52,72,0.24)]">
        <div className="flex items-start justify-between gap-4 border-b border-[#dce9f0] px-6 py-5"><div><p className="text-xs font-black uppercase tracking-[0.14em] text-[#2b9b76]">EXPORT DOCUMENT</p><h2 className="mt-1 text-2xl font-black">{form.id ? '수출서류 수정' : '수출서류 작성'}</h2></div><button type="button" onClick={() => setModalOpen(false)} disabled={saving} className="rounded-xl border border-[#d0e0e8] bg-white px-4 py-2.5 text-sm font-bold text-[#587283]">닫기</button></div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {error && <div className="mb-4 rounded-xl border border-[#efb9bf] bg-[#fff6f7] px-4 py-3 text-sm font-semibold text-[#a94752]">{error}</div>}

          <Section title="1. 기본정보">
            <div className="grid gap-4 md:grid-cols-2"><ReadOnly label="Invoice No." value={form.invoice_no || '저장 시 자동 생성 · INV-YYYYMMDD-001'} /><ReadOnly label="Packing List No." value={form.packing_list_no || '저장 시 자동 생성 · PL-YYYYMMDD-001'} /><Field label="Date" type="date" value={form.document_date} onChange={(value) => setForm({ ...form, document_date: value })} /><label><span className="mb-1.5 block text-sm font-bold text-[#5f7888]">Consignee (수출처)</span><select value={form.consignee_id} onChange={(event) => setForm({ ...form, consignee_id: event.target.value })} className="h-12 w-full rounded-xl border border-[#cfe0e9] bg-white px-4 font-semibold outline-none"><option value="">수출처 선택</option>{destinations.map((destination) => <option key={destination.id} value={destination.id}>{destination.company_name} · {destination.country}</option>)}</select></label><TextArea label="Bill To" value={form.bill_to} onChange={(value) => setForm({ ...form, bill_to: value })} className="md:col-span-2" /></div>
          </Section>

          <Section title="2. 배송 정보">
            <div className="grid gap-4 md:grid-cols-2"><Field label="Port of Loading (선적항)" value={form.port_of_loading} onChange={(value) => setForm({ ...form, port_of_loading: value })} placeholder="예: Incheon Port" /><Field label="Final Destination (목적지)" value={form.final_destination} onChange={(value) => setForm({ ...form, final_destination: value })} placeholder="예: Vientiane" /><Field label="Vessel / Flight (선박/항공편)" value={form.vessel_flight} onChange={(value) => setForm({ ...form, vessel_flight: value })} placeholder="예: KE123" /><Field label="Sailing Date (출항일)" type="date" value={form.sailing_date} onChange={(value) => setForm({ ...form, sailing_date: value })} /><TextArea label="Notify Party (통지처)" value={form.notify_party} onChange={(value) => setForm({ ...form, notify_party: value })} className="md:col-span-2" placeholder="선택사항" /></div>
          </Section>

          <Section title="3. L/C 정보 (선택사항)">
            <label className="mb-4 flex items-center gap-2 text-sm font-black text-[#31546a]"><input type="checkbox" checked={form.lc_enabled} onChange={(event) => setForm({ ...form, lc_enabled: event.target.checked })} /> L/C 사용</label>
            {form.lc_enabled && <div className="grid gap-4 md:grid-cols-2"><Field label="L/C No." value={form.lc_no} onChange={(value) => setForm({ ...form, lc_no: value })} placeholder="예: LC123456" /><Field label="L/C Date" type="date" value={form.lc_date} onChange={(value) => setForm({ ...form, lc_date: value })} /><Field label="L/C Issuing Bank" value={form.lc_issuing_bank} onChange={(value) => setForm({ ...form, lc_issuing_bank: value })} className="md:col-span-2" placeholder="예: Korea Bank" /><Field label="Terms of Delivery and Payment" value={form.terms_delivery_payment} onChange={(value) => setForm({ ...form, terms_delivery_payment: value })} placeholder="예: T/T 30 days" /><Field label="Other Reference" value={form.other_reference} onChange={(value) => setForm({ ...form, other_reference: value })} /></div>}
          </Section>

          <Section title="4. Invoice 추가정보">
            <div className="grid gap-4 md:grid-cols-2"><label><span className="mb-1.5 block text-sm font-bold text-[#5f7888]">Incoterms® 2020</span><select value={form.incoterm} onChange={(event) => setForm({ ...form, incoterm: event.target.value })} className="h-12 w-full rounded-xl border border-[#cfe0e9] bg-white px-4 font-semibold outline-none"><option value="">선택</option>{['EXW','FCA','CPT','CIP','DAP','DPU','DDP','FAS','FOB','CFR','CIF'].map((term) => <option key={term}>{term}</option>)}</select></label><Field label="Country of Origin" value={form.country_of_origin} onChange={(value) => setForm({ ...form, country_of_origin: value })} /><TextArea label="Reason for Export" value={form.reason_for_export} onChange={(value) => setForm({ ...form, reason_for_export: value })} className="md:col-span-2" /></div>
          </Section>

          <Section title="5. 제품 선택">
            <div className="rounded-2xl border border-[#d5e5ed] bg-[#f7fbfd] p-4"><label className="text-sm font-black text-[#315469]">수출품목 검색</label><input value={productSearch} onChange={(event) => setProductSearch(event.target.value)} placeholder="한글명 · 영문명 · 품목제조번호 검색" className="mt-2 h-11 w-full rounded-xl border border-[#cfe0e9] bg-white px-4 text-sm font-semibold outline-none" />{productSearch.trim() && <div className="mt-2 overflow-hidden rounded-xl border border-[#d6e5ed] bg-white">{productResults.map((product) => <button key={product.id} type="button" onClick={() => addProduct(product)} className="flex w-full items-center justify-between gap-4 border-b border-[#e7eff4] px-4 py-3 text-left last:border-b-0 hover:bg-[#f3f9fc]"><span><b className="block">{product.english_name}</b><small className="text-[#8296a3]">{product.products?.product_name} · {product.units_per_carton} EA/CTN · {money(Number(product.default_unit_price), product.currency)}</small></span><span className="text-xs font-black text-[#2d8c6c]">추가</span></button>)}{!productResults.length && <div className="px-4 py-4 text-sm text-[#8195a2]">추가할 수출품목이 없습니다.</div>}</div>}</div>
            <div className="mt-4 space-y-3">{form.items.map((item, index) => { const product = productFor(item); if (!product) return null; const currentPrice = item.price_overridden ? Number(item.unit_price || 0) : Number(product.default_unit_price || 0); return <div key={`${item.export_product_setting_id}-${index}`} className="rounded-2xl border border-[#d8e6ed] bg-white p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><b className="text-[#17384d]">{product.english_name}</b><div className="mt-1 text-xs text-[#7e929f]">{product.products?.product_name} · {product.units_per_carton} EA/CTN · Net {product.net_weight_kg}kg / Gross {product.gross_weight_kg}kg / CBM {product.cbm}</div></div><button type="button" onClick={() => removeItem(index)} className="text-xs font-black text-[#b34d56]">삭제</button></div><div className="mt-4 grid gap-3 md:grid-cols-[160px_1fr_1fr]"><Field label="수량 (CTN)" type="number" value={String(item.cartons)} onChange={(value) => updateItem(index, { cartons: value })} /><div><span className="mb-1.5 block text-sm font-bold text-[#5f7888]">Unit Price / CTN</span><div className="flex h-12 items-center rounded-xl border border-[#cfe0e9] bg-[#f8fbfd] px-4 font-black text-[#176f99]">{money(currentPrice, product.currency)}</div></div><label className="flex items-center gap-2 pt-7 text-sm font-bold"><input type="checkbox" checked={item.price_overridden} onChange={(event) => updateItem(index, { price_overridden: event.target.checked, unit_price: event.target.checked ? product.default_unit_price : product.default_unit_price, price_override_reason: '' })} /> 이번 건 단가 변경</label></div>{item.price_overridden && <div className="mt-3 grid gap-3 md:grid-cols-2"><Field label={`예외 Unit Price (${product.currency})`} type="number" value={String(item.unit_price)} onChange={(value) => updateItem(index, { unit_price: value })} /><Field label="변경 사유" value={item.price_override_reason} onChange={(value) => updateItem(index, { price_override_reason: value })} placeholder="예: Buyer Negotiation" /></div>}<div className="mt-3 rounded-xl bg-[#f5f9fb] px-4 py-3 text-xs font-semibold text-[#617b8b]">총 {Number(item.cartons || 0) * product.units_per_carton} EA · Net {(Number(item.cartons || 0) * Number(product.net_weight_kg || 0)).toLocaleString()} kg · Gross {(Number(item.cartons || 0) * Number(product.gross_weight_kg || 0)).toLocaleString()} kg · Amount {money(Number(item.cartons || 0) * currentPrice, product.currency)}</div></div> })}{!form.items.length && <div className="rounded-2xl border border-dashed border-[#ccdde6] py-8 text-center text-sm text-[#8296a3]">등록된 수출품목을 검색해서 추가해 주세요.</div>}</div>
          </Section>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[#dce9f0] bg-[#f8fbfd] px-6 py-4"><button type="button" onClick={() => setModalOpen(false)} disabled={saving} className="rounded-xl border border-[#d0e0e8] bg-white px-5 py-2.5 text-sm font-bold text-[#587283]">취소</button><button type="button" onClick={() => void save(false)} disabled={saving} className="rounded-xl border border-[#8db7ca] bg-white px-5 py-2.5 text-sm font-black text-[#315d75]">{saving ? '저장 중...' : '저장'}</button><button type="button" onClick={() => void save(true)} disabled={saving} className="rounded-xl bg-[#16b981] px-5 py-2.5 text-sm font-black text-white">저장 및 PDF/인쇄</button></div>
      </div>
    </div>}
  </main>
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="mb-5 rounded-2xl border border-[#dce8ef] bg-white p-5"><h3 className="mb-4 text-lg font-black text-[#31546a]">{title}</h3>{children}</section>
}

function Field({ label, value, onChange, type = 'text', placeholder = '', className = '' }: { label: string; value: string; onChange: (value: string) => void; type?: string; placeholder?: string; className?: string }) {
  return <label className={className}><span className="mb-1.5 block text-sm font-bold text-[#5f7888]">{label}</span><input type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} min={type === 'number' ? 0 : undefined} className="h-12 w-full rounded-xl border border-[#cfe0e9] bg-white px-4 font-semibold text-[#17384d] outline-none focus:border-[#7fb9d1]" /></label>
}

function ReadOnly({ label, value }: { label: string; value: string }) {
  return <label><span className="mb-1.5 block text-sm font-bold text-[#5f7888]">{label}</span><div className="flex h-12 items-center rounded-xl border border-[#d7e4eb] bg-[#f5f8fa] px-4 text-sm font-bold text-[#6e8390]">{value}</div></label>
}

function TextArea({ label, value, onChange, placeholder = '', className = '' }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; className?: string }) {
  return <label className={className}><span className="mb-1.5 block text-sm font-bold text-[#5f7888]">{label}</span><textarea value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} rows={3} className="w-full resize-none rounded-xl border border-[#cfe0e9] bg-white px-4 py-3 font-semibold text-[#17384d] outline-none focus:border-[#7fb9d1]" /></label>
}
