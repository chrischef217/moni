/**
 * 서식 기반 보고서 생성 API
 * GET /api/export/report?type=work_log&production_id=xxx
 * GET /api/export/report?type=production_daily&date=YYYY-MM-DD
 * GET /api/export/report?type=raw_material_ledger&month=YYYY-MM
 */
import { NextRequest, NextResponse } from 'next/server'
import {
  Document, Packer, Paragraph, Table, TableRow, TableCell,
  TextRun, HeadingLevel, AlignmentType, BorderStyle, WidthType,
  TableLayoutType,
} from 'docx'
import { supabase } from '@/lib/supabase'

const BORDER = { style: BorderStyle.SINGLE, size: 1, color: '374151' }
const BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER }

// 테이블 셀 헬퍼
function cell(text: string, bold = false, width?: number) {
  return new TableCell({
    borders: BORDERS,
    width: width ? { size: width, type: WidthType.DXA } : undefined,
    children: [
      new Paragraph({
        children: [new TextRun({ text: String(text ?? '-'), bold, size: 18 })],
        alignment: AlignmentType.CENTER,
      }),
    ],
  })
}

function headerRow(cols: string[]) {
  return new TableRow({ children: cols.map((c) => cell(c, true)) })
}

function dataRow(cols: string[]) {
  return new TableRow({ children: cols.map((c) => cell(c)) })
}

// ── 작업일지 생성 ─────────────────────────────────────────────
async function buildWorkLog(productionId: string) {
  // 생산 실적 조회
  const { data: prod } = await supabase
    .from('productions')
    .select('*')
    .eq('id', productionId)
    .single()

  if (!prod) throw new Error('생산 실적을 찾을 수 없습니다.')

  // 제품 정보 조회
  const { data: product } = await supabase
    .from('products')
    .select('*')
    .eq('product_code', prod.product_code)
    .maybeSingle()

  // BOM 조회
  const { data: bom } = await supabase
    .from('bom_items')
    .select('*')
    .eq('product_code', prod.product_code)
    .eq('business_id', 'default')

  // 원료 수불 내역 (해당 작업일)
  const { data: rawTxns } = await supabase
    .from('raw_material_transactions')
    .select('*')
    .eq('business_id', 'default')
    .eq('txn_date', prod.work_date)
    .eq('txn_type', 'OUTBOUND')

  const doc = new Document({
    sections: [{
      children: [
        // 제목
        new Paragraph({
          children: [new TextRun({ text: '작  업  일  지', bold: true, size: 32 })],
          alignment: AlignmentType.CENTER,
          heading: HeadingLevel.HEADING_1,
        }),
        new Paragraph({
          children: [new TextRun({ text: '생산 작업 일지', size: 22, color: '6B7280' })],
          alignment: AlignmentType.CENTER,
        }),
        new Paragraph({ text: '' }),

        // 제품 정보 섹션
        new Paragraph({ children: [new TextRun({ text: '▶ 제품 정보', bold: true, size: 22 })] }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          layout: TableLayoutType.FIXED,
          rows: [
            new TableRow({
              children: [
                cell('제품명', true), cell(prod.product_name),
                cell('제품코드', true), cell(prod.product_code ?? '-'),
              ],
            }),
            new TableRow({
              children: [
                cell('패킹중량', true), cell(product ? `${product.weight_g}g` : '-'),
                cell('보관방법', true), cell(product?.storage_method ?? '-'),
              ],
            }),
            new TableRow({
              children: [
                cell('소비기한', true), cell(product?.shelf_life ?? '-'),
                cell('제품형태', true), cell(product?.product_type ?? '-'),
              ],
            }),
          ],
        }),
        new Paragraph({ text: '' }),

        // 생산 정보 섹션
        new Paragraph({ children: [new TextRun({ text: '▶ 생산 정보', bold: true, size: 22 })] }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              children: [
                cell('작업일자', true), cell(prod.work_date),
                cell('요청수량', true), cell(`${(prod.requested_quantity_g ?? 0).toLocaleString()}g`),
              ],
            }),
            new TableRow({
              children: [
                cell('생산수량', true), cell(`${(prod.quantity_ok_g ?? 0).toLocaleString()}g`),
                cell('불량수량', true), cell(`${(prod.quantity_ng_g ?? 0).toLocaleString()}g`),
              ],
            }),
            new TableRow({
              children: [
                cell('샘플수량', true), cell(`${(prod.sample_quantity_g ?? 0).toLocaleString()}g`),
                cell('작업자', true), cell(prod.worker_name ?? '-'),
              ],
            }),
            new TableRow({
              children: [
                cell('시작시간', true), cell(prod.start_time ?? '-'),
                cell('종료시간', true), cell(prod.end_time ?? '-'),
              ],
            }),
          ],
        }),
        new Paragraph({ text: '' }),

        // BOM 정보 섹션
        new Paragraph({ children: [new TextRun({ text: '▶ BOM 정보 (배합표)', bold: true, size: 22 })] }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            headerRow(['번호', '원료명', '비율(%)', '필요량(g)', '비고']),
            ...(bom && bom.length > 0
              ? bom.map((b, i) => dataRow([
                  String(i + 1),
                  b.raw_name,
                  `${b.ratio_percent}%`,
                  `${Math.round((prod.requested_quantity_g ?? 0) * b.ratio_percent / 100).toLocaleString()}`,
                  b.note ?? '-',
                ]))
              : [dataRow(['-', 'BOM 미등록', '-', '-', '-'])]),
          ],
        }),
        new Paragraph({ text: '' }),

        // 원료 수불 내역
        new Paragraph({ children: [new TextRun({ text: '▶ 원료 수불 내역', bold: true, size: 22 })] }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            headerRow(['원료명', '사용량(g)', '비고']),
            ...(rawTxns && rawTxns.length > 0
              ? rawTxns.map((t) => dataRow([t.item_name, `${t.quantity_g.toLocaleString()}`, t.note ?? '-']))
              : [dataRow(['-', '-', '수불 내역 없음'])]),
          ],
        }),
        new Paragraph({ text: '' }),

        // 비고
        new Paragraph({ children: [new TextRun({ text: `비고: ${prod.note ?? '없음'}`, size: 18 })] }),
        new Paragraph({ text: '' }),
        new Paragraph({
          children: [new TextRun({ text: '본 작업일지는 Moni(모니) AI 경영 도우미가 자동 생성하였습니다.', size: 16, color: '94a3b8', italics: true })],
          alignment: AlignmentType.CENTER,
        }),
      ],
    }],
  })

  return doc
}

// ── 일일 생산현황 생성 ───────────────────────────────────────
async function buildProductionDaily(date: string) {
  const { data: prods } = await supabase
    .from('productions')
    .select('*')
    .eq('work_date', date)
    .eq('business_id', 'default')
    .order('created_at')

  const doc = new Document({
    sections: [{
      children: [
        new Paragraph({
          children: [new TextRun({ text: `${date} 일일 생산현황`, bold: true, size: 28 })],
          alignment: AlignmentType.CENTER,
        }),
        new Paragraph({ text: '' }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            headerRow(['제품명', '요청량(kg)', '생산량(kg)', '불량(kg)', '샘플(kg)', '시작', '종료', '작업자']),
            ...(prods && prods.length > 0
              ? prods.map((p) => dataRow([
                  p.product_name,
                  ((p.requested_quantity_g ?? 0) / 1000).toFixed(2),
                  ((p.quantity_ok_g ?? 0) / 1000).toFixed(2),
                  ((p.quantity_ng_g ?? 0) / 1000).toFixed(2),
                  ((p.sample_quantity_g ?? 0) / 1000).toFixed(2),
                  p.start_time ?? '-',
                  p.end_time ?? '-',
                  p.worker_name ?? '-',
                ]))
              : [dataRow(['생산 실적 없음', '-', '-', '-', '-', '-', '-', '-'])]),
          ],
        }),
      ],
    }],
  })

  return doc
}

// ── 원료수불부 생성 ───────────────────────────────────────────
async function buildRawMaterialLedger(month: string) {
  const startDate = `${month}-01`
  const endDate = `${month}-31`

  const { data: txns } = await supabase
    .from('raw_material_transactions')
    .select('*')
    .eq('business_id', 'default')
    .gte('txn_date', startDate)
    .lte('txn_date', endDate)
    .order('txn_date')

  const doc = new Document({
    sections: [{
      children: [
        new Paragraph({
          children: [new TextRun({ text: `${month} 원료 수불부`, bold: true, size: 28 })],
          alignment: AlignmentType.CENTER,
        }),
        new Paragraph({ text: '' }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            headerRow(['날짜', '원료명', '구분', '입고(kg)', '출고(kg)', '공급업체', '비고']),
            ...(txns && txns.length > 0
              ? txns.map((t) => dataRow([
                  t.txn_date,
                  t.item_name,
                  t.txn_type === 'INBOUND' ? '입고' : '출고',
                  t.txn_type === 'INBOUND' ? (t.quantity_g / 1000).toFixed(3) : '-',
                  t.txn_type === 'OUTBOUND' ? (t.quantity_g / 1000).toFixed(3) : '-',
                  t.supplier ?? '-',
                  t.note ?? '-',
                ]))
              : [dataRow(['-', '수불 내역 없음', '-', '-', '-', '-', '-'])]),
          ],
        }),
      ],
    }],
  })

  return doc
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const type = searchParams.get('type') ?? 'work_log'
    const productionId = searchParams.get('production_id') ?? ''
    const date = searchParams.get('date') ?? new Date().toISOString().slice(0, 10)
    const month = searchParams.get('month') ?? new Date().toISOString().slice(0, 7)

    let doc: Document
    let filename: string

    if (type === 'work_log') {
      if (!productionId) {
        return NextResponse.json({ error: 'production_id 파라미터가 필요합니다.' }, { status: 400 })
      }
      doc = await buildWorkLog(productionId)
      filename = encodeURIComponent(`작업일지_${date}.docx`)
    } else if (type === 'production_daily') {
      doc = await buildProductionDaily(date)
      filename = encodeURIComponent(`일일생산현황_${date}.docx`)
    } else if (type === 'raw_material_ledger') {
      doc = await buildRawMaterialLedger(month)
      filename = encodeURIComponent(`원료수불부_${month}.docx`)
    } else {
      return NextResponse.json({ error: '지원하지 않는 type입니다.' }, { status: 400 })
    }

    const buf = await Packer.toBuffer(doc)
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename*=UTF-8''${filename}`,
      },
    })
  } catch (error) {
    console.error('보고서 생성 오류:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
