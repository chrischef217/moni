'use client'

import { useEffect } from 'react'

type Requirement = {
  material_id: string
  material_name: string
  shortage_g: number
}

type RequirementGroup = {
  requirements?: Requirement[]
  validation?: { complete?: boolean }
}

type MonthlyPayload = {
  ok?: boolean
  confirmed?: RequirementGroup
  ai_only?: RequirementGroup
}

type RawMaterial = {
  id?: string
  item_name?: string
  unit_price_per_kg?: number | null
  packing_weight_g?: number | null
}

type RawMaterialPayload = {
  ok?: boolean
  materials?: RawMaterial[]
}

type BudgetRow = {
  requirement: Requirement
  packagePrice: number
  packageWeightG: number
  packageCount: number
  orderQuantityG: number
  estimatedAmount: number
  complete: boolean
}

const SUMMARY_ATTR = 'data-monthly-purchase-budget-summary'
const CELL_ATTR = 'data-monthly-purchase-budget-cell'

function normalizedText(value: unknown) {
  return String(value ?? '').trim().replace(/\s+/g, ' ')
}

function numberValue(value: unknown) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function formatWon(value: number) {
  return `${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 }).format(Math.round(value || 0))}원`
}

function formatKg(value: number) {
  const kg = numberValue(value) / 1000
  return `${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: kg >= 100 ? 0 : 1 }).format(kg)}kg`
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

function removeInjected() {
  document.querySelectorAll(`[${SUMMARY_ATTR}], [${CELL_ATTR}]`).forEach((node) => node.remove())
  const table = requirementSection()?.querySelector('table')
  const emptyCell = table?.querySelector<HTMLTableCellElement>('tbody td[colspan]')
  if (emptyCell) emptyCell.colSpan = 7
}

function baseTableFingerprint() {
  const table = requirementSection()?.querySelector('table')
  if (!table) return ''
  const rows = Array.from(table.querySelectorAll('tbody tr'))
  return rows
    .map((row) => Array.from(row.querySelectorAll('td')).slice(0, 7).map((cell) => normalizedText(cell.textContent)).join('|'))
    .join('||')
}

function createCell(text: string, className: string, title?: string) {
  const cell = document.createElement('td')
  cell.setAttribute(CELL_ATTR, 'true')
  cell.className = className
  cell.textContent = text
  if (title) cell.title = title
  return cell
}

function renderBudget(group: RequirementGroup, materials: RawMaterial[], aiOnly: boolean) {
  removeInjected()
  const section = requirementSection()
  const table = section?.querySelector('table')
  const tableWrapper = table?.parentElement
  if (!section || !table || !tableWrapper) return

  const materialById = new Map(materials.map((material) => [normalizedText(material.id), material]))
  const requirements = group.requirements ?? []
  const budgetRows: BudgetRow[] = requirements.map((requirement) => {
    const material = materialById.get(normalizedText(requirement.material_id))
    const packagePrice = numberValue(material?.unit_price_per_kg)
    const packageWeightG = numberValue(material?.packing_weight_g)
    const shortageG = Math.max(0, numberValue(requirement.shortage_g))
    const complete = shortageG === 0 || (packagePrice > 0 && packageWeightG > 0)
    const packageCount = shortageG > 0 && packageWeightG > 0 ? Math.ceil(shortageG / packageWeightG) : 0
    const orderQuantityG = packageCount * packageWeightG
    const estimatedAmount = complete && shortageG > 0 ? packageCount * packagePrice : 0
    return { requirement, packagePrice, packageWeightG, packageCount, orderQuantityG, estimatedAmount, complete }
  })

  const shortageRows = budgetRows.filter((row) => numberValue(row.requirement.shortage_g) > 0)
  const incompleteRows = shortageRows.filter((row) => !row.complete)
  const calculableAmount = shortageRows.reduce((sum, row) => sum + row.estimatedAmount, 0)
  const recipeComplete = group.validation?.complete === true
  const budgetComplete = recipeComplete && incompleteRows.length === 0
  const basis = aiOnly ? 'AI 예측 기준' : '예상 계획 기준'

  const summary = document.createElement('div')
  summary.setAttribute(SUMMARY_ATTR, 'true')
  summary.className = `grid gap-3 border-b border-slate-700 p-4 md:grid-cols-4 ${budgetComplete ? 'bg-slate-950/35' : 'bg-red-950/25'}`

  const basisCard = document.createElement('div')
  basisCard.className = 'rounded-xl border border-slate-700 bg-slate-900/70 p-3'
  basisCard.innerHTML = `<div class="text-xs text-slate-400">계산 기준</div><div class="mt-1 font-black ${aiOnly ? 'text-green-300' : 'text-blue-300'}">${basis}</div><div class="mt-1 text-xs text-slate-500">사용자 계획과 AI 예측은 합산하지 않음</div>`

  const countCard = document.createElement('div')
  countCard.className = 'rounded-xl border border-slate-700 bg-slate-900/70 p-3'
  countCard.innerHTML = `<div class="text-xs text-slate-400">발주 대상 원료</div><div class="mt-1 text-xl font-black text-white">${shortageRows.length}개</div><div class="mt-1 text-xs text-slate-500">현재재고보다 필요량이 많은 원료</div>`

  const amountCard = document.createElement('div')
  amountCard.className = `rounded-xl border p-3 ${budgetComplete ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-red-500/50 bg-red-500/10'}`
  amountCard.innerHTML = budgetComplete
    ? `<div class="text-xs text-emerald-200">총 예상 발주예산</div><div class="mt-1 text-xl font-black text-emerald-300">${formatWon(calculableAmount)}</div><div class="mt-1 text-xs text-emerald-200/70">부족량을 포장단위로 올림한 실제 구매 기준</div>`
    : `<div class="text-xs text-red-200">예상 발주예산 계산 불완전</div><div class="mt-1 text-xl font-black text-red-300">확정 불가</div><div class="mt-1 text-xs text-red-200/80">현재 계산 가능한 금액 ${formatWon(calculableAmount)} · 전체 예산으로 사용 금지</div>`

  const warningCard = document.createElement('div')
  warningCard.className = `rounded-xl border p-3 ${incompleteRows.length ? 'border-amber-500/50 bg-amber-500/10' : 'border-slate-700 bg-slate-900/70'}`
  warningCard.innerHTML = `<div class="text-xs ${incompleteRows.length ? 'text-amber-200' : 'text-slate-400'}">단가/포장중량 확인 필요</div><div class="mt-1 text-xl font-black ${incompleteRows.length ? 'text-amber-300' : 'text-white'}">${incompleteRows.length}개</div><div class="mt-1 text-xs ${incompleteRows.length ? 'text-amber-200/70' : 'text-slate-500'}">원재료 관리에서 포장단가와 규격을 등록</div>`

  summary.append(basisCard, countCard, amountCard, warningCard)
  tableWrapper.insertAdjacentElement('beforebegin', summary)

  const headRow = table.querySelector('thead tr')
  if (headRow) {
    ;['포장단가', '예상 발주수량', '예상 발주금액'].forEach((title) => {
      const th = document.createElement('th')
      th.setAttribute(CELL_ATTR, 'true')
      th.className = 'px-4 py-3 text-left'
      th.textContent = title
      headRow.appendChild(th)
    })
  }

  const budgetByName = new Map(budgetRows.map((row) => [normalizedText(row.requirement.material_name), row]))
  const bodyRows = Array.from(table.querySelectorAll<HTMLTableRowElement>('tbody tr'))
  bodyRows.forEach((row) => {
    const cells = row.querySelectorAll('td')
    if (cells.length < 2) {
      const emptyCell = row.querySelector<HTMLTableCellElement>('td[colspan]')
      if (emptyCell) emptyCell.colSpan = 10
      return
    }
    const materialName = normalizedText(cells[1]?.textContent)
    const budget = budgetByName.get(materialName)
    if (!budget) {
      row.append(
        createCell('-', 'px-4 py-3 text-slate-500'),
        createCell('-', 'px-4 py-3 text-slate-500'),
        createCell('-', 'px-4 py-3 text-slate-500'),
      )
      return
    }

    const shortageG = numberValue(budget.requirement.shortage_g)
    if (shortageG <= 0) {
      row.append(
        createCell('-', 'px-4 py-3 text-slate-500'),
        createCell('-', 'px-4 py-3 text-slate-500'),
        createCell('-', 'px-4 py-3 text-slate-500'),
      )
      return
    }

    const packagePriceText = budget.packagePrice > 0 ? `${formatWon(budget.packagePrice)} / ${budget.packageWeightG > 0 ? formatKg(budget.packageWeightG) : '포장'}` : '단가 확인 필요'
    const orderText = budget.packageWeightG > 0
      ? `${formatKg(budget.packageWeightG)} × ${budget.packageCount}포 = ${formatKg(budget.orderQuantityG)}`
      : '포장중량 확인 필요'
    const amountText = budget.complete ? formatWon(budget.estimatedAmount) : '계산 불가'
    const missing = !budget.complete

    row.append(
      createCell(packagePriceText, `px-4 py-3 ${missing ? 'font-bold text-amber-300' : 'text-slate-200'}`),
      createCell(orderText, `px-4 py-3 ${missing ? 'font-bold text-amber-300' : 'text-slate-200'}`, `부족량 ${formatKg(shortageG)}를 포장단위로 올림`),
      createCell(amountText, `px-4 py-3 font-black ${missing ? 'text-red-300' : 'text-emerald-300'}`),
    )
  })
}

export default function MonthlyProductionPurchaseBudgetController() {
  useEffect(() => {
    let timer = 0
    let requestSequence = 0
    let lastSignature = ''

    const refresh = async () => {
      if (window.location.pathname !== '/monthly-production-plan') {
        removeInjected()
        lastSignature = ''
        return
      }
      const section = requirementSection()
      if (!section) return

      const month = currentMonthFromPage()
      const level = currentLevelFromPage()
      const aiOnly = isAiOnlyView()
      const fingerprint = baseTableFingerprint()
      const signature = `${month}|${level}|${aiOnly ? 'ai' : 'user'}|${fingerprint}`
      if (signature === lastSignature && document.querySelector(`[${SUMMARY_ATTR}]`)) return
      const sequence = ++requestSequence

      try {
        const [monthlyResponse, materialsResponse] = await Promise.all([
          fetch(`/api/moni/monthly-production-plans?month=${encodeURIComponent(month)}&level=${level}`, { cache: 'no-store' }),
          fetch('/api/moni/raw-materials', { cache: 'no-store' }),
        ])
        const monthly = (await monthlyResponse.json().catch(() => null)) as MonthlyPayload | null
        const rawMaterials = (await materialsResponse.json().catch(() => null)) as RawMaterialPayload | null
        if (sequence !== requestSequence) return
        if (!monthlyResponse.ok || !monthly?.ok || !materialsResponse.ok || !rawMaterials?.ok) return
        const group = aiOnly ? monthly.ai_only : monthly.confirmed
        renderBudget(group || {}, rawMaterials.materials || [], aiOnly)
        lastSignature = signature
      } catch {
        if (sequence !== requestSequence) return
        removeInjected()
      }
    }

    const schedule = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => void refresh(), 220)
    }

    const observer = new MutationObserver(schedule)
    observer.observe(document.body, { childList: true, subtree: true, characterData: true })
    document.addEventListener('click', schedule, true)
    document.addEventListener('change', schedule, true)
    schedule()

    return () => {
      window.clearTimeout(timer)
      observer.disconnect()
      document.removeEventListener('click', schedule, true)
      document.removeEventListener('change', schedule, true)
      removeInjected()
    }
  }, [])

  return null
}
