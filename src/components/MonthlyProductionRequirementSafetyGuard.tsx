'use client'

import { useEffect } from 'react'

type Validation = {
  complete?: boolean
  unresolved_count?: number
  products?: Array<{
    product_name?: string
    unresolved_count?: number
    complete?: boolean
  }>
}

type RequirementGroup = {
  validation?: Validation
  issues?: Array<{
    product_name?: string
    recipe_item?: string | null
    reason?: string
  }>
}

type Payload = {
  ok?: boolean
  confirmed?: RequirementGroup
  ai_only?: RequirementGroup
}

const BANNER_ATTR = 'data-monthly-requirement-safety-banner'
const PRINT_ATTR = 'data-monthly-requirement-print'

function normalizedText(value: unknown) {
  return String(value ?? '').trim().replace(/\s+/g, ' ')
}

function currentMonthFromPage() {
  const nodes = Array.from(document.querySelectorAll('b, h1, h2, span'))
  for (const node of nodes) {
    const match = normalizedText(node.textContent).match(/(\d{4})년\s*(\d{1,2})월/)
    if (match) return `${match[1]}-${String(Number(match[2])).padStart(2, '0')}`
  }
  return new Date().toISOString().slice(0, 7)
}

function currentLevelFromPage(): 'stable' | 'standard' | 'expanded' {
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
  const active = buttons.find((button) =>
    ['안정형', '표준형', '확장형'].includes(normalizedText(button.textContent)) && button.className.includes('bg-green-600'),
  )
  const label = normalizedText(active?.textContent)
  if (label === '안정형') return 'stable'
  if (label === '확장형') return 'expanded'
  return 'standard'
}

function isAiOnlyView() {
  const labels = Array.from(document.querySelectorAll('label'))
  const target = labels.find((label) => normalizedText(label.textContent).includes('AI 예측만 보기'))
  return Boolean(target?.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked)
}

function requirementSection() {
  const heading = Array.from(document.querySelectorAll('h2')).find((node) => normalizedText(node.textContent) === '원료 필요량 현황')
  return heading?.closest('section') as HTMLElement | null
}

function removeBanner() {
  document.querySelectorAll(`[${BANNER_ATTR}]`).forEach((node) => node.remove())
}

function setPrintSafety(safe: boolean) {
  document.querySelectorAll<HTMLButtonElement>(`[${PRINT_ATTR}]`).forEach((button) => {
    button.dataset.monthlyRequirementSafe = safe ? 'true' : 'false'
    button.disabled = !safe
    button.title = safe ? '원료 체크리스트 인쇄 / PDF' : '계산이 완전하지 않아 인쇄할 수 없습니다.'
    button.classList.toggle('opacity-50', !safe)
    button.classList.toggle('cursor-not-allowed', !safe)
  })
}

function renderUnsafeBanner(group: RequirementGroup, aiOnly: boolean) {
  removeBanner()
  const section = requirementSection()
  if (!section) return
  const header = section.firstElementChild
  if (!header) return

  const unresolved = Number(group.validation?.unresolved_count || group.issues?.length || 0)
  const products = (group.validation?.products || [])
    .filter((product) => product.complete === false || Number(product.unresolved_count || 0) > 0)
    .map((product) => product.product_name)
    .filter(Boolean)
  const details = (group.issues || []).slice(0, 8).map((issue) => {
    const item = issue.recipe_item ? ` · ${issue.recipe_item}` : ''
    return `${issue.product_name || '제품'}${item}: ${issue.reason || '확인 필요'}`
  })

  const banner = document.createElement('div')
  banner.setAttribute(BANNER_ATTR, 'true')
  banner.className = 'm-4 rounded-xl border-2 border-red-500 bg-red-950/70 p-4 text-red-100'
  banner.innerHTML = `
    <div class="text-base font-black">계산 불완전 — 발주·인쇄 사용 금지</div>
    <div class="mt-1 text-sm">현재 ${aiOnly ? 'AI 예측' : '사용자 예상 계획'}에 포함된 레시피 중 ${unresolved}개 항목의 원재료 연결 또는 배합비 검증이 완료되지 않았습니다.</div>
    ${products.length ? `<div class="mt-2 text-sm"><b>영향 제품:</b> ${products.join(', ')}</div>` : ''}
    ${details.length ? `<ul class="mt-2 list-disc space-y-1 pl-5 text-xs text-red-200">${details.map((detail) => `<li>${detail}</li>`).join('')}</ul>` : ''}
    <div class="mt-2 text-xs font-bold">누락 항목을 해결하기 전까지 아래 수치는 참고용이며 발주 판단에 사용할 수 없습니다.</div>
  `
  header.insertAdjacentElement('afterend', banner)
}

export default function MonthlyProductionRequirementSafetyGuard() {
  useEffect(() => {
    if (window.location.pathname !== '/monthly-production-plan') return

    let requestSequence = 0
    let timer = 0
    const validate = async () => {
      const section = requirementSection()
      if (!section) return
      const sequence = ++requestSequence
      const month = currentMonthFromPage()
      const level = currentLevelFromPage()
      const aiOnly = isAiOnlyView()
      setPrintSafety(false)

      try {
        const response = await fetch(`/api/moni/monthly-production-plans?month=${encodeURIComponent(month)}&level=${level}`, { cache: 'no-store' })
        const payload = (await response.json().catch(() => null)) as Payload | null
        if (sequence !== requestSequence) return
        if (!response.ok || !payload?.ok) throw new Error('검증 정보를 불러오지 못했습니다.')
        const group = aiOnly ? payload.ai_only : payload.confirmed
        const complete = group?.validation?.complete === true
        if (complete) {
          removeBanner()
          setPrintSafety(true)
        } else {
          renderUnsafeBanner(group || {}, aiOnly)
          setPrintSafety(false)
        }
      } catch {
        if (sequence !== requestSequence) return
        renderUnsafeBanner({
          validation: { complete: false, unresolved_count: 1 },
          issues: [{ product_name: '월간 원료 계산', reason: '검증 서버 응답 실패' }],
        }, aiOnly)
        setPrintSafety(false)
      }
    }

    const schedule = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => void validate(), 180)
    }
    const observer = new MutationObserver(schedule)
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['checked', 'class'] })
    document.addEventListener('change', schedule, true)
    document.addEventListener('click', schedule, true)
    schedule()

    return () => {
      window.clearTimeout(timer)
      observer.disconnect()
      document.removeEventListener('change', schedule, true)
      document.removeEventListener('click', schedule, true)
      removeBanner()
    }
  }, [])

  return null
}
