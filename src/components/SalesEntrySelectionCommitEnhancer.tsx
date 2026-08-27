'use client'

import { useEffect } from 'react'

function normalize(value: unknown) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase('ko-KR')
    .replace(/[\s._\-·×()/]+/g, '')
    .trim()
}

function setNativeSelectValue(select: HTMLSelectElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set
  if (setter) setter.call(select, value)
  else select.value = value
  select.dispatchEvent(new Event('change', { bubbles: true }))
}

function uniqueMatch(select: HTMLSelectElement, query: string) {
  const needle = normalize(query)
  if (!needle) return null
  const options = Array.from(select.options).filter((option) => Boolean(option.value))
  const exact = options.filter((option) => normalize(option.textContent) === needle)
  if (exact.length === 1) return exact[0]
  const contains = options.filter((option) => normalize(option.textContent).includes(needle))
  return contains.length === 1 ? contains[0] : null
}

function productSaleModal() {
  return Array.from(document.querySelectorAll<HTMLElement>('h2'))
    .find((node) => ['제품 판매등록', '제품 판매 수정'].includes(String(node.textContent || '').trim()))
    ?.closest<HTMLElement>('div.fixed') || null
}

function commitClient(modal: HTMLElement) {
  const root = modal.querySelector<HTMLElement>('[data-sales-client-combobox]')
  if (!root) return false
  const input = root.querySelector<HTMLInputElement>('input.sales-client-combobox-input')
  const select = root.parentElement?.querySelector<HTMLSelectElement>('select') || null
  if (!input || !select || select.value) return Boolean(select?.value)
  const match = uniqueMatch(select, input.value)
  if (!match) return false
  setNativeSelectValue(select, match.value)
  input.value = String(match.textContent || '').trim()
  return true
}

function commitVariantWrap(wrap: HTMLElement) {
  const input = wrap.querySelector<HTMLInputElement>('[data-moni-variant-search]')
  const sibling = wrap.nextElementSibling
  const select = sibling instanceof HTMLSelectElement
    ? sibling
    : wrap.parentElement?.querySelector<HTMLSelectElement>('select') || null
  if (!input || !select || select.value) return Boolean(select?.value)
  const match = uniqueMatch(select, input.value)
  if (!match) return false
  setNativeSelectValue(select, match.value)
  input.value = String(match.textContent || '').trim()
  return true
}

function commitAll(modal: HTMLElement) {
  commitClient(modal)
  for (const wrap of Array.from(modal.querySelectorAll<HTMLElement>('[data-moni-variant-search-wrap]'))) {
    commitVariantWrap(wrap)
  }
}

export default function SalesEntrySelectionCommitEnhancer() {
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('button') : null
      if (!button || String(button.textContent || '').trim() !== '저장') return
      const modal = productSaleModal()
      if (modal && modal.contains(button)) commitAll(modal)
    }

    const onFocusOut = (event: FocusEvent) => {
      const target = event.target
      if (!(target instanceof HTMLInputElement)) return
      const modal = productSaleModal()
      if (!modal || !modal.contains(target)) return
      if (target.matches('input.sales-client-combobox-input')) {
        commitClient(modal)
        return
      }
      const wrap = target.closest<HTMLElement>('[data-moni-variant-search-wrap]')
      if (wrap) commitVariantWrap(wrap)
    }

    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('focusout', onFocusOut, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('focusout', onFocusOut, true)
    }
  }, [])

  return null
}
