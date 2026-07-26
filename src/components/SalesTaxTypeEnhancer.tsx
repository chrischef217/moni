'use client'

import { useEffect } from 'react'

type TaxType = 'TAXABLE' | 'EXEMPT'

type ClientRow = {
  id: string
  company_name: string
  tax_type?: TaxType | string | null
  payment_terms?: string | null
  note?: string | null
}

const text = (value: unknown) => String(value ?? '').replace(/\s+/g, ' ').trim()

function currentMonth() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit' }).format(new Date())
}

function fieldByLabel(root: ParentNode, label: string) {
  return Array.from(root.querySelectorAll<HTMLLabelElement>('label')).find((element) => {
    const span = element.querySelector(':scope > span')
    return text(span?.textContent) === label
  }) ?? null
}

function modalByTitle(title: string) {
  return Array.from(document.querySelectorAll<HTMLElement>('h2')).find((heading) => text(heading.textContent) === title)?.closest<HTMLElement>('.fixed.inset-0') ?? null
}

function nativeSetInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  if (setter) setter.call(input, value)
  else input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

export default function SalesTaxTypeEnhancer({ initialView }: { initialView: string }) {
  useEffect(() => {
    if (initialView !== 'clients' && initialView !== 'sales') return

    let disposed = false
    let selectedTaxType: TaxType = 'TAXABLE'
    let exportLocked = false
    const clientsById = new Map<string, ClientRow>()
    const clientsByName = new Map<string, ClientRow>()
    const originalFetch = window.fetch.bind(window)

    const rememberClients = (rows: ClientRow[]) => {
      clientsById.clear()
      clientsByName.clear()
      for (const row of rows) {
        if (row?.id) clientsById.set(String(row.id), row)
        const name = text(row?.company_name)
        if (name && !clientsByName.has(name)) clientsByName.set(name, row)
      }
    }

    const isExportClient = (row: ClientRow | undefined) => Boolean(
      row && (text(row.payment_terms).startsWith('수출거래') || text(row.note).startsWith('[EXPORT_DESTINATION:')),
    )

    const loadClients = async () => {
      try {
        const response = await originalFetch(`/api/moni/sales-operations?month=${encodeURIComponent(currentMonth())}&_=${Date.now()}`, { cache: 'no-store' })
        const payload = await response.json()
        if (!response.ok || !payload?.ok || !Array.isArray(payload.clients) || disposed) return
        rememberClients(payload.clients as ClientRow[])
      } catch {
        // The base sales-management screen remains usable even if the enhancer metadata cannot be loaded.
      }
    }

    const setSelectedFromRow = (row?: ClientRow) => {
      exportLocked = isExportClient(row)
      selectedTaxType = exportLocked || row?.tax_type === 'EXEMPT' ? 'EXEMPT' : 'TAXABLE'
    }

    const styleTaxButtons = (control: HTMLElement) => {
      for (const button of Array.from(control.querySelectorAll<HTMLButtonElement>('button[data-tax-type]'))) {
        const value = button.dataset.taxType as TaxType
        const selected = value === selectedTaxType
        const locked = exportLocked && value === 'TAXABLE'
        button.disabled = locked
        button.style.background = selected ? '#16b981' : '#ffffff'
        button.style.color = selected ? '#ffffff' : locked ? '#9aaab4' : '#29485a'
        button.style.borderColor = selected ? '#16b981' : '#c9dbe5'
        button.style.opacity = locked ? '0.55' : '1'
        button.style.cursor = locked ? 'not-allowed' : 'pointer'
      }
      const note = control.querySelector<HTMLElement>('[data-tax-helper]')
      if (note) {
        note.textContent = exportLocked
          ? '수출처 관리에서 연동된 거래처는 면세사업자(수출포함)로 고정되며 거래명세표 VAT는 항상 0%입니다.'
          : selectedTaxType === 'EXEMPT'
            ? '면세사업자는 판매·거래명세표 작성 시 VAT가 자동으로 0% 적용됩니다.'
            : '과세사업자는 판매 등록 시 설정된 부가세율이 적용됩니다.'
      }
    }

    const injectClientTaxControl = () => {
      if (initialView !== 'clients') return
      const modal = modalByTitle('거래처 등록') ?? modalByTitle('거래처 수정')
      if (!modal) return

      let control = modal.querySelector<HTMLElement>('[data-sales-tax-type-control]')
      if (!control) {
        control = document.createElement('div')
        control.dataset.salesTaxTypeControl = 'true'
        control.className = 'md:col-span-2'
        control.innerHTML = `
          <div style="font-size:14px;font-weight:800;color:#385568;margin-bottom:8px">부가가치세 유형</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            <button type="button" data-tax-type="TAXABLE" style="height:44px;border:1px solid #c9dbe5;border-radius:12px;font-weight:900">과세사업자</button>
            <button type="button" data-tax-type="EXEMPT" style="height:44px;border:1px solid #c9dbe5;border-radius:12px;font-weight:900">면세사업자(수출포함)</button>
          </div>
          <div data-tax-helper style="margin-top:7px;font-size:12px;line-height:1.5;color:#718895"></div>
        `
        for (const button of Array.from(control.querySelectorAll<HTMLButtonElement>('button[data-tax-type]'))) {
          button.addEventListener('click', () => {
            const value = button.dataset.taxType as TaxType
            if (exportLocked && value === 'TAXABLE') return
            selectedTaxType = value
            styleTaxButtons(control!)
          })
        }
        const statusField = fieldByLabel(modal, '상태')
        if (statusField?.parentElement) statusField.insertAdjacentElement('afterend', control)
        else modal.querySelector('.grid')?.appendChild(control)
      }
      styleTaxButtons(control)
    }

    const enhanceSalesVat = () => {
      if (initialView !== 'sales') return
      const modal = modalByTitle('판매 등록') ?? modalByTitle('판매 수정')
      if (!modal) return
      const clientField = fieldByLabel(modal, '거래처')
      const vatField = fieldByLabel(modal, '부가세율(%)')
      const clientSelect = clientField?.querySelector<HTMLSelectElement>('select')
      const vatInput = vatField?.querySelector<HTMLInputElement>('input')
      if (!clientSelect || !vatField || !vatInput) return

      const apply = () => {
        const row = clientsById.get(clientSelect.value)
        const exempt = row?.tax_type === 'EXEMPT' || isExportClient(row)
        if (exempt) {
          if (vatInput.value !== '0') nativeSetInputValue(vatInput, '0')
          vatInput.disabled = true
        } else {
          vatInput.disabled = false
        }
        let helper = vatField.querySelector<HTMLElement>('[data-sales-vat-tax-helper]')
        if (!helper) {
          helper = document.createElement('div')
          helper.dataset.salesVatTaxHelper = 'true'
          helper.style.marginTop = '6px'
          helper.style.fontSize = '11px'
          helper.style.fontWeight = '700'
          vatField.appendChild(helper)
        }
        helper.style.color = exempt ? '#16825d' : '#718895'
        helper.textContent = exempt
          ? '면세사업자(수출포함) · VAT 0% 자동 적용'
          : '과세사업자 · 부가세율 적용'
      }

      if (clientSelect.dataset.salesTaxTypeBound !== 'true') {
        clientSelect.dataset.salesTaxTypeBound = 'true'
        clientSelect.addEventListener('change', () => window.setTimeout(apply, 0))
      }
      apply()
    }

    const clickCapture = (event: MouseEvent) => {
      if (initialView !== 'clients') return
      const button = (event.target as Element | null)?.closest<HTMLButtonElement>('button')
      if (!button) return
      const label = text(button.textContent)
      if (label === '+ 거래처 등록') {
        selectedTaxType = 'TAXABLE'
        exportLocked = false
        window.setTimeout(injectClientTaxControl, 0)
        return
      }
      if (label !== '수정') return
      const row = button.closest('tr')
      const name = text(row?.querySelectorAll('td')?.[1]?.textContent)
      setSelectedFromRow(clientsByName.get(name))
      window.setTimeout(injectClientTaxControl, 0)
    }

    document.addEventListener('click', clickCapture, true)

    if (initialView === 'clients') {
      window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
        if (!url.includes('/api/moni/sales-operations') || String(init?.method || 'GET').toUpperCase() !== 'POST' || typeof init?.body !== 'string') {
          return originalFetch(input, init)
        }
        try {
          const body = JSON.parse(init.body) as Record<string, any>
          if (body?.action !== 'save_client' || !body?.data) return originalFetch(input, init)
          const note = String(body.data.note ?? '').replace(/\s*\[MONI_TAX_TYPE:(?:TAXABLE|EXEMPT)\]\s*/g, ' ').trim()
          body.data.note = `${note}${note ? ' ' : ''}[MONI_TAX_TYPE:${selectedTaxType}]`
          const response = await originalFetch(input, { ...init, body: JSON.stringify(body) })
          if (response.ok) {
            void response.clone().json().then((payload) => {
              const row = payload?.row as ClientRow | undefined
              if (row?.id) {
                clientsById.set(String(row.id), row)
                const name = text(row.company_name)
                if (name) clientsByName.set(name, row)
              }
            }).catch(() => undefined)
          }
          return response
        } catch {
          return originalFetch(input, init)
        }
      }) as typeof window.fetch
    }

    const observer = new MutationObserver(() => {
      injectClientTaxControl()
      enhanceSalesVat()
    })
    observer.observe(document.body, { childList: true, subtree: true })
    void loadClients().finally(() => {
      if (disposed) return
      injectClientTaxControl()
      enhanceSalesVat()
    })

    return () => {
      disposed = true
      observer.disconnect()
      document.removeEventListener('click', clickCapture, true)
      if (initialView === 'clients') window.fetch = originalFetch as typeof window.fetch
    }
  }, [initialView])

  return <span data-sales-tax-type-enhancer hidden />
}
