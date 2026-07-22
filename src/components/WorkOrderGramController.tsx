'use client'

import { useEffect } from 'react'

type WorkOrderRecord = {
  id: string
  lot_number?: string | null
  planned_quantity_g?: number | string | null
}

type ProductionRecordsPayload = {
  ok?: boolean
  error?: string
  records?: WorkOrderRecord[]
}

type ProductionActionPayload = {
  ok?: boolean
  error?: string
  record?: WorkOrderRecord | null
}

const CREATE_LABELS = new Set([
  '예정 생산량 (kg)',
  '예정 생산량(kg)',
  '생산 예정량(kg)',
  '예정 생산량(g)',
  '생산 예정량(g)',
])
const EDIT_LABELS = new Set(['수정 예정량(kg)', '수정 예정량(g)'])
const RELEVANT_BUTTON_TEXTS = [
  '작업 지시',
  '작업지시서',
  '작업지시서 생성',
  '작업지시서 수정',
  '수정',
  '닫기',
]
const GRAM_HELP_TEXT = 'g 단위 정수로 입력하세요. 예: 434,069g은 434069로 입력'

function normalizedText(element: Element | null) {
  return (element?.textContent || '').replace(/\s+/g, ' ').trim()
}

function setNativeInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  if (setter) setter.call(input, value)
  else input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

function gramTextFromKgValue(value: string) {
  const kg = Number(String(value || '').replaceAll(',', '').trim())
  if (!Number.isFinite(kg) || kg <= 0) return ''
  const grams = kg * 1000
  return Number.isInteger(grams) ? String(grams) : String(Number(grams.toFixed(6)))
}

function sanitizeGramInput(value: string) {
  const digits = String(value || '').replace(/[^0-9]/g, '')
  if (!digits) return ''
  return String(Number(digits))
}

function createVisibleGramInput(source: HTMLInputElement, mode: 'create' | 'edit', requestRefresh: () => void) {
  const label = source.closest('label')
  if (!label) return
  const labelSpan = label.querySelector(':scope > span')
  if (!labelSpan) return

  labelSpan.textContent = mode === 'edit' ? '수정 예정량(g)' : '예정 생산량(g)'
  source.dataset.moniWorkOrderGramSource = mode
  source.style.display = 'none'
  source.tabIndex = -1
  source.setAttribute('aria-hidden', 'true')

  const existing = label.querySelector<HTMLInputElement>(`input[data-moni-work-order-${mode}-g="true"]`)
  if (existing) {
    if (document.activeElement !== existing) {
      const nextValue = gramTextFromKgValue(source.value)
      if (existing.value !== nextValue) existing.value = nextValue
    }
    return
  }

  const visible = document.createElement('input')
  visible.type = 'text'
  visible.inputMode = 'numeric'
  visible.autocomplete = 'off'
  visible.placeholder = '예: 434069'
  visible.className = source.className
  visible.value = gramTextFromKgValue(source.value)
  visible.dataset[`moniWorkOrder${mode === 'edit' ? 'Edit' : 'Create'}G`] = 'true'
  visible.setAttribute('aria-label', mode === 'edit' ? '수정 예정량(g)' : '예정 생산량(g)')

  const helper = document.createElement('p')
  helper.dataset.moniWorkOrderGramHelp = mode
  helper.className = 'mt-1 text-xs text-amber-300'
  helper.textContent = GRAM_HELP_TEXT

  visible.addEventListener('input', () => {
    const gramsText = sanitizeGramInput(visible.value)
    if (visible.value !== gramsText) visible.value = gramsText
    const grams = Number(gramsText || 0)
    setNativeInputValue(source, grams > 0 ? String(grams / 1000) : '')
    requestRefresh()
  })

  source.insertAdjacentElement('afterend', visible)
  visible.insertAdjacentElement('afterend', helper)
}

function applyGramInputs(requestRefresh: () => void) {
  const labels = Array.from(document.querySelectorAll<HTMLLabelElement>('label'))
  for (const label of labels) {
    const labelText = normalizedText(label.querySelector(':scope > span'))
    const source = label.querySelector<HTMLInputElement>('input[type="number"]')
    if (!source) continue

    if (CREATE_LABELS.has(labelText)) {
      createVisibleGramInput(source, 'create', requestRefresh)
      continue
    }
    if (EDIT_LABELS.has(labelText)) {
      createVisibleGramInput(source, 'edit', requestRefresh)
    }
  }
}

function applyGramDisplays() {
  const paragraphs = Array.from(document.querySelectorAll<HTMLParagraphElement>('p'))
  for (const paragraph of paragraphs) {
    const raw = normalizedText(paragraph)
    const matched = raw.match(/^현재 예정량:\s*([0-9,.]+)kg$/)
    if (!matched) continue
    const kg = Number(matched[1].replaceAll(',', ''))
    if (!Number.isFinite(kg)) continue
    paragraph.textContent = `현재 예정량: ${Math.round(kg * 1000).toLocaleString('ko-KR')}g`
  }

  const headings = Array.from(document.querySelectorAll<HTMLElement>('h2, h3, h4'))
  const listHeading = headings.find((heading) => normalizedText(heading) === '등록된 작업지시서 목록')
  const section = listHeading?.closest('section') ?? listHeading?.parentElement?.parentElement
  if (section) {
    const plannedHeader = Array.from(section.querySelectorAll<HTMLTableCellElement>('th'))
      .find((header) => normalizedText(header) === '예정량')
    if (plannedHeader) plannedHeader.textContent = '예정량(g)'
  }

  const descriptions = Array.from(document.querySelectorAll<HTMLElement>('p, span'))
  for (const element of descriptions) {
    const text = normalizedText(element)
    if (text.includes('계획 생산량(kg)')) {
      element.textContent = text.replaceAll('계획 생산량(kg)', '계획 생산량(g)')
    }
  }
}

function findFieldInput(modal: Element, labelText: string) {
  const labels = Array.from(modal.querySelectorAll<HTMLLabelElement>('label'))
  const label = labels.find((candidate) => normalizedText(candidate.querySelector(':scope > span')) === labelText)
  return label?.querySelector<HTMLInputElement>('input') ?? null
}

async function readRecords() {
  const response = await fetch(`/api/moni/production-records?limit=1000&include_cancelled=true&_=${Date.now()}`, {
    cache: 'no-store',
  })
  const payload = (await response.json().catch(() => null)) as ProductionRecordsPayload | null
  if (!response.ok || !payload?.ok) throw new Error(payload?.error || '작업지시서 목록을 불러오지 못했습니다.')
  return payload.records ?? []
}

async function savePlannedGram(modal: Element, button: HTMLButtonElement) {
  const visibleGramInput = modal.querySelector<HTMLInputElement>('input[data-moni-work-order-edit-g="true"]')
  const workDateInput = modal.querySelector<HTMLInputElement>('input[type="date"]')
  const lotInput = findFieldInput(modal, 'LOT')
  const originalLot = normalizedText(modal).match(/LOT\d{8}-[1-9][0-9]*/)?.[0] || ''
  const plannedGram = Number(visibleGramInput?.value || 0)
  const workDate = workDateInput?.value.trim() || ''
  const lotNumber = lotInput?.value.trim().toUpperCase() || ''

  if (!Number.isInteger(plannedGram) || plannedGram <= 0) {
    throw new Error('수정 예정량은 g 단위의 1 이상 정수로 입력해 주세요.')
  }
  if (!workDate) throw new Error('생산예정일을 입력해 주세요.')
  if (!lotNumber) throw new Error('LOT를 입력해 주세요.')

  const records = await readRecords()
  const target = records.find((record) => String(record.lot_number || '').toUpperCase() === originalLot.toUpperCase())
    || records.find((record) => String(record.lot_number || '').toUpperCase() === lotNumber)
  if (!target?.id) throw new Error('수정할 작업지시서를 찾지 못했습니다. 화면을 새로고침한 뒤 다시 시도해 주세요.')

  const response = await fetch('/api/moni/production-records', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'update_planned',
      record_id: target.id,
      work_date: workDate,
      lot_number: lotNumber,
      planned_quantity_g: plannedGram,
    }),
  })
  const payload = (await response.json().catch(() => null)) as ProductionActionPayload | null
  if (!response.ok || !payload?.ok) throw new Error(payload?.error || '작업지시서 수정에 실패했습니다.')
  if (Number(payload.record?.planned_quantity_g) !== plannedGram) {
    throw new Error('수정된 예정량이 서버 저장값과 일치하지 않습니다.')
  }

  const verifiedRecords = await readRecords()
  const verified = verifiedRecords.find((record) => record.id === target.id)
  if (Number(verified?.planned_quantity_g) !== plannedGram) {
    throw new Error('저장 후 재조회한 예정량이 입력값과 일치하지 않습니다.')
  }

  button.textContent = '저장 완료'
  window.setTimeout(() => window.location.reload(), 250)
}

export default function WorkOrderGramController() {
  useEffect(() => {
    const pendingTimers = new Set<number>()

    const apply = () => {
      applyGramInputs(scheduleRefresh)
      applyGramDisplays()
    }

    const scheduleAt = (delay: number) => {
      const timer = window.setTimeout(() => {
        pendingTimers.delete(timer)
        apply()
      }, delay)
      pendingTimers.add(timer)
    }

    function scheduleRefresh() {
      scheduleAt(0)
      scheduleAt(60)
    }

    const scheduleAfterNavigation = () => {
      scheduleAt(0)
      scheduleAt(80)
      scheduleAt(220)
      scheduleAt(500)
    }

    const onClickCapture = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('button') : null
      if (!target) return
      const text = normalizedText(target)

      if (text === '수정 저장') {
        const modal = target.closest<HTMLElement>('div.fixed.inset-0')
        if (!modal || !normalizedText(modal).includes('작업지시서 수정')) return

        event.preventDefault()
        event.stopPropagation()
        event.stopImmediatePropagation()
        if (target.disabled) return

        const previousText = target.textContent || '수정 저장'
        target.disabled = true
        target.textContent = '저장 확인 중...'
        void savePlannedGram(modal, target).catch((error) => {
          target.disabled = false
          target.textContent = previousText
          window.alert(error instanceof Error ? error.message : '작업지시서 수정에 실패했습니다.')
        })
        return
      }

      if (RELEVANT_BUTTON_TEXTS.some((keyword) => text.includes(keyword))) {
        scheduleAfterNavigation()
      }
    }

    const onFocusIn = (event: FocusEvent) => {
      const input = event.target instanceof HTMLInputElement ? event.target : null
      if (!input || input.type !== 'number') return
      const labelText = normalizedText(input.closest('label')?.querySelector(':scope > span') ?? null)
      if (CREATE_LABELS.has(labelText) || EDIT_LABELS.has(labelText)) scheduleRefresh()
    }

    apply()
    document.addEventListener('click', onClickCapture, true)
    document.addEventListener('focusin', onFocusIn, true)

    return () => {
      pendingTimers.forEach((timer) => window.clearTimeout(timer))
      pendingTimers.clear()
      document.removeEventListener('click', onClickCapture, true)
      document.removeEventListener('focusin', onFocusIn, true)
    }
  }, [])

  return null
}
