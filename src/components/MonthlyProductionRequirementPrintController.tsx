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
}

type Payload = {
  ok?: boolean
  error?: string
  confirmed?: { requirements?: Requirement[] }
  with_ai?: { requirements?: Requirement[] }
}

const BUTTON_ATTR = 'data-monthly-requirement-print'

function normalizeText(value: unknown): string {
  return String(value ?? '').trim().replace(/\s+/g, ' ')
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function formatKg(value: number): string {
  const kg = Number(value || 0) / 1000
  return `${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: kg >= 100 ? 0 : 1 }).format(kg)} kg`
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

function includeAiFromPage(): boolean {
  const labels = Array.from(document.querySelectorAll('label'))
  const target = labels.find((label) => normalizeText(label.textContent).includes('AI 예측 포함해서 보기'))
  return Boolean(target?.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked)
}

function rowsHtml(rows: Requirement[]): string {
  if (!rows.length) return '<tr><td colspan="11" class="empty">해당 원료가 없습니다.</td></tr>'
  return rows
    .map(
      (row, index) => `
      <tr>
        <td class="center">${index + 1}</td>
        <td class="check">□</td>
        <td class="name">${escapeHtml(row.material_name)}</td>
        <td class="number">${escapeHtml(formatKg(row.current_stock_g))}</td>
        <td class="number">${escapeHtml(formatKg(row.required_g))}</td>
        <td class="number strong">${escapeHtml(formatKg(row.projected_balance_g))}</td>
        <td class="number">${row.shortage_g > 0 ? escapeHtml(formatKg(row.shortage_g)) : '-'}</td>
        <td class="center">${escapeHtml(row.first_shortage_date ?? '-')}</td>
        <td class="blank"></td>
        <td class="judgement">부족 □<br/>충분 □</td>
        <td class="blank note"></td>
      </tr>`,
    )
    .join('')
}

function sectionHtml(title: string, description: string, rows: Requirement[], className: string): string {
  return `
    <section class="group ${className}">
      <div class="group-title"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(description)} · ${rows.length}개</span></div>
      <table>
        <colgroup>
          <col class="no"/><col class="checked"/><col class="material"/><col class="qty"/><col class="qty"/>
          <col class="qty"/><col class="qty"/><col class="date"/><col class="actual"/><col class="judge"/><col class="memo"/>
        </colgroup>
        <thead><tr>
          <th>No</th><th>확인</th><th>원료명</th><th>시스템 현재재고</th><th>월간 필요량</th>
          <th>예상잔량</th><th>예상 부족량</th><th>최초 부족일</th><th>실사재고</th><th>현장 판단</th><th>비고</th>
        </tr></thead>
        <tbody>${rowsHtml(rows)}</tbody>
      </table>
    </section>`
}

function buildPrintHtml(month: string, levelLabel: string, includeAi: boolean, requirements: Requirement[]): string {
  const shortage = requirements.filter((row) => row.status === '부족')
  const warning = requirements.filter((row) => row.status === '주의')
  const sufficient = requirements.filter((row) => row.status === '충분')
  const printedAt = new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date())
  const monthLabel = `${month.slice(0, 4)}년 ${Number(month.slice(5, 7))}월`
  const basis = includeAi ? `사용자 예상 계획 + AI 예측(${levelLabel})` : '사용자 예상 계획'

  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"/><title>${escapeHtml(monthLabel)} 월간 원료 수요 체크리스트</title>
<style>
@page { size: A4 landscape; margin: 9mm; }
* { box-sizing: border-box; }
body { margin: 0; color: #000; background: #fff; font-family: Pretendard, "Noto Sans KR", "Malgun Gothic", Arial, sans-serif; font-size: 8.5pt; line-height: 1.3; }
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
th, td { border: 1px solid #777; padding: 1.7mm 1.4mm; vertical-align: middle; }
th { background: #f2f2f2; font-size: 7.5pt; text-align: center; }
td { height: 9mm; }
.center, .check { text-align: center; }
.check { font-size: 13pt; }
.number { text-align: right; white-space: nowrap; }
.strong, .name { font-weight: 800; }
.blank { min-width: 18mm; }
.judgement { text-align: center; line-height: 1.7; white-space: nowrap; }
.empty { text-align: center; padding: 5mm; color: #555; }
col.no { width: 4%; } col.checked { width: 4%; } col.material { width: 16%; }
col.qty { width: 9%; } col.date { width: 10%; } col.actual { width: 10%; } col.judge { width: 9%; } col.memo { width: 11%; }
.shortage .group-title { border-top: 3px solid #000; }
.warning .group-title { border-top: 2px dashed #555; }
.sufficient .group-title { border-top: 3px double #555; }
.signatures { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 5mm; margin-top: 6mm; }
.signatures div { border: 1px solid #777; min-height: 16mm; padding: 2mm 3mm; }
.footer { margin-top: 3mm; color: #555; font-size: 7.5pt; }
@media print { * { color: #000 !important; box-shadow: none !important; text-shadow: none !important; } }
</style></head><body>
<header class="header"><div><div class="company">두배 · MONI 생산관리</div><h1>${escapeHtml(monthLabel)} 월간 원료 수요 현장 체크리스트</h1><div class="meta">계산 기준: ${escapeHtml(basis)}</div></div><div>출력일시: ${escapeHtml(printedAt)}</div></header>
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
<div class="footer">※ 실사재고와 현장 판단은 작업자가 직접 기입합니다. 본 체크리스트 출력만으로 MONI의 재고·수불·생산계획 데이터는 변경되지 않습니다.</div>
</body></html>`
}

async function printChecklist(): Promise<void> {
  const month = currentMonthFromPage()
  const level = currentLevelFromPage()
  const includeAi = includeAiFromPage()
  const levelLabel = level === 'stable' ? '안정형' : level === 'expanded' ? '확장형' : '표준형'
  try {
    const response = await fetch(`/api/moni/monthly-production-plans?month=${encodeURIComponent(month)}&level=${level}`, { cache: 'no-store' })
    const payload = (await response.json().catch(() => null)) as Payload | null
    if (!response.ok || !payload?.ok) throw new Error(payload?.error || '원료 필요량을 불러오지 못했습니다.')
    const requirements = includeAi ? payload.with_ai?.requirements ?? [] : payload.confirmed?.requirements ?? []
    if (!requirements.length) {
      window.alert('출력할 원료 필요량이 없습니다. 먼저 예상 계획을 등록해 주세요.')
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
    printDocument.write(buildPrintHtml(month, levelLabel, includeAi, requirements))
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
