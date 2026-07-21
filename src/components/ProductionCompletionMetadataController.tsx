'use client'

import { useEffect } from 'react'

type CompletionRequest = {
  action?: string
  record_id?: string
  id?: string
  actual_input_unit?: string
  actual_input_value?: number | string
  defect_input_unit?: string
  defect_input_value?: number | string
}

type SampleEntry = {
  label: string
  value: number
  unit: 'kg' | 'g'
}

function elementText(element: Element | null): string {
  return String(element?.textContent ?? '').replace(/\s+/g, ' ').trim()
}

function findCompletionModal(): HTMLElement | null {
  const title = Array.from(document.querySelectorAll<HTMLElement>('h1,h2,h3,h4,p,div')).find(
    (element) => elementText(element) === '생산 완료 입력',
  )
  if (!title) return null

  let current: HTMLElement | null = title
  while (current && current !== document.body) {
    const hasSaveButton = Array.from(current.querySelectorAll<HTMLButtonElement>('button')).some(
      (button) => elementText(button) === '생산 완료 저장',
    )
    const hasCompletionFields = elementText(current).includes('완료수량') && elementText(current).includes('샘플수량')
    if (hasSaveButton && hasCompletionFields) return current
    current = current.parentElement
  }
  return null
}

function getInjectedInput(modal: HTMLElement, name: 'writer' | 'reviewer'): HTMLInputElement | null {
  return modal.querySelector<HTMLInputElement>(`input[data-production-completion-${name}="true"]`)
}

function collectSampleEntries(modal: HTMLElement): SampleEntry[] {
  const numberInputs = Array.from(modal.querySelectorAll<HTMLInputElement>('input[type="number"]'))
  const unitSelects = Array.from(modal.querySelectorAll<HTMLSelectElement>('select'))
  const sampleInputs = numberInputs.slice(2)
  const sampleUnitSelects = unitSelects.slice(2)

  return sampleInputs
    .map((input, index) => {
      const raw = input.value.trim()
      if (!raw) return null
      const value = Number(raw)
      if (!Number.isFinite(value) || value < 0) return null
      const unit = sampleUnitSelects[index]?.value === 'kg' ? 'kg' : 'g'
      return {
        label: `샘플 ${index + 1}`,
        value,
        unit,
      } satisfies SampleEntry
    })
    .filter((entry): entry is SampleEntry => Boolean(entry))
}

function makeInput(label: string, dataName: 'writer' | 'reviewer') {
  const wrapper = document.createElement('label')
  wrapper.className = 'block'

  const labelText = document.createElement('span')
  labelText.className = 'mb-1.5 block text-sm font-medium text-gray-300'
  labelText.textContent = label

  const input = document.createElement('input')
  input.type = 'text'
  input.autocomplete = 'off'
  input.placeholder = `${label} 이름 입력`
  input.className =
    'w-full rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-white outline-none focus:border-green-500'
  input.setAttribute(`data-production-completion-${dataName}`, 'true')

  wrapper.append(labelText, input)
  return wrapper
}

function ensureCompletionFields() {
  const modal = findCompletionModal()
  if (!modal || modal.querySelector('[data-production-completion-meta-fields="true"]')) return

  const saveButton = Array.from(modal.querySelectorAll<HTMLButtonElement>('button')).find(
    (button) => elementText(button) === '생산 완료 저장',
  )
  const footer = saveButton?.parentElement
  if (!footer?.parentElement) return

  const section = document.createElement('section')
  section.setAttribute('data-production-completion-meta-fields', 'true')
  section.className = 'mt-4 rounded-2xl border border-gray-700 bg-gray-900/50 p-4'

  const heading = document.createElement('p')
  heading.className = 'mb-3 text-sm font-semibold text-white'
  heading.textContent = '작업지시서 작성 정보'

  const description = document.createElement('p')
  description.className = 'mb-3 text-xs text-gray-400'
  description.textContent = '입력한 이름은 생산 완료 작업지시서의 작성자와 확인자란에 표시됩니다.'

  const grid = document.createElement('div')
  grid.className = 'grid gap-3 md:grid-cols-2'
  grid.append(makeInput('작성자', 'writer'), makeInput('확인자', 'reviewer'))

  section.append(heading, description, grid)
  footer.parentElement.insertBefore(section, footer)
}

export default function ProductionCompletionMetadataController() {
  useEffect(() => {
    ensureCompletionFields()
    const observer = new MutationObserver(() => ensureCompletionFields())
    observer.observe(document.body, { childList: true, subtree: true })

    const originalFetch = window.fetch.bind(window)

    const patchedFetch: typeof window.fetch = async (input, init) => {
      const requestUrl = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input)
      const method = String(init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()

      if (method !== 'PATCH' || !requestUrl.includes('/api/moni/production-records')) {
        return originalFetch(input, init)
      }

      let bodyText = ''
      if (typeof init?.body === 'string') bodyText = init.body
      else if (input instanceof Request) bodyText = await input.clone().text().catch(() => '')

      let body: CompletionRequest | null = null
      try {
        body = bodyText ? (JSON.parse(bodyText) as CompletionRequest) : null
      } catch {
        body = null
      }

      if (String(body?.action ?? '').toLowerCase() !== 'complete') {
        return originalFetch(input, init)
      }

      const modal = findCompletionModal()
      const writerName = modal ? getInjectedInput(modal, 'writer')?.value.trim() ?? '' : ''
      const reviewerName = modal ? getInjectedInput(modal, 'reviewer')?.value.trim() ?? '' : ''
      if (!writerName || !reviewerName) {
        return new Response(JSON.stringify({ ok: false, error: '작성자와 확인자를 모두 입력해 주세요.' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      const recordId = String(body?.record_id ?? body?.id ?? '').trim()
      if (!recordId) {
        return new Response(JSON.stringify({ ok: false, error: '작업지시서 정보를 확인할 수 없습니다.' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      const metadataResponse = await originalFetch('/api/moni/production-completion-metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          record_id: recordId,
          writer_name: writerName,
          reviewer_name: reviewerName,
          actual_input_unit: body?.actual_input_unit,
          actual_input_value: body?.actual_input_value,
          defect_input_unit: body?.defect_input_unit,
          defect_input_value: body?.defect_input_value,
          sample_entries: modal ? collectSampleEntries(modal) : [],
        }),
      })

      if (!metadataResponse.ok) {
        const errorText = await metadataResponse.text()
        return new Response(errorText, {
          status: metadataResponse.status,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      return originalFetch(input, init)
    }

    window.fetch = patchedFetch

    const validateBeforeSave = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Element)) return
      const button = target.closest('button')
      if (!button || elementText(button) !== '생산 완료 저장') return

      const modal = findCompletionModal()
      if (!modal) return
      const writerName = getInjectedInput(modal, 'writer')?.value.trim() ?? ''
      const reviewerName = getInjectedInput(modal, 'reviewer')?.value.trim() ?? ''
      if (writerName && reviewerName) return

      event.preventDefault()
      event.stopPropagation()
      window.alert('작성자와 확인자를 모두 입력해 주세요.')
      ;(writerName ? getInjectedInput(modal, 'reviewer') : getInjectedInput(modal, 'writer'))?.focus()
    }

    document.addEventListener('click', validateBeforeSave, true)

    return () => {
      observer.disconnect()
      document.removeEventListener('click', validateBeforeSave, true)
      if (window.fetch === patchedFetch) window.fetch = originalFetch
    }
  }, [])

  return null
}
