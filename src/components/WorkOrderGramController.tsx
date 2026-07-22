'use client'

import { useEffect } from 'react'

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
  '수정 저장',
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

function createVisibleGramInput(
  source: HTMLInputElement,
  mode: 'create' | 'edit',
  requestRefresh: () => void,
) {
  const label = source.closest('label')
  if (!label) return
  const labelSpan = label.querySelector(':scope > span')
  if (!labelSpan) return

  labelSpan.textContent = mode === 'edit' ? '수정 예정량(g)' : '예정 생산량(g)'
  source.dataset.moniWorkOrderGramSource = mode
  source.style.display = 'none'
  source.tabIndex = -1
  source.setAttribute('aria-hidden', 'true')

  const visibleAttribute = `data-moni-work-order-${mode}-g`
  const existing = label.querySelector<HTMLInputElement>(`input[${visibleAttribute}="true"]`)
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
  visible.setAttribute(visibleAttribute, 'true')
  visible.setAttribute('aria-label', mode === 'edit' ? '수정 예정량(g)' : '예정 생산량(g)')

  const helper = document.createElement('p')
  helper.dataset.moniWorkOrderGramHelp = mode
  helper.className = 'mt-1 text-xs text-amber-300'
  helper.textContent = GRAM_HELP_TEXT

  visible.addEventListener('input', () => {
    const gramsText = sanitizeGramInput(visible.value)
    if (visible.value !== gramsText) visible.value = gramsText
    const grams = Number(gramsText || 0)

    // 기존 MONI 폼은 kg 값을 상태로 관리하므로 화면의 g 입력만 kg로 환산해 전달합니다.
    // 저장은 AdminDashboard의 원래 저장 함수가 수행하며, 성공 후 팝업만 닫고 목록을 다시 조회합니다.
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
    if (EDIT_LABELS.has(labelText)) createVisibleGramInput(source, 'edit', requestRefresh)
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
    const plannedHeader = Array.from(section.querySelectorAll<HTMLTableCellElement>('th')).find(
      (header) => normalizedText(header) === '예정량',
    )
    if (plannedHeader) plannedHeader.textContent = '예정량(g)'
  }

  const descriptions = Array.from(document.querySelectorAll<HTMLElement>('p, span'))
  for (const element of descriptions) {
    const value = normalizedText(element)
    if (value.includes('계획 생산량(kg)')) {
      element.textContent = value.replaceAll('계획 생산량(kg)', '계획 생산량(g)')
    }
  }
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

    const scheduleAfterUiChange = () => {
      scheduleAt(0)
      scheduleAt(80)
      scheduleAt(220)
      scheduleAt(500)
    }

    const onClickCapture = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('button') : null
      if (!target) return
      const buttonText = normalizedText(target)
      if (RELEVANT_BUTTON_TEXTS.some((keyword) => buttonText.includes(keyword))) scheduleAfterUiChange()
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
