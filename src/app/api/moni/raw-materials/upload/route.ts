import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { createMoniServiceRoleClient } from '@/lib/moni/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type ExcelRow = Array<string | number | null | undefined>

function text(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : ''
}

function numberValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value.trim())
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function dateValue(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value)
    if (parsed) {
      return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`
    }
  }
  return text(value)
}

async function readWorkbookRows(request: NextRequest): Promise<ExcelRow[]> {
  const formData = await request.formData()
  const file = formData.get('file')
  if (!(file instanceof File)) {
    throw new Error('업로드할 엑셀 파일이 필요합니다.')
  }

  const bytes = Buffer.from(await file.arrayBuffer())
  const workbook = XLSX.read(bytes, { type: 'buffer', cellDates: true })
  const worksheet = workbook.Sheets['원재료입고'] ?? workbook.Sheets[workbook.SheetNames[0]]
  if (!worksheet) throw new Error('원재료입고 시트를 찾을 수 없습니다.')

  return XLSX.utils.sheet_to_json<ExcelRow>(worksheet, { header: 1, defval: '' }).slice(2)
}

function makeRawMaterialId(index: number) {
  return `ITEM-${Date.now()}-${String(index + 1).padStart(3, '0')}`
}

function makeTransactionId(index: number) {
  return `RMT-${Date.now()}-${String(index + 1).padStart(3, '0')}`
}

export async function POST(request: NextRequest) {
  const errors: string[] = []
  let success = 0
  let skipped = 0

  try {
    const rows = await readWorkbookRows(request)
    const supabase = createMoniServiceRoleClient()

    for (let index = 0; index < rows.length; index += 1) {
      const rowNumber = index + 3
      const row = rows[index] ?? []
      const receivedDate = dateValue(row[0])
      const rawMaterialName = text(row[1])
      const foodTypeName = text(row[2])
      const supplier = text(row[3])
      const packQuantity = numberValue(row[4])
      const packingUnit = text(row[5])
      const packingWeightG = numberValue(row[6])
      const unitPriceWon = numberValue(row[7])
      const note = text(row[8])

      if (!receivedDate && !rawMaterialName && !foodTypeName && packQuantity === null) continue
      if (!receivedDate || !rawMaterialName || packQuantity === null || packingWeightG === null) {
        skipped += 1
        errors.push(`${rowNumber}행: 입고일자, 원재료명, 입고수량, 패킹중량g는 필수입니다.`)
        continue
      }

      const totalQuantityG = packQuantity * packingWeightG
      const { data: existingRows, error: findError } = await supabase
        .from('raw_materials')
        .select('*')
        .eq('item_name', rawMaterialName)
        .limit(1)
      if (findError) throw new Error(findError.message || '원재료 조회 실패')

      const existing = existingRows?.[0] as { id?: string; current_stock_g?: number | string | null } | undefined
      let rawMaterialId = existing?.id ? String(existing.id) : makeRawMaterialId(index)
      const currentStock = numberValue(existing?.current_stock_g) ?? 0
      const rawMaterialPayload = {
        item_name: rawMaterialName,
        item_code: rawMaterialId,
        supplier: supplier || null,
        unit_price_per_kg: unitPriceWon,
        packing_weight_g: packingWeightG,
        current_stock_g: currentStock + totalQuantityG,
        is_active: true,
        business_id: 'default',
      }

      const materialResult = existing
        ? await supabase.from('raw_materials').update(rawMaterialPayload).eq('id', rawMaterialId)
        : await supabase.from('raw_materials').insert({ id: rawMaterialId, ...rawMaterialPayload })
      if (materialResult.error) throw new Error(materialResult.error.message || '원재료 저장 실패')

      const transactionPayload = {
        id: makeTransactionId(index),
        item_code: rawMaterialId,
        item_name: rawMaterialName,
        txn_type: 'INBOUND',
        quantity_g: totalQuantityG,
        unit_price: unitPriceWon,
        txn_date: receivedDate,
        received_date: receivedDate,
        raw_material_id: rawMaterialId,
        raw_material_name: rawMaterialName,
        food_type_name: foodTypeName || null,
        supplier: supplier || null,
        received_pack_quantity: packQuantity,
        packing_unit: packingUnit || null,
        packing_weight_g: packingWeightG,
        total_quantity_g: totalQuantityG,
        unit_price_won: unitPriceWon,
        note: note || null,
        business_id: 'default',
      }
      const transactionResult = await supabase.from('raw_material_transactions').insert(transactionPayload)
      if (transactionResult.error) throw new Error(transactionResult.error.message || '입고 기록 저장 실패')

      success += 1
    }

    return NextResponse.json({ success, skipped, errors }, { status: 200 })
  } catch (error) {
    const message = error instanceof Error ? error.message : '원재료 입고 엑셀 업로드 중 오류가 발생했습니다.'
    return NextResponse.json({ success, skipped, errors: [...errors, message] }, { status: 500 })
  }
}
