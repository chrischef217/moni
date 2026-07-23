'use client'

import { useEffect } from 'react'

type ViewMode = 'all' | 'raw' | 'semi'

const CONTROL_ATTR = 'data-raw-material-type-filter'
const BUTTON_ATTR = 'data-raw-material-type-filter-button'

const VIEW_OPTIONS: Array<{ mode: ViewMode; label: string }> = [
  { mode: 'all', label: '원재료+반제품 보기' },
  { mode: 'raw', label: '원재료만 보기' },
  { mode: 'semi', label: '반제품만 보기' },
]

function normalizedText(value: unknown): string {
  return String(value ?? '').trim().replace(/\s+/g, ' ')
}

function findRawMaterialSection(): HTMLElement | null {
  const heading = Array.from(document.querySelectorAll<HTMLElement>('h1, h2, h3')).find(
    (node) => normalizedText(node.textContent) === '원재료 관리',
  )
  return (heading?.closest('section') as HTMLElement | null) ?? null
}

function findSummaryBar(section: HTMLElement): HTMLElement | null {
  const summary = Array.from(section.querySelectorAll<HTMLParagraphElement>('p')).find((node) =>
    normalizedText(node.textContent).startsWith('원재료 총 '),
  )
  return summary?.parentElement ?? null
}

function findMaterialTable(section: HTMLElement): HTMLTableElement | null {
  return (
    Array.from(section.querySelectorAll<HTMLTableElement>('table')).find((table) => {
      const headers = Array.from(table.querySelectorAll<HTMLTableCellElement>('thead th')).map((cell) =>
        normalizedText(cell.textContent),
      )
      return headers.includes('원재료명') && headers.includes('재료유형')
    }) ?? null
  )
}

function materialTypeMatches(typeText: string, mode: ViewMode): boolean {
  if (mode === 'all') return true
  const type = normalizedText(typeText) || '원재료'
  return mode === 'semi' ? type === '반제품' : type === '원재료'
}

function applyMaterialFilter(section: HTMLElement, mode: ViewMode) {
  const table = findMaterialTable(section)
  if (!table) return

  const headers = Array.from(table.querySelectorAll<HTMLTableCellElement>('thead th')).map((cell) =>
    normalizedText(cell.textContent),
  )
  const typeColumnIndex = headers.indexOf('재료유형')
  if (typeColumnIndex < 0) return

  table.querySelectorAll<HTMLTableRowElement>('tbody tr').forEach((row) => {
    const cells = Array.from(row.querySelectorAll<HTMLTableCellElement>(':scope > td'))
    const typeCell = cells[typeColumnIndex]
    if (!typeCell) return
    row.hidden = !materialTypeMatches(typeCell.textContent ?? '', mode)
  })
}

function updateButtonState(section: HTMLElement, mode: ViewMode) {
  section.querySelectorAll<HTMLButtonElement>(`button[${BUTTON_ATTR}]`).forEach((button) => {
    const selected = button.dataset.mode === mode
    button.setAttribute('aria-pressed', selected ? 'true' : 'false')
    button.className = `rounded-md px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition ${
      selected ? 'bg-green-500 text-white' : 'text-gray-300 hover:text-white'
    }`
  })
}

function ensureControls(section: HTMLElement, onChange: (mode: ViewMode) => void) {
  if (section.querySelector(`[${CONTROL_ATTR}]`)) return

  const summaryBar = findSummaryBar(section)
  if (!summaryBar) return

  const controls = document.createElement('div')
  controls.setAttribute(CONTROL_ATTR, 'true')
  controls.className = 'mb-4 flex w-fit max-w-full flex-wrap rounded-lg border border-gray-700 bg-gray-950 p-1'
  controls.setAttribute('role', 'group')
  controls.setAttribute('aria-label', '원재료 재료유형 보기')

  for (const option of VIEW_OPTIONS) {
    const button = document.createElement('button')
    button.type = 'button'
    button.setAttribute(BUTTON_ATTR, 'true')
    button.dataset.mode = option.mode
    button.textContent = option.label
    button.addEventListener('click', () => onChange(option.mode))
    controls.appendChild(button)
  }

  summaryBar.insertAdjacentElement('afterend', controls)
}

export default function RawMaterialTypeFilterController() {
  useEffect(() => {
    let activeSection: HTMLElement | null = null
    let mode: ViewMode = 'all'
    let frame: number | null = null

    const setMode = (nextMode: ViewMode) => {
      mode = nextMode
      if (!activeSection) return
      updateButtonState(activeSection, mode)
      applyMaterialFilter(activeSection, mode)
    }

    const sync = () => {
      const section = findRawMaterialSection()
      if (!section) {
        activeSection = null
        mode = 'all'
        return
      }

      if (section !== activeSection) {
        activeSection = section
        mode = 'all'
      }

      ensureControls(section, setMode)
      updateButtonState(section, mode)
      applyMaterialFilter(section, mode)
    }

    const scheduleSync = () => {
      if (frame !== null) return
      frame = window.requestAnimationFrame(() => {
        frame = null
        sync()
      })
    }

    const observer = new MutationObserver(scheduleSync)
    observer.observe(document.body, { childList: true, subtree: true })
    scheduleSync()

    return () => {
      observer.disconnect()
      if (frame !== null) window.cancelAnimationFrame(frame)
      document.querySelectorAll(`[${CONTROL_ATTR}]`).forEach((node) => node.remove())
    }
  }, [])

  return null
}
