import { NextRequest, NextResponse } from 'next/server'
import { createMoniServiceRoleClient } from '@/lib/moni/db'
import { getSessionFromRequest } from '@/lib/allowance/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BUSINESS_ID = '20220523011'

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

export async function GET(request: NextRequest) {
  try {
    if (!(await requireAdmin(request))) {
      return NextResponse.json({ ok: false, error: '관리자 권한이 필요합니다.' }, { status: 403 })
    }

    const client = createMoniServiceRoleClient()
    const result = await client
      .from('finished_goods_inventory_adjustments')
      .select('id,business_id,product_id,adjustment_date,input_quantity,input_unit,balance_before_g,target_stock_g,adjustment_g,reason,created_at')
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
    if (!body) return NextResponse.json({ ok: false, error: '재고조정 정보가 필요합니다.' }, { status: 400 })

    const productId = text(body.product_id)
    const adjustmentDate = text(body.adjustment_date)
    const inputUnit = text(body.input_unit).toLowerCase()
    const inputQuantity = num(body.input_quantity)
    const balanceBeforeG = num(body.balance_before_g)
    const reason = text(body.reason)

    if (!productId) return NextResponse.json({ ok: false, error: '조정할 제품이 필요합니다.' }, { status: 400 })
    if (!validDate(adjustmentDate)) return NextResponse.json({ ok: false, error: '조정 일자를 확인해 주세요.' }, { status: 400 })
    if (adjustmentDate > todayKst()) return NextResponse.json({ ok: false, error: '미래 날짜로 재고조정할 수 없습니다.' }, { status: 400 })
    if (inputUnit !== 'kg' && inputUnit !== 'g') return NextResponse.json({ ok: false, error: '입력 단위는 kg 또는 g만 사용할 수 있습니다.' }, { status: 400 })
    if (inputQuantity === null || inputQuantity < 0) return NextResponse.json({ ok: false, error: '조정 후 재고 수량을 0 이상으로 입력해 주세요.' }, { status: 400 })
    if (balanceBeforeG === null) return NextResponse.json({ ok: false, error: '조정 전 재고를 확인하지 못했습니다. 재고 새로고침 후 다시 시도해 주세요.' }, { status: 400 })
    if (!reason) return NextResponse.json({ ok: false, error: '재고조정 사유를 입력해 주세요.' }, { status: 400 })

    const targetStockG = inputUnit === 'kg' ? inputQuantity * 1000 : inputQuantity
    const adjustmentG = targetStockG - balanceBeforeG
    if (Math.abs(adjustmentG) < 0.0001) {
      return NextResponse.json({ ok: false, error: '현재 재고와 동일하여 조정할 수량이 없습니다.' }, { status: 400 })
    }

    const client = createMoniServiceRoleClient()
    const product = await client
      .from('products')
      .select('id,product_name,product_type,is_active')
      .eq('id', productId)
      .maybeSingle()

    if (product.error) throw new Error(product.error.message)
    if (!product.data) return NextResponse.json({ ok: false, error: '조정할 제품을 찾을 수 없습니다.' }, { status: 404 })
    if (product.data.is_active === false) return NextResponse.json({ ok: false, error: '비활성 제품은 재고조정할 수 없습니다.' }, { status: 400 })

    const inserted = await client
      .from('finished_goods_inventory_adjustments')
      .insert({
        business_id: BUSINESS_ID,
        product_id: productId,
        adjustment_date: adjustmentDate,
        input_quantity: inputQuantity,
        input_unit: inputUnit,
        balance_before_g: balanceBeforeG,
        target_stock_g: targetStockG,
        adjustment_g: adjustmentG,
        reason,
      })
      .select('id,business_id,product_id,adjustment_date,input_quantity,input_unit,balance_before_g,target_stock_g,adjustment_g,reason,created_at')
      .single()

    if (inserted.error) throw new Error(inserted.error.message)

    return NextResponse.json({
      ok: true,
      adjustment: inserted.data,
      converted: {
        input_quantity: inputQuantity,
        input_unit: inputUnit,
        target_stock_g: targetStockG,
        adjustment_g: adjustmentG,
      },
    }, { status: 201 })
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : '재고조정 저장 중 오류가 발생했습니다.',
    }, { status: 500 })
  }
}
