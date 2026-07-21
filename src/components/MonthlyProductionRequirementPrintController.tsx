'use client'

import { useEffect } from 'react'

type Requirement = {
  material_id: string
  material_name: string
  current_stock_g: number
  required_g: number
  projected_balance_g: number
  shortage_g: number
  first_shortage_date: string | null
  status: '부족' | '주의' | '충분'
  packing_weight_g?: number | null
}

type RequirementGroup = {
  requirements?: Requirement[]
  validation?: { complete?: boolean; unresolved_count?: number }
  issues?: Array<{ product_name?: string; recipe_item?: string | null; reason?: string }>
}

type Payload = {
  ok?: boolean
  error?: string
  confirmed?: RequirementGroup
  ai_only?: RequirementGroup
}

type RawMaterial = {
  id?: string
  item_name?: string
  packing_weight_g?: number | null
  spec?: string | null
}

type RawMaterialsPayload = {
  ok?: boolean
  error?: string
  materials?: RawMaterial[]
}

type PreparedRequirement = Requirement & {
  packingWeightG: number
  packageCount: number
  roundedUp: boolean
}

const BUTTON_ATTR = 'data-monthly-requirement-print'

function normalizeText(value: unknown): string {
  return String(value ?? '').trim().replace(/\s+/g, ' ')
}

function normalizeKey(value: unknown): string {
  return normalizeText(value).toLocaleLowerCase('ko-KR').replace(/\s+/g, '')
}

function numberValue(value: unknown): number {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function isPlaceholderMaterialName(value: unknown): boolean {
  const key = normalizeKey(value)
  return (
    key === '미연결제품' ||
    key === '미연결' ||
    key === '연결필요' ||
    key === '원재료연결필요' ||
    key === '확인필요' ||
    key.includes('미연결제품')
  )
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 }).format(Math.round(numberValue(value)))
}

function formatKg(value: number): string {
  const kg = numberValue(value) / 1000
  return `${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: kg >= 100 ? 0 : 3 }).format(kg)} kg`
}

function formatPackingWeight(valueG: number): string {
  const value = numberValue(valueG)
  if (value <= 0) return '규격 미등록'
  if (value >= 1000) {
    const kg = value / 1000
    return `${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 3 }).format(kg)} kg`
  }
  return `${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 }).format(value)} g`
}

function parseSpecWeightG(value: unknown): number {
  const raw = normalizeText(value).toLowerCase().replaceAll(',', '')
  if (!raw) return 0

  const unitMatch = raw.match(/(\d+(?:\.\d+)?)\s*(kg|g)\b/)
  if (unitMatch) {
    const amount = Number(unitMatch[1])
    if (!Number.isFinite(amount) || amount <= 0) return 0
    return unitMatch[2] === 'kg' ? amount * 1000 : amount
  }

  if (/^\d+(?:\.\d+)?$/.test(raw)) {
    const amount = Number(raw)
    return Number.isFinite(amount) && amount > 0 ? amount : 0
  }

  return 0
}

function resolvePackingWeightG(requirement: Requirement, material?: RawMaterial): number {
  const fromRequirement = numberValue(requirement.packing_weight_g)
  if (fromRequirement > 0) return fromRequirement
  const fromMaster = numberValue(material?.packing_weight_g)
  if (fromMaster > 0) return fromMaster
  return parseSpecWeightG(material?.spec)
}

function currentMonthFromPage(): string {
  const headings = Array.from(document.querySelectorAll('b, h1, h2, span'))
  for (const node of headings) {
    const match = normalizeText(node.textContent).match(/(\d{4})년\s*(\d{1,2})월/)
    if (match) return `${match[1]}-${String(Number(match[2])).padStart(2, '0')}`
  }
  return new Date().toISOString().slice(0, 7)
}

function currentLevelFromPage(): 'stable' | 'standard' | 'expanded' {
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
  const active = buttons.find((button) =>
    ['안정형', '표준형', '확장형'].includes(normalizeText(button.textContent)) && button.className.includes('bg-green-600'),
  )
  const label = normalizeText(active?.textContent)
  if (label === '안정형') return 'stable'
  if (label === '확장형') return 'expanded'
  return 'standard'
}

function aiOnlyFromPage(): boolean {
  const labels = Array.from(document.querySelectorAll('label'))
  const target = labels.find((label) => normalizeText(label.textContent).includes('AI 예측만 보기'))
  return Boolean(target?.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked)
}

function prepareRequirements(requirements: Requirement[], materials: RawMaterial[]): PreparedRequirement[] {
  const byId = new Map<string, RawMaterial>()
  const byName = new Map<string, RawMaterial>()

  for (const material of materials) {
    const id = normalizeText(material.id)
    const nameKey = normalizeKey(material.item_name)
    if (id) byId.set(id, material)
    if (nameKey && !byName.has(nameKey)) byName.set(nameKey, material)
  }

  return requirements.map((requirement) => {
    const material = byId.get(normalizeText(requirement.material_id)) ?? byName.get(normalizeKey(requirement.material_name))
    const packingWeightG = resolvePackingWeightG(requirement, material)
    const requiredG = Math.max(0, numberValue(requirement.required_g))
    const rawPackageCount = packingWeightG > 0 ? requiredG / packingWeightG : 0
    const packageCount = packingWeightG > 0 && requiredG > 0 ? Math.ceil(rawPackageCount) : 0
    const roundedUp = packingWeightG > 0 && Math.abs(rawPackageCount - Math.round(rawPackageCount)) > 0.000001
    return { ...requirement, packingWeightG, packageCount, roundedUp }
  })
}

function packageCountText(row: PreparedRequirement): string {
  if (row.packingWeightG <= 0) return '규격 미등록'
  if (row.required_g <= 0) return '-'
  const roundingLabel = row.roundedUp ? ' · 올림' : ''
  return `${formatNumber(row.packageCount)}개 (${formatPackingWeight(row.packingWeightG)}/개${roundingLabel})`
}

function rowsHtml(rows: PreparedRequirement[]): string {
  if (!rows.length) return '<tr><td colspan="12" class="empty">해당 원료가 없습니다.</td></tr>'
  return rows.map((row, index) => `
    <tr>
      <td class="center">${index + 1}</td>
      <td class="check">□</td>
      <td class="name">${escapeHtml(row.material_name)}</td>
      <td class="package">${escapeHtml(packageCountText(row))}</td>
      <td class="number">${escapeHtml(formatKg(row.current_stock_g))}</td>
      <td class="number strong">${escapeHtml(formatKg(row.required_g))}</td>
      <td class="number">${escapeHtml(formatKg(row.projected_balance_g))}</td>
      <td class="number">${row.shortage_g > 0 ? escapeHtml(formatKg(row.shortage_g)) : '-'}</td>
      <td class="center">${escapeHtml(row.first_shortage_date ?? '-')}</td>
      <td class="blank"></td>
      <td class="judgement">부족 □<br/>충분 □</td>
      <td class="blank note"></td>
    </tr>
  `).join('')
}

function sectionHtml(title: string, description: string, rows: PreparedRequirement[], className: string): string {
  return `
    <section class="group ${className}">
      <div class="group-title"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(description)} · ${rows.length}개</span></div>
      <table>
        <colgroup>
          <col class="no"/><col class="checked"/><col class="material"/><col class="package-col"/>
          <col class="qty"/><col class="qty"/><col class="qty"/><col class="qty"/><col class="date"/>
          <col class="actual"/><col class="judge"/><col class="memo"/>
        </colgroup>
        <thead><tr>
          <th>No</th><th>확인</th><th>원재료명</th><th>준비 포장수량</th><th>시스템 현재재고</th>
          <th>최종 투입량</th><th>예상잔량</th><th>예상 부족량</th><th>최초 부족일</th>
          <th>실사재고</th><th>현장 판단</th><th>비고</th>
        </tr></thead>
        <tbody>${rowsHtml(rows)}</tbody>
      </table>
    </section>`
}

function buildPrintHtml(month: string, levelLabel: string, aiOnly: boolean, requirements: PreparedRequirement[]): string {
  const shortage = requirements.filter((row) => row.status === '부족')
  const warning = requirements.filter((row) => row.status === '주의')
  const sufficient = requirements.filter((row) => row.status === '충분')
  const printedAt = new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date())
  const monthLabel = `${month.slice(0, 4)}년 ${Number(month.slice(5, 7))}월`
  const basis = aiOnly ? `AI 예측(${levelLabel})만 — 사용자 예상 계획 제외` : '사용자 예상 계획만 — AI 예측 제외'

  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"/><title>${escapeHtml(monthLabel)} 원재료 준비 체크리스트</title>
<style>
@page { size: A4 landscape; margin: 8mm; }
* { box-sizing: border-box; }
body { margin: 0; color: #000; background: #fff; font-family: Pretendard, "Noto Sans KR", "Malgun Gothic", Arial, sans-serif; font-size: 8pt; line-height: 1.3; }
.header { display: flex; justify-content: space-between; gap: 20px; align-items: flex-start; border-bottom: 2px solid #000; padding-bottom: 3mm; }
h1 { margin: 0; font-size: 18pt; }
.company { font-size: 10pt; font-weight: 800; }
.meta { margin-top: 2mm; color: #333; }
.summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 2mm; margin: 4mm 0; }
.summary div { border: 1px solid #777; padding: 2.5mm 3mm; }
.summary span { display: block; color: #555; font-size: 7.5pt; }
.summary strong { display: block; margin-top: 1mm; font-size: 12pt; }
.group { margin-top: 4mm; break-inside: auto; }
.group-title { display: flex; justify-content: space-between; align-items: center; border: 1px solid #555; border-bottom: 0; padding: 2mm 3mm; background: #eee; }
.group-title strong { font-size: 11pt; }
.group-title span { color: #444; }
table { width: 100%; border-collapse: collapse; table-layout: fixed; }
thead { display: table-header-group; }
tr { break-inside: avoid; page-break-inside: avoid; }
th, td { border: 1px solid #777; padding: 1.6mm 1.2mm; vertical-align: middle; }
th { background: #f2f2f2; font-size: 7.3pt; text-align: center; }
td { height: 9mm; }
.center, .check { text-align: center; }
.check { font-size: 13pt; }
.number { text-align: right; white-space: nowrap; }
.package { text-align: center; font-weight: 800; line-height: 1.45; }
.strong, .name { font-weight: 800; }
.blank { min-width: 16mm; }
.judgement { text-align: center; line-height: 1.7; white-space: nowrap; }
.empty { text-align: center; padding: 5mm; color: #555; }
col.no { width: 3.5%; } col.checked { width: 3.5%; } col.material { width: 13%; } col.package-col { width: 14%; }
col.qty { width: 8%; } col.date { width: 8.5%; } col.actual { width: 8%; } col.judge { width: 8%; } col.memo { width: 9%; }
.shortage .group-title { border-top: 3px solid #000; }
.warning .group-title { border-top: 2px dashed #555; }
.sufficient .group-title { border-top: 3px double #555; }
.signatures { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 5mm; margin-top: 6mm; }
.signatures div { border: 1px solid #777; min-height: 16mm; padding: 2mm 3mm; }
.footer { margin-top: 3mm; color: #444; font-size: 7.5pt; }
@media print { * { color: #000 !important; box-shadow: none !important; text-shadow: none !important; } }
</style></head><body>
<header class="header"><div><div class="company">두배 · MONI 생산관리</div><h1>${escapeHtml(monthLabel)} 원재료 준비 체크리스트</h1><div class="meta">계산 기준: ${escapeHtml(basis)}</div></div><div>출력일시: ${escapeHtml(printedAt)}</div></header>
<section class="summary">
  <div><span>전체 원료</span><strong>${requirements.length}개</strong></div>
  <div><span>부족 원료</span><strong>${shortage.length}개</strong></div>
  <div><span>주의 원료</span><strong>${warning.length}개</strong></div>
  <div><span>충분 원료</span><strong>${sufficient.length}개</strong></div>
</section>
${sectionHtml('1. 부족 원료', '시스템 계산상 생산계획 대비 부족', shortage, 'shortage')}
${sectionHtml('2. 주의 원료', '생산 가능하지만 예상잔량이 낮음', warning, 'warning')}
${sectionHtml('3. 충분 원료', '시스템 계산상 생산계획을 충족', sufficient, 'sufficient')}
<section class="signatures"><div>확인 작업자:<br/><br/>서명:</div><div>확인일:<br/><br/>____년 ____월 ____일</div><div>관리자 확인:<br/><br/>서명:</div></section>
<div class="footer">※ 최종 투입량은 월간 생산계획에 필요한 실제 원재료 중량입니다. 준비 포장수량은 최종 투입량 ÷ 원재료 규격(g)으로 계산하며, 소수점이 발생하면 부족하지 않도록 1개 단위로 올림합니다. 본 체크리스트 출력만으로 재고·수불·생산계획 데이터는 변경되지 않습니다.</div>
</body></html>`
}

async function printChecklist(): Promise<void> {
  const month = currentMonthFromPage()
  const level = currentLevelFromPage()
  const aiOnly = aiOnlyFromPage()
  const levelLabel = level === 'stable' ? '안정형' : level === 'expanded' ? '확장형' : '표준형'

  try {
    const [requirementResponse, materialsResponse] = await Promise.all([
      fetch(`/api/moni/monthly-production-plans?month=${encodeURIComponent(month)}&level=${level}`, { cache: 'no-store' }),
      fetch('/api/moni/raw-materials?include_inactive=true', { cache: 'no-store' }),
    ])
    const payload = (await requirementResponse.json().catch(() => null)) as Payload | null
    const materialsPayload = (await materialsResponse.json().catch(() => null)) as RawMaterialsPayload | null
    if (!requirementResponse.ok || !payload?.ok) throw new Error(payload?.error || '원료 필요량을 불러오지 못했습니다.')
    if (!materialsResponse.ok || !materialsPayload?.ok) throw new Error(materialsPayload?.error || '원재료 규격 정보를 불러오지 못했습니다.')

    const group = aiOnly ? payload.ai_only : payload.confirmed
    if (group?.validation?.complete !== true) {
      const count = Number(group?.validation?.unresolved_count || group?.issues?.length || 0)
      window.alert(`계산이 완전하지 않아 인쇄할 수 없습니다. 원재료 연결 또는 배합비 확인이 필요한 항목: ${count}개`)
      return
    }

    const requirements = group?.requirements ?? []
    if (!requirements.length) {
      window.alert(aiOnly ? '출력할 AI 예측 원료 필요량이 없습니다.' : '출력할 사용자 예상 계획 원료 필요량이 없습니다.')
      return
    }

    const placeholderRows = requirements.filter((row) => isPlaceholderMaterialName(row.material_name))
    if (placeholderRows.length > 0) {
      window.alert('원재료명에 "미연결 제품" 항목이 남아 있어 안전하게 인쇄할 수 없습니다. 원재료 연결을 먼저 완료해 주세요.')
      return
    }

    const preparedRequirements = prepareRequirements(requirements, materialsPayload.materials ?? [])
    const missingPackingRows = preparedRequirements.filter((row) => row.required_g > 0 && row.packingWeightG <= 0)
    if (missingPackingRows.length > 0) {
      const names = missingPackingRows.slice(0, 8).map((row) => row.material_name).join(', ')
      const more = missingPackingRows.length > 8 ? ` 외 ${missingPackingRows.length - 8}개` : ''
      window.alert(`준비 포장수량을 계산할 수 없어 인쇄를 중단했습니다. 원재료 관리에서 규격(g)을 입력해 주세요: ${names}${more}`)
      return
    }

    const iframe = document.createElement('iframe')
    iframe.setAttribute('aria-hidden', 'true')
    iframe.style.position = 'fixed'
    iframe.style.right = '0'
    iframe.style.bottom = '0'
    iframe.style.width = '0'
    iframe.style.height = '0'
    iframe.style.border = '0'
    document.body.appendChild(iframe)
    const printDocument = iframe.contentDocument ?? iframe.contentWindow?.document
    if (!printDocument || !iframe.contentWindow) throw new Error('인쇄창을 열지 못했습니다.')
    printDocument.open()
    printDocument.write(buildPrintHtml(month, levelLabel, aiOnly, preparedRequirements))
    printDocument.close()
    const printWindow = iframe.contentWindow
    const cleanup = () => window.setTimeout(() => iframe.remove(), 500)
    printWindow.addEventListener('afterprint', cleanup, { once: true })
    window.setTimeout(() => { printWindow.focus(); printWindow.print() }, 350)
    window.setTimeout(cleanup, 60000)
  } catch (error) {
    window.alert(error instanceof Error ? error.message : '체크리스트 인쇄에 실패했습니다.')
  }
}

function installButton(): void {
  if (window.location.pathname !== '/monthly-production-plan') return
  if (document.querySelector(`[${BUTTON_ATTR}]`)) return
  const heading = Array.from(document.querySelectorAll('h2')).find((node) => normalizeText(node.textContent) === '원료 필요량 현황')
  const header = heading?.parentElement?.parentElement
  if (!header) return
  const controls = header.lastElementChild
  if (!controls) return
  const button = document.createElement('button')
  button.type = 'button'
  button.setAttribute(BUTTON_ATTR, 'true')
  button.dataset.monthlyRequirementSafe = 'false'
  button.className = 'rounded-xl border border-emerald-500 bg-emerald-500/10 px-4 py-2 font-bold text-emerald-200 hover:bg-emerald-500/20'
  button.textContent = '원료 체크리스트 인쇄 / PDF'
  button.addEventListener('click', () => void printChecklist())
  controls.parentElement?.insertBefore(button, controls)
}

export default function MonthlyProductionRequirementPrintController() {
  useEffect(() => {
    let frame = 0
    const schedule = () => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(installButton)
    }
    const observer = new MutationObserver(schedule)
    observer.observe(document.body, { childList: true, subtree: true })
    schedule()
    return () => {
      observer.disconnect()
      window.cancelAnimationFrame(frame)
      document.querySelectorAll(`[${BUTTON_ATTR}]`).forEach((node) => node.remove())
    }
  }, [])
  return null
}
