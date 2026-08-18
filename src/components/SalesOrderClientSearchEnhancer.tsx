'use client'

import { useEffect } from 'react'

const normalize = (value: unknown) => String(value ?? '').normalize('NFKC').toLowerCase().replace(/\s+/g, '')

function setNativeSelectValue(select: HTMLSelectElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set
  if (setter) setter.call(select, value)
  else select.value = value
  select.dispatchEvent(new Event('change', { bubbles: true }))
}

export default function SalesOrderClientSearchEnhancer() {
  useEffect(() => {
    const shell = document.querySelector<HTMLElement>("[data-sales-management-shell='true']")
    if (!shell) return

    let observer: MutationObserver | null = null
    const cleanups = new Set<() => void>()

    function enhance() {
      const modals = Array.from(document.querySelectorAll<HTMLElement>('.fixed.inset-0.z-\\[1300\\]'))
      for (const modal of modals) {
        const title = String(modal.querySelector('h2')?.textContent || '').trim()
        if (title !== '제품 판매등록' && title !== '제품 판매 수정') continue

        const fields = Array.from(modal.querySelectorAll<HTMLLabelElement>('label'))
        const clientField = fields.find((label) => String(label.querySelector('span')?.textContent || '').trim() === '거래처')
        const nativeSelect = clientField?.querySelector<HTMLSelectElement>('select') || null
        if (!clientField || !nativeSelect || clientField.querySelector('[data-sales-client-combobox]')) continue

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
          if (nativeSelect.value && normalize(input.value) !== normalize(currentSelectedName)) {
            setNativeSelectValue(nativeSelect, '')
          }
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
    }

    enhance()
    observer = new MutationObserver(enhance)
    observer.observe(document.body, { childList: true, subtree: true })

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
        width: 100%;
        height: 42px;
        border: 1px solid #334155;
        border-radius: 0.75rem;
        background: #020617;
        padding: 0 38px 0 12px;
        color: white;
        font-size: 0.875rem;
        outline: none;
      }
      .sales-client-combobox-input:focus { border-color: #3b82f6; }
      .sales-client-combobox-input::-webkit-search-cancel-button { cursor: pointer; }
      .sales-client-combobox-arrow {
        position: absolute;
        right: 12px;
        top: 50%;
        transform: translateY(-54%);
        color: #94a3b8;
        font-size: 20px;
        line-height: 1;
        pointer-events: none;
      }
      .sales-client-combobox-list {
        position: absolute;
        z-index: 1500;
        top: calc(100% + 5px);
        left: 0;
        right: 0;
        max-height: 300px;
        overflow-y: auto;
        border: 1px solid #475569;
        border-radius: 0.8rem;
        background: #0f172a;
        padding: 6px;
        box-shadow: 0 18px 44px rgba(2, 6, 23, 0.42);
      }
      .sales-client-combobox-summary {
        padding: 6px 9px 7px;
        color: #94a3b8;
        font-size: 11px;
        font-weight: 700;
      }
      .sales-client-combobox-option {
        display: block;
        width: 100%;
        border: 0;
        border-radius: 0.6rem;
        background: transparent;
        padding: 9px 10px;
        color: #e2e8f0;
        font-size: 14px;
        text-align: left;
        cursor: pointer;
      }
      .sales-client-combobox-option:hover,
      .sales-client-combobox-option:focus-visible { background: #1e293b; outline: none; }
      .sales-client-combobox-option.is-selected { background: #2563eb; color: white; }
      .sales-client-combobox-empty { padding: 18px 10px; color: #94a3b8; font-size: 13px; text-align: center; }
    `}</style>
  )
}
