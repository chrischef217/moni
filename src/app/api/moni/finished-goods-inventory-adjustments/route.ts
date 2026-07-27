import { NextRequest, NextResponse } from 'next/server'
import { createMoniServiceRoleClient } from '@/lib/moni/db'
import { getSessionFromRequest } from '@/lib/allowance/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BUSINESS_ID = '20220523011'
const SELECT_FIELDS = 'id,business_id,product_id,adjustment_date,input_quantity,input_unit,balance_before_g,target_stock_g,adjustment_g,reason,created_at'

const todayKst = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date())
const text = (value: unknown) => String(value ?? '').trim()
const num = (value: unknown) => {
  const parsed = Number(value ?? NaN)
  return Number.isFinite(parsed) ? parsed : null
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

async function requireAdmin(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  return session?.role === 'admin' ? session : null
}

function validateAdjustmentBody(body: Record<string, unknown> | null) {
  if (!body) return { error: '재고조정 정보가 필요합니다.' as string }

  const productId = text(body.product_id)
  const adjustmentDate = text(body.adjustment_date)
  const inputUnit = text(body.input_unit).toLowerCase()
  const inputQuantity = num(body.input_quantity)
  const balanceBeforeG = num(body.balance_before_g)
  const reason = text(body.reason)

  if (!productId) return { error: '조정할 제품이 필요합니다.' }
  if (!validDate(adjustmentDate)) return { error: '조정 일자를 확인해 주세요.' }
  if (adjustmentDate > todayKst()) return { error: '미래 날짜로 재고조정할 수 없습니다.' }
  if (inputUnit !== 'kg' && inputUnit !== 'g') return { error: '입력 단위는 kg 또는 g만 사용할 수 있습니다.' }
  if (inputQuantity === null || inputQuantity < 0) return { error: '조정 후 재고 수량을 0 이상으로 입력해 주세요.' }
  if (balanceBeforeG === null) return { error: '조정 전 재고를 확인하지 못했습니다. 재고 새로고침 후 다시 시도해 주세요.' }
  if (!reason) return { error: '재고조정 사유를 입력해 주세요.' }

  const targetStockG = inputUnit === 'kg' ? inputQuantity * 1000 : inputQuantity
  const adjustmentG = targetStockG - balanceBeforeG
  if (Math.abs(adjustmentG) < 0.0001) return { error: '현재 재고와 동일하여 조정할 수량이 없습니다.' }

  return {
    value: {
      productId,
      adjustmentDate,
      inputUnit,
      inputQuantity,
      balanceBeforeG,
      targetStockG,
      adjustmentG,
      reason,
    },
  }
}

async function validateProduct(productId: string) {
  const client = createMoniServiceRoleClient()
  const product = await client
    .from('products')
    .select('id,product_name,product_type,is_active')
    .eq('id', productId)
    .maybeSingle()

  if (product.error) throw new Error(product.error.message)
  if (!product.data) return '조정할 제품을 찾을 수 없습니다.'
  if (product.data.is_active === false) return '비활성 제품은 재고조정할 수 없습니다.'
  return null
}

export async function GET(request: NextRequest) {
  try {
    if (!(await requireAdmin(request))) {
      return NextResponse.json({ ok: false, error: '관리자 권한이 필요합니다.' }, { status: 403 })
    }

    const client = createMoniServiceRoleClient()
    const result = await client
      .from('finished_goods_inventory_adjustments')
      .select(SELECT_FIELDS)
      .eq('business_id', BUSINESS_ID)
      .order('adjustment_date', { ascending: true })
      .order('created_at', { ascending: true })

    if (result.error) throw new Error(result.error.message)
    return NextResponse.json({ ok: true, adjustments: result.data ?? [] })
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : '재고조정 이력을 불러오지 못했습니다.',
    }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!(await requireAdmin(request))) {
      return NextResponse.json({ ok: false, error: '관리자 권한이 필요합니다.' }, { status: 403 })
    }

    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    const validation = validateAdjustmentBody(body)
    if ('error' in validation) return NextResponse.json({ ok: false, error: validation.error }, { status: 400 })
    const value = validation.value

    const productError = await validateProduct(value.productId)
    if (productError) return NextResponse.json({ ok: false, error: productError }, { status: 400 })

    const client = createMoniServiceRoleClient()
    const inserted = await client
      .from('finished_goods_inventory_adjustments')
      .insert({
        business_id: BUSINESS_ID,
        product_id: value.productId,
        adjustment_date: value.adjustmentDate,
        input_quantity: value.inputQuantity,
        input_unit: value.inputUnit,
        balance_before_g: value.balanceBeforeG,
        target_stock_g: value.targetStockG,
        adjustment_g: value.adjustmentG,
        reason: value.reason,
      })
      .select(SELECT_FIELDS)
      .single()

    if (inserted.error) throw new Error(inserted.error.message)
    return NextResponse.json({ ok: true, adjustment: inserted.data }, { status: 201 })
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : '재고조정 저장 중 오류가 발생했습니다.',
    }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    if (!(await requireAdmin(request))) {
      return NextResponse.json({ ok: false, error: '관리자 권한이 필요합니다.' }, { status: 403 })
    }

    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    const id = text(body?.id)
    if (!id) return NextResponse.json({ ok: false, error: '수정할 재고조정 이력이 필요합니다.' }, { status: 400 })

    const validation = validateAdjustmentBody(body)
    if ('error' in validation) return NextResponse.json({ ok: false, error: validation.error }, { status: 400 })
    const value = validation.value

    const productError = await validateProduct(value.productId)
    if (productError) return NextResponse.json({ ok: false, error: productError }, { status: 400 })

    const client = createMoniServiceRoleClient()
    const existing = await client
      .from('finished_goods_inventory_adjustments')
      .select('id')
      .eq('id', id)
      .eq('business_id', BUSINESS_ID)
      .maybeSingle()

    if (existing.error) throw new Error(existing.error.message)
    if (!existing.data) return NextResponse.json({ ok: false, error: '수정할 재고조정 이력을 찾을 수 없습니다.' }, { status: 404 })

    const updated = await client
      .from('finished_goods_inventory_adjustments')
      .update({
        product_id: value.productId,
        adjustment_date: value.adjustmentDate,
        input_quantity: value.inputQuantity,
        input_unit: value.inputUnit,
        balance_before_g: value.balanceBeforeG,
        target_stock_g: value.targetStockG,
        adjustment_g: value.adjustmentG,
        reason: value.reason,
      })
      .eq('id', id)
      .eq('business_id', BUSINESS_ID)
      .select(SELECT_FIELDS)
      .single()

    if (updated.error) throw new Error(updated.error.message)
    return NextResponse.json({ ok: true, adjustment: updated.data })
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : '재고조정 수정 중 오류가 발생했습니다.',
    }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    if (!(await requireAdmin(request))) {
      return NextResponse.json({ ok: false, error: '관리자 권한이 필요합니다.' }, { status: 403 })
    }

    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    const id = text(body?.id)
    if (!id) return NextResponse.json({ ok: false, error: '삭제할 재고조정 이력이 필요합니다.' }, { status: 400 })

    const client = createMoniServiceRoleClient()
    const deleted = await client
      .from('finished_goods_inventory_adjustments')
      .delete()
      .eq('id', id)
      .eq('business_id', BUSINESS_ID)
      .select('id')
      .maybeSingle()

    if (deleted.error) throw new Error(deleted.error.message)
    if (!deleted.data) return NextResponse.json({ ok: false, error: '삭제할 재고조정 이력을 찾을 수 없습니다.' }, { status: 404 })
    return NextResponse.json({ ok: true, id })
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : '재고조정 삭제 중 오류가 발생했습니다.',
    }, { status: 500 })
  }
}
