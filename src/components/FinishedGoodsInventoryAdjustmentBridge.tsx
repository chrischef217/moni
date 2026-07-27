'use client'

import { useEffect, useMemo, useState } from 'react'
import FinishedGoodsInventoryPage from '@/components/FinishedGoodsInventoryPage'

type Unit = 'kg' | 'g'

type InventoryRow = {
  product_id: string
  product_name: string
  weight_g?: number
  stock_g: number
  negative_stock?: boolean
}

type Movement = {
  id: string
  product_id: string
  product_name?: string
  date: string
  type: 'INBOUND' | 'OUTBOUND'
  source_kind?: 'PRODUCTION' | 'SALE' | 'EXPORT' | 'ADJUSTMENT'
  quantity_g: number
  reference?: string
  counterparty?: string
  lot_number?: string
  source_id?: string
  balance_after_g?: number
}

type InventoryPayload = {
  ok: boolean
  inventory: InventoryRow[]
  movements: Movement[]
  summary: Record<string, number>
  policy?: Record<string, string>
  [key: string]: unknown
}

type AdjustmentRow = {
  id: string
  product_id: string
  adjustment_date: string
  input_quantity: number | string
  input_unit: Unit
  balance_before_g: number | string
  target_stock_g: number | string
  adjustment_g: number | string
  reason: string
  created_at: string
}

type ExportDocument = {
  id: string
  invoice_no?: string
  document_date: string
  shipped_at?: string | null
  status: string
  consignee_snapshot?: { company_name?: string }
  export_document_items?: Array<{
    id: string
    product_id: string
    product_name_ko?: string
    cartons: number
    units_per_carton: number
    net_weight_per_carton_kg: number | string
  }>
}

let bridgeInstalled = false
let latestInventory: InventoryPayload | null = null
let latestExports: ExportDocument[] = []

const numberValue = (value: unknown) => {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

const todayKst = () =>
  new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date())

const formatKg = (value: number, digits = 3) =>
  `${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: digits }).format(value / 1000)}kg`

function movementDelta(movement: Movement) {
  return movement.type === 'INBOUND' ? numberValue(movement.quantity_g) : -numberValue(movement.quantity_g)
}

function recalculateBalances(movements: Movement[]) {
  const chronological = movements
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
  const balances = new Map<string, number>()

  for (const movement of chronological) {
    const next = (balances.get(movement.product_id) ?? 0) + movementDelta(movement)
    balances.set(movement.product_id, next)
    movement.balance_after_g = next
  }

  return { chronological, balances }
}

function mergeAdjustments(payload: InventoryPayload, adjustments: AdjustmentRow[]): InventoryPayload {
  const inventory = (payload.inventory ?? []).map((row) => ({ ...row }))
  const rowById = new Map(inventory.map((row) => [String(row.product_id), row]))
  const movements: Movement[] = (payload.movements ?? []).map((movement) => ({
    ...movement,
    source_kind: movement.source_kind ?? (movement.type === 'INBOUND' ? 'PRODUCTION' : 'SALE'),
  }))

  for (const adjustment of adjustments) {
    const delta = numberValue(adjustment.adjustment_g)
    if (!delta) continue
    const row = rowById.get(String(adjustment.product_id))
    if (!row) continue

    movements.push({
      id: `zz-adjustment:${adjustment.id}`,
      product_id: String(adjustment.product_id),
      product_name: row.product_name,
      date: String(adjustment.adjustment_date),
      type: delta >= 0 ? 'INBOUND' : 'OUTBOUND',
      source_kind: 'ADJUSTMENT',
      quantity_g: Math.abs(delta),
      reference: '재고조정',
      counterparty: adjustment.reason || '재고조정',
      lot_number: adjustment.reason || '재고조정',
      source_id: adjustment.id,
      balance_after_g: 0,
    })
  }

  const { chronological, balances } = recalculateBalances(movements)
  for (const row of inventory) {
    row.stock_g = balances.get(String(row.product_id)) ?? 0
    row.negative_stock = row.stock_g < 0
  }

  const summary = {
    ...(payload.summary ?? {}),
    stocked_product_count: inventory.filter((row) => row.stock_g > 0).length,
    negative_product_count: inventory.filter((row) => row.stock_g < 0).length,
    total_stock_g: inventory.reduce((sum, row) => sum + numberValue(row.stock_g), 0),
  }

  return {
    ...payload,
    inventory,
    movements: chronological.reverse(),
    summary,
    policy: {
      ...(payload.policy ?? {}),
      adjustment: '재고조정은 실제 입출고와 구분해 별도 이력으로 저장되며 선택 일자의 마감재고를 입력값으로 맞춤',
    },
  }
}

function movementsWithExports() {
  if (!latestInventory) return [] as Movement[]
  const inventoryById = new Map(latestInventory.inventory.map((row) => [String(row.product_id), row]))
  const movements: Movement[] = latestInventory.movements.map((row) => ({ ...row }))

  for (const document of latestExports) {
    if (document.status !== 'SHIPPED') continue
    for (const item of document.export_document_items ?? []) {
      const row = inventoryById.get(String(item.product_id))
      if (!row) continue
      const cartons = numberValue(item.cartons)
      const unitsPerCarton = numberValue(item.units_per_carton)
      const netPerCartonG = numberValue(item.net_weight_per_carton_kg) * 1000
      const quantityG = numberValue(row.weight_g) > 0 && unitsPerCarton > 0
        ? cartons * unitsPerCarton * numberValue(row.weight_g)
        : cartons * netPerCartonG
      if (!(quantityG > 0)) continue

      movements.push({
        id: `export:${document.id}:${item.id}`,
        product_id: String(item.product_id),
        product_name: row.product_name,
        date: String(document.document_date),
        type: 'OUTBOUND',
        source_kind: 'EXPORT',
        quantity_g: quantityG,
        reference: document.invoice_no || '수출 출고',
        counterparty: document.consignee_snapshot?.company_name || '수출처',
        lot_number: '',
        source_id: document.id,
        balance_after_g: 0,
      })
    }
  }

  return movements
}

function balanceAtDate(productId: string, date: string) {
  return movementsWithExports()
    .filter((movement) => String(movement.product_id) === productId && movement.date <= date)
    .reduce((sum, movement) => sum + movementDelta(movement), 0)
}

function installFetchBridge() {
  if (typeof window === 'undefined' || bridgeInstalled) return
  bridgeInstalled = true
  const originalFetch = window.fetch.bind(window)

  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    const url = new URL(rawUrl, window.location.origin)
    const response = await originalFetch(input, init)
    const method = String(init?.method || 'GET').toUpperCase()

    if (method === 'GET' && url.pathname === '/api/moni/export-documents') {
      try {
        const payload = await response.clone().json()
        if (response.ok && payload?.ok && Array.isArray(payload.documents)) {
          latestExports = payload.documents as ExportDocument[]
        }
      } catch {
        // Keep the original export response untouched.
      }
      return response
    }

    if (method !== 'GET' || url.pathname !== '/api/moni/finished-goods-inventory') return response

    try {
      const payload = await response.clone().json() as InventoryPayload
      if (!response.ok || !payload?.ok) return response
      const adjustmentResponse = await originalFetch(`/api/moni/finished-goods-inventory-adjustments?_=${Date.now()}`, { cache: 'no-store' })
      const adjustmentPayload = await adjustmentResponse.json()
      const adjustments = adjustmentResponse.ok && adjustmentPayload?.ok && Array.isArray(adjustmentPayload.adjustments)
        ? adjustmentPayload.adjustments as AdjustmentRow[]
        : []
      const merged = mergeAdjustments(payload, adjustments)
      latestInventory = merged
      return new Response(JSON.stringify(merged), {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      })
    } catch {
      return response
    }
  }) as typeof window.fetch
}

type FormState = {
  productId: string
  productName: string
  date: string
  quantity: string
  unit: Unit
  reason: string
}

const emptyForm = (): FormState => ({
  productId: '',
  productName: '',
  date: todayKst(),
  quantity: '',
  unit: 'kg',
  reason: '실사 재고 조정',
})

export default function FinishedGoodsInventoryAdjustmentBridge() {
  installFetchBridge()

  const [form, setForm] = useState<FormState>(emptyForm())
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const balanceBeforeG = useMemo(
    () => form.productId && form.date ? balanceAtDate(form.productId, form.date) : 0,
    [form.productId, form.date, open],
  )

  const targetG = useMemo(() => {
    const quantity = Number(form.quantity)
    if (!Number.isFinite(quantity) || quantity < 0) return null
    return form.unit === 'kg' ? quantity * 1000 : quantity
  }, [form.quantity, form.unit])

  const deltaG = targetG === null ? null : targetG - balanceBeforeG

  useEffect(() => {
    const openAdjustment = () => {
      const ledger = Array.from(document.querySelectorAll<HTMLElement>('h2'))
        .find((element) => element.textContent?.trim().endsWith('재고 이력'))
        ?.closest<HTMLElement>('.fixed.inset-0')
      const heading = ledger?.querySelector<HTMLElement>('h2')
      const productName = String(heading?.textContent ?? '').replace(/\s*재고 이력\s*$/, '').trim()
      const row = latestInventory?.inventory.find((item) => item.product_name === productName)
      if (!row) {
        setMessage('선택한 제품의 재고정보를 찾지 못했습니다. 재고 새로고침 후 다시 시도해 주세요.')
        return
      }

      const date = todayKst()
      const currentG = balanceAtDate(String(row.product_id), date)
      setForm({
        productId: String(row.product_id),
        productName: row.product_name,
        date,
        quantity: String(Number((currentG / 1000).toFixed(3))),
        unit: 'kg',
        reason: '실사 재고 조정',
      })
      setMessage('')
      setOpen(true)
    }

    const decorate = () => {
      const ledger = Array.from(document.querySelectorAll<HTMLElement>('h2'))
        .find((element) => element.textContent?.trim().endsWith('재고 이력'))
        ?.closest<HTMLElement>('.fixed.inset-0')
      if (!ledger) return

      const header = ledger.querySelector<HTMLElement>('.border-b')
      const closeButton = Array.from(header?.querySelectorAll<HTMLButtonElement>('button') ?? [])
        .find((button) => button.textContent?.trim() === '닫기')
      if (header && closeButton && !header.querySelector('[data-finished-goods-adjustment-button]')) {
        const button = document.createElement('button')
        button.type = 'button'
        button.dataset.finishedGoodsAdjustmentButton = 'true'
        button.textContent = '재고조정'
        button.className = 'rounded-xl bg-[#16b981] px-4 py-2.5 text-sm font-black text-white shadow-sm hover:bg-[#10a874]'
        button.addEventListener('click', openAdjustment)
        header.style.justifyContent = 'flex-start'
        const titleBlock = header.firstElementChild as HTMLElement | null
        if (titleBlock) titleBlock.style.marginRight = 'auto'
        closeButton.insertAdjacentElement('beforebegin', button)
      }

      const rows = Array.from(ledger.querySelectorAll<HTMLTableRowElement>('tbody tr'))
      for (const row of rows) {
        const cells = row.querySelectorAll<HTMLTableCellElement>('td')
        if (cells.length < 6 || cells[2]?.textContent?.trim() !== '재고조정') continue
        const typeCell = cells[1]
        typeCell.innerHTML = '<span style="display:inline-flex;border-radius:8px;padding:6px 10px;font-size:12px;font-weight:900;background:#eef7ff;color:#2673a4">재고 조정</span>'
      }
    }

    decorate()
    const observer = new MutationObserver(decorate)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [])

  const changeUnit = (next: Unit) => {
    setForm((current) => {
      if (current.unit === next) return current
      const value = Number(current.quantity)
      const converted = Number.isFinite(value)
        ? next === 'g' ? value * 1000 : value / 1000
        : value
      return {
        ...current,
        unit: next,
        quantity: Number.isFinite(converted) ? String(Number(converted.toFixed(next === 'kg' ? 3 : 1))) : current.quantity,
      }
    })
  }

  const save = async () => {
    if (!form.productId || !form.date) return
    if (targetG === null) {
      setMessage('조정 후 재고 수량을 0 이상으로 입력해 주세요.')
      return
    }
    if (!form.reason.trim()) {
      setMessage('재고조정 사유를 입력해 주세요.')
      return
    }
    if (deltaG !== null && Math.abs(deltaG) < 0.0001) {
      setMessage('현재 재고와 동일합니다. 조정할 재고 수량을 변경해 주세요.')
      return
    }

    setSaving(true)
    setMessage('')
    try {
      const response = await fetch('/api/moni/finished-goods-inventory-adjustments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: form.productId,
          adjustment_date: form.date,
          input_quantity: Number(form.quantity),
          input_unit: form.unit,
          balance_before_g: balanceBeforeG,
          reason: form.reason.trim(),
        }),
      })
      const payload = await response.json()
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || '재고조정 저장에 실패했습니다.')

      setOpen(false)
      const refreshButton = Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
        .find((button) => button.textContent?.trim() === '재고 새로고침')
      if (refreshButton) refreshButton.click()
      else window.location.reload()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '재고조정 저장에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  return <>
    <FinishedGoodsInventoryPage />

    {open && <div className="fixed inset-0 z-[1500] flex items-center justify-center bg-[rgba(12,31,44,0.38)] p-4 backdrop-blur-[4px]" onMouseDown={(event) => { if (event.currentTarget === event.target && !saving) setOpen(false) }}>
      <div className="w-full max-w-[560px] overflow-hidden rounded-[26px] border border-[#cfe1eb] bg-white shadow-[0_28px_80px_rgba(22,52,72,0.28)]">
        <div className="border-b border-[#dce9f0] px-6 py-5">
          <p className="text-xs font-black uppercase tracking-[0.15em] text-[#2b9b76]">STOCK ADJUSTMENT</p>
          <h2 className="mt-1 text-2xl font-black tracking-[-0.025em] text-[#17384d]">재고조정</h2>
          <p className="mt-1 text-sm text-[#718896]">{form.productName}</p>
        </div>

        <div className="space-y-5 px-6 py-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-bold text-[#466274]">
              <span className="mb-1.5 block">조정 일자</span>
              <input type="date" max={todayKst()} value={form.date} onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))} className="h-11 w-full rounded-xl border border-[#cfe0e9] bg-white px-3 text-[#17384d] outline-none focus:border-[#75bad3]" />
            </label>

            <div className="block text-sm font-bold text-[#466274]">
              <span className="mb-1.5 block">입력 단위</span>
              <div className="grid h-11 grid-cols-2 overflow-hidden rounded-xl border border-[#cfe0e9] bg-[#f7fbfd] p-1">
                {(['kg', 'g'] as Unit[]).map((unit) => <button key={unit} type="button" onClick={() => changeUnit(unit)} className={`rounded-lg text-sm font-black ${form.unit === unit ? 'bg-[#16b981] text-white shadow-sm' : 'text-[#5f7888]'}`}>{unit}</button>)}
              </div>
            </div>
          </div>

          <label className="block text-sm font-bold text-[#466274]">
            <span className="mb-1.5 block">조정 후 재고 ({form.unit})</span>
            <input type="number" min="0" step={form.unit === 'kg' ? '0.001' : '0.1'} value={form.quantity} onChange={(event) => setForm((current) => ({ ...current, quantity: event.target.value }))} className="h-12 w-full rounded-xl border border-[#cfe0e9] bg-white px-4 text-lg font-black text-[#17384d] outline-none focus:border-[#75bad3]" />
            <span className="mt-1.5 block text-xs font-medium leading-5 text-[#8195a1]">입력한 kg/g 값은 MONI 내부 기준인 g으로 자동 변환되어 저장됩니다. 선택한 일자의 마감재고를 이 수량으로 맞춥니다.</span>
          </label>

          <label className="block text-sm font-bold text-[#466274]">
            <span className="mb-1.5 block">조정 사유</span>
            <input value={form.reason} onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))} placeholder="예: 실사 재고 조정" className="h-11 w-full rounded-xl border border-[#cfe0e9] bg-white px-3 text-[#17384d] outline-none focus:border-[#75bad3]" />
          </label>

          <div className="grid gap-3 rounded-2xl border border-[#d8e8ef] bg-[#f7fbfd] p-4 sm:grid-cols-3">
            <div><span className="text-[11px] font-bold text-[#78909e]">조정 전</span><strong className="mt-1 block text-lg font-black text-[#17384d]">{formatKg(balanceBeforeG)}</strong></div>
            <div><span className="text-[11px] font-bold text-[#78909e]">조정 후</span><strong className="mt-1 block text-lg font-black text-[#176f99]">{targetG === null ? '-' : formatKg(targetG)}</strong></div>
            <div><span className="text-[11px] font-bold text-[#78909e]">재고 변동</span><strong className={`mt-1 block text-lg font-black ${deltaG === null ? 'text-[#81939e]' : deltaG >= 0 ? 'text-[#16825d]' : 'text-[#c4515b]'}`}>{deltaG === null ? '-' : `${deltaG >= 0 ? '+' : '-'}${formatKg(Math.abs(deltaG))}`}</strong></div>
          </div>

          {message && <div className="rounded-xl border border-[#efc0c4] bg-[#fff7f7] px-4 py-3 text-sm font-bold text-[#ad4b55]">{message}</div>}
        </div>

        <div className="flex justify-end gap-2 border-t border-[#dce9f0] bg-[#fbfdfe] px-6 py-4">
          <button type="button" disabled={saving} onClick={() => setOpen(false)} className="h-11 rounded-xl border border-[#cbdde6] bg-white px-5 text-sm font-black text-[#587283] disabled:opacity-50">취소</button>
          <button type="button" disabled={saving} onClick={() => void save()} className="h-11 rounded-xl bg-[#16b981] px-5 text-sm font-black text-white shadow-sm hover:bg-[#10a874] disabled:opacity-50">{saving ? '반영 중...' : '재고조정 반영'}</button>
        </div>
      </div>
    </div>}
  </>
}
