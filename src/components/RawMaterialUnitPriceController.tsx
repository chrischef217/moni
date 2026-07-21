'use client'

import { useEffect } from 'react'

type RawMaterial = {
  id?: string
  item_name?: string
  unit_price_per_kg?: number | null
  packing_weight_g?: number | null
  spec?: string | null
}

type RawMaterialsPayload = {
  ok?: boolean
  materials?: RawMaterial[]
}

const FIELD_ATTR = 'data-raw-material-unit-price-field'
const INPUT_ATTR = 'data-raw-material-unit-price-input'
const PACKING_INPUT_ATTR = 'data-raw-material-packing-weight-input'
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

function findField(modal: HTMLElement, labelTexts: string[]): HTMLLabelElement | null {
  return (
    Array.from(modal.querySelectorAll<HTMLLabelElement>('label')).find((label) => {
      const title = label.querySelector(':scope > span')
      return labelTexts.includes(normalizedText(title?.textContent))
    }) ?? null
  )
}

function priceFromInput(input: HTMLInputElement): number | null {
  const raw = input.value.replaceAll(',', '').trim()
  if (!raw) return null
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : Number.NaN
}

function packingWeightFromInput(input: HTMLInputElement): number | null {
  const raw = input.value.replaceAll(',', '').trim()
  if (!raw) return null
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed <= 0 || !Number.isInteger(parsed)) return Number.NaN
  return parsed
}

function setStatus(modal: HTMLElement, message: string, tone: 'idle' | 'error' = 'idle') {
  const status = modal.querySelector<HTMLElement>(`[${STATUS_ATTR}]`)
  if (!status) return
  status.textContent = message
  status.className = `mt-1 text-xs ${tone === 'error' ? 'text-red-300' : 'text-gray-500'}`
}

async function injectField() {
  const modal = findMaterialModal()
  if (!modal) return

  const unitField = findField(modal, ['단위(g)', '규격'])
  const nameField = findField(modal, ['원재료명'])
  const unitInput = unitField?.querySelector<HTMLInputElement>('input')
  const nameInput = nameField?.querySelector<HTMLInputElement>('input')
  if (!unitField || !unitInput || !nameInput) return

  const unitTitle = unitField.querySelector<HTMLElement>(':scope > span')
  if (unitTitle) unitTitle.textContent = '단위(g)'
  unitInput.setAttribute(PACKING_INPUT_ATTR, 'true')
  unitInput.inputMode = 'numeric'
  unitInput.placeholder = '예: 10000'

  if (modal.querySelector(`[${FIELD_ATTR}]`)) return

  const wrapper = document.createElement('label')
  wrapper.setAttribute(FIELD_ATTR, 'true')
  wrapper.className = unitField.className

  const title = document.createElement('span')
  title.className = unitField.querySelector(':scope > span')?.className || 'mb-1.5 block'
  title.textContent = '포장단가(원)'

  const input = document.createElement('input')
  input.setAttribute(INPUT_ATTR, 'true')
  input.type = 'number'
  input.min = '0'
  input.step = '1'
  input.inputMode = 'numeric'
  input.placeholder = '예: 80000'
  input.className = unitInput.className

  const status = document.createElement('p')
  status.setAttribute(STATUS_ATTR, 'true')
  status.className = 'mt-1 text-xs text-gray-500'
  status.textContent = '단위(g) 한 포장의 실제 매입가격을 입력합니다.'

  wrapper.append(title, input, status)
  unitField.insertAdjacentElement('afterend', wrapper)

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
    if (!unitInput.value.trim()) {
      const packingWeight = Number(material?.packing_weight_g ?? 0)
      const legacySpec = Number(String(material?.spec ?? '').replaceAll(',', '').trim())
      if (Number.isInteger(packingWeight) && packingWeight > 0) {
        unitInput.value = String(packingWeight)
      } else if (Number.isInteger(legacySpec) && legacySpec > 0) {
        unitInput.value = String(legacySpec)
      }
    }
  } catch {
    setStatus(modal, '기존 포장단가를 불러오지 못했습니다. 저장 시 다시 시도합니다.', 'error')
  }
}

export default function RawMaterialUnitPriceController() {
  useEffect(() => {
    const originalFetch = window.fetch.bind(window)

    const patchedFetch: typeof window.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      const method = String(init?.method ?? (typeof input !== 'string' && !(input instanceof URL) ? input.method : 'GET')).toUpperCase()
      const match = url.match(/\/api\/moni\/raw-materials\/([^/?]+)(?:\?.*)?$/)
      const modal = findMaterialModal()
      const priceInput = modal?.querySelector<HTMLInputElement>(`[${INPUT_ATTR}]`) ?? null
      const packingInput = modal?.querySelector<HTMLInputElement>(`[${PACKING_INPUT_ATTR}]`) ?? null

      let nextInit = init
      let unitPrice: number | null = null

      if (method === 'PATCH' && match && modal) {
        if (packingInput) {
          const packingWeight = packingWeightFromInput(packingInput)
          if (typeof packingWeight === 'number' && !Number.isFinite(packingWeight)) {
            setStatus(modal, '단위(g)는 1g 이상의 정수로 입력해 주세요.', 'error')
            throw new Error('단위(g)는 1g 이상의 정수로 입력해 주세요.')
          }

          if (typeof packingWeight === 'number') {
            if (typeof init?.body !== 'string') {
              setStatus(modal, '단위(g) 저장 요청을 구성하지 못했습니다.', 'error')
              throw new Error('단위(g) 저장 요청을 구성하지 못했습니다.')
            }
            const originalBody = JSON.parse(init.body) as Record<string, unknown>
            nextInit = {
              ...init,
              body: JSON.stringify({
                ...originalBody,
                spec: String(packingWeight),
                packing_weight_g: packingWeight,
              }),
            }
          }
        }

        if (priceInput) {
          unitPrice = priceFromInput(priceInput)
          if (typeof unitPrice === 'number' && (!Number.isFinite(unitPrice) || unitPrice < 0)) {
            setStatus(modal, '포장단가는 0 이상의 숫자로 입력해 주세요.', 'error')
            throw new Error('포장단가는 0 이상의 숫자로 입력해 주세요.')
          }
        }
      }

      const response = await originalFetch(input, nextInit)

      if (response.ok && method === 'PATCH' && match && modal && priceInput) {
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
