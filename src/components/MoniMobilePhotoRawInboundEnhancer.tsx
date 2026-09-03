'use client'

import { useEffect } from 'react'

type PhotoCardState = {
  expirationKind: string
  expirationDate: string
  evidenceIds: string[]
  evidenceCount: number
  warnings: string[]
  masterReference: Record<string, any> | null
}

const emptyState = (): PhotoCardState => ({ expirationKind: '', expirationDate: '', evidenceIds: [], evidenceCount: 0, warnings: [], masterReference: null })
const text = (value: unknown) => String(value ?? '').trim()

export default function MoniMobilePhotoRawInboundEnhancer() {
  useEffect(() => {
    let disposed = false
    let frame = 0
    let state = emptyState()
    const originalFetch = window.fetch.bind(window)

    const scheduleEnhance = () => {
      if (disposed || frame) return
      frame = window.requestAnimationFrame(() => { frame = 0; enhanceCard() })
    }

    const rememberCard = (payload: any) => {
      const card = payload?.card
      if (!card || card.stage !== 'draft' || !['CREATE', 'UPDATE'].includes(String(card.operation || '').toUpperCase())) return
      const fields = card.fields || {}
      state = {
        expirationKind: text(fields.expiration_kind),
        expirationDate: text(fields.expiration_date),
        evidenceIds: Array.isArray(fields.evidence_attachment_ids) ? fields.evidence_attachment_ids.map(text).filter(Boolean) : [],
        evidenceCount: Number(card.photo_evidence?.count || 0),
        warnings: Array.isArray(card.photo_warnings) ? card.photo_warnings.map(text).filter(Boolean) : [],
        masterReference: card.master_reference && typeof card.master_reference === 'object' ? card.master_reference : null,
      }
      scheduleEnhance()
    }

    const wrappedFetch: typeof window.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      const method = String(init?.method || 'GET').toUpperCase()
      let nextInit = init
      if (url.includes('/api/moni/mobile-actions') && method === 'POST' && typeof init?.body === 'string') {
        try {
          const body = JSON.parse(init.body)
          if (String(body?.command || '').toLowerCase() === 'prepare') {
            const kind = document.querySelector<HTMLSelectElement>('[data-moni-photo-expiration-kind]')?.value || state.expirationKind
            const date = document.querySelector<HTMLInputElement>('[data-moni-photo-expiration-date]')?.value || state.expirationDate
            body.fields = {
              ...(body.fields || {}),
              expiration_kind: kind || '',
              expiration_date: date || '',
              evidence_attachment_ids: state.evidenceIds,
            }
            nextInit = { ...init, body: JSON.stringify(body) }
          }
        } catch { /* preserve original request */ }
      }
      const response = await originalFetch(input, nextInit)
      if (url.includes('/api/moni/mobile-actions') && method === 'GET') {
        void response.clone().json().then(rememberCard).catch(() => undefined)
      }
      return response
    }
    window.fetch = wrappedFetch

    function addReference(grid: HTMLElement) {
      let box = grid.querySelector<HTMLElement>('[data-moni-photo-inbound-reference]')
      if (!box) {
        box = document.createElement('div')
        box.dataset.moniPhotoInboundReference = 'true'
        box.className = 'moni-v2-reference moni-crud-span-2'
        grid.prepend(box)
      }
      const ref = state.masterReference
      const chips = [
        state.evidenceCount ? `사진 근거 ${state.evidenceCount}장` : '',
        ref?.packing_weight_g ? `마스터 포장 ${Number(ref.packing_weight_g / 1000).toLocaleString('ko-KR', { maximumFractionDigits: 3 })}kg` : '',
        ref?.unit_price ? `마스터 기준단가 ${Number(ref.unit_price).toLocaleString('ko-KR')}원` : '',
        ref?.supplier ? `마스터 매입처 ${text(ref.supplier)}` : '',
        ref?.box_quantity ? `박스수량 ${Number(ref.box_quantity).toLocaleString('ko-KR')}` : '',
      ].filter(Boolean)
      box.innerHTML = `<b>${state.evidenceCount ? '사진 판독 + 원재료 마스터 교차확인' : '입고 기한 정보'}</b><div>${chips.map((value) => `<span>${value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')}</span>`).join('')}</div>${state.warnings.map((warning) => `<small style="display:block;color:#b45309;margin-top:5px">⚠ ${warning.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')}</small>`).join('')}<small>${state.evidenceCount ? '사진 판독값은 자동 저장되지 않습니다. 아래 값을 확인하고 미리보기·확정을 거쳐야 실제 입고로 반영됩니다.' : '소비기한·유통기한이 있는 원재료는 라벨 날짜를 그대로 입력할 수 있습니다.'}</small>`
    }

    function addExpirationFields(grid: HTMLElement) {
      let kind = grid.querySelector<HTMLSelectElement>('[data-moni-photo-expiration-kind]')
      if (!kind) {
        const label = document.createElement('label')
        label.className = 'moni-crud-field'
        label.innerHTML = '<span class="moni-crud-label">기한 종류</span>'
        kind = document.createElement('select')
        kind.dataset.moniPhotoExpirationKind = 'true'
        kind.innerHTML = '<option value="">표기 없음 / 확인 불가</option><option value="소비기한">소비기한</option><option value="유통기한">유통기한</option><option value="EXP">EXP</option>'
        label.appendChild(kind)
        grid.appendChild(label)
        kind.addEventListener('change', () => { state.expirationKind = kind?.value || '' })
      }
      if (kind.value !== state.expirationKind) kind.value = state.expirationKind

      let date = grid.querySelector<HTMLInputElement>('[data-moni-photo-expiration-date]')
      if (!date) {
        const label = document.createElement('label')
        label.className = 'moni-crud-field'
        label.innerHTML = '<span class="moni-crud-label">소비/유통기한 날짜</span>'
        date = document.createElement('input')
        date.type = 'date'
        date.dataset.moniPhotoExpirationDate = 'true'
        label.appendChild(date)
        grid.appendChild(label)
        date.addEventListener('input', () => { state.expirationDate = date?.value || '' })
      }
      if (date.value !== state.expirationDate) date.value = state.expirationDate
    }

    function enhanceCard() {
      const host = document.querySelector<HTMLElement>('[data-moni-raw-material-v2-host="true"]')
      const card = host?.querySelector<HTMLElement>('.moni-crud-card.moni-crud-stage-draft')
      const grid = card?.querySelector<HTMLElement>('.moni-crud-grid')
      if (!grid) return
      addReference(grid)
      addExpirationFields(grid)
    }

    const observer = new MutationObserver(scheduleEnhance)
    observer.observe(document.body, { childList: true, subtree: true })
    scheduleEnhance()

    return () => {
      disposed = true
      observer.disconnect()
      if (frame) window.cancelAnimationFrame(frame)
      if (window.fetch === wrappedFetch) window.fetch = originalFetch
    }
  }, [])

  return null
}
