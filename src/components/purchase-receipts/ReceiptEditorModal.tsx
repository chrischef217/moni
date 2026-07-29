'use client'

import { useEffect, useId, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import type { PackagingMaterial, PurchaseCategory, PurchaseReceipt, PurchaseUnit, RawMaterial, ReceiptDraft, Supplier } from './types'
import { integerNumber, normalize, rawMaterialName } from './utils'

type Props = {
  editing: PurchaseReceipt | null
  draft: ReceiptDraft
  setDraft: Dispatch<SetStateAction<ReceiptDraft>>
  suppliers: Supplier[]
  rawMaterials: RawMaterial[]
  packagingMaterials: PackagingMaterial[]
  busy: boolean
  onClose: () => void
  onSave: () => void
}

type MaterialOption = {
  id: string
  label: string
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-xs font-black text-[#607d8d]">{label}</span>{children}</label>
}

export default function ReceiptEditorModal({
  editing,
  draft,
  setDraft,
  suppliers,
  rawMaterials,
  packagingMaterials,
  busy,
  onClose,
  onSave,
}: Props) {
  const legacy = Boolean(editing?.legacy_record)
  const materialListId = useId().replace(/:/g, '')
  const selectedRaw = rawMaterials.find((row) => row.id === draft.material_id || row.item_code === draft.material_id)
  const selectedPackaging = packagingMaterials.find((row) => row.id === draft.material_id || row.material_code === draft.material_id)
  const selectedMaterial = draft.purchase_category === 'RAW_MATERIAL' ? selectedRaw : selectedPackaging
  const availableSuppliers = suppliers.filter((row) => row.status === 'ACTIVE' && (row.supply_type === 'BOTH' || row.supply_type === 'OTHER' || row.supply_type === draft.purchase_category))

  const materialOptions = useMemo<MaterialOption[]>(() => {
    if (draft.purchase_category === 'RAW_MATERIAL') {
      return rawMaterials.map((row) => ({ id: row.id, label: rawMaterialName(row) }))
    }
    return packagingMaterials.map((row) => ({
      id: row.id,
      label: `${row.material_name}${row.spec ? ` · ${row.spec}` : ''}`,
    }))
  }, [draft.purchase_category, packagingMaterials, rawMaterials])

  const selectedMaterialLabel = useMemo(() => {
    if (!draft.material_id) return ''
    return materialOptions.find((row) => row.id === draft.material_id)?.label || ''
  }, [draft.material_id, materialOptions])

  const [materialQuery, setMaterialQuery] = useState(selectedMaterialLabel)

  useEffect(() => {
    setMaterialQuery(selectedMaterialLabel)
  }, [draft.purchase_category, selectedMaterialLabel])

  const priceFor = (category: PurchaseCategory, materialId: string, unit: PurchaseUnit) => {
    if (category === 'PACKAGING') return Number(packagingMaterials.find((row) => row.id === materialId || row.material_code === materialId)?.unit_price ?? 0)
    const raw = rawMaterials.find((row) => row.id === materialId || row.item_code === materialId)
    const perKg = Number(raw?.unit_price_per_kg ?? 0)
    if (unit === 'G') return perKg / 1000
    if (unit === 'EA') return perKg * Number(raw?.packing_weight_g ?? 0) / 1000
    return perKg
  }

  const selectSupplier = (supplierId: string) => {
    const supplier = suppliers.find((row) => row.id === supplierId)
    setDraft((current) => ({
      ...current,
      supplier_id: supplierId,
      supplier_name_snapshot: supplier?.company_name || '',
      planned_payment_method: supplier?.default_payment_method || 'BANK_TRANSFER',
      planned_payment_account: supplier?.default_payment_account || '',
      planned_card_name: supplier?.default_card_name || '',
      planned_installment_months: supplier?.default_installment_months || 1,
      tax_invoice_status: supplier?.tax_invoice_required === false ? 'NOT_REQUIRED' : 'NOT_RECEIVED',
    }))
  }

  const changeCategory = (category: PurchaseCategory) => {
    setMaterialQuery('')
    setDraft((current) => ({
      ...current,
      purchase_category: category,
      material_id: '',
      supplier_id: legacy ? current.supplier_id : '',
      quantity: 1,
      unit: category === 'RAW_MATERIAL' ? 'KG' : 'EA',
      unit_price: 0,
      supply_amount: 0,
      vat_amount: 0,
      total_amount: 0,
    }))
  }

  const changeUnit = (unit: PurchaseUnit) => {
    setDraft((current) => {
      const unitPrice = priceFor(current.purchase_category, current.material_id, unit)
      const supplyAmount = Number(current.quantity || 0) * unitPrice
      return { ...current, unit, unit_price: unitPrice, supply_amount: supplyAmount, total_amount: supplyAmount + Number(current.vat_amount || 0) }
    })
  }

  const selectMaterial = (materialId: string) => {
    setDraft((current) => {
      const unitPrice = priceFor(current.purchase_category, materialId, current.unit)
      const supplyAmount = Number(current.quantity || 0) * unitPrice
      return { ...current, material_id: materialId, unit_price: unitPrice, supply_amount: supplyAmount, total_amount: supplyAmount + Number(current.vat_amount || 0) }
    })
  }

  const changeMaterialQuery = (value: string) => {
    setMaterialQuery(value)
    const normalizedValue = normalize(value)
    const matched = materialOptions.find((option) => normalize(option.label) === normalizedValue)
    if (matched) {
      selectMaterial(matched.id)
      return
    }
    if (draft.material_id) selectMaterial('')
  }

  const confirmMaterialQuery = () => {
    const normalizedValue = normalize(materialQuery)
    const exact = materialOptions.find((option) => normalize(option.label) === normalizedValue)
    if (exact) {
      if (draft.material_id !== exact.id) selectMaterial(exact.id)
      setMaterialQuery(exact.label)
      return
    }
    if (draft.material_id) {
      const selected = materialOptions.find((option) => option.id === draft.material_id)
      setMaterialQuery(selected?.label || '')
    }
  }

  const changeAmount = (field: 'quantity' | 'unit_price' | 'supply_amount' | 'vat_amount', value: number) => {
    setDraft((current) => {
      const next = { ...current, [field]: value }
      if (field === 'quantity' || field === 'unit_price') next.supply_amount = Number(next.quantity || 0) * Number(next.unit_price || 0)
      next.total_amount = Number(next.supply_amount || 0) + Number(next.vat_amount || 0)
      return next
    })
  }

  return (
    <div className="fixed inset-0 z-[1500] flex items-center justify-center bg-slate-950/65 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div className="max-h-[92vh] w-full max-w-5xl overflow-auto rounded-[28px] bg-white p-7 text-[#173b52] shadow-2xl">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-2xl font-black">{editing ? '매입·입고 수정' : '매입·입고 등록'}</h2>
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 font-black">닫기</button>
        </div>

        <div className="mb-5 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm font-bold text-sky-900">
          저장하면 원재료·부재료 수불부와 현재고가 즉시 함께 변경됩니다.
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="종류 *">
            <select className="pr-input" value={draft.purchase_category} onChange={(event) => changeCategory(event.target.value as PurchaseCategory)}>
              <option value="RAW_MATERIAL">원재료</option>
              <option value="PACKAGING">부재료</option>
            </select>
          </Field>
          {legacy ? (
            <Field label="매입처 *"><input className="pr-input" value={draft.supplier_name_snapshot} onChange={(event) => setDraft({ ...draft, supplier_name_snapshot: event.target.value })} /></Field>
          ) : (
            <Field label="매입처 *">
              <select className="pr-input" value={draft.supplier_id} onChange={(event) => selectSupplier(event.target.value)}>
                <option value="">선택</option>
                {availableSuppliers.map((row) => <option key={row.id} value={row.id}>{row.company_name}</option>)}
              </select>
            </Field>
          )}
          {!legacy ? <Field label="매입일 *"><input type="date" className="pr-input" value={draft.purchase_date} onChange={(event) => setDraft({ ...draft, purchase_date: event.target.value })} /></Field> : null}
          <Field label="입고일 *"><input type="date" className="pr-input" value={draft.receipt_date} onChange={(event) => setDraft({ ...draft, receipt_date: event.target.value })} /></Field>
        </div>

        <Field label={`${draft.purchase_category === 'RAW_MATERIAL' ? '원재료' : '부재료'} 품목 선택·검색 *`}>
          <div className="relative">
            <input
              type="text"
              list={materialListId}
              autoComplete="off"
              className="pr-input pr-searchable-input pr-material-combobox"
              value={materialQuery}
              placeholder="품목을 선택하거나 이름을 입력해 검색"
              onChange={(event) => changeMaterialQuery(event.target.value)}
              onBlur={confirmMaterialQuery}
            />
            <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm font-black text-sky-700">⌄</span>
            <datalist id={materialListId}>
              {materialOptions.map((option) => <option key={option.id} value={option.label} />)}
            </datalist>
          </div>
          <div className="mt-1.5 text-[11px] font-bold text-[#78909d]">
            입력하면 등록된 {draft.purchase_category === 'RAW_MATERIAL' ? '원재료' : '부재료'}만 검색됩니다. 목록에서 정확한 품목을 선택해 주세요.
          </div>
        </Field>

        {selectedMaterial ? (
          <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            현재고: <b>{draft.purchase_category === 'RAW_MATERIAL' ? `${integerNumber((selectedMaterial as RawMaterial).current_stock_g)}g` : `${integerNumber((selectedMaterial as PackagingMaterial).current_stock)}EA`}</b>
            {draft.purchase_category === 'RAW_MATERIAL' && (selectedMaterial as RawMaterial).packing_weight_g ? <span> · 1EA 규격 {integerNumber((selectedMaterial as RawMaterial).packing_weight_g)}g</span> : null}
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-4">
          <Field label="입고수량 *"><input type="number" min="0" step="any" className="pr-input" value={draft.quantity} onChange={(event) => changeAmount('quantity', Number(event.target.value))} /></Field>
          <Field label="입고단위 *">
            <select disabled={draft.purchase_category === 'PACKAGING'} className="pr-input" value={draft.unit} onChange={(event) => changeUnit(event.target.value as PurchaseUnit)}>
              {draft.purchase_category === 'RAW_MATERIAL' ? <><option value="KG">kg</option><option value="G">g</option><option value="EA">EA</option></> : <option value="EA">EA</option>}
            </select>
          </Field>
          <Field label={`단가 / ${draft.unit}`}><input type="number" min="0" step="any" className="pr-input" value={draft.unit_price} onChange={(event) => changeAmount('unit_price', Number(event.target.value))} /></Field>
          <Field label="공급가액"><input type="number" min="0" className="pr-input" value={draft.supply_amount} onChange={(event) => changeAmount('supply_amount', Number(event.target.value))} /></Field>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Field label="부가세"><input type="number" min="0" className="pr-input" value={draft.vat_amount} onChange={(event) => changeAmount('vat_amount', Number(event.target.value))} /></Field>
          <Field label="총 매입금액"><input readOnly className="pr-input bg-slate-50 font-black" value={draft.total_amount} /></Field>
          {!legacy ? <Field label="지급 예정일"><input type="date" className="pr-input" value={draft.due_date} onChange={(event) => setDraft({ ...draft, due_date: event.target.value })} /></Field> : <div />}
        </div>

        {!legacy ? (
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="예정 결제수단">
              <select className="pr-input" value={draft.planned_payment_method} onChange={(event) => setDraft({ ...draft, planned_payment_method: event.target.value })}>
                <option value="BANK_TRANSFER">계좌이체</option><option value="CARD">카드</option><option value="CASH">현금</option><option value="OTHER">기타</option>
              </select>
            </Field>
            <Field label="출금계좌·카드"><input className="pr-input" value={draft.planned_payment_method === 'CARD' ? draft.planned_card_name : draft.planned_payment_account} onChange={(event) => setDraft({ ...draft, [draft.planned_payment_method === 'CARD' ? 'planned_card_name' : 'planned_payment_account']: event.target.value })} /></Field>
            <Field label="할부 개월"><input type="number" min="1" max="36" disabled={draft.planned_payment_method !== 'CARD'} className="pr-input" value={draft.planned_installment_months} onChange={(event) => setDraft({ ...draft, planned_installment_months: Number(event.target.value) })} /></Field>
          </div>
        ) : null}

        <Field label="비고"><input className="pr-input" value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} /></Field>
        <div className="mt-6 text-right"><button type="button" disabled={busy} onClick={onSave} className="pr-primary">{busy ? '저장 중...' : editing ? '수정 저장' : '매입·입고 등록'}</button></div>
      </div>
    </div>
  )
}
