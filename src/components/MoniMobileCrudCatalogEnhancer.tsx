'use client'

import { useEffect, useRef } from 'react'

type Supplier = { name: string; source: string; count: number; last_date?: string | null }
type Material = {
  id: string
  item_code?: string | null
  name: string
  is_stock_managed: boolean
  current_stock_g: number
  packing_weight_g?: number | null
  packing_weight_source?: string | null
  unit_price?: number | null
  unit_price_source?: string | null
  box_quantity?: number | null
  suppliers: Supplier[]
  default_supplier?: string
  spec?: string | null
  storage_type?: string | null
  country_of_origin?: string | null
  food_type?: string | null
  shelf_life_days?: number | null
}

const normalize = (value: unknown) => String(value ?? '').normalize('NFKC').toLowerCase().replace(/\s+/g, '')
const formatG = (value: unknown) => {
  const grams = Number(value || 0)
  if (Math.abs(grams) >= 1000) return `${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 3 }).format(grams / 1000)}kg`
  return `${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 }).format(grams)}g`
}
const formatNumber = (value: unknown) => new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 2 }).format(Number(value || 0))

function setNativeValue(element: HTMLInputElement | HTMLSelectElement, value: string) {
  const prototype = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set
  if (setter) setter.call(element, value)
  else element.value = value
  element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
  if (element instanceof HTMLInputElement) element.dispatchEvent(new Event('change', { bubbles: true }))
}

function fieldByLabel(card: HTMLElement, labelText: string) {
  return Array.from(card.querySelectorAll<HTMLElement>('.moni-crud-field')).find((field) => {
    const label = field.querySelector<HTMLElement>('.moni-crud-label')
    return String(label?.textContent || '').includes(labelText)
  }) || null
}

function inputByLabel(card: HTMLElement, labelText: string) {
  return fieldByLabel(card, labelText)?.querySelector<HTMLInputElement>('input') || null
}

function addText(parent: HTMLElement, tag: keyof HTMLElementTagNameMap, text: string, className?: string) {
  const node = document.createElement(tag)
  node.textContent = text
  if (className) node.className = className
  parent.appendChild(node)
  return node
}

export default function MoniMobileCrudCatalogEnhancer() {
  const catalogRef = useRef<Material[]>([])
  const loadedRef = useRef(false)

  useEffect(() => {
    let stopped = false
    let observer: MutationObserver | null = null
    let retryTimer: number | null = null

    async function loadCatalog() {
      if (loadedRef.current) return
      try {
        const response = await fetch(`/api/moni/mobile-material-catalog?_=${Date.now()}`, { cache: 'no-store' })
        const payload = await response.json()
        if (!response.ok || !payload.ok || !Array.isArray(payload.materials)) return
        catalogRef.current = payload.materials as Material[]
        loadedRef.current = true
      } catch {
        // Core CRUD card remains usable when enhancement data is temporarily unavailable.
      }
    }

    function enhance(card: HTMLElement) {
      if (!card.classList.contains('moni-crud-create') || !card.classList.contains('moni-crud-stage-draft')) return
      const materialField = fieldByLabel(card, '원재료')
      const nativeSelect = materialField?.querySelector<HTMLSelectElement>('select') || null
      if (!materialField || !nativeSelect || materialField.querySelector('[data-moni-material-search]')) return
      const materialSelect: HTMLSelectElement = nativeSelect
      if (!loadedRef.current || !catalogRef.current.length) {
        if (retryTimer === null) retryTimer = window.setTimeout(() => { retryTimer = null; scan() }, 250)
        return
      }

      materialSelect.style.display = 'none'
      materialSelect.setAttribute('aria-hidden', 'true')

      const shell = document.createElement('div')
      shell.dataset.moniMaterialSearch = 'true'
      shell.className = 'moni-material-search-shell'
      const input = document.createElement('input')
      input.type = 'search'
      input.autocomplete = 'off'
      input.placeholder = '원재료명 또는 코드 입력 · 전체 목록 검색'
      input.className = 'moni-material-search-input'
      input.setAttribute('aria-label', '원재료 검색')
      const count = document.createElement('span')
      count.className = 'moni-material-search-count'
      const list = document.createElement('div')
      list.className = 'moni-material-search-list'
      list.hidden = true
      const reference = document.createElement('div')
      reference.className = 'moni-material-reference'
      reference.hidden = true
      shell.append(input, count, list, reference)
      materialField.insertBefore(shell, materialSelect)

      const all = catalogRef.current
      const stockManagedCount = all.filter((item) => item.is_stock_managed).length
      count.textContent = `활성 원재료 ${all.length}개 전체 · 입고 가능 ${stockManagedCount}개`

      const supplierInput = inputByLabel(card, '매입처')
      const packingInput = inputByLabel(card, '포장당 중량')
      const unitPriceInput = inputByLabel(card, '단가')
      const quantityPacksInput = inputByLabel(card, '포장 개수')
      const quantityGInput = inputByLabel(card, '총 입고량')
      const datalist = card.querySelector<HTMLDataListElement>('#moni-supplier-suggestions')

      function updateSuppliers(material: Material) {
        if (datalist) {
          datalist.replaceChildren()
          for (const supplier of material.suppliers || []) {
            const option = document.createElement('option')
            option.value = supplier.name
            option.label = supplier.source
            datalist.appendChild(option)
          }
        }
      }

      function renderReference(material: Material) {
        reference.replaceChildren()
        reference.hidden = false
        addText(reference, 'b', '선택 원재료 연결 정보', 'moni-material-reference-title')
        const grid = document.createElement('div')
        grid.className = 'moni-material-reference-grid'
        const values = [
          `현재재고 ${formatG(material.current_stock_g)}`,
          material.packing_weight_g ? `포장기준 ${formatG(material.packing_weight_g)}${material.packing_weight_source ? ` · ${material.packing_weight_source}` : ''}` : '포장기준 미등록',
          material.unit_price ? `기준단가 ${formatNumber(material.unit_price)} · 포장 1EA` : '기준단가 미등록',
          material.default_supplier ? `주 매입처 ${material.default_supplier}` : '주 매입처 미등록',
          material.box_quantity ? `박스수량 ${formatNumber(material.box_quantity)}` : '',
          material.spec ? `규격 ${material.spec}` : '',
          material.storage_type ? `보관 ${material.storage_type}` : '',
          material.food_type ? `식품유형 ${material.food_type}` : '',
          material.country_of_origin ? `원산지 ${material.country_of_origin}` : '',
          material.shelf_life_days ? `기준 보관일 ${formatNumber(material.shelf_life_days)}일` : '',
        ].filter(Boolean)
        for (const value of values) addText(grid, 'span', value)
        reference.appendChild(grid)
        addText(reference, 'small', '자동으로 채운 매입처·포장중량·단가는 이번 입고 건에서 자유롭게 수정할 수 있습니다. 원재료 마스터 자체는 이 카드에서 변경하지 않습니다.')
      }

      function applyMaterial(material: Material, replaceLinkedValues: boolean) {
        if (!material.is_stock_managed) return
        setNativeValue(materialSelect, material.id)
        input.value = material.name
        updateSuppliers(material)
        renderReference(material)
        if (replaceLinkedValues) {
          if (supplierInput) setNativeValue(supplierInput, material.default_supplier || '')
          if (packingInput) setNativeValue(packingInput, material.packing_weight_g ? String(material.packing_weight_g) : '')
          if (unitPriceInput) setNativeValue(unitPriceInput, material.unit_price ? String(material.unit_price) : '')
          if (quantityPacksInput && quantityGInput && quantityPacksInput.value && packingInput?.value) {
            const total = Number(quantityPacksInput.value) * Number(packingInput.value)
            if (Number.isFinite(total) && total > 0) setNativeValue(quantityGInput, String(Math.round(total)))
          }
        }
        list.hidden = true
      }

      function renderList(query: string) {
        const needle = normalize(query)
        const matches = all.filter((material) => {
          if (!needle) return true
          return normalize(material.name).includes(needle) || normalize(material.item_code).includes(needle) || normalize(material.id).includes(needle)
        })
        list.replaceChildren()
        const header = document.createElement('div')
        header.className = 'moni-material-result-summary'
        header.textContent = needle ? `검색 결과 ${matches.length}개` : `전체 ${all.length}개`
        list.appendChild(header)
        for (const material of matches) {
          const button = document.createElement('button')
          button.type = 'button'
          button.className = `moni-material-result ${material.is_stock_managed ? '' : 'is-unmanaged'}`
          button.disabled = !material.is_stock_managed
          const main = document.createElement('span')
          addText(main, 'b', material.name)
          addText(main, 'small', material.item_code || material.id)
          button.appendChild(main)
          const badge = document.createElement('em')
          badge.textContent = material.is_stock_managed ? (material.packing_weight_g ? formatG(material.packing_weight_g) : '포장정보 확인') : '재고관리 미설정'
          button.appendChild(badge)
          button.addEventListener('pointerdown', (event) => event.preventDefault())
          button.addEventListener('click', () => applyMaterial(material, true))
          list.appendChild(button)
        }
        if (!matches.length) addText(list, 'div', '일치하는 원재료가 없습니다.', 'moni-material-no-result')
        list.hidden = false
      }

      input.addEventListener('focus', () => renderList(input.value))
      input.addEventListener('input', () => {
        renderList(input.value)
        const exact = all.find((material) => normalize(material.name) === normalize(input.value) || normalize(material.item_code) === normalize(input.value))
        if (exact?.is_stock_managed) applyMaterial(exact, true)
        else if (!exact && materialSelect.value) setNativeValue(materialSelect, '')
      })
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') list.hidden = true
      })
      const close = (event: Event) => {
        const target = event.target as Node | null
        if (target && !shell.contains(target)) list.hidden = true
      }
      document.addEventListener('pointerdown', close)
      shell.addEventListener('DOMNodeRemoved', () => document.removeEventListener('pointerdown', close), { once: true })

      const selectedId = materialSelect.value
      const selected = all.find((material) => material.id === selectedId)
      if (selected) {
        input.value = selected.name
        updateSuppliers(selected)
        renderReference(selected)
        if (supplierInput && !supplierInput.value && selected.default_supplier) setNativeValue(supplierInput, selected.default_supplier)
        if (packingInput && !packingInput.value && selected.packing_weight_g) setNativeValue(packingInput, String(selected.packing_weight_g))
        if (unitPriceInput && !unitPriceInput.value && selected.unit_price) setNativeValue(unitPriceInput, String(selected.unit_price))
      }
    }

    function scan() {
      if (stopped) return
      for (const card of Array.from(document.querySelectorAll<HTMLElement>('.moni-crud-card'))) enhance(card)
    }

    void loadCatalog().then(scan)
    observer = new MutationObserver(scan)
    observer.observe(document.body, { childList: true, subtree: true })
    scan()

    return () => {
      stopped = true
      observer?.disconnect()
      if (retryTimer !== null) window.clearTimeout(retryTimer)
    }
  }, [])

  return (
    <style jsx global>{`
      .moni-material-search-shell{position:relative}.moni-material-search-input{width:100%!important;height:44px!important;border:1px solid #c9deda!important;border-radius:12px!important;background:#fbfdfd!important;padding:0 38px 0 12px!important;color:#173b52!important;font-size:12px!important;font-weight:800!important;outline:none!important}.moni-material-search-input:focus{border-color:#3ca38c!important;box-shadow:0 0 0 3px rgba(60,163,140,.11)!important}.moni-material-search-count{display:block;margin:5px 2px 0;color:#7a929b;font-size:9.5px;font-weight:750}.moni-material-search-list{position:absolute;left:0;right:0;top:48px;z-index:80;max-height:310px;overflow:auto;border:1px solid #cfe3df;border-radius:14px;background:white;padding:6px;box-shadow:0 16px 36px rgba(23,59,82,.18)}.moni-material-result-summary{padding:6px 8px;color:#75909a;font-size:9.5px;font-weight:850}.moni-material-result{display:flex;width:100%;align-items:center;justify-content:space-between;gap:8px;border:0;border-radius:10px;background:transparent;padding:9px 8px;text-align:left;color:#234653}.moni-material-result:active,.moni-material-result:hover{background:#eef8f5}.moni-material-result>span{display:grid;min-width:0;gap:2px}.moni-material-result b{font-size:11.5px;line-height:1.25}.moni-material-result small{overflow:hidden;color:#80959d;font-size:9px;text-overflow:ellipsis;white-space:nowrap}.moni-material-result em{flex:0 0 auto;border-radius:999px;background:#eef8f5;padding:4px 6px;color:#247866;font-size:8.5px;font-style:normal;font-weight:850}.moni-material-result.is-unmanaged{opacity:.46}.moni-material-result.is-unmanaged em{background:#f1f3f4;color:#7b8589}.moni-material-no-result{padding:18px 10px;color:#86989f;font-size:11px;text-align:center}.moni-material-reference{grid-column:1/-1;margin-top:9px;border:1px solid #d9e9e5;border-radius:13px;background:#f7fbfa;padding:10px}.moni-material-reference-title{display:block;margin-bottom:7px;color:#367466;font-size:10px;font-weight:900}.moni-material-reference-grid{display:flex;flex-wrap:wrap;gap:5px}.moni-material-reference-grid span{border-radius:999px;background:white;padding:4px 7px;color:#55727d;font-size:9px;font-weight:750;box-shadow:inset 0 0 0 1px #e0ece9}.moni-material-reference>small{display:block;margin-top:7px;color:#81959c;font-size:8.8px;line-height:1.45}
    `}</style>
  )
}
