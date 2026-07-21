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

function formatNumber(value: unknown, digits = 0): string {
  const parsed = Number(value ?? 0)
  if (!Number.isFinite(parsed)) return '-'
  return new Intl.NumberFormat('ko-KR', { maximumFractionDigits: digits }).format(parsed)
}

function formatGram(value: unknown): string {
  return `${formatNumber(Math.round(Number(value ?? 0)))}g`
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

  const pages = records.map((record, index) => {
    const semiProducts = record.semi_products ?? []
    const semiRows = semiProducts.length > 0
      ? semiProducts.map((stage) => `<tr>
          <td>${formatNumber(stage.depth)}단계</td>
          <td><strong>${escapeHtml(stage.product_name)}</strong><div class="path">${escapeHtml((stage.path ?? []).join(' → '))}</div></td>
          <td>${escapeHtml(stage.parent_product_name)}</td>
          <td>${formatNumber(stage.ratio_from_parent, 3)}%</td>
          <td><strong>${formatGram(stage.required_g)}</strong></td>
          <td>동일 LOT 내 제조</td>
        </tr>`).join('')
      : '<tr><td colspan="6">연결 반제품 없음</td></tr>'

    const issues = (record.semi_product_issues ?? []).length > 0
      ? `<div class="issue"><strong>연결 확인 필요:</strong> ${(record.semi_product_issues ?? []).map(escapeHtml).join(', ')}</div>`
      : ''

    return `<section class="sheet">
      <div class="page-meta">선택 생산일보 ${index + 1} / ${records.length}</div>
      <h1>생산일보</h1>
      <table class="main"><tbody>
        <tr><th>생산일자</th><td>${escapeHtml(record.work_date)}</td><th>LOT</th><td>${escapeHtml(record.lot_number)}</td></tr>
        <tr><th>제품명</th><td colspan="3" class="product-name">${escapeHtml(record.product_name)}</td></tr>
        <tr><th>계획량</th><td>${formatGram(record.planned_quantity_g)}</td><th>완료량</th><td class="actual">${formatGram(record.actual_quantity_g)}</td></tr>
        <tr><th>불량량</th><td>${formatGram(record.defect_quantity_g)}</td><th>샘플량</th><td>${formatGram(record.sample_quantity_g)}</td></tr>
        <tr><th>상태</th><td>${escapeHtml(normalizeStatus(record.status))}</td><th>원료차감</th><td>${normalizeStatus(record.status) === '확정' ? '반영' : '미반영'}</td></tr>
      </tbody></table>
      <h2>연결 반제품 제조내역</h2>
      <table class="semi"><thead><tr><th>단계</th><th>연결 반제품</th><th>상위 제품</th><th>배합비</th><th>필요량</th><th>처리</th></tr></thead><tbody>${semiRows}</tbody></table>
      ${issues}
    </section>${index < records.length - 1 ? '<div class="page-break"></div>' : ''}`
  }).join('')

  const firstDate = escapeHtml(records[0]?.work_date || '')
  const title = `선택 생산일보_${firstDate}_${records.length}건`

  return htmlResponse(`<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <style>
    @page { size: A4; margin: 13mm; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Arial, 'Malgun Gothic', sans-serif; color: #111827; background: #e5e7eb; }
    .toolbar { position: sticky; top: 0; z-index: 10; display: flex; justify-content: center; gap: 10px; padding: 12px; background: #0f172a; }
    .toolbar a, .toolbar button { border: 1px solid #475569; border-radius: 8px; padding: 9px 14px; background: #fff; color: #0f172a; font-size: 14px; font-weight: 700; text-decoration: none; cursor: pointer; }
    .toolbar button { border-color: #059669; background: #059669; color: #fff; }
    .sheet { width: 210mm; min-height: 297mm; margin: 10mm auto; padding: 13mm; background: #fff; page-break-inside: avoid; break-inside: avoid-page; }
    .page-meta { text-align: right; color: #64748b; font-size: 10px; }
    h1 { margin: 0 0 12px; text-align: center; font-size: 24px; }
    h2 { margin: 17px 0 7px; font-size: 16px; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 12px; }
    th, td { border: 1px solid #111827; padding: 8px 7px; text-align: center; vertical-align: middle; }
    th { background: #e5e7eb; font-weight: 700; }
    .main th { width: 17%; }
    .main td { font-size: 13px; }
    .product-name { font-weight: 700; }
    .actual { font-size: 15px !important; font-weight: 800; }
    .semi th:nth-child(1) { width: 8%; }
    .semi th:nth-child(2) { width: 23%; }
    .semi th:nth-child(3) { width: 25%; }
    .semi th:nth-child(4) { width: 12%; }
    .semi th:nth-child(5) { width: 15%; }
    .semi th:nth-child(6) { width: 17%; }
    .path { margin-top: 3px; color: #64748b; font-size: 10px; line-height: 1.35; }
    .issue { margin-top: 10px; border: 1px solid #dc2626; background: #fef2f2; padding: 9px; color: #991b1b; font-size: 12px; }
    .page-break { height: 0; page-break-after: always; break-after: page; }
    @media print {
      body { background: #fff; }
      .no-print { display: none !important; }
      .sheet { width: auto; min-height: auto; margin: 0; padding: 0; }
    }
  </style>
</head>
<body>
  <div class="toolbar no-print">
    <a href="/production-daily">생산일보로 돌아가기</a>
    <button type="button" onclick="window.print()">인쇄 / PDF 저장</button>
  </div>
  ${pages}
  <script>window.addEventListener('load', () => setTimeout(() => window.print(), 300));</script>
</body>
</html>`)
}
