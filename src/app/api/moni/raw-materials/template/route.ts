import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const rows = [
    ['입고일자', '원재료명', '식품유형_식약처기준', '공급업체', '입고수량_패킹단위', '패킹단위', '패킹중량g', '단가_원', '비고'],
    ['YYYY-MM-DD', '현장 원료명', '품목보고서 기준 유형', '거래처명', '숫자', '예: 18L드럼', '숫자', '숫자', '선택사항'],
    ['2024-01-15', '샘표 양조간장', '양조간장', '샘표식품', 5, '18L드럼', 19800, 45000, '초기 재고 이관'],
    ['2024-01-16', '해찬들 된장', '된장', 'CJ제일제당', 3, '18kg포대', 18000, 38000, ''],
  ]

  const worksheet = XLSX.utils.aoa_to_sheet(rows)
  worksheet['!cols'] = [
    { wch: 14 },
    { wch: 24 },
    { wch: 20 },
    { wch: 18 },
    { wch: 18 },
    { wch: 14 },
    { wch: 12 },
    { wch: 12 },
    { wch: 24 },
  ]

  for (let col = 0; col < rows[0].length; col += 1) {
    const headerRef = XLSX.utils.encode_cell({ r: 0, c: col })
    const guideRef = XLSX.utils.encode_cell({ r: 1, c: col })
    if (worksheet[headerRef]) worksheet[headerRef].s = { font: { bold: true } }
    if (worksheet[guideRef]) worksheet[guideRef].s = { font: { color: { rgb: '888888' } } }
  }

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, '원재료입고')
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="moni_raw_material_receipts_template.xlsx"',
    },
  })
}
