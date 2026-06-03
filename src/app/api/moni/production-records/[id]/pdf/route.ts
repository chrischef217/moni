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

function parseNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value.trim())
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function formatNumber(value: unknown) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? new Intl.NumberFormat('ko-KR').format(parsed) : '-'
}

function formatGram(value: unknown) {
  const parsed = parseNumber(value)
  if (parsed === null) return '-'
  return `${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 }).format(parsed)}g`
}

function formatRequiredGram(value: number) {
  if (!Number.isFinite(value)) return '-'
  const abs = Math.abs(value)

  if (abs >= 1) {
    return new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 }).format(Math.round(value))
  }

  return new Intl.NumberFormat('ko-KR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value)
}

function formatEaRemainder(ea: number, remainderG: number) {
  return `${new Intl.NumberFormat('ko-KR').format(ea)}ea + 잔량 ${formatGram(remainderG)}`
}

type RecipeRow = {
  food_type_name?: string | null
  ratio_percent?: number | string | null
}

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createMoniServiceRoleClient()
    const { data, error } = await supabase.from('production_records').select('*').eq('id', params.id).maybeSingle()
    if (error) throw new Error(error.message || '제조기록서 조회에 실패했습니다.')
    if (!data) return NextResponse.json({ ok: false, error: '제조기록서를 찾을 수 없습니다.' }, { status: 404 })

    const productId = String(data.product_id ?? '').trim()
    const productName = String(data.product_name ?? '').trim()
    const plannedQuantityG = parseNumber(data.planned_quantity_g) ?? 0
    const productionUnitName = String(data.production_unit_name ?? '').trim()
    const productionUnitWeightG = parseNumber(data.production_unit_weight_g)
    const storedPlannedEa = parseNumber(data.planned_quantity_ea)
    const storedPlannedRemainderG = parseNumber(data.planned_remainder_g)
    const plannedEa =
      storedPlannedEa !== null
        ? Math.floor(storedPlannedEa)
        : plannedQuantityG > 0 && productionUnitWeightG !== null && productionUnitWeightG > 0
          ? Math.floor(plannedQuantityG / productionUnitWeightG)
          : null
    const plannedRemainderG =
      storedPlannedRemainderG !== null
        ? storedPlannedRemainderG
        : plannedEa !== null && productionUnitWeightG !== null && productionUnitWeightG > 0
          ? plannedQuantityG - plannedEa * productionUnitWeightG
          : null
    const plannedEaRemainderText =
      plannedEa !== null && plannedRemainderG !== null ? formatEaRemainder(plannedEa, plannedRemainderG) : ''
    const productionUnitLabel =
      productionUnitName || (productionUnitWeightG !== null && productionUnitWeightG > 0 ? `${formatGram(productionUnitWeightG)} 단위` : '')

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
        const ratio = parseNumber(row.ratio_percent) ?? 0
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
    @page { size: A4; margin: 14mm; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Arial, "Malgun Gothic", sans-serif; color: #111827; background: #f3f4f6; }
    .page { width: 210mm; min-height: 297mm; margin: 0 auto; background: #fff; padding: 14mm; }
    h1 { margin: 0 0 10px; text-align: center; font-size: 24px; letter-spacing: 0; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; margin-top: 8px; }
    th, td { border: 1px solid #111827; padding: 7px 8px; vertical-align: middle; }
    th { background: #e5e7eb; text-align: left; white-space: nowrap; }
    .section-title { margin-top: 14px; font-size: 16px; font-weight: 700; }
    .compact { table-layout: fixed; }
    .compact col.label { width: 18%; }
    .compact col.value { width: 32%; }
    .compact td.value { word-break: break-word; }
    .number { text-align: right; white-space: nowrap; }
    .fill-grid { display: grid; grid-template-columns: 2fr 1fr; gap: 12px; margin-top: 8px; align-items: stretch; }
    .fill-table { table-layout: fixed; margin-top: 0; height: 100%; }
    .fill-table col.label-col { width: 26%; }
    .fill-table col.input-col { width: 74%; }
    .fill-table td.input-cell { height: 48px; background: #fff; }
    .entry-wrap { display: flex; align-items: center; justify-content: space-between; gap: 10px; min-height: 34px; }
    .entry-space { flex: 1 1 auto; min-height: 26px; }
    .unit-hints { flex: 0 0 auto; color: #374151; font-size: 12px; white-space: nowrap; }
    .sign-table { margin-top: 0; height: 100%; table-layout: fixed; }
    .sign-table th { width: 46%; }
    .sign-table td { height: 62px; vertical-align: bottom; text-align: right; padding-bottom: 10px; }
    .no-print { margin: 16px auto; width: 210mm; text-align: right; }
    .no-print button { padding: 10px 14px; border: 1px solid #111827; background: #111827; color: #fff; cursor: pointer; }
    @media print {
      body { background: #fff; }
      .page { width: auto; min-height: auto; margin: 0; padding: 0; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="no-print"><button onclick="window.print()">인쇄 / PDF 저장</button></div>
  <main class="page">
    <h1>작업지시서 / 제조기록서</h1>

    <table class="compact">
      <colgroup>
        <col class="label" />
        <col class="value" />
        <col class="label" />
        <col class="value" />
      </colgroup>
      <tbody>
        <tr>
          <th>LOT</th>
          <td class="value">${escapeHtml(data.lot_number)}</td>
          <th>생산일자</th>
          <td class="value">${escapeHtml(data.work_date)}</td>
        </tr>
        <tr>
          <th>제품명</th>
          <td class="value">${escapeHtml(data.product_name)}</td>
          <th>예정수량</th>
          <td class="value number">
            ${formatGram(data.planned_quantity_g)}
            ${plannedEaRemainderText ? `<div style="margin-top:4px;font-size:12px;color:#374151;">${escapeHtml(plannedEaRemainderText)}</div>` : ''}
          </td>
        </tr>
        ${
          productionUnitLabel
            ? `<tr>
          <th>생산단위</th>
          <td class="value">${escapeHtml(productionUnitLabel)}</td>
          <th>예정수량(ea)</th>
          <td class="value number">${plannedEaRemainderText ? escapeHtml(plannedEaRemainderText) : '-'}</td>
        </tr>`
            : ''
        }
      </tbody>
    </table>

    <div class="section-title">원재료 필요량(예정 기준)</div>
    <table>
      <thead>
        <tr>
          <th>원재료명(식품유형)</th>
          <th class="number">배합비율(%)</th>
          <th class="number">필요량(g)</th>
        </tr>
      </thead>
      <tbody>
        ${
          requirementRows.length > 0
            ? requirementRows
                .map(
                  (row) => `<tr>
                    <td>${escapeHtml(row.foodTypeName)}</td>
                    <td class="number">${formatNumber(row.ratioPercent)}</td>
                    <td class="number">${formatRequiredGram(row.requiredG)}</td>
                  </tr>`,
                )
                .join('')
            : '<tr><td colspan="3">등록된 레시피가 없어 원재료 필요량을 계산할 수 없습니다.</td></tr>'
        }
      </tbody>
    </table>

    <div class="section-title">생산 완료 후 기입란</div>
    <div class="fill-grid">
      <table class="fill-table">
        <colgroup>
          <col class="label-col" />
          <col class="input-col" />
        </colgroup>
        <tbody>
          <tr>
            <th>완료수량</th>
            <td class="input-cell">
              <div class="entry-wrap">
                <div class="entry-space"></div>
                <div class="unit-hints">□ ea&nbsp;&nbsp;□ kg&nbsp;&nbsp;□ g</div>
              </div>
            </td>
          </tr>
          <tr>
            <th>불량수량</th>
            <td class="input-cell">
              <div class="entry-wrap">
                <div class="entry-space"></div>
                <div class="unit-hints">□ kg&nbsp;&nbsp;□ g</div>
              </div>
            </td>
          </tr>
          <tr>
            <th>샘플수량</th>
            <td class="input-cell">
              <div class="entry-wrap">
                <div class="entry-space"></div>
                <div class="unit-hints">□ kg&nbsp;&nbsp;□ g</div>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      <table class="sign-table">
        <tbody>
          <tr><th>작성자 서명</th><td></td></tr>
          <tr><th>확인자 서명</th><td></td></tr>
        </tbody>
      </table>
    </div>
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
