import { NextRequest, NextResponse } from 'next/server'
import { createMoniServiceRoleClient } from '@/lib/moni/db'
import { expandProductionRecipe } from '@/lib/moni/recipeExpansion'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type SampleEntry = {
  label?: string
  value?: number
  unit?: 'kg' | 'g'
  grams?: number
}

function text(value: unknown): string {
  return String(value ?? '').trim()
}

function numberOrNull(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.trim().replaceAll(',', ''))
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function formatNumber(value: unknown, maximumFractionDigits = 0): string {
  const parsed = numberOrNull(value)
  if (parsed === null) return '-'
  return new Intl.NumberFormat('ko-KR', { maximumFractionDigits }).format(parsed)
}

function formatGram(value: unknown): string {
  const parsed = numberOrNull(value)
  if (parsed === null) return '-'
  return `${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 }).format(Math.round(parsed))}g`
}

function formatPackingWeight(valueG: number | null): string {
  if (valueG === null || !Number.isFinite(valueG) || valueG <= 0) return '규격 미등록'
  if (valueG >= 1000) {
    return `${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 3 }).format(valueG / 1000)}kg/ea`
  }
  return `${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 }).format(valueG)}g/ea`
}

function formatInputValue(value: unknown, unit: unknown, grams: unknown, fallbackEa?: unknown): string {
  const parsedValue = numberOrNull(value)
  const normalizedUnit = text(unit).toLowerCase()
  const parsedGrams = numberOrNull(grams)
  if (parsedValue !== null && ['ea', 'kg', 'g'].includes(normalizedUnit)) {
    const primary = `${formatNumber(parsedValue, 3)}${normalizedUnit}`
    if (normalizedUnit === 'g' || parsedGrams === null) return primary
    return `${primary} (${formatGram(parsedGrams)})`
  }

  const ea = numberOrNull(fallbackEa)
  if (ea !== null && ea > 0 && parsedGrams !== null) return `${formatNumber(ea)}ea (${formatGram(parsedGrams)})`
  if (parsedGrams !== null) return formatGram(parsedGrams)
  return '-'
}

function normalizeSampleEntries(value: unknown): SampleEntry[] {
  if (!Array.isArray(value)) return []
  return value
    .map((entry) => (entry ?? {}) as SampleEntry)
    .filter((entry) => numberOrNull(entry.value) !== null || numberOrNull(entry.grams) !== null)
}

function isCompletionRecorded(record: Record<string, unknown>): boolean {
  const status = text(record.status).toLowerCase()
  if (['completed', 'confirmed', '완료', '확정'].includes(status)) return true
  return (numberOrNull(record.actual_quantity_g) ?? 0) > 0
}

async function fetchCompletionMetadata(request: NextRequest, recordId: string): Promise<Record<string, unknown>> {
  const metadataUrl = new URL('/api/moni/production-completion-metadata', request.url)
  metadataUrl.searchParams.set('record_id', recordId)
  const response = await fetch(metadataUrl.toString(), { cache: 'no-store' })
  if (!response.ok) return {}
  const payload = (await response.json().catch(() => null)) as { metadata?: Record<string, unknown> | null } | null
  return (payload?.metadata ?? {}) as Record<string, unknown>
}

function buildErrorHtml(record: Record<string, unknown>, unresolvedItems: string[]): string {
  const items = Array.from(new Set(unresolvedItems.filter(Boolean)))
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <title>레시피 연결 확인 필요</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; background: #f3f4f6; color: #111827; font-family: Arial, "Malgun Gothic", sans-serif; }
    main { width: min(920px, calc(100% - 32px)); margin: 36px auto; background: #fff; border: 1px solid #d1d5db; padding: 28px; }
    h1 { margin: 0 0 12px; font-size: 24px; }
    .meta { display: grid; grid-template-columns: 120px 1fr; border: 1px solid #d1d5db; margin: 18px 0; }
    .meta div { padding: 9px 12px; border-bottom: 1px solid #e5e7eb; }
    .meta div:nth-child(odd) { background: #f9fafb; font-weight: 700; }
    .warning { border: 2px solid #dc2626; background: #fef2f2; padding: 18px; }
    .warning strong { color: #b91c1c; }
    li { margin: 7px 0; }
    button { margin-top: 18px; padding: 10px 16px; border: 0; background: #111827; color: #fff; cursor: pointer; }
  </style>
</head>
<body>
  <main>
    <h1>레시피 연결 확인 필요</h1>
    <p>완제품과 연결 반제품을 끝까지 전개했을 때 확인이 필요한 항목이 있어 작업지시서 인쇄를 차단했습니다.</p>
    <div class="meta">
      <div>LOT</div><div>${escapeHtml(record.lot_number)}</div>
      <div>제품명</div><div>${escapeHtml(record.product_name)}</div>
      <div>생산일자</div><div>${escapeHtml(record.work_date)}</div>
    </div>
    <div class="warning">
      <strong>관리자에서 아래 레시피 또는 원재료 연결을 먼저 확인해 주세요.</strong>
      <ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
    </div>
    <button type="button" onclick="window.close()">닫기</button>
  </main>
</body>
</html>`
}

export async function GET(request: NextRequest, context: { params: { id: string } }) {
  try {
    const supabase = createMoniServiceRoleClient()
    const recordResult = await supabase.from('production_records').select('*').eq('id', context.params.id).maybeSingle()
    if (recordResult.error) throw new Error(recordResult.error.message)
    if (!recordResult.data) {
      return NextResponse.json({ ok: false, error: '작업지시서를 찾을 수 없습니다.' }, { status: 404 })
    }

    const record = recordResult.data as Record<string, unknown>
    const plannedG = numberOrNull(record.planned_quantity_g)
    if (plannedG === null || plannedG <= 0) {
      return NextResponse.json({ ok: false, error: '예정 생산량이 없어 작업지시서를 계산할 수 없습니다.' }, { status: 422 })
    }

    const expansion = await expandProductionRecipe({
      productId: text(record.product_id),
      productName: text(record.product_name),
      quantityG: plannedG,
      businessId: text(record.business_id) || '20220523011',
    })

    if (request.nextUrl.searchParams.get('format') === 'json') {
      return NextResponse.json(
        { ok: expansion.unresolved_items.length === 0, record, expansion },
        { status: expansion.unresolved_items.length === 0 ? 200 : 422 },
      )
    }

    if (expansion.unresolved_items.length > 0 || expansion.has_cycle || expansion.max_depth_reached) {
      return new NextResponse(buildErrorHtml(record, expansion.unresolved_items), {
        status: 422,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      })
    }

    const metadata = await fetchCompletionMetadata(request, context.params.id)
    const completionRecorded = isCompletionRecorded(record)

    const productResult = await supabase
      .from('products')
      .select('report_number, weight_g')
      .eq('id', text(record.product_id))
      .maybeSingle()
    if (productResult.error) throw new Error(productResult.error.message)
    const productMeta = (productResult.data ?? {}) as Record<string, unknown>
    const packingUnitG = numberOrNull(record.production_unit_weight_g) ?? numberOrNull(productMeta.weight_g)
    const plannedEa = packingUnitG !== null && packingUnitG > 0 ? Math.ceil(plannedG / packingUnitG) : null

    const stageRows = expansion.semi_products.length
      ? expansion.semi_products
          .map((stage) => `<tr>
            <td class="center">${stage.depth}단계</td>
            <td><strong>${escapeHtml(stage.product_name)}</strong></td>
            <td>${escapeHtml(stage.parent_product_name)}</td>
            <td class="number">${escapeHtml(formatNumber(stage.ratio_from_parent, 3))}%</td>
            <td class="number"><strong>${escapeHtml(formatGram(stage.required_g))}</strong></td>
            <td class="center">${escapeHtml(stage.usage_type === 'inline' ? '동일 LOT 내 제조' : stage.usage_type || '동일 LOT 내 제조')}</td>
          </tr>`)
          .join('')
      : '<tr><td colspan="6" class="center">연결 반제품 없음</td></tr>'

    const headerCells = [
      '원재료명',
      '준비수량(ea)',
      '포장단위',
      '완제품 직접투입(g)',
      ...expansion.semi_product_columns.map((column) => `${column.product_name}(g)`),
      '최종 투입량(g)',
    ]

    const materialRows = expansion.materials.length
      ? expansion.materials
          .map((row) => {
            const packageCount =
              row.is_stock_managed && row.packing_unit_g !== null && row.packing_unit_g > 0
                ? Math.ceil(row.final_input_g / row.packing_unit_g)
                : null
            const countText = !row.is_stock_managed ? '-' : packageCount === null ? '확인 필요' : `${formatNumber(packageCount)}ea`
            const unitText = !row.is_stock_managed ? '해당 없음' : formatPackingWeight(row.packing_unit_g)
            const semiCells = expansion.semi_product_columns
              .map((column) => `<td class="number">${escapeHtml(formatNumber(row.semi_product_g[column.product_id] ?? 0))}</td>`)
              .join('')
            return `<tr>
              <td>${escapeHtml(row.material_name)}</td>
              <td class="package-count">${escapeHtml(countText)}</td>
              <td class="package-unit">${escapeHtml(unitText)}</td>
              <td class="number">${escapeHtml(formatNumber(row.direct_input_g))}</td>
              ${semiCells}
              <td class="number final-input">${escapeHtml(formatNumber(row.final_input_g))}</td>
            </tr>`
          })
          .join('')
      : `<tr><td colspan="${headerCells.length}" class="center">원재료 필요량을 계산할 수 없습니다.</td></tr>`

    const actualText = completionRecorded
      ? formatInputValue(metadata.actual_input_value, metadata.actual_input_unit, record.actual_quantity_g, record.actual_quantity_ea)
      : ''
    const defectText = completionRecorded
      ? formatInputValue(metadata.defect_input_value, metadata.defect_input_unit, record.defect_quantity_g)
      : ''
    const samples = completionRecorded ? normalizeSampleEntries(metadata.sample_entries) : []
    const sampleDetailRows = samples
      .map((sample, index) => {
        const value = numberOrNull(sample.value)
        const unit = sample.unit === 'kg' ? 'kg' : 'g'
        const grams = numberOrNull(sample.grams) ?? (value !== null ? (unit === 'kg' ? value * 1000 : value) : null)
        const display = value !== null ? `${formatNumber(value, 3)}${unit}` : grams !== null ? formatGram(grams) : '-'
        const converted = unit === 'kg' && grams !== null ? ` (${formatGram(grams)})` : ''
        return `<div>${escapeHtml(text(sample.label) || `샘플 ${index + 1}`)}: <strong>${escapeHtml(display + converted)}</strong></div>`
      })
      .join('')
    const sampleContent = completionRecorded
      ? `${sampleDetailRows}<div>샘플 합계: <strong>${escapeHtml(formatGram(record.sample_quantity_g))}</strong></div>`
      : '<div class="blank-area"></div>'
    const writerText = completionRecorded ? text(metadata.writer_name) || '-' : ''
    const reviewerText = completionRecorded ? text(metadata.reviewer_name) || '-' : ''
    const completionSectionTitle = completionRecorded ? '생산 완료 입력 내역' : '생산 완료 후 기입란'

    const html = `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <title>작업지시서 ${escapeHtml(record.lot_number)}</title>
  <style>
    @page { size: A4; margin: 10mm; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Arial, "Malgun Gothic", sans-serif; color: #111827; background: #f3f4f6; }
    .page { width: 210mm; min-height: 297mm; margin: 0 auto; background: #fff; padding: 10mm; }
    h1 { margin: 0 0 9px; text-align: center; font-size: 23px; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 7px; }
    th, td { border: 1px solid #111827; padding: 6px 6px; vertical-align: middle; }
    th { background: #e5e7eb; text-align: left; white-space: nowrap; }
    .compact { table-layout: fixed; font-size: 13px; }
    .compact col.label { width: 18%; }
    .compact col.value { width: 32%; }
    .section-title { margin-top: 12px; font-size: 15px; font-weight: 700; }
    .number { text-align: right; white-space: nowrap; }
    .center { text-align: center; }
    .final-input { font-weight: 700; }
    .package-count, .package-unit { text-align: center; font-weight: 700; white-space: nowrap; }
    .stage-table td:nth-child(2) { color: #065f46; }
    .completion-grid { display: grid; grid-template-columns: 2fr 1fr; gap: 10px; margin-top: 7px; align-items: stretch; }
    .completion-table, .people-table { table-layout: fixed; margin-top: 0; height: 100%; font-size: 13px; }
    .completion-table th { width: 26%; }
    .completion-table td { min-height: 42px; height: 48px; }
    .sample-list { display: flex; min-height: 70px; flex-direction: column; gap: 5px; }
    .blank-area { min-height: 62px; }
    .people-table th { width: 38%; }
    .people-table td { font-weight: 700; font-size: 15px; }
    .note { margin-top: 6px; color: #374151; font-size: 10px; line-height: 1.5; }
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
      <colgroup><col class="label" /><col class="value" /><col class="label" /><col class="value" /></colgroup>
      <tbody>
        <tr><th>LOT</th><td>${escapeHtml(record.lot_number)}</td><th>생산일자</th><td>${escapeHtml(record.work_date)}</td></tr>
        <tr><th>제품명</th><td>${escapeHtml(record.product_name)}</td><th>품목보고번호</th><td>${escapeHtml(text(productMeta.report_number) || '미등록')}</td></tr>
        <tr><th>패킹단위</th><td class="number">${packingUnitG !== null ? escapeHtml(formatGram(packingUnitG)) : '패킹단위 미등록'}</td><th>예정량</th><td class="number">${escapeHtml(formatGram(plannedG))}</td></tr>
        <tr><th>예정수량(ea)</th><td class="number">${plannedEa !== null ? `${escapeHtml(formatNumber(plannedEa))}ea` : '계산불가'}</td><th>생산단위</th><td>${escapeHtml(text(record.production_unit_name) || (packingUnitG !== null ? formatGram(packingUnitG) : '-'))}</td></tr>
      </tbody>
    </table>

    <div class="section-title">연결 반제품 제조 순서</div>
    <table class="stage-table">
      <thead><tr><th>단계</th><th>연결 반제품</th><th>상위 제품</th><th>상위 배합비</th><th>필요량</th><th>처리 방식</th></tr></thead>
      <tbody>${stageRows}</tbody>
    </table>
    <div class="note">※ 동일 LOT 내 제조 반제품은 별도 재고를 이중 차감하지 않고, 끝까지 전개된 실제 원재료만 차감합니다.</div>

    <div class="section-title">원재료 준비 체크리스트</div>
    <table>
      <thead><tr>${headerCells.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr></thead>
      <tbody>${materialRows}</tbody>
    </table>
    <div class="note">※ 준비수량은 최종 투입량과 포장단위를 기준으로 현장에서 준비해야 할 정수 ea로 표시합니다. 반제품 열은 해당 반제품을 현장에서 제조할 때 투입할 원재료 수량입니다.</div>

    <div class="section-title">${escapeHtml(completionSectionTitle)}</div>
    <div class="completion-grid">
      <table class="completion-table">
        <tbody>
          <tr><th>완료수량</th><td>${escapeHtml(actualText)}</td></tr>
          <tr><th>불량수량</th><td>${escapeHtml(defectText)}</td></tr>
          <tr><th>샘플수량</th><td><div class="sample-list">${sampleContent}</div></td></tr>
        </tbody>
      </table>
      <table class="people-table">
        <tbody>
          <tr><th>작성자</th><td>${escapeHtml(writerText)}</td></tr>
          <tr><th>확인자</th><td>${escapeHtml(reviewerText)}</td></tr>
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
    const message = error instanceof Error ? error.message : '작업지시서 PDF 생성 중 오류가 발생했습니다.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
