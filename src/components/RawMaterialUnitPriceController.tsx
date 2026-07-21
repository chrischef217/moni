'use client'

import { useEffect } from 'react'

type RawMaterial = {
  id?: string
  item_name?: string
  unit_price_per_kg?: number | null
}

type RawMaterialsPayload = {
  ok?: boolean
  materials?: RawMaterial[]
}

const FIELD_ATTR = 'data-raw-material-unit-price-field'
const INPUT_ATTR = 'data-raw-material-unit-price-input'
const STATUS_ATTR = 'data-raw-material-unit-price-status'

function normalizedText(value: unknown): string {
  return String(value ?? '').trim().replace(/\s+/g, ' ')
}

function findMaterialModal(): HTMLElement | null {
  const heading = Array.from(document.querySelectorAll<HTMLElement>('h1, h2, h3')).find(
    (node) => normalizedText(node.textContent) === '원재료 상세편집',
  )
  return (heading?.closest('.fixed') as HTMLElement | null) ?? null
}

function findField(modal: HTMLElement, labelText: string): HTMLLabelElement | null {
  return (
    Array.from(modal.querySelectorAll<HTMLLabelElement>('label')).find((label) => {
      const title = label.querySelector(':scope > span')
      return normalizedText(title?.textContent) === labelText
    }) ?? null
  )
}

function priceFromInput(input: HTMLInputElement): number | null {
  const raw = input.value.replaceAll(',', '').trim()
  if (!raw) return null
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : Number.NaN
}

function setStatus(modal: HTMLElement, message: string, tone: 'idle' | 'error' = 'idle') {
  const status = modal.querySelector<HTMLElement>(`[${STATUS_ATTR}]`)
  if (!status) return
  status.textContent = message
  status.className = `mt-1 text-xs ${tone === 'error' ? 'text-red-300' : 'text-gray-500'}`
}

async function injectField() {
  const modal = findMaterialModal()
  if (!modal || modal.querySelector(`[${FIELD_ATTR}]`)) return

  const specField = findField(modal, '규격')
  const nameField = findField(modal, '원재료명')
  const specInput = specField?.querySelector<HTMLInputElement>('input')
  const nameInput = nameField?.querySelector<HTMLInputElement>('input')
  if (!specField || !specInput || !nameInput) return

  const wrapper = document.createElement('label')
  wrapper.setAttribute(FIELD_ATTR, 'true')
  wrapper.className = specField.className

  const title = document.createElement('span')
  title.className = specField.querySelector(':scope > span')?.className || 'mb-1.5 block'
  title.textContent = '포장단가(원)'

  const input = document.createElement('input')
  input.setAttribute(INPUT_ATTR, 'true')
  input.type = 'number'
  input.min = '0'
  input.step = '1'
  input.inputMode = 'numeric'
  input.placeholder = '예: 80000'
  input.className = specInput.className

  const status = document.createElement('p')
  status.setAttribute(STATUS_ATTR, 'true')
  status.className = 'mt-1 text-xs text-gray-500'
  status.textContent = '규격(g) 한 포장의 실제 매입가격을 입력합니다.'

  wrapper.append(title, input, status)
  specField.insertAdjacentElement('afterend', wrapper)

  try {
    const response = await fetch('/api/moni/raw-materials?include_inactive=1', { cache: 'no-store' })
    const payload = (await response.json().catch(() => null)) as RawMaterialsPayload | null
    const currentName = normalizedText(nameInput.value)
    const material = (payload?.materials ?? []).find(
      (row) => normalizedText(row.item_name) === currentName,
    )
    if (material?.unit_price_per_kg !== null && material?.unit_price_per_kg !== undefined) {
      input.value = String(material.unit_price_per_kg)
    }
  } catch {
    setStatus(modal, '기존 포장단가를 불러오지 못했습니다. 저장 시 다시 시도합니다.', 'error')
  }
}

export default function RawMaterialUnitPriceController() {
  useEffect(() => {
    const originalFetch = window.fetch.bind(window)

    const patchedFetch: typeof window.fetch = async (input, init) => {
      const response = await originalFetch(input, init)
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      const method = String(init?.method ?? (typeof input !== 'string' && !(input instanceof URL) ? input.method : 'GET')).toUpperCase()
      const match = url.match(/\/api\/moni\/raw-materials\/([^/?]+)(?:\?.*)?$/)
      const modal = findMaterialModal()
      const priceInput = modal?.querySelector<HTMLInputElement>(`[${INPUT_ATTR}]`) ?? null

      if (response.ok && method === 'PATCH' && match && modal && priceInput) {
        const unitPrice = priceFromInput(priceInput)
        if (typeof unitPrice === 'number' && (!Number.isFinite(unitPrice) || unitPrice < 0)) {
          setStatus(modal, '포장단가는 0 이상의 숫자로 입력해 주세요.', 'error')
          throw new Error('포장단가는 0 이상의 숫자로 입력해 주세요.')
        }

        const pricingResponse = await originalFetch(
          `/api/moni/raw-materials/${encodeURIComponent(match[1])}/pricing`,
          {
            method: 'PATCH',
            cache: 'no-store',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ unit_price_per_kg: unitPrice }),
          },
        )
        const pricingPayload = (await pricingResponse.json().catch(() => null)) as { error?: string } | null
        if (!pricingResponse.ok) {
          const message = pricingPayload?.error || '포장단가 저장에 실패했습니다.'
          setStatus(modal, message, 'error')
          throw new Error(message)
        }
      }

      return response
    }

    window.fetch = patchedFetch

    let frame = 0
    const schedule = () => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => void injectField())
    }
    const observer = new MutationObserver(schedule)
    observer.observe(document.body, { childList: true, subtree: true })
    schedule()

    return () => {
      observer.disconnect()
      window.cancelAnimationFrame(frame)
      if (window.fetch === patchedFetch) window.fetch = originalFetch
      document.querySelectorAll(`[${FIELD_ATTR}]`).forEach((node) => node.remove())
    }
  }, [])

  return null
}
