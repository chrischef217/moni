import { NextRequest, NextResponse } from 'next/server'
import { createMoniServiceRoleClient } from '@/lib/moni/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type TxRow = Record<string, unknown>

function text(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : ''
}

function numberValue(value: unknown): number {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function nullableNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value.trim())
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function normalizeType(value: string): '입고' | '소모' {
  const raw = value.toUpperCase()
  if (raw.includes('INBOUND') || raw.includes('입고')) return '입고'
  return '소모'
}

function resolveDate(row: TxRow): string {
  return text(row.txn_date) || text(row.created_at) || ''
}

function isInbound(txType: string) {
  return txType.toUpperCase().includes('INBOUND')
}

export async function GET(request: NextRequest) {
  try {
    const materialName = text(request.nextUrl.searchParams.get('material_name'))
    const from = text(request.nextUrl.searchParams.get('from'))
    const to = text(request.nextUrl.searchParams.get('to'))

    const supabase = createMoniServiceRoleClient()
    let query = supabase
      .from('raw_material_transactions')
      .select('*')
      .order('txn_date', { ascending: true })
      .order('created_at', { ascending: true })

    if (from) query = query.gte('txn_date', from)
    if (to) query = query.lte('txn_date', to)

    const { data, error } = await query
    if (error) throw new Error(error.message || '원재료 거래내역 조회에 실패했습니다.')

    let runningBalance = 0
    const normalizedKeyword = materialName.trim().toLowerCase()
    const allRows = ((data ?? []) as TxRow[]).map((row) => {
      const materialLabel = text(row.raw_material_name) || text(row.item_name)
      const qtyG = numberValue(row.quantity_g ?? row.quantity ?? 0)
      const txType = normalizeType(text(row.txn_type))
      const inboundG = txType === '입고' ? qtyG : 0
      const outboundG = txType === '소모' ? qtyG : 0
      runningBalance += inboundG - outboundG
      const note = text(row.note)
      const useTarget =
        txType === '입고'
          ? text(row.supplier) || '입고'
          : note.includes('production_record_id=') || note.includes('lot_number=')
            ? note
            : '생산소모'

      return {
        id: text(row.id),
        material_name: materialLabel,
        tx_date: resolveDate(row),
        tx_type: txType,
        counterparty: useTarget,
        inbound_g: inboundG,
        outbound_g: outboundG,
        balance_g: numberValue(row.total_quantity_g) || runningBalance,
        note,
      }
    })

    const rows = normalizedKeyword
      ? allRows.filter((row) => row.material_name.toLowerCase().includes(normalizedKeyword))
      : allRows

    return NextResponse.json(
      {
        ok: true,
        material_name: materialName || null,
        balance_mode: 'period_cumulative',
        rows,
      },
      { status: 200 },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : '원재료 거래내역 조회 중 오류가 발생했습니다.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) {
      return NextResponse.json({ ok: false, error: '요청 본문이 필요합니다.' }, { status: 400 })
    }

    const rawMaterialId = text(body.raw_material_id)
    if (!rawMaterialId) {
      return NextResponse.json({ ok: false, error: '원재료를 선택해 주세요.' }, { status: 400 })
    }

    const quantity = nullableNumber(body.quantity)
    if (quantity === null || quantity <= 0) {
      return NextResponse.json({ ok: false, error: '입고수량은 0보다 커야 합니다.' }, { status: 400 })
    }

    const unitRaw = text(body.unit).toLowerCase()
    const unit = unitRaw === 'kg' ? 'kg' : 'g'
    const quantityG = unit === 'kg' ? quantity * 1000 : quantity
    if (quantityG <= 0) {
      return NextResponse.json({ ok: false, error: '입고수량은 0보다 커야 합니다.' }, { status: 400 })
    }

    const txDate = text(body.tx_date) || new Date().toISOString().slice(0, 10)
    const counterparty = text(body.counterparty)
    const note = text(body.note)
    const unitPrice = nullableNumber(body.unit_price)

    const supabase = createMoniServiceRoleClient()
    const materialResult = await supabase
      .from('raw_materials')
      .select('id, item_name, current_stock_g, business_id')
      .eq('id', rawMaterialId)
      .maybeSingle()
    if (materialResult.error) throw new Error(materialResult.error.message || '원재료 조회에 실패했습니다.')
    if (!materialResult.data) {
      return NextResponse.json({ ok: false, error: '선택한 원재료를 찾을 수 없습니다.' }, { status: 404 })
    }

    const material = materialResult.data as {
      id: string
      item_name?: string | null
      current_stock_g?: number | string | null
      business_id?: string | null
    }
    const currentStockG = numberValue(material.current_stock_g)
    const nextStockG = currentStockG + quantityG
    const businessId = text(body.business_id) || text(material.business_id) || 'default'
    const rawMaterialName = text(body.raw_material_name) || text(material.item_name) || rawMaterialId

    const updateResult = await supabase.from('raw_materials').update({ current_stock_g: nextStockG }).eq('id', rawMaterialId)
    if (updateResult.error) throw new Error(updateResult.error.message || '원재료 재고 갱신에 실패했습니다.')

    const txPayload: Record<string, unknown> = {
      id: `RMT-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      raw_material_id: rawMaterialId,
      raw_material_name: rawMaterialName,
      item_name: rawMaterialName,
      txn_type: 'INBOUND',
      quantity_g: quantityG,
      total_quantity_g: nextStockG,
      txn_date: txDate,
      supplier: counterparty || null,
      unit_price: unitPrice,
      note: note || counterparty || null,
      business_id: businessId,
    }
    const txResult = await supabase.from('raw_material_transactions').insert(txPayload)
    if (txResult.error) {
      await supabase.from('raw_materials').update({ current_stock_g: currentStockG }).eq('id', rawMaterialId)
      throw new Error(txResult.error.message || '원재료 입고 기록 저장에 실패했습니다.')
    }

    return NextResponse.json(
      {
        ok: true,
        material: {
          id: rawMaterialId,
          item_name: rawMaterialName,
          current_stock_g: nextStockG,
        },
      },
      { status: 200 },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : '원재료 입고 등록 중 오류가 발생했습니다.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) {
      return NextResponse.json({ ok: false, error: '요청 본문이 필요합니다.' }, { status: 400 })
    }

    const id = text(body.id)
    if (!id) {
      return NextResponse.json({ ok: false, error: '거래 ID가 필요합니다.' }, { status: 400 })
    }

    const quantity = nullableNumber(body.quantity)
    if (quantity === null || quantity <= 0) {
      return NextResponse.json({ ok: false, error: '입고수량은 0보다 커야 합니다.' }, { status: 400 })
    }

    const unitRaw = text(body.unit).toLowerCase()
    const unit = unitRaw === 'kg' ? 'kg' : 'g'
    const nextQuantityG = unit === 'kg' ? quantity * 1000 : quantity
    if (nextQuantityG <= 0) {
      return NextResponse.json({ ok: false, error: '입고수량은 0보다 커야 합니다.' }, { status: 400 })
    }

    const txDate = text(body.tx_date) || new Date().toISOString().slice(0, 10)
    const counterparty = text(body.counterparty)
    const note = text(body.note)
    const unitPrice = nullableNumber(body.unit_price)

    const supabase = createMoniServiceRoleClient()
    const txResult = await supabase.from('raw_material_transactions').select('*').eq('id', id).maybeSingle()
    if (txResult.error) throw new Error(txResult.error.message || '거래내역 조회에 실패했습니다.')
    if (!txResult.data) {
      return NextResponse.json({ ok: false, error: '내역을 찾을 수 없습니다.' }, { status: 404 })
    }

    const txRow = txResult.data as TxRow
    if (!isInbound(text(txRow.txn_type))) {
      return NextResponse.json(
        { ok: false, error: '생산확정으로 생성된 출고/소모 내역은 수정할 수 없습니다.' },
        { status: 409 },
      )
    }

    const rawMaterialId = text(txRow.raw_material_id)
    if (!rawMaterialId) {
      return NextResponse.json({ ok: false, error: '원재료 연결 정보가 없습니다.' }, { status: 422 })
    }

    const oldQuantityG = numberValue(txRow.quantity_g ?? txRow.quantity ?? 0)
    const materialResult = await supabase
      .from('raw_materials')
      .select('id, item_name, current_stock_g')
      .eq('id', rawMaterialId)
      .maybeSingle()
    if (materialResult.error) throw new Error(materialResult.error.message || '원재료 조회에 실패했습니다.')
    if (!materialResult.data) {
      return NextResponse.json({ ok: false, error: '연결된 원재료를 찾을 수 없습니다.' }, { status: 404 })
    }

    const material = materialResult.data as {
      id: string
      item_name?: string | null
      current_stock_g?: number | string | null
    }

    const currentStockG = numberValue(material.current_stock_g)
    const nextStockG = currentStockG - oldQuantityG + nextQuantityG
    if (nextStockG < 0) {
      return NextResponse.json({ ok: false, error: '수정 후 현재재고가 0보다 작아집니다.' }, { status: 409 })
    }

    const updateStock = await supabase.from('raw_materials').update({ current_stock_g: nextStockG }).eq('id', rawMaterialId)
    if (updateStock.error) throw new Error(updateStock.error.message || '원재료 재고 갱신에 실패했습니다.')

    const updateTx = await supabase
      .from('raw_material_transactions')
      .update({
        quantity_g: nextQuantityG,
        total_quantity_g: nextStockG,
        txn_date: txDate,
        supplier: counterparty || null,
        unit_price: unitPrice,
        note: note || counterparty || null,
      })
      .eq('id', id)
    if (updateTx.error) {
      await supabase.from('raw_materials').update({ current_stock_g: currentStockG }).eq('id', rawMaterialId)
      throw new Error(updateTx.error.message || '거래내역 수정에 실패했습니다.')
    }

    return NextResponse.json(
      {
        ok: true,
        material: {
          id: material.id,
          item_name: text(material.item_name) || rawMaterialId,
          current_stock_g: nextStockG,
        },
      },
      { status: 200 },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : '거래내역 수정 중 오류가 발생했습니다.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = text(request.nextUrl.searchParams.get('id'))
    if (!id) {
      return NextResponse.json({ ok: false, error: '거래 ID가 필요합니다.' }, { status: 400 })
    }

    const supabase = createMoniServiceRoleClient()
    const txResult = await supabase.from('raw_material_transactions').select('*').eq('id', id).maybeSingle()
    if (txResult.error) throw new Error(txResult.error.message || '거래내역 조회에 실패했습니다.')
    if (!txResult.data) {
      return NextResponse.json({ ok: false, error: '내역을 찾을 수 없습니다.' }, { status: 404 })
    }

    const txRow = txResult.data as TxRow
    if (!isInbound(text(txRow.txn_type))) {
      return NextResponse.json(
        { ok: false, error: '생산확정으로 생성된 출고/소모 내역은 삭제할 수 없습니다.' },
        { status: 409 },
      )
    }

    const rawMaterialId = text(txRow.raw_material_id)
    if (!rawMaterialId) {
      return NextResponse.json({ ok: false, error: '원재료 연결 정보가 없습니다.' }, { status: 422 })
    }

    const qtyG = numberValue(txRow.quantity_g ?? txRow.quantity ?? 0)
    const materialResult = await supabase
      .from('raw_materials')
      .select('id, item_name, current_stock_g')
      .eq('id', rawMaterialId)
      .maybeSingle()
    if (materialResult.error) throw new Error(materialResult.error.message || '원재료 조회에 실패했습니다.')
    if (!materialResult.data) {
      return NextResponse.json({ ok: false, error: '연결된 원재료를 찾을 수 없습니다.' }, { status: 404 })
    }

    const material = materialResult.data as {
      id: string
      item_name?: string | null
      current_stock_g?: number | string | null
    }
    const currentStockG = numberValue(material.current_stock_g)
    const nextStockG = currentStockG - qtyG
    if (nextStockG < 0) {
      return NextResponse.json({ ok: false, error: '현재재고가 부족해 삭제할 수 없습니다.' }, { status: 409 })
    }

    const updateStock = await supabase.from('raw_materials').update({ current_stock_g: nextStockG }).eq('id', rawMaterialId)
    if (updateStock.error) throw new Error(updateStock.error.message || '원재료 재고 갱신에 실패했습니다.')

    const deleteTx = await supabase.from('raw_material_transactions').delete().eq('id', id)
    if (deleteTx.error) {
      await supabase.from('raw_materials').update({ current_stock_g: currentStockG }).eq('id', rawMaterialId)
      throw new Error(deleteTx.error.message || '거래내역 삭제에 실패했습니다.')
    }

    return NextResponse.json(
      {
        ok: true,
        material: {
          id: material.id,
          item_name: text(material.item_name) || rawMaterialId,
          current_stock_g: nextStockG,
        },
      },
      { status: 200 },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : '거래내역 삭제 중 오류가 발생했습니다.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
