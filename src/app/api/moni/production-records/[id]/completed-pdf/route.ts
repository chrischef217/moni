import { NextRequest, NextResponse } from 'next/server'
import { createMoniServiceRoleClient } from '@/lib/moni/db'
import { GET as getBaseWorkOrderPdf } from '../pdf/route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type ExpansionRow = {
  material_id: string | null
  material_name: string
  packing_unit_g: number | null
  is_stock_managed?: boolean
  semi_product_g?: Record<string, number>
  final_input_g: number
}

type ExpansionPayload = {
  semi_product_columns?: Array<{ product_id: string; product_name: string }>
  rows?: ExpansionRow[]
  unresolved_items?: string[]
}

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
    const parsed = Number(value)
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

export async function GET(request: NextRequest, context: { params: { id: string } }) {
  try {
    const jsonUrl = new URL(request.url)
    jsonUrl.searchParams.set('format', 'json')
    const expansionResponse = await getBaseWorkOrderPdf(new NextRequest(jsonUrl), context)

    if (!expansionResponse.ok) {
      const htmlUrl = new URL(request.url)
      htmlUrl.searchParams.delete('format')
      return getBaseWorkOrderPdf(new NextRequest(htmlUrl), context)
    }

    const expansionJson = (await expansionResponse.json()) as {
      record?: Record<string, unknown>
      expansion?: ExpansionPayload
    }
    const expansion = expansionJson.expansion ?? {}

    const supabase = createMoniServiceRoleClient()
    const [recordResult, metadataResult] = await Promise.all([
      supabase.from('production_records').select('*').eq('id', context.params.id).maybeSingle(),
      supabase
        .from('production_completion_metadata')
        .select('*')
        .eq('production_record_id', context.params.id)
        .maybeSingle(),
    ])

    if (recordResult.error) throw new Error(recordResult.error.message)
    if (!recordResult.data) {
      return NextResponse.json({ ok: false, error: '작업지시서를 찾을 수 없습니다.' }, { status: 404 })
    }
    if (metadataResult.error) throw new Error(metadataResult.error.message)

    const record = recordResult.data as Record<string, unknown>
    const metadata = (metadataResult.data ?? {}) as Record<string, unknown>
    const semiColumns = expansion.semi_product_columns ?? []
    const rows = expansion.rows ?? []

    const headerCells = [
      '원재료명',
      '준비수량(ea)',
      '포장단위',
      ...semiColumns.map((column) => `${column.product_name}(g)`),
      '최종 투입량(g)',
    ]

    const bodyRows = rows.length
      ? rows
          .map((row) => {
            const packingUnitG = numberOrNull(row.packing_unit_g)
            const isStockManaged = row.is_stock_managed !== false
            const packageCount =
              isStockManaged && packingUnitG !== null && packingUnitG > 0
                ? Math.ceil(Number(row.final_input_g ?? 0) / packingUnitG)
                : null
            const countText = !isStockManaged ? '-' : packageCount === null ? '확인 필요' : `${formatNumber(packageCount)}ea`
            const unitText = !isStockManaged ? '해당 없음' : formatPackingWeight(packingUnitG)
            const semiCells = semiColumns
              .map((column) => `<td class="number">${escapeHtml(formatNumber(row.semi_product_g?.[column.product_id] ?? 0))}</td>`)
              .join('')

            return `<tr>
              <td>${escapeHtml(row.material_name)}</td>
              <td class="package-count">${escapeHtml(countText)}</td>
              <td class="package-unit">${escapeHtml(unitText)}</td>
              ${semiCells}
              <td class="number final-input">${escapeHtml(formatNumber(row.final_input_g))}</td>
            </tr>`
          })
          .join('')
      : `<tr><td colspan="${headerCells.length}">원재료 필요량을 계산할 수 없습니다.</td></tr>`

    const actualText = formatInputValue(
      metadata.actual_input_value,
      metadata.actual_input_unit,
      record.actual_quantity_g,
      record.actual_quantity_ea,
    )
    const defectText = formatInputValue(
      metadata.defect_input_value,
      metadata.defect_input_unit,
      record.defect_quantity_g,
    )
    const samples = normalizeSampleEntries(metadata.sample_entries)
    const sampleRows = samples.length
      ? samples
          .map((sample, index) => {
            const value = numberOrNull(sample.value)
            const unit = sample.unit === 'kg' ? 'kg' : 'g'
            const grams = numberOrNull(sample.grams) ?? (value !== null ? (unit === 'kg' ? value * 1000 : value) : null)
            const display = value !== null ? `${formatNumber(value, 3)}${unit}` : grams !== null ? formatGram(grams) : '-'
            const converted = unit === 'kg' && grams !== null ? ` (${formatGram(grams)})` : ''
            return `<div>${escapeHtml(text(sample.label) || `샘플 ${index + 1}`)}: <strong>${escapeHtml(display + converted)}</strong></div>`
          })
          .join('')
      : `<div>샘플 합계: <strong>${escapeHtml(formatGram(record.sample_quantity_g))}</strong></div>`

    const productResult = await supabase
      .from('products')
      .select('report_number, weight_g')
      .eq('id', text(record.product_id))
      .maybeSingle()
    if (productResult.error) throw new Error(productResult.error.message)
    const productMeta = (productResult.data ?? {}) as Record<string, unknown>
    const packingUnitG = numberOrNull(record.production_unit_weight_g) ?? numberOrNull(productMeta.weight_g)
    const plannedG = numberOrNull(record.planned_quantity_g)
    const plannedEa = packingUnitG !== null && packingUnitG > 0 && plannedG !== null ? Math.ceil(plannedG / packingUnitG) : null

    const html = `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <title>작업지시서 ${escapeHtml(record.lot_number)}</title>
  <style>
    @page { size: A4; margin: 12mm; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Arial, "Malgun Gothic", sans-serif; color: #111827; background: #f3f4f6; }
    .page { width: 210mm; min-height: 297mm; margin: 0 auto; background: #fff; padding: 12mm; }
    h1 { margin: 0 0 10px; text-align: center; font-size: 24px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 8px; }
    th, td { border: 1px solid #111827; padding: 7px 8px; vertical-align: middle; }
    th { background: #e5e7eb; text-align: left; white-space: nowrap; }
    .compact { table-layout: fixed; }
    .compact col.label { width: 18%; }
    .compact col.value { width: 32%; }
    .section-title { margin-top: 14px; font-size: 16px; font-weight: 700; }
    .number { text-align: right; white-space: nowrap; }
    .final-input { font-weight: 700; }
    .package-count, .package-unit { text-align: center; font-weight: 700; white-space: nowrap; }
    .completion-grid { display: grid; grid-template-columns: 2fr 1fr; gap: 12px; margin-top: 8px; align-items: stretch; }
    .completion-table, .people-table { table-layout: fixed; margin-top: 0; height: 100%; }
    .completion-table th { width: 26%; }
    .completion-table td { min-height: 42px; }
    .sample-list { display: flex; flex-direction: column; gap: 5px; }
    .people-table th { width: 38%; }
    .people-table td { font-weight: 700; font-size: 15px; }
    .note { margin-top: 7px; color: #374151; font-size: 11px; }
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

    <div class="section-title">원재료 준비 체크리스트</div>
    <table>
      <thead><tr>${headerCells.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr></thead>
      <tbody>${bodyRows}</tbody>
    </table>
    <div class="note">※ 준비수량은 최종 투입량과 포장단위를 기준으로 현장에서 준비해야 할 정수 ea로 표시합니다.</div>

    <div class="section-title">생산 완료 입력 내역</div>
    <div class="completion-grid">
      <table class="completion-table">
        <tbody>
          <tr><th>완료수량</th><td>${escapeHtml(actualText)}</td></tr>
          <tr><th>불량수량</th><td>${escapeHtml(defectText)}</td></tr>
          <tr><th>샘플수량</th><td><div class="sample-list">${sampleRows}<div>샘플 합계: <strong>${escapeHtml(formatGram(record.sample_quantity_g))}</strong></div></div></td></tr>
        </tbody>
      </table>
      <table class="people-table">
        <tbody>
          <tr><th>작성자</th><td>${escapeHtml(text(metadata.writer_name) || '-')}</td></tr>
          <tr><th>확인자</th><td>${escapeHtml(text(metadata.reviewer_name) || '-')}</td></tr>
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
