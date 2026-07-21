import { NextRequest, NextResponse } from 'next/server'
import { GET as getProductionDaily } from '../route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type SemiProductStage = {
  product_name?: string
  parent_product_name?: string
  depth?: number
  ratio_from_parent?: number
  required_g?: number
  path?: string[]
}

type DailyRecord = {
  id?: string
  lot_number?: string
  work_date?: string
  product_name?: string
  planned_quantity_g?: number
  actual_quantity_g?: number
  defect_quantity_g?: number
  sample_quantity_g?: number
  status?: string | null
  semi_products?: SemiProductStage[]
  semi_product_issues?: string[]
}

type DailyPayload = {
  ok?: boolean
  error?: string
  records?: DailyRecord[]
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function numberValue(value: unknown): number {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function formatNumber(value: unknown, digits = 0): string {
  const parsed = numberValue(value)
  return new Intl.NumberFormat('ko-KR', { maximumFractionDigits: digits }).format(parsed)
}

function normalizeStatus(value: unknown): string {
  const raw = String(value ?? '').trim().toLowerCase()
  if (['confirmed', '확정'].includes(raw)) return '확정'
  if (['completed', '완료'].includes(raw)) return '생산완료'
  return String(value ?? '-')
}

function htmlResponse(html: string, status = 200): NextResponse {
  return new NextResponse(html, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}

export async function GET(request: NextRequest) {
  const ids = Array.from(new Set(
    String(request.nextUrl.searchParams.get('ids') ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean),
  ))

  if (ids.length === 0) {
    return htmlResponse('<!doctype html><html lang="ko"><meta charset="utf-8"><body><h1>인쇄할 생산일보가 선택되지 않았습니다.</h1><p><a href="/production-daily">생산일보로 돌아가기</a></p></body></html>', 400)
  }

  if (ids.length > 100) {
    return htmlResponse('<!doctype html><html lang="ko"><meta charset="utf-8"><body><h1>한 번에 최대 100건까지 출력할 수 있습니다.</h1><p><a href="/production-daily">생산일보로 돌아가기</a></p></body></html>', 400)
  }

  const sourceResponse = await getProductionDaily(request)
  const payload = (await sourceResponse.json().catch(() => null)) as DailyPayload | null

  if (!sourceResponse.ok || !payload?.ok) {
    const error = escapeHtml(payload?.error || '선택 생산일보를 불러오지 못했습니다.')
    return htmlResponse(`<!doctype html><html lang="ko"><meta charset="utf-8"><body><h1>생산일보 출력 오류</h1><p>${error}</p><p><a href="/production-daily">생산일보로 돌아가기</a></p></body></html>`, sourceResponse.status || 500)
  }

  const records = payload.records ?? []
  if (records.length === 0) {
    return htmlResponse('<!doctype html><html lang="ko"><meta charset="utf-8"><body><h1>출력할 완료 생산일보가 없습니다.</h1><p><a href="/production-daily">생산일보로 돌아가기</a></p></body></html>', 404)
  }

  const totalPlanned = records.reduce((sum, record) => sum + numberValue(record.planned_quantity_g), 0)
  const totalActual = records.reduce((sum, record) => sum + numberValue(record.actual_quantity_g), 0)
  const totalDefect = records.reduce((sum, record) => sum + numberValue(record.defect_quantity_g), 0)
  const totalSample = records.reduce((sum, record) => sum + numberValue(record.sample_quantity_g), 0)
  const dates = records.map((record) => String(record.work_date ?? '')).filter(Boolean).sort()
  const fromDate = dates[0] ?? '-'
  const toDate = dates[dates.length - 1] ?? '-'

  const rows = records.map((record, recordIndex) => {
    const mainRow = `<tr class="main-row">
      <td>${recordIndex + 1}</td>
      <td>${escapeHtml(record.work_date)}</td>
      <td class="lot">${escapeHtml(record.lot_number)}</td>
      <td class="product">${escapeHtml(record.product_name)}</td>
      <td class="amount planned">${formatNumber(record.planned_quantity_g)}</td>
      <td class="amount actual">${formatNumber(record.actual_quantity_g)}</td>
      <td class="amount defect">${formatNumber(record.defect_quantity_g)}</td>
      <td class="amount sample">${formatNumber(record.sample_quantity_g)}</td>
      <td>${escapeHtml(normalizeStatus(record.status))}</td>
    </tr>`

    const semiRows = (record.semi_products ?? []).map((stage) => `<tr class="semi-row">
      <td></td>
      <td>↳ ${formatNumber(stage.depth)}단계</td>
      <td>동일 LOT</td>
      <td class="product">
        <strong>[연결 반제품] ${escapeHtml(stage.product_name)}</strong>
        <div class="sub-info">상위: ${escapeHtml(stage.parent_product_name)} · 배합비 ${formatNumber(stage.ratio_from_parent, 3)}%</div>
      </td>
      <td class="amount semi-required">${formatNumber(stage.required_g)}</td>
      <td>-</td>
      <td>-</td>
      <td>-</td>
      <td>동일 LOT 내 제조</td>
    </tr>`).join('')

    const issueRows = (record.semi_product_issues ?? []).length > 0
      ? `<tr class="issue-row"><td></td><td colspan="8"><strong>반제품 연결 확인 필요:</strong> ${(record.semi_product_issues ?? []).map(escapeHtml).join(', ')}</td></tr>`
      : ''

    return `${mainRow}${semiRows}${issueRows}`
  }).join('')

  const title = `선택 생산일보_${fromDate}_${records.length}건`

  return htmlResponse(`<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    @page { size: A4 landscape; margin: 10mm; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Arial, 'Malgun Gothic', sans-serif; color: #111827; background: #e5e7eb; }
    .toolbar { position: sticky; top: 0; z-index: 10; display: flex; justify-content: center; gap: 10px; padding: 12px; background: #0f172a; }
    .toolbar a, .toolbar button { border: 1px solid #475569; border-radius: 8px; padding: 9px 14px; background: #fff; color: #0f172a; font-size: 14px; font-weight: 700; text-decoration: none; cursor: pointer; }
    .toolbar button { border-color: #059669; background: #059669; color: #fff; }
    .document { width: 297mm; min-height: 210mm; margin: 10mm auto; padding: 10mm; background: #fff; }
    h1 { margin: 0 0 10px; text-align: center; font-size: 24px; }
    .meta { margin-bottom: 9px; text-align: right; color: #475569; font-size: 11px; }
    .summary { margin-bottom: 12px; }
    .summary th, .summary td { padding: 7px 6px; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 11px; }
    th, td { border: 1px solid #111827; padding: 7px 5px; text-align: center; vertical-align: middle; }
    th { background: #e5e7eb; font-weight: 700; }
    .records col:nth-child(1) { width: 4%; }
    .records col:nth-child(2) { width: 9%; }
    .records col:nth-child(3) { width: 12%; }
    .records col:nth-child(4) { width: 27%; }
    .records col:nth-child(5) { width: 10%; }
    .records col:nth-child(6) { width: 10%; }
    .records col:nth-child(7) { width: 8%; }
    .records col:nth-child(8) { width: 8%; }
    .records col:nth-child(9) { width: 12%; }
    .records thead { display: table-header-group; }
    .records tfoot { display: table-footer-group; }
    .main-row { break-inside: avoid; page-break-inside: avoid; }
    .main-row td { min-height: 30px; font-size: 11.5px; }
    .main-row .product { font-weight: 700; }
    .lot { white-space: nowrap; font-family: Consolas, monospace; }
    .product { overflow-wrap: anywhere; word-break: keep-all; }
    .amount { white-space: nowrap; font-variant-numeric: tabular-nums; }
    .actual { color: #047857; font-size: 13px !important; font-weight: 800; }
    .planned { color: #1d4ed8; }
    .defect { color: #b45309; }
    .sample { color: #0369a1; }
    .semi-row td { padding-top: 6px; padding-bottom: 6px; background: #f8fafc; color: #334155; }
    .semi-row .product { text-align: left; }
    .semi-row strong { color: #0e7490; }
    .semi-required { color: #0e7490; font-weight: 800; }
    .sub-info { margin-top: 3px; color: #64748b; font-size: 9.5px; line-height: 1.3; }
    .issue-row td { background: #fef2f2; color: #991b1b; text-align: left; }
    .totals td { background: #eef2ff; font-size: 12px; font-weight: 800; }
    .totals .actual { font-size: 14px !important; }
    .note { margin-top: 8px; color: #64748b; font-size: 10px; line-height: 1.45; }
    @media print {
      body { background: #fff; }
      .no-print { display: none !important; }
      .document { width: auto; min-height: auto; margin: 0; padding: 0; }
      .records tr { break-inside: avoid; page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="toolbar no-print">
    <a href="/production-daily">생산일보로 돌아가기</a>
    <button type="button" onclick="window.print()">인쇄 / PDF 저장</button>
  </div>
  <main class="document">
    <h1>선택 생산일보</h1>
    <div class="meta">조회기간 ${escapeHtml(fromDate)} ~ ${escapeHtml(toDate)} · 선택 ${records.length}건</div>

    <table class="summary">
      <tbody><tr>
        <th>생산기록</th><td>${records.length}건</td>
        <th>계획량 합계</th><td>${formatNumber(totalPlanned)}g</td>
        <th>완료량 합계</th><td><strong>${formatNumber(totalActual)}g</strong></td>
        <th>불량량 합계</th><td>${formatNumber(totalDefect)}g</td>
        <th>샘플량 합계</th><td>${formatNumber(totalSample)}g</td>
      </tr></tbody>
    </table>

    <table class="records">
      <colgroup><col/><col/><col/><col/><col/><col/><col/><col/><col/></colgroup>
      <thead><tr>
        <th>순번</th><th>생산일자</th><th>LOT</th><th>제품 / 연결 반제품</th>
        <th>계획·필요량(g)</th><th>완료(g)</th><th>불량(g)</th><th>샘플(g)</th><th>상태</th>
      </tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr class="totals">
        <td colspan="4">선택 합계</td>
        <td>${formatNumber(totalPlanned)}</td>
        <td class="actual">${formatNumber(totalActual)}</td>
        <td>${formatNumber(totalDefect)}</td>
        <td>${formatNumber(totalSample)}</td>
        <td>${records.length}건</td>
      </tr></tfoot>
    </table>
    <div class="note">※ 연결 반제품이 있는 생산기록만 해당 완제품 바로 아래에 하위 행으로 표시됩니다. 연결 반제품이 없는 생산기록에는 빈 반제품 표를 만들지 않습니다.</div>
  </main>
  <script>window.addEventListener('load', () => setTimeout(() => window.print(), 300));</script>
</body>
</html>`)
}
