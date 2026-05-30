import { NextRequest, NextResponse } from 'next/server'
import { buildSububuReport } from '@/lib/moni/sububu'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function formatNumber(value: unknown) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? new Intl.NumberFormat('ko-KR').format(parsed) : '0'
}

function formatKg(value: number) {
  return new Intl.NumberFormat('ko-KR', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }).format(value / 1000)
}

export async function GET(request: NextRequest) {
  try {
    const report = await buildSububuReport({
      from: request.nextUrl.searchParams.get('from'),
      to: request.nextUrl.searchParams.get('to'),
      materialName: request.nextUrl.searchParams.get('material_name'),
    })

    const rowsHtml =
      report.materials.length > 0
        ? report.materials
            .map(
              (material, index) => `
                <tr>
                  <td>${index + 1}</td>
                  <td>${escapeHtml(material.food_type_name)}</td>
                  <td class="number">${formatNumber(material.total_usage_g)}</td>
                  <td class="number">${formatKg(material.total_usage_g)}</td>
                  <td class="number">${formatNumber(material.products_used.length)}</td>
                  <td class="number">${formatNumber(material.usage_count)}</td>
                </tr>`,
            )
            .join('')
        : '<tr><td colspan="6" class="empty">해당 기간에 계산된 원재료 사용 내역이 없습니다.</td></tr>'

    const html = `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <title>원재료 수불 내역서</title>
  <style>
    @page { size: A4; margin: 14mm; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Arial, "Malgun Gothic", sans-serif; color: #111827; background: #f3f4f6; }
    .page { width: 210mm; min-height: 297mm; margin: 0 auto; background: white; padding: 16mm; }
    h1 { margin: 0 0 16px; text-align: center; font-size: 26px; }
    .meta { display: grid; grid-template-columns: 1fr 1fr 1fr; border: 1px solid #111827; border-bottom: 0; }
    .meta div { padding: 10px; border-right: 1px solid #111827; font-size: 14px; }
    .meta div:last-child { border-right: 0; }
    table { width: 100%; border-collapse: collapse; margin-top: 14px; font-size: 13px; }
    th, td { border: 1px solid #111827; padding: 8px 10px; vertical-align: top; }
    th { background: #e5e7eb; }
    td.number { text-align: right; }
    td.empty { text-align: center; color: #475569; padding: 18px 10px; }
    .summary { margin-top: 14px; font-size: 14px; }
    .summary strong { display: inline-block; min-width: 140px; }
    .sign { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 36px; }
    .sign div { height: 84px; border: 1px solid #111827; padding: 10px; text-align: right; }
    .no-print { margin: 16px auto; width: 210mm; text-align: right; }
    .no-print button { padding: 10px 14px; border: 1px solid #111827; background: #111827; color: white; cursor: pointer; }
    @media print {
      body { background: white; }
      .page { width: auto; min-height: auto; margin: 0; padding: 0; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="no-print"><button onclick="window.print()">인쇄 / PDF 저장</button></div>
  <main class="page">
    <h1>원재료 수불 내역서</h1>
    <section class="meta">
      <div><strong>회사명</strong><br />두배식품</div>
      <div><strong>조회 시작일</strong><br />${escapeHtml(report.period.from)}</div>
      <div><strong>조회 종료일</strong><br />${escapeHtml(report.period.to)}</div>
    </section>

    <div class="summary">
      <p><strong>총 생산량(g)</strong>${formatNumber(report.total_production_g)}</p>
      <p><strong>원재료 항목 수</strong>${formatNumber(report.materials.length)}</p>
    </div>

    <table>
      <thead>
        <tr>
          <th style="width: 8%">번호</th>
          <th style="width: 30%">원재료명(식약처 기준)</th>
          <th style="width: 18%">사용량(g)</th>
          <th style="width: 18%">사용량(kg)</th>
          <th style="width: 13%">투입 제품 수</th>
          <th style="width: 13%">투입 횟수</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>

    <section class="sign">
      <div>작성자 서명: __________________</div>
      <div>확인자 서명: __________________</div>
    </section>
  </main>
  <script>window.addEventListener('load', () => setTimeout(() => window.print(), 300));</script>
</body>
</html>`

    return new NextResponse(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : '수불부 PDF 생성 중 오류가 발생했습니다.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
