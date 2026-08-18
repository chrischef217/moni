'use client'

import { useEffect } from 'react'

const normalize = (value: unknown) => String(value ?? '').normalize('NFKC').toLowerCase().replace(/\s+/g, '')

function setNativeSelectValue(select: HTMLSelectElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set
  if (setter) setter.call(select, value)
  else select.value = value
  select.dispatchEvent(new Event('change', { bubbles: true }))
}

function setNativeInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  if (setter) setter.call(input, value)
  else input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

function modalContent(modal: HTMLElement) {
  const panel = modal.firstElementChild as HTMLElement | null
  return panel?.children?.[1] as HTMLElement | undefined
}

function ensureSaveMessage(modal: HTMLElement) {
  let box = modal.querySelector<HTMLElement>('[data-sales-save-message]')
  if (box) return box
  const content = modalContent(modal)
  if (!content) return null
  box = document.createElement('div')
  box.dataset.salesSaveMessage = 'true'
  box.className = 'sales-save-message'
  box.hidden = true
  content.insertBefore(box, content.firstChild)
  return box
}

function showSaveMessage(modal: HTMLElement, message: string, tone: 'error' | 'working' = 'error') {
  const box = ensureSaveMessage(modal)
  if (!box) return
  box.dataset.tone = tone
  box.textContent = message
  box.hidden = false
  box.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
}

function clearSaveMessage(modal: HTMLElement) {
  const box = ensureSaveMessage(modal)
  if (!box) return
  box.hidden = true
  box.textContent = ''
}

function topLevelSalesError(shell: HTMLElement, modal: HTMLElement) {
  const candidates = Array.from(shell.querySelectorAll<HTMLElement>('div'))
  return candidates.find((element) => {
    if (modal.contains(element)) return false
    const text = String(element.textContent || '').trim()
    if (!text) return false
    return element.className.includes('border-red-500') && element.className.includes('text-red-200')
  })?.textContent?.trim() || ''
}

export default function SalesOrderClientSearchEnhancer() {
  useEffect(() => {
    const shell = document.querySelector<HTMLElement>("[data-sales-management-shell='true']")
    if (!shell) return

    let observer: MutationObserver | null = null
    const cleanups = new Set<() => void>()
    let pendingSaleMonth = ''

    function syncSavedMonth() {
      if (!pendingSaleMonth) return
      const success = Array.from(shell.querySelectorAll<HTMLElement>('div')).find((element) => {
        const text = String(element.textContent || '').trim()
        return element.className.includes('border-emerald-500') && /제품 판매(를|건을) (등록|수정)했습니다/.test(text)
      })
      if (!success) return
      const monthInput = shell.querySelector<HTMLInputElement>('input[type="month"]')
      if (monthInput && monthInput.value !== pendingSaleMonth) setNativeInputValue(monthInput, pendingSaleMonth)
      pendingSaleMonth = ''
    }

    function enhance() {
      const modals = Array.from(document.querySelectorAll<HTMLElement>('.fixed.inset-0.z-\\[1300\\]'))
      for (const modal of modals) {
        const title = String(modal.querySelector('h2')?.textContent || '').trim()
        if (title !== '제품 판매등록' && title !== '제품 판매 수정') continue

        ensureSaveMessage(modal)
        const pageError = topLevelSalesError(shell, modal)
        if (pageError) showSaveMessage(modal, pageError)

        const fields = Array.from(modal.querySelectorAll<HTMLLabelElement>('label'))
        const clientField = fields.find((label) => String(label.querySelector('span')?.textContent || '').trim() === '거래처')
        const nativeSelect = clientField?.querySelector<HTMLSelectElement>('select') || null
        if (clientField && nativeSelect && !clientField.querySelector('[data-sales-client-combobox]')) {
          const options = Array.from(nativeSelect.options)
            .filter((option) => option.value)
            .map((option) => ({ id: option.value, name: option.textContent?.trim() || '' }))
            .filter((option) => option.name)

          nativeSelect.style.display = 'none'
          nativeSelect.setAttribute('aria-hidden', 'true')

          const root = document.createElement('div')
          root.dataset.salesClientCombobox = 'true'
          root.className = 'sales-client-combobox'

          const inputWrap = document.createElement('div')
          inputWrap.className = 'sales-client-combobox-input-wrap'

          const input = document.createElement('input')
          input.type = 'search'
          input.autocomplete = 'off'
          input.placeholder = '거래처명 입력 또는 선택'
          input.className = 'sales-client-combobox-input'
          input.setAttribute('role', 'combobox')
          input.setAttribute('aria-autocomplete', 'list')
          input.setAttribute('aria-expanded', 'false')
          input.setAttribute('aria-label', '거래처 검색')

          const arrow = document.createElement('span')
          arrow.className = 'sales-client-combobox-arrow'
          arrow.setAttribute('aria-hidden', 'true')
          arrow.textContent = '⌄'

          const list = document.createElement('div')
          list.className = 'sales-client-combobox-list'
          list.hidden = true
          list.setAttribute('role', 'listbox')

          const summary = document.createElement('div')
          summary.className = 'sales-client-combobox-summary'

          inputWrap.append(input, arrow)
          root.append(inputWrap, list)
          clientField.insertBefore(root, nativeSelect)

          if (title === '제품 판매등록' && nativeSelect.value) setNativeSelectValue(nativeSelect, '')

          const selectedName = () => options.find((option) => option.id === nativeSelect.value)?.name || ''
          let filtered = options

          const closeList = () => {
            list.hidden = true
            input.setAttribute('aria-expanded', 'false')
          }

          const selectClient = (id: string) => {
            const option = options.find((item) => item.id === id)
            if (!option) return
            input.value = option.name
            setNativeSelectValue(nativeSelect, option.id)
            clearSaveMessage(modal)
            closeList()
          }

          const render = (query = '') => {
            const needle = normalize(query)
            filtered = options.filter((option) => !needle || normalize(option.name).includes(needle))
            list.replaceChildren()
            summary.textContent = needle ? `검색 결과 ${filtered.length}개` : `전체 거래처 ${options.length}개`
            list.appendChild(summary)

            for (const option of filtered) {
              const button = document.createElement('button')
              button.type = 'button'
              button.className = `sales-client-combobox-option${option.id === nativeSelect.value ? ' is-selected' : ''}`
              button.setAttribute('role', 'option')
              button.setAttribute('aria-selected', option.id === nativeSelect.value ? 'true' : 'false')
              button.textContent = option.name
              button.addEventListener('pointerdown', (event) => event.preventDefault())
              button.addEventListener('click', () => selectClient(option.id))
              list.appendChild(button)
            }

            if (!filtered.length) {
              const empty = document.createElement('div')
              empty.className = 'sales-client-combobox-empty'
              empty.textContent = '일치하는 거래처가 없습니다.'
              list.appendChild(empty)
            }

            list.hidden = false
            input.setAttribute('aria-expanded', 'true')
          }

          input.value = selectedName()

          const onFocus = () => render(input.value)
          const onInput = () => {
            const currentSelectedName = selectedName()
            if (nativeSelect.value && normalize(input.value) !== normalize(currentSelectedName)) setNativeSelectValue(nativeSelect, '')
            clearSaveMessage(modal)
            render(input.value)
          }
          const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
              closeList()
              return
            }
            if (event.key === 'Enter' && !list.hidden && filtered.length > 0) {
              event.preventDefault()
              selectClient(filtered[0].id)
            }
          }
          const onSelectChange = () => {
            const name = selectedName()
            if (name && normalize(input.value) !== normalize(name)) input.value = name
            if (!nativeSelect.value && input.value && title === '제품 판매등록') input.value = ''
          }
          const onDocumentPointer = (event: PointerEvent) => {
            const target = event.target as Node | null
            if (target && !root.contains(target)) closeList()
          }

          input.addEventListener('focus', onFocus)
          input.addEventListener('input', onInput)
          input.addEventListener('keydown', onKeyDown)
          nativeSelect.addEventListener('change', onSelectChange)
          document.addEventListener('pointerdown', onDocumentPointer)

          cleanups.add(() => {
            input.removeEventListener('focus', onFocus)
            input.removeEventListener('input', onInput)
            input.removeEventListener('keydown', onKeyDown)
            nativeSelect.removeEventListener('change', onSelectChange)
            document.removeEventListener('pointerdown', onDocumentPointer)
          })
        }

        if (!modal.dataset.salesSaveGuard) {
          modal.dataset.salesSaveGuard = 'true'
          const saveButton = Array.from(modal.querySelectorAll<HTMLButtonElement>('button')).find((button) => String(button.textContent || '').trim() === '저장')
          if (saveButton) {
            const onSaveCapture = (event: Event) => {
              const labels = Array.from(modal.querySelectorAll<HTMLLabelElement>('label'))
              const clientLabel = labels.find((label) => String(label.querySelector('span')?.textContent || '').trim() === '거래처')
              const clientSelect = clientLabel?.querySelector<HTMLSelectElement>('select')
              if (!clientSelect?.value) {
                event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation()
                showSaveMessage(modal, '거래처를 선택해 주세요.')
                return
              }

              const bodyRows = Array.from(modal.querySelectorAll<HTMLTableRowElement>('tbody tr')).filter((row) => row.querySelector('select'))
              if (!bodyRows.length) {
                event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation()
                showSaveMessage(modal, '판매 품목을 한 개 이상 추가해 주세요.')
                return
              }
              for (let index = 0; index < bodyRows.length; index += 1) {
                const row = bodyRows[index]
                const variantSelect = row.querySelector<HTMLSelectElement>('select')
                const numericInputs = Array.from(row.querySelectorAll<HTMLInputElement>('input[type="number"]'))
                const quantity = Number(numericInputs[0]?.value || 0)
                const price = Number(numericInputs[1]?.value || 0)
                if (!variantSelect?.value) {
                  event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation()
                  showSaveMessage(modal, `${index + 1}번째 판매품목의 판매규격을 선택해 주세요.`)
                  return
                }
                if (!(quantity > 0)) {
                  event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation()
                  showSaveMessage(modal, `${index + 1}번째 판매품목의 수량을 확인해 주세요.`)
                  return
                }
                if (!(price > 0)) {
                  event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation()
                  showSaveMessage(modal, `${index + 1}번째 판매품목의 판매단가를 확인해 주세요.`)
                  return
                }
              }

              const saleDate = modal.querySelector<HTMLInputElement>('input[type="date"]')?.value || ''
              pendingSaleMonth = /^\d{4}-\d{2}-\d{2}$/.test(saleDate) ? saleDate.slice(0, 7) : ''
              showSaveMessage(modal, '판매 등록을 저장하고 있습니다.', 'working')
              window.setTimeout(enhance, 120)
              window.setTimeout(enhance, 500)
              window.setTimeout(enhance, 1200)
            }
            saveButton.addEventListener('click', onSaveCapture, true)
            cleanups.add(() => saveButton.removeEventListener('click', onSaveCapture, true))
          }
        }
      }
      syncSavedMonth()
    }

    enhance()
    observer = new MutationObserver(enhance)
    observer.observe(document.body, { childList: true, subtree: true, characterData: true })

    return () => {
      observer?.disconnect()
      cleanups.forEach((cleanup) => cleanup())
      cleanups.clear()
    }
  }, [])

  return (
    <style jsx global>{`
      .sales-client-combobox { position: relative; width: 100%; }
      .sales-client-combobox-input-wrap { position: relative; }
      .sales-client-combobox-input {
        width: 100%; height: 42px; border: 1px solid #c7d8e8; border-radius: 0.75rem;
        background: rgba(255,255,255,.92); padding: 0 38px 0 12px; color: #173b52;
        font-size: 0.875rem; outline: none;
      }
      .sales-client-combobox-input:focus { border-color: #60a5fa; box-shadow: 0 0 0 3px rgba(96,165,250,.12); }
      .sales-client-combobox-input::-webkit-search-cancel-button { cursor: pointer; }
      .sales-client-combobox-arrow { position:absolute; right:12px; top:50%; transform:translateY(-54%); color:#7890a0; font-size:20px; line-height:1; pointer-events:none; }
      .sales-client-combobox-list { position:absolute; z-index:1500; top:calc(100% + 5px); left:0; right:0; max-height:300px; overflow-y:auto; border:1px solid #c8d9e7; border-radius:.8rem; background:#fff; padding:6px; box-shadow:0 18px 44px rgba(23,59,82,.18); }
      .sales-client-combobox-summary { padding:6px 9px 7px; color:#78909d; font-size:11px; font-weight:700; }
      .sales-client-combobox-option { display:block; width:100%; border:0; border-radius:.6rem; background:transparent; padding:9px 10px; color:#234653; font-size:14px; text-align:left; cursor:pointer; }
      .sales-client-combobox-option:hover,.sales-client-combobox-option:focus-visible { background:#edf6fb; outline:none; }
      .sales-client-combobox-option.is-selected { background:#2563eb; color:#fff; }
      .sales-client-combobox-empty { padding:18px 10px; color:#8799a3; font-size:13px; text-align:center; }
      .sales-save-message { margin:0 0 16px; border:1px solid #fecaca; border-radius:14px; background:#fff1f2; padding:12px 14px; color:#b42318; font-size:13px; font-weight:800; line-height:1.5; }
      .sales-save-message[data-tone='working'] { border-color:#bfdbfe; background:#eff6ff; color:#1d4ed8; }
    `}</style>
  )
}
