'use client'

import { useEffect } from 'react'

type LedgerPrintRow = {
  id: string
  materialName: string
  date: string
  type: string
  counterparty: string
  inboundG: number
  outboundG: number
  balanceG: number
  note: string
}

type RawMaterialApiRow = {
  item_name?: string | null
  country_of_origin?: string | null
  current_stock_g?: number | string | null
}

type RawMaterialsPayload = {
  ok?: boolean
  materials?: RawMaterialApiRow[]
}

type RawLedgerApiRow = {
  id?: string | null
  material_name?: string | null
  tx_date?: string | null
  tx_type?: string | null
  counterparty?: string | null
  inbound_g?: number | string | null
  outbound_g?: number | string | null
  balance_g?: number | string | null
  note?: string | null
}

type RawLedgerPayload = {
  ok?: boolean
  rows?: RawLedgerApiRow[]
}

const PRINT_BUTTON_ATTRIBUTE = 'data-raw-ledger-print-button'

function normalizeText(value: unknown): string {
  return String(value ?? '').trim().replace(/\s+/g, ' ')
}

function parseGram(value: unknown): number {
  const parsed = Number(String(value ?? '').replace(/[^0-9.-]/g, ''))
  return Number.isFinite(parsed) ? Math.round(parsed) : 0
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 }).format(Math.round(value))
}

function todayValue(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date())
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function findRawLedgerModal(): HTMLDivElement | null {
  const overlays = Array.from(document.querySelectorAll<HTMLDivElement>('div.fixed.inset-0'))
  return (
    overlays.find((overlay) => {
      const title = normalizeText(overlay.querySelector('h3')?.textContent)
      const hasRawDescription = Array.from(overlay.querySelectorAll('p')).some(
        (paragraph) => normalizeText(paragraph.textContent) === '기간별 입고/소모 내역',
      )
      return title.endsWith('수불 상세') && hasRawDescription
    }) ?? null
  )
}

function findRawLedgerTable(modal: HTMLElement): HTMLTableElement | null {
  const tables = Array.from(modal.querySelectorAll<HTMLTableElement>('table'))
  return (
    tables.find((table) => {
      const headers = Array.from(table.querySelectorAll('thead th')).map((cell) => normalizeText(cell.textContent))
      return headers.includes('입고(g)') && headers.includes('소모(g)') && headers.includes('잔량(g)')
    }) ?? null
  )
}

function readVisibleLedgerRows(table: HTMLTableElement, materialName: string): LedgerPrintRow[] {
  return Array.from(table.querySelectorAll<HTMLTableRowElement>('tbody tr'))
    .map((row, index) => {
      const cells = Array.from(row.querySelectorAll<HTMLTableCellElement>('td'))
      if (cells.length < 7) return null
      return {
        id: `visible-${index}`,
        materialName,
        date: normalizeText(cells[0]?.textContent) || '-',
        type: normalizeText(cells[1]?.textContent) || '-',
        counterparty: normalizeText(cells[2]?.textContent) || '-',
        inboundG: parseGram(cells[3]?.textContent),
        outboundG: parseGram(cells[4]?.textContent),
        balanceG: parseGram(cells[5]?.textContent),
        note: normalizeText(cells[6]?.textContent) || '-',
      } satisfies LedgerPrintRow
    })
    .filter((row): row is LedgerPrintRow => row !== null)
}

function splitCounterpartyAndLot(counterparty: string): { counterparty: string; lot: string } {
  const marker = ' · LOT '
  const markerIndex = counterparty.indexOf(marker)
  if (markerIndex < 0) return { counterparty, lot: '' }
  return {
    counterparty: counterparty.slice(0, markerIndex).trim() || '-',
    lot: `LOT ${counterparty.slice(markerIndex + marker.length).trim()}`,
  }
}

async function loadCurrentStock(materialName: string): Promise<number | null> {
  try {
    const response = await fetch('/api/moni/raw-materials?include_inactive=all', { cache: 'no-store' })
    if (!response.ok) return null
    const payload = (await response.json().catch(() => null)) as RawMaterialsPayload | null
    const materials = payload?.materials ?? []
    const target = normalizeText(materialName)
    const matched =
      materials.find((material) => {
        const name = normalizeText(material.item_name)
        const origin = normalizeText(material.country_of_origin)
        const displayName = origin ? `${name} (${origin})` : name
        return displayName === target
      }) ?? materials.find((material) => normalizeText(material.item_name) === target)

    if (!matched) return null
    const parsed = Number(matched.current_stock_g ?? 0)
    return Number.isFinite(parsed) ? Math.round(parsed) : null
  } catch {
    return null
  }
}

async function loadCumulativeLedgerRows(materialName: string, from: string, to: string): Promise<LedgerPrintRow[]> {
  try {
    const params = new URLSearchParams()
    params.set('material_name', materialName)
    if (to && to !== '-') params.set('to', to)
    const response = await fetch(`/api/moni/raw-material-transactions?${params.toString()}`, { cache: 'no-store' })
    if (!response.ok) return []
    const payload = (await response.json().catch(() => null)) as RawLedgerPayload | null
    const target = normalizeText(materialName)
    const allRows = (payload?.rows ?? [])
      .filter((row) => normalizeText(row.material_name) === target)
      .map((row, index) => ({
        id: normalizeText(row.id) || `api-${index}`,
        materialName: normalizeText(row.material_name) || materialName,
        date: normalizeText(row.tx_date) || '-',
        type: normalizeText(row.tx_type) || '-',
        counterparty: normalizeText(row.counterparty) || '-',
        inboundG: parseGram(row.inbound_g),
        outboundG: parseGram(row.outbound_g),
        balanceG: parseGram(row.balance_g),
        note: normalizeText(row.note) || '-',
      }))

    return allRows.filter((row) => (!from || from === '-' || row.date >= from) && (!to || to === '-' || row.date <= to))
  } catch {
    return []
  }
}

function buildPrintHtml({
  materialName,
  from,
  to,
  rows,
  currentStockG,
}: {
  materialName: string
  from: string
  to: string
  rows: LedgerPrintRow[]
  currentStockG: number | null
}): string {
  const first = rows[0]
  const last = rows[rows.length - 1]
  const openingBalanceG = first ? first.balanceG - first.inboundG + first.outboundG : 0
  const totalInboundG = rows.reduce((sum, row) => sum + row.inboundG, 0)
  const totalOutboundG = rows.reduce((sum, row) => sum + row.outboundG, 0)
  const endingBalanceG = last?.balanceG ?? openingBalanceG + totalInboundG - totalOutboundG
  const isCurrentPeriod = to === todayValue()
  const stockDiffG = currentStockG === null ? null : endingBalanceG - currentStockG
  const stockMatches = isCurrentPeriod && stockDiffG === 0
  const printedAt = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date())
  const safeFileName = materialName.replace(/[\\/:*?"<>|]/g, '_')
  const documentTitle = `원료수불부_${safeFileName}_${from.replaceAll('-', '')}-${to.replaceAll('-', '')}`

  const rowHtml = rows
    .map((row, index) => {
      const separated = splitCounterpartyAndLot(row.counterparty)
      const note = [separated.lot, row.note === '-' ? '' : row.note].filter(Boolean).join(' / ') || '-'
      return `
        <tr>
          <td class="center">${index + 1}</td>
          <td class="center nowrap">${escapeHtml(row.date)}</td>
          <td class="center nowrap">${escapeHtml(row.type)}</td>
          <td>${escapeHtml(separated.counterparty)}</td>
          <td class="number">${row.inboundG ? formatNumber(row.inboundG) : '-'}</td>
          <td class="number">${row.outboundG ? formatNumber(row.outboundG) : '-'}</td>
          <td class="number strong">${formatNumber(row.balanceG)}</td>
          <td>${escapeHtml(note)}</td>
        </tr>`
    })
    .join('')

  const stockComparison =
    currentStockG === null
      ? `<span class="stock-status neutral">현재재고 확인 불가</span>`
      : !isCurrentPeriod
        ? `<span class="stock-status neutral">과거 종료일 조회 · 현재재고 일치 비교 제외</span>`
        : stockMatches
          ? `<span class="stock-status match">기말잔량 일치 확인 ✓</span>`
          : `<span class="stock-status mismatch">불일치 · 차이 ${formatNumber(stockDiffG ?? 0)}g</span>`

  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(documentTitle)}</title>
  <style>
    @page { size: A4 landscape; margin: 10mm 10mm 12mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: #000;
      background: #fff;
      font-family: Pretendard, "Noto Sans KR", "Malgun Gothic", Arial, sans-serif;
      font-size: 9pt;
      line-height: 1.35;
      -webkit-print-color-adjust: economy;
      print-color-adjust: economy;
    }
    .document { width: 100%; }
    .topline { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; }
    .company { margin: 0; font-size: 10pt; font-weight: 800; color: #000; }
    .print-time { margin: 0; font-size: 8pt; color: #555; text-align: right; }
    h1 { margin: 4mm 0 5mm; text-align: center; font-size: 18pt; letter-spacing: -0.03em; }
    .meta-grid { display: grid; grid-template-columns: 1.4fr 1fr 1fr 0.55fr; border: 1px solid #777; }
    .meta-cell { min-height: 14mm; padding: 3mm 4mm; border-right: 1px solid #aaa; }
    .meta-cell:last-child { border-right: 0; }
    .label { display: block; margin-bottom: 1mm; font-size: 7.5pt; color: #555; }
    .value { font-size: 10pt; font-weight: 700; }
    .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); margin-top: 4mm; border: 1px solid #777; }
    .summary-cell { padding: 3mm 4mm; border-right: 1px solid #aaa; text-align: right; }
    .summary-cell:last-child { border-right: 0; }
    .summary-cell .label { text-align: left; }
    .summary-value { font-size: 12pt; font-weight: 800; }
    .stock-check {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin: 2.5mm 0 4mm;
      padding: 2.5mm 4mm;
      border: 1px solid #999;
      background: #fff;
    }
    .stock-value { font-weight: 800; }
    .stock-status { font-weight: 800; }
    .stock-status.match,
    .stock-status.mismatch,
    .stock-status.neutral { color: #000; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    col.no { width: 4%; }
    col.date { width: 10%; }
    col.type { width: 7%; }
    col.counterparty { width: 24%; }
    col.qty { width: 9%; }
    col.balance { width: 10%; }
    col.note { width: 28%; }
    thead { display: table-header-group; }
    tr { break-inside: avoid; page-break-inside: avoid; }
    th, td { border: 1px solid #aaa; padding: 2mm 2.2mm; vertical-align: middle; overflow-wrap: anywhere; }
    th { background: #eee; color: #000; font-size: 8pt; font-weight: 800; text-align: center; }
    td { font-size: 8.2pt; }
    td.center { text-align: center; }
    td.number { text-align: right; font-variant-numeric: tabular-nums; }
    td.strong { font-weight: 800; }
    .nowrap { white-space: nowrap; }
    .footer { margin-top: 3mm; display: flex; justify-content: space-between; color: #555; font-size: 7.5pt; }
    @media print {
      html, body, .document { background: #fff !important; color: #000 !important; }
      * { color: #000 !important; box-shadow: none !important; text-shadow: none !important; }
      a { color: #000 !important; text-decoration: none; }
    }
  </style>
</head>
<body>
  <main class="document">
    <div class="topline">
      <p class="company">두배</p>
      <p class="print-time">출력일시: ${escapeHtml(printedAt)}</p>
    </div>
    <h1>원재료 수불 상세내역</h1>

    <section class="meta-grid">
      <div class="meta-cell"><span class="label">원재료명</span><span class="value">${escapeHtml(materialName)}</span></div>
      <div class="meta-cell"><span class="label">조회기간</span><span class="value">${escapeHtml(from)} ~ ${escapeHtml(to)}</span></div>
      <div class="meta-cell"><span class="label">거래 건수</span><span class="value">${formatNumber(rows.length)}건</span></div>
      <div class="meta-cell"><span class="label">표시단위</span><span class="value">g</span></div>
    </section>

    <section class="summary-grid">
      <div class="summary-cell"><span class="label">이월잔량</span><span class="summary-value">${formatNumber(openingBalanceG)}g</span></div>
      <div class="summary-cell"><span class="label">기간 총 입고</span><span class="summary-value">${formatNumber(totalInboundG)}g</span></div>
      <div class="summary-cell"><span class="label">기간 총 소모</span><span class="summary-value">${formatNumber(totalOutboundG)}g</span></div>
      <div class="summary-cell"><span class="label">기말잔량</span><span class="summary-value">${formatNumber(endingBalanceG)}g</span></div>
    </section>

    <section class="stock-check">
      <div>원재료 관리 현재재고(오늘 기준): <span class="stock-value">${currentStockG === null ? '-' : `${formatNumber(currentStockG)}g`}</span></div>
      ${stockComparison}
    </section>

    <table>
      <colgroup>
        <col class="no" /><col class="date" /><col class="type" /><col class="counterparty" />
        <col class="qty" /><col class="qty" /><col class="balance" /><col class="note" />
      </colgroup>
      <thead>
        <tr>
          <th>No</th><th>거래일자</th><th>구분</th><th>거래처 / 사용처</th>
          <th>입고(g)</th><th>소모(g)</th><th>잔량(g)</th><th>비고</th>
        </tr>
      </thead>
      <tbody>${rowHtml}</tbody>
    </table>

    <div class="footer">
      <span>본 출력물은 MONI 원료수불부의 조회기간 기준 자료입니다.</span>
      <span>${escapeHtml(materialName)} · ${formatNumber(rows.length)}건</span>
    </div>
  </main>
</body>
</html>`
}

async function printRawLedger(modal: HTMLElement): Promise<void> {
  const table = findRawLedgerTable(modal)
  if (!table) {
    window.alert('인쇄할 원료수불 거래 내역이 없습니다.')
    return
  }

  const title = normalizeText(modal.querySelector('h3')?.textContent)
  const materialName = title.replace(/\s+수불 상세$/, '').trim() || '원재료'
  const dateInputs = Array.from(modal.querySelectorAll<HTMLInputElement>('input[type="date"]'))
  const from = dateInputs[0]?.value || '-'
  const to = dateInputs[1]?.value || '-'
  const visibleRows = readVisibleLedgerRows(table, materialName)
  const cumulativeRows = await loadCumulativeLedgerRows(materialName, from, to)
  const rows = cumulativeRows.length > 0 ? cumulativeRows : visibleRows

  if (rows.length === 0) {
    window.alert('인쇄할 원료수불 거래 내역이 없습니다.')
    return
  }

  const currentStockG = await loadCurrentStock(materialName)
  const html = buildPrintHtml({ materialName, from, to, rows, currentStockG })

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
  if (!printDocument || !iframe.contentWindow) {
    iframe.remove()
    window.alert('인쇄 화면을 열지 못했습니다. 다시 시도해 주세요.')
    return
  }

  printDocument.open()
  printDocument.write(html)
  printDocument.close()

  const printWindow = iframe.contentWindow
  const cleanup = () => window.setTimeout(() => iframe.remove(), 500)
  printWindow.addEventListener('afterprint', cleanup, { once: true })
  window.setTimeout(() => {
    printWindow.focus()
    printWindow.print()
  }, 300)
  window.setTimeout(cleanup, 60000)
}

function installPrintButton(): void {
  const modal = findRawLedgerModal()
  if (!modal || modal.querySelector(`[${PRINT_BUTTON_ATTRIBUTE}]`)) return

  const title = modal.querySelector('h3')
  const header = title?.parentElement?.parentElement
  const closeButton = header?.querySelector<HTMLButtonElement>('button')
  if (!header || !closeButton) return

  const printButton = document.createElement('button')
  printButton.type = 'button'
  printButton.setAttribute(PRINT_BUTTON_ATTRIBUTE, 'true')
  printButton.setAttribute('aria-label', '원료수불 상세 인쇄 또는 PDF 저장')
  printButton.className =
    'ml-auto rounded-lg border border-green-600 bg-green-500/10 px-3 py-1.5 text-sm font-semibold text-green-200 hover:bg-green-500/20 hover:text-white'
  printButton.textContent = '인쇄 / PDF 저장'
  printButton.addEventListener('click', () => void printRawLedger(modal))
  header.insertBefore(printButton, closeButton)
}

export default function RawMaterialLedgerPrintController() {
  useEffect(() => {
    let animationFrame = 0
    const scheduleInstall = () => {
      window.cancelAnimationFrame(animationFrame)
      animationFrame = window.requestAnimationFrame(installPrintButton)
    }

    const observer = new MutationObserver(scheduleInstall)
    observer.observe(document.body, { childList: true, subtree: true })
    scheduleInstall()

    return () => {
      observer.disconnect()
      window.cancelAnimationFrame(animationFrame)
      document.querySelectorAll(`[${PRINT_BUTTON_ATTRIBUTE}]`).forEach((button) => button.remove())
    }
  }, [])

  return null
}
