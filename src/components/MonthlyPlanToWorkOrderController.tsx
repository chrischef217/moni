'use client'

import { useEffect, useRef, useState } from 'react'

type MonthlyPlan = {
  id: string
  plan_date: string
  product_id: string
  product_name: string
  planned_quantity_g: number
  note?: string | null
  business_id?: string | null
}

type MonthlyPlansPayload = {
  ok?: boolean
  error?: string
  plans?: MonthlyPlan[]
}

type ProductionRecordPayload = {
  ok?: boolean
  error?: string
  record?: {
    id?: string | null
  }
}

type ProductionRecordsPayload = {
  ok?: boolean
  error?: string
  records?: Array<{
    lot_number?: string | null
  }>
}

const BUTTON_ATTR = 'data-monthly-plan-to-work-order'
const PLAN_ID_ATTR = 'data-monthly-plan-id'
const OPEN_MODAL_EVENT = 'moni:monthly-plan-to-work-order'

function normalizedText(value: unknown): string {
  return String(value ?? '').trim().replace(/\s+/g, ' ')
}

function formatKg(value: number): string {
  const kg = Number(value || 0) / 1000
  return `${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: kg >= 100 ? 0 : 1 }).format(kg)}kg`
}

function lotPrefix(workDate: string): string {
  return `LOT${workDate.replaceAll('-', '')}`
}

function isValidIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function isValidLotForDate(lotNumber: string, workDate: string): boolean {
  if (!isValidIsoDate(workDate)) return false
  return new RegExp(`^${lotPrefix(workDate)}-[1-9][0-9]*$`).test(lotNumber)
}

function isMonthlyPlanPage(): boolean {
  return window.location.pathname === '/monthly-production-plan'
}

function currentMonthFromPage(): string | null {
  const candidates = Array.from(document.querySelectorAll<HTMLElement>('b, h1, h2, span'))
  for (const node of candidates) {
    const match = normalizedText(node.textContent).match(/^(20\d{2})년\s*(\d{1,2})월$/)
    if (!match) continue
    return `${match[1]}-${String(Number(match[2])).padStart(2, '0')}`
  }
  return null
}

function expectedPlanCards(): HTMLElement[] {
  const labels = Array.from(document.querySelectorAll<HTMLElement>('span')).filter(
    (node) => normalizedText(node.textContent) === '예상 계획',
  )

  return labels
    .map((label) => label.closest<HTMLElement>('div.rounded-lg.border'))
    .filter((card): card is HTMLElement => !!card)
}

function cardDate(card: HTMLElement, month: string): string | null {
  const dayCell = card.closest<HTMLElement>('[role="button"]')
  if (!dayCell) return null

  const dayLabel = Array.from(dayCell.children).find(
    (child): child is HTMLElement => child instanceof HTMLElement && child.tagName === 'SPAN',
  )
  const day = Number(normalizedText(dayLabel?.textContent))
  if (!Number.isInteger(day) || day < 1 || day > 31) return null
  return `${month}-${String(day).padStart(2, '0')}`
}

function cardProductName(card: HTMLElement): string {
  return normalizedText(card.querySelector('b')?.textContent)
}

function cardQuantityLabel(card: HTMLElement): string {
  const headerRow = card.firstElementChild instanceof HTMLElement ? card.firstElementChild : null
  return normalizedText(headerRow?.querySelector('span')?.textContent)
}

function planKey(planDate: string, productName: string, quantityLabel: string): string {
  return `${planDate}::${normalizedText(productName)}::${normalizedText(quantityLabel)}`
}

function conversionButton(card: HTMLElement): HTMLButtonElement | null {
  return card.querySelector<HTMLButtonElement>(`button[${BUTTON_ATTR}]`)
}

function styleConversionButton(button: HTMLButtonElement) {
  button.textContent = '작업지시서로 전환'
  button.className = 'font-bold text-amber-200 underline decoration-amber-400/70 underline-offset-2 hover:text-amber-100'
}

function findRefreshButton(): HTMLButtonElement | null {
  return (
    Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => normalizedText(button.textContent) === '실제 생산 동기화',
    ) ?? null
  )
}

async function rollbackCreatedWorkOrder(recordId: string): Promise<boolean> {
  try {
    const response = await fetch('/api/moni/production-records', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', record_id: recordId }),
    })
    const payload = (await response.json().catch(() => null)) as ProductionRecordPayload | null
    return response.ok && payload?.ok === true
  } catch {
    return false
  }
}

async function suggestLotNumber(workDate: string): Promise<string> {
  if (!isValidIsoDate(workDate)) throw new Error('생산일자를 먼저 확인해 주세요.')

  const response = await fetch(
    `/api/moni/production-records?from=${encodeURIComponent(workDate)}&to=${encodeURIComponent(workDate)}&limit=1000&_=${Date.now()}`,
    { cache: 'no-store' },
  )
  const payload = (await response.json().catch(() => null)) as ProductionRecordsPayload | null
  if (!response.ok || payload?.ok !== true) {
    throw new Error(payload?.error || 'LOT 자동 제안에 실패했습니다.')
  }

  const prefix = lotPrefix(workDate)
  let maxSequence = 0
  for (const record of payload.records ?? []) {
    const lotNumber = normalizedText(record.lot_number).toUpperCase()
    const match = lotNumber.match(new RegExp(`^${prefix}-([1-9][0-9]*)$`))
    if (!match) continue
    const sequence = Number(match[1])
    if (Number.isFinite(sequence) && sequence > maxSequence) maxSequence = sequence
  }
  return `${prefix}-${maxSequence + 1}`
}

async function loadPlans(month: string): Promise<MonthlyPlan[]> {
  const response = await fetch(`/api/moni/monthly-production-plans?month=${encodeURIComponent(month)}&level=standard`, {
    cache: 'no-store',
  })
  const payload = (await response.json().catch(() => null)) as MonthlyPlansPayload | null
  if (!response.ok || payload?.ok !== true) {
    throw new Error(payload?.error || '예상 계획 목록을 불러오지 못했습니다.')
  }
  return payload.plans ?? []
}

function installButtons(month: string, plans: MonthlyPlan[]) {
  const planByKey = new Map<string, MonthlyPlan>()
  for (const plan of plans) {
    const key = planKey(plan.plan_date, plan.product_name, formatKg(Number(plan.planned_quantity_g)))
    if (!planByKey.has(key)) planByKey.set(key, plan)
  }

  for (const card of expectedPlanCards()) {
    const date = cardDate(card, month)
    const productName = cardProductName(card)
    const quantityLabel = cardQuantityLabel(card)
    if (!date || !productName || !quantityLabel) continue

    const plan = planByKey.get(planKey(date, productName, quantityLabel))
    if (!plan) continue

    card.setAttribute(PLAN_ID_ATTR, plan.id)
    const existing = conversionButton(card)
    if (existing) {
      existing.dataset.planId = plan.id
      continue
    }

    const actionRow = Array.from(card.querySelectorAll<HTMLElement>('div')).find((node) => {
      const directSpans = Array.from(node.children).filter((child) => child.tagName === 'SPAN')
      return directSpans.some((span) => normalizedText(span.textContent) === '예상 계획')
    })
    if (!actionRow) continue

    const button = document.createElement('button')
    button.type = 'button'
    button.setAttribute(BUTTON_ATTR, 'true')
    button.dataset.planId = plan.id
    button.title = '예상 계획을 확인·수정한 뒤 작업지시서로 전환'
    styleConversionButton(button)
    button.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      window.dispatchEvent(new CustomEvent(OPEN_MODAL_EVENT, { detail: { planId: button.dataset.planId } }))
    })
    actionRow.appendChild(button)
  }
}

export default function MonthlyPlanToWorkOrderController() {
  const plansRef = useRef<MonthlyPlan[]>([])
  const lotRequestRef = useRef(0)
  const [selectedPlan, setSelectedPlan] = useState<MonthlyPlan | null>(null)
  const [workDate, setWorkDate] = useState('')
  const [quantityKg, setQuantityKg] = useState('')
  const [lotNumber, setLotNumber] = useState('')
  const [note, setNote] = useState('')
  const [lotLoading, setLotLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [modalError, setModalError] = useState('')

  async function refreshSuggestedLot(nextDate: string) {
    const requestId = ++lotRequestRef.current
    setLotLoading(true)
    setModalError('')
    try {
      const suggested = await suggestLotNumber(nextDate)
      if (requestId !== lotRequestRef.current) return
      setLotNumber(suggested)
    } catch (error) {
      if (requestId !== lotRequestRef.current) return
      setLotNumber('')
      setModalError(
        `${error instanceof Error ? error.message : 'LOT 자동 제안에 실패했습니다.'} 직접 입력해서 계속 진행할 수 있습니다.`,
      )
    } finally {
      if (requestId === lotRequestRef.current) setLotLoading(false)
    }
  }

  function openModal(plan: MonthlyPlan) {
    setSelectedPlan(plan)
    setWorkDate(plan.plan_date)
    setQuantityKg(String(Number(plan.planned_quantity_g) / 1000))
    setNote(plan.note ?? '')
    setLotNumber('')
    setModalError('')
    setSaving(false)
    void refreshSuggestedLot(plan.plan_date)
  }

  function closeModal() {
    if (saving) return
    lotRequestRef.current += 1
    setSelectedPlan(null)
    setModalError('')
    setLotLoading(false)
  }

  async function createWorkOrder() {
    if (!selectedPlan || saving) return

    const plannedQuantityG = Math.round(Number(quantityKg) * 1000)
    const normalizedLot = normalizedText(lotNumber).toUpperCase()

    if (!isValidIsoDate(workDate)) {
      setModalError('생산일자를 확인해 주세요.')
      return
    }
    if (!Number.isFinite(plannedQuantityG) || plannedQuantityG <= 0) {
      setModalError('생산량은 0보다 크게 입력해 주세요.')
      return
    }
    if (!isValidLotForDate(normalizedLot, workDate)) {
      setModalError(`LOT는 ${lotPrefix(workDate)}-1 형식으로 입력해 주세요. 순번 앞에는 0을 붙이지 않습니다.`)
      return
    }

    setSaving(true)
    setModalError('')
    let createdRecordId = ''

    try {
      const createResponse = await fetch('/api/moni/production-records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          work_date: workDate,
          lot_number: normalizedLot,
          product_id: selectedPlan.product_id,
          product_name: selectedPlan.product_name,
          planned_quantity_g: plannedQuantityG,
          note: normalizedText(note) || null,
          status: 'planned',
          business_id: normalizedText(selectedPlan.business_id) || undefined,
        }),
      })
      const createPayload = (await createResponse.json().catch(() => null)) as ProductionRecordPayload | null
      if (!createResponse.ok || createPayload?.ok !== true) {
        throw new Error(createPayload?.error || '작업지시서 생성에 실패했습니다.')
      }

      createdRecordId = normalizedText(createPayload.record?.id)
      if (!createdRecordId) {
        throw new Error('작업지시서가 생성되었지만 생성 ID를 확인하지 못했습니다. 예상 계획은 삭제하지 않았습니다.')
      }

      const deleteResponse = await fetch(
        `/api/moni/monthly-production-plans?id=${encodeURIComponent(selectedPlan.id)}`,
        { method: 'DELETE' },
      )
      const deletePayload = (await deleteResponse.json().catch(() => null)) as { ok?: boolean; error?: string } | null

      if (!deleteResponse.ok || deletePayload?.ok !== true) {
        const rolledBack = await rollbackCreatedWorkOrder(createdRecordId)
        if (rolledBack) {
          throw new Error('예상 계획 정리에 실패해 방금 생성한 작업지시서를 자동으로 되돌렸습니다. 기존 예상 계획은 그대로 유지됩니다.')
        }
        throw new Error('예상 계획 정리와 작업지시 자동 롤백이 모두 실패했습니다. 작업지시 목록에서 중복 여부를 확인해 주세요.')
      }

      setSelectedPlan(null)
      const refreshButton = findRefreshButton()
      if (refreshButton) refreshButton.click()
      else window.dispatchEvent(new Event('focus'))
    } catch (error) {
      setModalError(error instanceof Error ? error.message : '작업지시서 생성 중 오류가 발생했습니다.')
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    let disposed = false
    let syncTimer: number | null = null
    let loadedMonth = ''
    let cachedPlans: MonthlyPlan[] = []
    let requestSerial = 0

    const sync = async () => {
      if (disposed || !isMonthlyPlanPage()) return
      const month = currentMonthFromPage()
      if (!month) return

      const cards = expectedPlanCards()
      const needsRefresh = month !== loadedMonth || cards.some((card) => !card.hasAttribute(PLAN_ID_ATTR))

      if (needsRefresh) {
        const serial = ++requestSerial
        try {
          const plans = await loadPlans(month)
          if (disposed || serial !== requestSerial) return
          loadedMonth = month
          cachedPlans = plans
          plansRef.current = plans
        } catch {
          return
        }
      }

      installButtons(month, cachedPlans)
    }

    const scheduleSync = () => {
      if (syncTimer !== null) window.clearTimeout(syncTimer)
      syncTimer = window.setTimeout(() => {
        syncTimer = null
        void sync()
      }, 120)
    }

    const openModalFromCard = (event: Event) => {
      const detail = (event as CustomEvent<{ planId?: string }>).detail
      const planId = normalizedText(detail?.planId)
      if (!planId) return
      const plan = plansRef.current.find((item) => item.id === planId)
      if (plan) openModal(plan)
    }

    const observer = new MutationObserver(scheduleSync)
    observer.observe(document.body, { childList: true, subtree: true })
    window.addEventListener('focus', scheduleSync)
    window.addEventListener(OPEN_MODAL_EVENT, openModalFromCard)
    scheduleSync()

    return () => {
      disposed = true
      requestSerial += 1
      observer.disconnect()
      window.removeEventListener('focus', scheduleSync)
      window.removeEventListener(OPEN_MODAL_EVENT, openModalFromCard)
      if (syncTimer !== null) window.clearTimeout(syncTimer)
      document.querySelectorAll(`[${BUTTON_ATTR}]`).forEach((node) => node.remove())
      document.querySelectorAll(`[${PLAN_ID_ATTR}]`).forEach((node) => node.removeAttribute(PLAN_ID_ATTR))
    }
  }, [])

  if (!selectedPlan) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-xl rounded-2xl border border-slate-600 bg-[#101d31] p-6 text-slate-100 shadow-2xl">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-black">작업지시서 생성</h2>
            <p className="mt-1 text-sm text-slate-400">예상 계획 값을 확인하고 필요한 항목을 수정한 뒤 생성합니다.</p>
          </div>
          <button
            type="button"
            onClick={closeModal}
            disabled={saving}
            className="text-2xl leading-none text-slate-400 hover:text-white disabled:opacity-40"
            aria-label="닫기"
          >
            ×
          </button>
        </div>

        {modalError && (
          <div className="mb-4 rounded-xl border border-red-500/50 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {modalError}
          </div>
        )}

        <div className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm font-bold text-slate-300">제품</span>
            <input
              value={selectedPlan.product_name}
              readOnly
              className="w-full rounded-xl border border-slate-700 bg-slate-900/60 p-3 font-bold text-slate-200 outline-none"
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-sm font-bold text-slate-300">생산일자</span>
              <input
                type="date"
                value={workDate}
                disabled={saving}
                onChange={(event) => {
                  const nextDate = event.target.value
                  setWorkDate(nextDate)
                  setLotNumber('')
                  setModalError('')
                  if (isValidIsoDate(nextDate)) void refreshSuggestedLot(nextDate)
                }}
                className="w-full rounded-xl border border-slate-600 bg-slate-900 p-3 outline-none focus:border-blue-400 disabled:opacity-60"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-bold text-slate-300">생산량(kg)</span>
              <input
                type="number"
                min="0.001"
                step="0.001"
                value={quantityKg}
                disabled={saving}
                onChange={(event) => setQuantityKg(event.target.value)}
                className="w-full rounded-xl border border-slate-600 bg-slate-900 p-3 outline-none focus:border-blue-400 disabled:opacity-60"
              />
            </label>
          </div>

          <label className="block">
            <div className="mb-1 flex items-center justify-between gap-3">
              <span className="text-sm font-bold text-slate-300">LOT</span>
              <span className="text-xs text-slate-500">생산일 기준 다음 순번 자동 제안 · 직접 수정 가능</span>
            </div>
            <input
              value={lotNumber}
              disabled={saving}
              onChange={(event) => {
                setLotNumber(event.target.value.toUpperCase())
                setModalError('')
              }}
              placeholder={lotLoading ? 'LOT 계산 중...' : `${lotPrefix(workDate || 'YYYY-MM-DD')}-1`}
              className="w-full rounded-xl border border-amber-400/60 bg-slate-900 p-3 font-mono font-bold text-amber-100 outline-none focus:border-amber-300 disabled:opacity-60"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-bold text-slate-300">메모</span>
            <textarea
              value={note}
              disabled={saving}
              onChange={(event) => setNote(event.target.value)}
              rows={3}
              className="w-full resize-none rounded-xl border border-slate-600 bg-slate-900 p-3 outline-none focus:border-blue-400 disabled:opacity-60"
            />
          </label>
        </div>

        <div className="mt-6 flex justify-end gap-3 border-t border-slate-700 pt-5">
          <button
            type="button"
            onClick={closeModal}
            disabled={saving}
            className="rounded-xl border border-slate-600 px-5 py-3 font-bold text-slate-200 hover:bg-slate-800 disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={() => void createWorkOrder()}
            disabled={saving || lotLoading}
            className="rounded-xl bg-amber-500 px-6 py-3 font-black text-slate-950 hover:bg-amber-400 disabled:cursor-wait disabled:opacity-50"
          >
            {saving ? '생성 중...' : lotLoading ? 'LOT 확인 중...' : '작업지시 생성'}
          </button>
        </div>
      </div>
    </div>
  )
}
