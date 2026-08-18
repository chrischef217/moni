'use client'

import { useEffect } from 'react'

const STORAGE_KEY = 'moni-alert-sync-v10'
const SYNC_INTERVAL_MS = 10 * 60 * 1000
const INITIAL_SYNC_DELAY_MS = 8 * 1000

function lastSyncedAt() {
  try {
    return Number(window.sessionStorage.getItem(STORAGE_KEY) || 0)
  } catch {
    return 0
  }
}

function rememberSync() {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, String(Date.now()))
  } catch {
    // Best-effort throttle only.
  }
}

function setNativeInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  if (setter) setter.call(input, value)
  else input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

function salesModal() {
  return Array.from(document.querySelectorAll<HTMLElement>('.fixed.inset-0.z-\\[1300\\]')).find((modal) => {
    const title = String(modal.querySelector('h2')?.textContent || '').trim()
    return title === '제품 판매등록' || title === '제품 판매 수정'
  }) || null
}

function ensureSalesMessage(modal: HTMLElement) {
  let box = modal.querySelector<HTMLElement>('[data-sales-save-message]')
  if (box) return box
  const panel = modal.firstElementChild as HTMLElement | null
  const content = panel?.children?.[1] as HTMLElement | undefined
  if (!content) return null
  box = document.createElement('div')
  box.dataset.salesSaveMessage = 'true'
  box.className = 'sales-save-message'
  box.hidden = true
  content.insertBefore(box, content.firstChild)
  return box
}

function showSalesMessage(modal: HTMLElement, message: string, tone: 'error' | 'working' = 'error') {
  const box = ensureSalesMessage(modal)
  if (!box) return
  box.dataset.tone = tone
  box.textContent = message
  box.hidden = false
}

function clearSalesMessage(modal: HTMLElement) {
  const box = ensureSalesMessage(modal)
  if (!box) return
  box.hidden = true
  box.textContent = ''
}

function currentSalesPageError(modal: HTMLElement) {
  const shell = document.querySelector<HTMLElement>("[data-sales-management-shell='true']")
  if (!shell) return ''
  const candidate = Array.from(shell.querySelectorAll<HTMLElement>('div')).find((element) => {
    if (modal.contains(element)) return false
    const message = String(element.textContent || '').trim()
    return Boolean(message) && element.className.includes('border-red-500') && element.className.includes('text-red-200')
  })
  return String(candidate?.textContent || '').trim()
}

export default function GlobalAlertSyncController() {
  useEffect(() => {
    let cancelled = false
    let redirecting = false
    let pendingSaleMonth = ''
    const guardedButtons = new WeakSet<HTMLButtonElement>()

    const recoverExpiredSession = () => {
      if (redirecting || cancelled) return
      redirecting = true
      try {
        window.sessionStorage.setItem('moni-session-expired-at', String(Date.now()))
      } catch {
        // Best effort only.
      }
      window.location.reload()
    }

    const sync = async (force = false) => {
      if (document.visibilityState !== 'visible') return
      if (!force && Date.now() - lastSyncedAt() < SYNC_INTERVAL_MS) return
      try {
        const response = await fetch('/api/moni/alerts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'sync_intelligence' }),
        })
        if (cancelled) return
        if (response.status === 401 || response.status === 403) {
          recoverExpiredSession()
          return
        }
        if (!response.ok) return
        rememberSync()
        window.dispatchEvent(new CustomEvent('moni-alerts-synced'))
      } catch {
        // Network loss must not eject an otherwise-valid session.
      }
    }

    const enhanceSalesSave = () => {
      const modal = salesModal()
      if (modal) {
        ensureSalesMessage(modal)
        const pageError = currentSalesPageError(modal)
        if (pageError) showSalesMessage(modal, pageError)

        const saveButton = Array.from(modal.querySelectorAll<HTMLButtonElement>('button')).find((button) => String(button.textContent || '').trim() === '저장')
        if (saveButton && !guardedButtons.has(saveButton)) {
          guardedButtons.add(saveButton)
          saveButton.addEventListener('click', (event) => {
            const labels = Array.from(modal.querySelectorAll<HTMLLabelElement>('label'))
            const clientLabel = labels.find((label) => String(label.querySelector('span')?.textContent || '').trim() === '거래처')
            const clientSelect = clientLabel?.querySelector<HTMLSelectElement>('select')
            if (!clientSelect?.value) {
              event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation()
              showSalesMessage(modal, '거래처를 선택해 주세요.')
              return
            }

            const bodyRows = Array.from(modal.querySelectorAll<HTMLTableRowElement>('tbody tr')).filter((row) => row.querySelector('select'))
            if (!bodyRows.length) {
              event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation()
              showSalesMessage(modal, '판매 품목을 한 개 이상 추가해 주세요.')
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
                showSalesMessage(modal, `${index + 1}번째 판매품목의 판매규격을 선택해 주세요.`)
                return
              }
              if (!(quantity > 0)) {
                event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation()
                showSalesMessage(modal, `${index + 1}번째 판매품목의 수량을 확인해 주세요.`)
                return
              }
              if (!(price > 0)) {
                event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation()
                showSalesMessage(modal, `${index + 1}번째 판매품목의 판매단가를 확인해 주세요.`)
                return
              }
            }

            clearSalesMessage(modal)
            const saleDate = modal.querySelector<HTMLInputElement>('input[type="date"]')?.value || ''
            pendingSaleMonth = /^\d{4}-\d{2}-\d{2}$/.test(saleDate) ? saleDate.slice(0, 7) : ''
            showSalesMessage(modal, '판매 등록을 저장하고 있습니다.', 'working')
          }, true)
        }
      }

      if (!modal && pendingSaleMonth) {
        const shell = document.querySelector<HTMLElement>("[data-sales-management-shell='true']")
        if (!shell) return
        const success = Array.from(shell.querySelectorAll<HTMLElement>('div')).find((element) => {
          const message = String(element.textContent || '').trim()
          return element.className.includes('border-emerald-500') && /제품 판매(를|건을) (등록|수정)했습니다/.test(message)
        })
        if (!success) return
        const monthInput = shell.querySelector<HTMLInputElement>('input[type="month"]')
        if (monthInput && monthInput.value !== pendingSaleMonth) setNativeInputValue(monthInput, pendingSaleMonth)
        pendingSaleMonth = ''
      }
    }

    const first = window.setTimeout(() => void sync(), INITIAL_SYNC_DELAY_MS)
    const timer = window.setInterval(() => void sync(true), SYNC_INTERVAL_MS)
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void sync(true)
    }
    const onFocus = () => void sync(true)
    const observer = new MutationObserver(enhanceSalesSave)
    observer.observe(document.body, { childList: true, subtree: true, characterData: true })
    enhanceSalesSave()
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', onFocus)

    return () => {
      cancelled = true
      observer.disconnect()
      window.clearTimeout(first)
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  return <style jsx global>{`
    .sales-save-message { margin:0 0 16px; border:1px solid #fecaca; border-radius:14px; background:#fff1f2; padding:12px 14px; color:#b42318; font-size:13px; font-weight:800; line-height:1.5; }
    .sales-save-message[data-tone='working'] { border-color:#bfdbfe; background:#eff6ff; color:#1d4ed8; }
  `}</style>
}
