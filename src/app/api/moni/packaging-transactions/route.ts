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

function normalizeType(value: string): '입고' | '출고' {
  const raw = value.toUpperCase()
  if (raw.includes('INBOUND') || raw.includes('입고')) return '입고'
  return '출고'
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
      .from('packaging_transactions')
      .select('*')
      .order('txn_date', { ascending: true })
      .order('created_at', { ascending: true })

    if (from) query = query.gte('txn_date', from)
    if (to) query = query.lte('txn_date', to)

    const [txResult, materialsResult] = await Promise.all([
      query,
      supabase.from('packaging_materials').select('id, material_code, material_name, unit_price'),
    ])
    if (txResult.error) throw new Error(txResult.error.message || '부재료 수불 내역 조회에 실패했습니다.')
    if (materialsResult.error) throw new Error(materialsResult.error.message || '부재료 목록 조회에 실패했습니다.')

    const materialMetaMap = new Map<string, { name: string; unitPrice: number }>()
    for (const row of (materialsResult.data ?? []) as Array<{
      id?: string | null
      material_code?: string | null
      material_name?: string | null
      unit_price?: string | number | null
    }>) {
      const name = text(row.material_name)
      if (!name) continue
      const id = text(row.id)
      const code = text(row.material_code)
      const meta = { name, unitPrice: Math.max(0, numberValue(row.unit_price)) }
      if (id) materialMetaMap.set(id, meta)
      if (code) materialMetaMap.set(code, meta)
    }

    const keyword = materialName.trim().toLowerCase()
    const rows = []
    const runningBalanceByMaterial = new Map<string, number>()

    for (const row of (txResult.data ?? []) as TxRow[]) {
      const code = text(row.material_code)
      const materialMeta = materialMetaMap.get(code)
      const name = (materialMeta?.name ?? code) || '부재료명 확인 필요'
      if (keyword && !name.toLowerCase().includes(keyword)) continue

      const qty = numberValue(row.quantity)
      const txType = normalizeType(text(row.txn_type))
      const inboundEa = txType === '입고' ? qty : 0
      const outboundEa = txType === '출고' ? qty : 0
      const runningBalance = (runningBalanceByMaterial.get(code) ?? 0) + inboundEa - outboundEa
      runningBalanceByMaterial.set(code, runningBalance)

      rows.push({
        id: text(row.id),
        material_code: code,
        material_name: name,
        tx_date: resolveDate(row),
        tx_type: txType,
        counterparty: text(row.counterparty) || text(row.supplier) || (txType === '입고' ? '입고' : '출고'),
        inbound_ea: inboundEa,
        outbound_ea: outboundEa,
        balance_ea: runningBalance,
        unit_price: materialMeta?.unitPrice ?? 0,
        note: text(row.note),
      })
    }

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
    const message = error instanceof Error ? error.message : '부재료 수불 내역 조회 중 오류가 발생했습니다.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) {
      return NextResponse.json({ ok: false, error: '요청 본문이 필요합니다.' }, { status: 400 })
    }

    const materialCode = text(body.material_code) || text(body.material_id)
    if (!materialCode) {
      return NextResponse.json({ ok: false, error: '부재료를 선택해 주세요.' }, { status: 400 })
    }

    const quantity = nullableNumber(body.quantity)
    if (quantity === null || quantity <= 0) {
      return NextResponse.json({ ok: false, error: '입고수량은 0보다 커야 합니다.' }, { status: 400 })
    }

    const txDate = text(body.tx_date) || new Date().toISOString().slice(0, 10)
    const counterparty = text(body.counterparty)
    const note = text(body.note)

    const supabase = createMoniServiceRoleClient()
    const materialResult = await supabase
      .from('packaging_materials')
      .select('id, material_code, material_name, current_stock, business_id')
      .or(`id.eq.${materialCode},material_code.eq.${materialCode}`)
      .limit(1)
      .maybeSingle()
    if (materialResult.error) throw new Error(materialResult.error.message || '부재료 조회에 실패했습니다.')
    if (!materialResult.data) {
      return NextResponse.json({ ok: false, error: '선택한 부재료를 찾을 수 없습니다.' }, { status: 404 })
    }

    const material = materialResult.data as {
      id?: string | null
      material_code?: string | null
      material_name?: string | null
      current_stock?: number | string | null
      business_id?: string | null
    }
    const targetId = text(material.id) || materialCode
    const targetCode = text(material.material_code) || targetId
    const currentStock = numberValue(material.current_stock)
    const nextStock = currentStock + quantity
    const businessId = text(body.business_id) || text(material.business_id) || '20220523011'

    const updateResult = await supabase.from('packaging_materials').update({ current_stock: nextStock }).eq('id', targetId)
    if (updateResult.error) throw new Error(updateResult.error.message || '부재료 재고 갱신에 실패했습니다.')

    const txPayload = {
      id: `PKGTX-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      material_code: targetCode,
      txn_type: 'INBOUND',
      quantity,
      txn_date: txDate,
      note: note || counterparty || null,
      business_id: businessId,
    }
    const txResult = await supabase.from('packaging_transactions').insert(txPayload)
    if (txResult.error) {
      await supabase.from('packaging_materials').update({ current_stock: currentStock }).eq('id', targetId)
      throw new Error(txResult.error.message || '부재료 입고 기록 저장에 실패했습니다.')
    }

    return NextResponse.json(
      {
        ok: true,
        material: {
          id: targetId,
          material_code: targetCode,
          material_name: text(material.material_name) || targetCode,
          current_stock: nextStock,
        },
      },
      { status: 200 },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : '부재료 입고 등록 중 오류가 발생했습니다.'
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

    const txDate = text(body.tx_date) || new Date().toISOString().slice(0, 10)
    const counterparty = text(body.counterparty)
    const note = text(body.note)

    const supabase = createMoniServiceRoleClient()
    const txResult = await supabase.from('packaging_transactions').select('*').eq('id', id).maybeSingle()
    if (txResult.error) throw new Error(txResult.error.message || '거래내역 조회에 실패했습니다.')
    if (!txResult.data) {
      return NextResponse.json({ ok: false, error: '내역을 찾을 수 없습니다.' }, { status: 404 })
    }

    const txRow = txResult.data as TxRow
    if (!isInbound(text(txRow.txn_type))) {
      return NextResponse.json(
        { ok: false, error: '자동 출고 내역은 수정할 수 없습니다.' },
        { status: 409 },
      )
    }

    const materialCode = text(txRow.material_code)
    if (!materialCode) {
      return NextResponse.json({ ok: false, error: '부재료 연결 정보가 없습니다.' }, { status: 422 })
    }

    const materialResult = await supabase
      .from('packaging_materials')
      .select('id, material_code, material_name, current_stock')
      .or(`id.eq.${materialCode},material_code.eq.${materialCode}`)
      .limit(1)
      .maybeSingle()
    if (materialResult.error) throw new Error(materialResult.error.message || '부재료 조회에 실패했습니다.')
    if (!materialResult.data) {
      return NextResponse.json({ ok: false, error: '연결된 부재료를 찾을 수 없습니다.' }, { status: 404 })
    }

    const material = materialResult.data as {
      id?: string | null
      material_code?: string | null
      material_name?: string | null
      current_stock?: number | string | null
    }
    const targetId = text(material.id) || materialCode
    const currentStock = numberValue(material.current_stock)
    const oldQty = numberValue(txRow.quantity)
    const nextStock = currentStock - oldQty + quantity
    if (nextStock < 0) {
      return NextResponse.json({ ok: false, error: '수정 후 현재재고가 0보다 작아집니다.' }, { status: 409 })
    }

    const updateStock = await supabase.from('packaging_materials').update({ current_stock: nextStock }).eq('id', targetId)
    if (updateStock.error) throw new Error(updateStock.error.message || '부재료 재고 갱신에 실패했습니다.')

    const updateTx = await supabase
      .from('packaging_transactions')
      .update({
        quantity,
        txn_date: txDate,
        note: note || counterparty || null,
      })
      .eq('id', id)
    if (updateTx.error) {
      await supabase.from('packaging_materials').update({ current_stock: currentStock }).eq('id', targetId)
      throw new Error(updateTx.error.message || '거래내역 수정에 실패했습니다.')
    }

    return NextResponse.json(
      {
        ok: true,
        material: {
          id: targetId,
          material_code: text(material.material_code) || materialCode,
          material_name: text(material.material_name) || materialCode,
          current_stock: nextStock,
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
    const txResult = await supabase.from('packaging_transactions').select('*').eq('id', id).maybeSingle()
    if (txResult.error) throw new Error(txResult.error.message || '거래내역 조회에 실패했습니다.')
    if (!txResult.data) {
      return NextResponse.json({ ok: false, error: '내역을 찾을 수 없습니다.' }, { status: 404 })
    }

    const txRow = txResult.data as TxRow
    if (!isInbound(text(txRow.txn_type))) {
      return NextResponse.json(
        { ok: false, error: '자동 출고 내역은 삭제할 수 없습니다.' },
        { status: 409 },
      )
    }

    const materialCode = text(txRow.material_code)
    if (!materialCode) {
      return NextResponse.json({ ok: false, error: '부재료 연결 정보가 없습니다.' }, { status: 422 })
    }

    const materialResult = await supabase
      .from('packaging_materials')
      .select('id, material_code, material_name, current_stock')
      .or(`id.eq.${materialCode},material_code.eq.${materialCode}`)
      .limit(1)
      .maybeSingle()
    if (materialResult.error) throw new Error(materialResult.error.message || '부재료 조회에 실패했습니다.')
    if (!materialResult.data) {
      return NextResponse.json({ ok: false, error: '연결된 부재료를 찾을 수 없습니다.' }, { status: 404 })
    }

    const material = materialResult.data as {
      id?: string | null
      material_code?: string | null
      material_name?: string | null
      current_stock?: number | string | null
    }
    const targetId = text(material.id) || materialCode
    const currentStock = numberValue(material.current_stock)
    const qty = numberValue(txRow.quantity)
    const nextStock = currentStock - qty
    if (nextStock < 0) {
      return NextResponse.json({ ok: false, error: '현재재고가 부족해 삭제할 수 없습니다.' }, { status: 409 })
    }

    const updateStock = await supabase.from('packaging_materials').update({ current_stock: nextStock }).eq('id', targetId)
    if (updateStock.error) throw new Error(updateStock.error.message || '부재료 재고 갱신에 실패했습니다.')

    const deleteTx = await supabase.from('packaging_transactions').delete().eq('id', id)
    if (deleteTx.error) {
      await supabase.from('packaging_materials').update({ current_stock: currentStock }).eq('id', targetId)
      throw new Error(deleteTx.error.message || '거래내역 삭제에 실패했습니다.')
    }

    return NextResponse.json(
      {
        ok: true,
        material: {
          id: targetId,
          material_code: text(material.material_code) || materialCode,
          material_name: text(material.material_name) || materialCode,
          current_stock: nextStock,
        },
      },
      { status: 200 },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : '거래내역 삭제 중 오류가 발생했습니다.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
