import { NextRequest, NextResponse } from 'next/server'
import { createMoniServiceRoleClient } from '@/lib/moni/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type TxRow = Record<string, unknown>

type MaterialMasterRow = {
  id?: string | number | null
  item_name?: string | null
}

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

function normalizeTypeCode(value: string): 'INBOUND' | 'OUTBOUND' {
  const raw = value.toUpperCase()
  if (raw.includes('INBOUND') || raw.includes('입고')) return 'INBOUND'
  return 'OUTBOUND'
}

function normalizeTypeLabel(typeCode: 'INBOUND' | 'OUTBOUND'): '입고' | '소모' {
  return typeCode === 'INBOUND' ? '입고' : '소모'
}

function resolveDate(row: TxRow): string {
  return text(row.txn_date) || text(row.transaction_date) || text(row.created_at) || ''
}

function resolveMaterialId(row: TxRow): string {
  return text(row.raw_material_id) || text(row.item_code)
}

function isInbound(txType: string) {
  return normalizeTypeCode(txType) === 'INBOUND'
}

export async function GET(request: NextRequest) {
  try {
    const materialId = text(request.nextUrl.searchParams.get('material_id'))
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

    const [{ data, error }, materialResult] = await Promise.all([
      query,
      supabase.from('raw_materials').select('id, item_name'),
    ])
    if (error) throw new Error(error.message || '원재료 거래내역 조회에 실패했습니다.')
    if (materialResult.error) throw new Error(materialResult.error.message || '원재료 마스터 조회에 실패했습니다.')

    const materialNameById = new Map<string, string>()
    for (const material of (materialResult.data ?? []) as MaterialMasterRow[]) {
      const id = text(material.id)
      const name = text(material.item_name)
      if (id && name) materialNameById.set(id, name)
    }

    const runningBalanceByMaterial = new Map<string, number>()
    const normalizedKeyword = materialName.toLowerCase()
    const allRows = ((data ?? []) as TxRow[]).map((row) => {
      const resolvedMaterialId = resolveMaterialId(row)
      const transactionLabel = text(row.raw_material_name) || text(row.item_name)
      const materialLabel = materialNameById.get(resolvedMaterialId) || transactionLabel || '원재료명 확인 필요'
      const materialKey = resolvedMaterialId || `name:${materialLabel.toLowerCase()}`
      const qtyG = numberValue(row.quantity_g ?? row.quantity ?? 0)
      const txTypeCode = normalizeTypeCode(text(row.txn_type) || text(row.transaction_type))
      const txType = normalizeTypeLabel(txTypeCode)
      const inboundG = txTypeCode === 'INBOUND' ? qtyG : 0
      const outboundG = txTypeCode === 'OUTBOUND' ? qtyG : 0
      const note = text(row.note)

      const prevBalance = runningBalanceByMaterial.get(materialKey) ?? 0
      const nextBalance = prevBalance + inboundG - outboundG
      runningBalanceByMaterial.set(materialKey, nextBalance)

      const useTarget =
        txTypeCode === 'INBOUND'
          ? text(row.supplier) || '입고'
          : note.includes('production_record_id=') || note.includes('lot_number=')
            ? note
            : '생산소모'

      return {
        id: text(row.id),
        material_id: resolvedMaterialId,
        item_code: text(row.item_code) || resolvedMaterialId,
        material_name: materialLabel,
        tx_date: resolveDate(row),
        tx_type: txType,
        tx_type_code: txTypeCode,
        counterparty: useTarget,
        inbound_g: inboundG,
        outbound_g: outboundG,
        balance_g: nextBalance,
        note,
      }
    })

    const rows = allRows.filter((row) => {
      if (materialId && row.material_id !== materialId && row.item_code !== materialId) return false
      if (normalizedKeyword && !row.material_name.toLowerCase().includes(normalizedKeyword)) return false
      return true
    })

    return NextResponse.json(
      {
        ok: true,
        material_id: materialId || null,
        material_name: materialName || null,
        balance_mode: 'item_code_period_cumulative',
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
    if (!body) return NextResponse.json({ ok: false, error: '요청 본문이 필요합니다.' }, { status: 400 })

    const rawMaterialId = text(body.raw_material_id)
    if (!rawMaterialId) return NextResponse.json({ ok: false, error: '원재료를 선택해 주세요.' }, { status: 400 })

    const quantity = nullableNumber(body.quantity)
    if (quantity === null || quantity <= 0) {
      return NextResponse.json({ ok: false, error: '입고수량은 0보다 커야 합니다.' }, { status: 400 })
    }

    const unitRaw = text(body.unit).toLowerCase()
    const unit = unitRaw === 'kg' ? 'kg' : 'g'
    const quantityG = unit === 'kg' ? quantity * 1000 : quantity
    if (quantityG <= 0) return NextResponse.json({ ok: false, error: '입고수량은 0보다 커야 합니다.' }, { status: 400 })

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
    if (!materialResult.data) return NextResponse.json({ ok: false, error: '선택한 원재료를 찾을 수 없습니다.' }, { status: 404 })

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
      item_code: rawMaterialId,
      raw_material_name: rawMaterialName,
      item_name: rawMaterialName,
      txn_type: 'INBOUND',
      transaction_type: 'INBOUND',
      quantity_g: quantityG,
      total_quantity_g: nextStockG,
      txn_date: txDate,
      transaction_date: txDate,
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

    return NextResponse.json({ ok: true, material: { id: rawMaterialId, item_name: rawMaterialName, current_stock_g: nextStockG } }, { status: 200 })
  } catch (error) {
    const message = error instanceof Error ? error.message : '원재료 입고 등록 중 오류가 발생했습니다.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) return NextResponse.json({ ok: false, error: '요청 본문이 필요합니다.' }, { status: 400 })

    const id = text(body.id)
    if (!id) return NextResponse.json({ ok: false, error: '거래 ID가 필요합니다.' }, { status: 400 })

    const quantity = nullableNumber(body.quantity)
    if (quantity === null || quantity <= 0) return NextResponse.json({ ok: false, error: '입고수량은 0보다 커야 합니다.' }, { status: 400 })

    const unitRaw = text(body.unit).toLowerCase()
    const unit = unitRaw === 'kg' ? 'kg' : 'g'
    const nextQuantityG = unit === 'kg' ? quantity * 1000 : quantity
    if (nextQuantityG <= 0) return NextResponse.json({ ok: false, error: '입고수량은 0보다 커야 합니다.' }, { status: 400 })

    const txDate = text(body.tx_date) || new Date().toISOString().slice(0, 10)
    const counterparty = text(body.counterparty)
    const note = text(body.note)
    const unitPrice = nullableNumber(body.unit_price)

    const supabase = createMoniServiceRoleClient()
    const txResult = await supabase.from('raw_material_transactions').select('*').eq('id', id).maybeSingle()
    if (txResult.error) throw new Error(txResult.error.message || '거래내역 조회에 실패했습니다.')
    if (!txResult.data) return NextResponse.json({ ok: false, error: '내역을 찾을 수 없습니다.' }, { status: 404 })

    const txRow = txResult.data as TxRow
    if (!isInbound(text(txRow.txn_type) || text(txRow.transaction_type))) {
      return NextResponse.json({ ok: false, error: '생산확정으로 생성된 소모 내역은 수정할 수 없습니다.' }, { status: 409 })
    }

    const rawMaterialId = resolveMaterialId(txRow)
    if (!rawMaterialId) return NextResponse.json({ ok: false, error: '원재료 연결 정보가 없습니다.' }, { status: 422 })

    const oldQuantityG = numberValue(txRow.quantity_g ?? txRow.quantity ?? 0)
    const materialResult = await supabase.from('raw_materials').select('id, item_name, current_stock_g').eq('id', rawMaterialId).maybeSingle()
    if (materialResult.error) throw new Error(materialResult.error.message || '원재료 조회에 실패했습니다.')
    if (!materialResult.data) return NextResponse.json({ ok: false, error: '연결된 원재료를 찾을 수 없습니다.' }, { status: 404 })

    const material = materialResult.data as { id: string; item_name?: string | null; current_stock_g?: number | string | null }
    const currentStockG = numberValue(material.current_stock_g)
    const nextStockG = currentStockG - oldQuantityG + nextQuantityG
    if (nextStockG < 0) return NextResponse.json({ ok: false, error: '수정 후 현재재고가 0보다 작아집니다.' }, { status: 409 })

    const updateStock = await supabase.from('raw_materials').update({ current_stock_g: nextStockG }).eq('id', rawMaterialId)
    if (updateStock.error) throw new Error(updateStock.error.message || '원재료 재고 갱신에 실패했습니다.')

    const updateTx = await supabase
      .from('raw_material_transactions')
      .update({
        raw_material_id: rawMaterialId,
        item_code: rawMaterialId,
        quantity_g: nextQuantityG,
        total_quantity_g: nextStockG,
        txn_date: txDate,
        transaction_date: txDate,
        supplier: counterparty || null,
        unit_price: unitPrice,
        note: note || counterparty || null,
      })
      .eq('id', id)
    if (updateTx.error) {
      await supabase.from('raw_materials').update({ current_stock_g: currentStockG }).eq('id', rawMaterialId)
      throw new Error(updateTx.error.message || '원재료 거래내역 수정에 실패했습니다.')
    }

    return NextResponse.json({ ok: true, material: { id: material.id, item_name: text(material.item_name) || rawMaterialId, current_stock_g: nextStockG } }, { status: 200 })
  } catch (error) {
    const message = error instanceof Error ? error.message : '원재료 거래내역 수정 중 오류가 발생했습니다.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = text(request.nextUrl.searchParams.get('id'))
    if (!id) return NextResponse.json({ ok: false, error: '거래 ID가 필요합니다.' }, { status: 400 })

    const supabase = createMoniServiceRoleClient()
    const txResult = await supabase.from('raw_material_transactions').select('*').eq('id', id).maybeSingle()
    if (txResult.error) throw new Error(txResult.error.message || '거래내역 조회에 실패했습니다.')
    if (!txResult.data) return NextResponse.json({ ok: false, error: '내역을 찾을 수 없습니다.' }, { status: 404 })

    const txRow = txResult.data as TxRow
    if (!isInbound(text(txRow.txn_type) || text(txRow.transaction_type))) {
      return NextResponse.json({ ok: false, error: '생산확정으로 생성된 소모 내역은 삭제할 수 없습니다.' }, { status: 409 })
    }

    const rawMaterialId = resolveMaterialId(txRow)
    if (!rawMaterialId) return NextResponse.json({ ok: false, error: '원재료 연결 정보가 없습니다.' }, { status: 422 })

    const qtyG = numberValue(txRow.quantity_g ?? txRow.quantity ?? 0)
    const materialResult = await supabase.from('raw_materials').select('id, item_name, current_stock_g').eq('id', rawMaterialId).maybeSingle()
    if (materialResult.error) throw new Error(materialResult.error.message || '원재료 조회에 실패했습니다.')
    if (!materialResult.data) return NextResponse.json({ ok: false, error: '연결된 원재료를 찾을 수 없습니다.' }, { status: 404 })

    const material = materialResult.data as { id: string; item_name?: string | null; current_stock_g?: number | string | null }
    const currentStockG = numberValue(material.current_stock_g)
    const nextStockG = currentStockG - qtyG
    if (nextStockG < 0) return NextResponse.json({ ok: false, error: '현재재고가 부족해 삭제할 수 없습니다.' }, { status: 409 })

    const updateStock = await supabase.from('raw_materials').update({ current_stock_g: nextStockG }).eq('id', rawMaterialId)
    if (updateStock.error) throw new Error(updateStock.error.message || '원재료 재고 갱신에 실패했습니다.')

    const deleteTx = await supabase.from('raw_material_transactions').delete().eq('id', id)
    if (deleteTx.error) {
      await supabase.from('raw_materials').update({ current_stock_g: currentStockG }).eq('id', rawMaterialId)
      throw new Error(deleteTx.error.message || '원재료 거래내역 삭제에 실패했습니다.')
    }

    return NextResponse.json({ ok: true, material: { id: material.id, item_name: text(material.item_name) || rawMaterialId, current_stock_g: nextStockG } }, { status: 200 })
  } catch (error) {
    const message = error instanceof Error ? error.message : '원재료 거래내역 삭제 중 오류가 발생했습니다.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
