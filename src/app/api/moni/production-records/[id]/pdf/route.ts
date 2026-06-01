import { NextRequest, NextResponse } from 'next/server'
import { createMoniServiceRoleClient } from '@/lib/moni/db'

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
  return Number.isFinite(parsed) ? new Intl.NumberFormat('ko-KR').format(parsed) : '-'
}

function parseNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value.trim())
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}

type RecipeRow = {
  food_type_name?: string | null
  ratio_percent?: number | string | null
}

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createMoniServiceRoleClient()
    const { data, error } = await supabase.from('production_records').select('*').eq('id', params.id).maybeSingle()
    if (error) throw new Error(error.message || '제조기록서 조회 실패')
    if (!data) return NextResponse.json({ ok: false, error: '제조기록서를 찾을 수 없습니다.' }, { status: 404 })

    const productId = String(data.product_id ?? '').trim()
    const productName = String(data.product_name ?? '').trim()
    const plannedQuantityG = parseNumber(data.planned_quantity_g)
    let recipeRows: RecipeRow[] = []

    if (productId) {
      const byProductId = await supabase
        .from('recipes')
        .select('food_type_name, ratio_percent')
        .eq('product_id', productId)
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
      if (byProductId.error) throw new Error(byProductId.error.message || '레시피 조회에 실패했습니다.')
      recipeRows = (byProductId.data ?? []) as RecipeRow[]
    }

    if (recipeRows.length === 0 && productName) {
      const byProductName = await supabase
        .from('recipes')
        .select('food_type_name, ratio_percent')
        .eq('product_name', productName)
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
      if (byProductName.error) throw new Error(byProductName.error.message || '레시피 조회에 실패했습니다.')
      recipeRows = (byProductName.data ?? []) as RecipeRow[]
    }

    const requirementRows = recipeRows
      .map((row) => {
        const ratio = parseNumber(row.ratio_percent)
        return {
          foodTypeName: String(row.food_type_name ?? '').trim(),
          ratioPercent: ratio,
          requiredG: plannedQuantityG > 0 ? (plannedQuantityG * ratio) / 100 : 0,
        }
      })
      .filter((row) => row.foodTypeName && row.ratioPercent > 0)

    const html = `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <title>작업지시서 ${escapeHtml(data.lot_number)}</title>
  <style>
    @page { size: A4; margin: 16mm; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Arial, "Malgun Gothic", sans-serif; color: #111827; background: #f3f4f6; }
    .page { width: 210mm; min-height: 297mm; margin: 0 auto; background: white; padding: 18mm; }
    h1 { margin: 0 0 16px; text-align: center; font-size: 26px; letter-spacing: 0; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; margin-top: 12px; }
    th, td { border: 1px solid #111827; padding: 10px; vertical-align: top; }
    th { background: #e5e7eb; text-align: left; }
    .section-title { margin-top: 22px; font-size: 17px; font-weight: 700; }
    .sign { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 40px; }
    .sign div { height: 80px; border: 1px solid #111827; padding: 10px; text-align: right; }
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
    <h1>작업지시서 / 제조기록서</h1>
    <table>
      <tbody>
        <tr><th>제조번호(LOT)</th><td>${escapeHtml(data.lot_number)}</td><th>생산일자</th><td>${escapeHtml(data.work_date)}</td></tr>
        <tr><th>제품명</th><td colspan="3">${escapeHtml(data.product_name)}</td></tr>
      </tbody>
    </table>

    <div class="section-title">생산량 정보</div>
    <table>
      <tbody>
        <tr><th>예정 생산량(g)</th><td>${formatNumber(data.planned_quantity_g)}</td></tr>
        <tr><th>실제 완료량(g)</th><td>${formatNumber(data.actual_quantity_g)}</td></tr>
        <tr><th>불량수량(g)</th><td>${formatNumber(data.defect_quantity_g)}</td></tr>
        <tr><th>샘플수량(g)</th><td>${formatNumber(data.sample_quantity_g)}</td></tr>
      </tbody>
    </table>

    <div class="section-title">원재료 필요량 (예정 기준)</div>
    <table>
      <thead>
        <tr>
          <th>원재료명(식품유형)</th>
          <th>배합비율(%)</th>
          <th>필요량(g)</th>
        </tr>
      </thead>
      <tbody>
        ${
          requirementRows.length > 0
            ? requirementRows
                .map(
                  (row) => `<tr>
                    <td>${escapeHtml(row.foodTypeName)}</td>
                    <td>${formatNumber(row.ratioPercent)}</td>
                    <td>${formatNumber(row.requiredG)}</td>
                  </tr>`,
                )
                .join('')
            : '<tr><td colspan="3">등록된 레시피가 없어 원재료 필요량을 계산할 수 없습니다.</td></tr>'
        }
      </tbody>
    </table>

    <div class="section-title">비고란</div>
    <table>
      <tbody>
        <tr><th>비고</th><td style="height:120px;">${escapeHtml(data.note || '')}</td></tr>
      </tbody>
    </table>

    <div class="section-title">생산 완료 후 기입란</div>
    <table>
      <tbody>
        <tr><th>실제 완료량(g)</th><td>${formatNumber(data.actual_quantity_g)}</td></tr>
        <tr><th>불량수량(g)</th><td>${formatNumber(data.defect_quantity_g)}</td></tr>
        <tr><th>샘플수량(g)</th><td>${formatNumber(data.sample_quantity_g)}</td></tr>
      </tbody>
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
    const message = error instanceof Error ? error.message : '제조기록서 PDF 생성 중 오류가 발생했습니다.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
