'use client'

import { useEffect } from 'react'

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

const BUTTON_ATTR = 'data-monthly-plan-to-work-order'
const PLAN_ID_ATTR = 'data-monthly-plan-id'

function normalizedText(value: unknown): string {
  return String(value ?? '').trim().replace(/\s+/g, ' ')
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

function planKey(planDate: string, productName: string): string {
  return `${planDate}::${normalizedText(productName)}`
}

function conversionButton(card: HTMLElement): HTMLButtonElement | null {
  return card.querySelector<HTMLButtonElement>(`button[${BUTTON_ATTR}]`)
}

function setButtonBusy(button: HTMLButtonElement, busy: boolean) {
  button.disabled = busy
  button.textContent = busy ? '전환 중...' : '작업지시서로 전환'
  button.className = busy
    ? 'font-bold text-amber-200/60 underline decoration-amber-400/40 underline-offset-2 cursor-wait'
    : 'font-bold text-amber-200 underline decoration-amber-400/70 underline-offset-2 hover:text-amber-100'
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

async function convertPlan(plan: MonthlyPlan, button: HTMLButtonElement): Promise<void> {
  const confirmed = window.confirm(
    `이 예상 계획을 작업지시서로 전환할까요?\n\n${plan.plan_date} · ${plan.product_name}\n생산일·제품·예정량은 그대로 사용하며 LOT는 작업지시서 규칙에 따라 자동 생성됩니다.`,
  )
  if (!confirmed) return

  setButtonBusy(button, true)
  let createdRecordId = ''

  try {
    const createResponse = await fetch('/api/moni/production-records', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        work_date: plan.plan_date,
        product_id: plan.product_id,
        product_name: plan.product_name,
        planned_quantity_g: Number(plan.planned_quantity_g),
        note: normalizedText(plan.note) || null,
        status: 'planned',
        business_id: normalizedText(plan.business_id) || undefined,
      }),
    })
    const createPayload = (await createResponse.json().catch(() => null)) as ProductionRecordPayload | null
    if (!createResponse.ok || createPayload?.ok !== true) {
      throw new Error(createPayload?.error || '작업지시서 생성에 실패했습니다.')
    }

    createdRecordId = normalizedText(createPayload.record?.id)
    if (!createdRecordId) {
      throw new Error('작업지시서가 생성되었지만 생성 ID를 확인하지 못했습니다.')
    }

    const deleteResponse = await fetch(
      `/api/moni/monthly-production-plans?id=${encodeURIComponent(plan.id)}`,
      { method: 'DELETE' },
    )
    const deletePayload = (await deleteResponse.json().catch(() => null)) as { ok?: boolean; error?: string } | null

    if (!deleteResponse.ok || deletePayload?.ok !== true) {
      const rolledBack = await rollbackCreatedWorkOrder(createdRecordId)
      if (rolledBack) {
        throw new Error(
          deletePayload?.error ||
            '예상 계획 삭제에 실패해 새 작업지시서를 자동으로 되돌렸습니다. 기존 예상 계획은 그대로 유지됩니다.',
        )
      }

      throw new Error(
        '예상 계획 삭제에 실패했고 새 작업지시서 자동 롤백도 실패했습니다. 중복 상태가 생겼을 수 있으므로 작업지시서 목록을 확인해 주세요.',
      )
    }

    const refreshButton = findRefreshButton()
    if (refreshButton) {
      refreshButton.click()
    } else {
      window.dispatchEvent(new Event('focus'))
    }
  } catch (error) {
    if (createdRecordId && error instanceof Error && error.message.includes('생성 ID를 확인하지 못했습니다.')) {
      window.alert(`${error.message}\n예상 계획은 삭제하지 않았습니다. 작업지시서 목록에서 신규 생성 여부를 확인해 주세요.`)
      return
    }
    window.alert(error instanceof Error ? error.message : '작업지시서 전환 중 오류가 발생했습니다.')
  } finally {
    if (button.isConnected) setButtonBusy(button, false)
  }
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
  const plansByKey = new Map<string, MonthlyPlan[]>()
  for (const plan of plans) {
    const key = planKey(plan.plan_date, plan.product_name)
    plansByKey.set(key, [...(plansByKey.get(key) ?? []), plan])
  }

  const usedByKey = new Map<string, number>()
  for (const card of expectedPlanCards()) {
    const date = cardDate(card, month)
    const productName = cardProductName(card)
    if (!date || !productName) continue

    const key = planKey(date, productName)
    const index = usedByKey.get(key) ?? 0
    const plan = plansByKey.get(key)?.[index]
    usedByKey.set(key, index + 1)
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
    button.title = '이 예상 계획을 실제 작업지시서로 전환'
    setButtonBusy(button, false)
    button.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      void convertPlan(plan, button)
    })
    actionRow.appendChild(button)
  }
}

export default function MonthlyPlanToWorkOrderController() {
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

      if (month !== loadedMonth) {
        const serial = ++requestSerial
        try {
          const plans = await loadPlans(month)
          if (disposed || serial !== requestSerial) return
          loadedMonth = month
          cachedPlans = plans
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

    const observer = new MutationObserver(scheduleSync)
    observer.observe(document.body, { childList: true, subtree: true })
    window.addEventListener('focus', scheduleSync)
    scheduleSync()

    return () => {
      disposed = true
      requestSerial += 1
      observer.disconnect()
      window.removeEventListener('focus', scheduleSync)
      if (syncTimer !== null) window.clearTimeout(syncTimer)
      document.querySelectorAll(`[${BUTTON_ATTR}]`).forEach((node) => node.remove())
      document.querySelectorAll(`[${PLAN_ID_ATTR}]`).forEach((node) => node.removeAttribute(PLAN_ID_ATTR))
    }
  }, [])

  return null
}
