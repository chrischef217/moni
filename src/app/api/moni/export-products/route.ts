import { NextRequest, NextResponse } from 'next/server'
import { createMoniServiceRoleClient } from '@/lib/moni/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function text(value: unknown) {
  if (typeof value !== 'string' && typeof value !== 'number') return ''
  return String(value).trim()
}

function numberValue(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(text(value))
  return Number.isFinite(parsed) ? parsed : null
}

function boolValue(value: unknown, fallback = true) {
  if (typeof value === 'boolean') return value
  const normalized = text(value).toLowerCase()
  if (['true', '1', 'y', 'yes'].includes(normalized)) return true
  if (['false', '0', 'n', 'no'].includes(normalized)) return false
  return fallback
}

function createId() {
  const stamp = Date.now().toString(36).toUpperCase()
  const random = Math.floor(Math.random() * 1_000_000).toString(36).toUpperCase().padStart(4, '0')
  return `EXP-${stamp}-${random}`
}

function normalizeCurrency(value: unknown) {
  const currency = text(value).toUpperCase() || 'USD'
  return ['USD', 'THB', 'KRW', 'EUR'].includes(currency) ? currency : null
}

async function loadSettings() {
  const supabase = createMoniServiceRoleClient()
  const { data, error } = await supabase
    .from('export_product_settings')
    .select([
      'id',
      'product_id',
      'english_name',
      'default_unit_price',
      'currency',
      'net_weight_kg',
      'gross_weight_kg',
      'cbm',
      'is_active',
      'created_at',
      'updated_at',
      'products!inner(id, product_name, report_number, product_spec, weight_g, product_type, is_active)',
    ].join(', '))
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message || '수출품목 설정 조회에 실패했습니다.')
  return data ?? []
}

export async function GET() {
  try {
    const settings = await loadSettings()
    return NextResponse.json({ ok: true, settings }, { status: 200 })
  } catch (error) {
    const message = error instanceof Error ? error.message : '수출품목 설정 조회 중 오류가 발생했습니다.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) return NextResponse.json({ ok: false, error: '요청 본문이 필요합니다.' }, { status: 400 })

    const productId = text(body.product_id)
    const englishName = text(body.english_name)
    const unitPrice = numberValue(body.default_unit_price)
    const currency = normalizeCurrency(body.currency)
    const netWeight = numberValue(body.net_weight_kg)
    const grossWeight = numberValue(body.gross_weight_kg)
    const cbm = numberValue(body.cbm)

    if (!productId) return NextResponse.json({ ok: false, error: '기존 완제품을 선택해 주세요.' }, { status: 400 })
    if (!englishName) return NextResponse.json({ ok: false, error: '완제품 영문이름을 입력해 주세요.' }, { status: 400 })
    if (unitPrice === null || unitPrice < 0) return NextResponse.json({ ok: false, error: '기본 Unit Price를 정확히 입력해 주세요.' }, { status: 400 })
    if (!currency) return NextResponse.json({ ok: false, error: '지원하지 않는 통화입니다.' }, { status: 400 })
    if (netWeight === null || netWeight < 0) return NextResponse.json({ ok: false, error: 'Net Weight를 정확히 입력해 주세요.' }, { status: 400 })
    if (grossWeight === null || grossWeight < 0) return NextResponse.json({ ok: false, error: 'Gross Weight를 정확히 입력해 주세요.' }, { status: 400 })
    if (grossWeight > 0 && netWeight > 0 && grossWeight < netWeight) return NextResponse.json({ ok: false, error: 'Gross Weight는 Net Weight보다 작을 수 없습니다.' }, { status: 400 })
    if (cbm === null || cbm < 0) return NextResponse.json({ ok: false, error: 'CBM을 정확히 입력해 주세요.' }, { status: 400 })

    const supabase = createMoniServiceRoleClient()
    const { data: product, error: productError } = await supabase
      .from('products')
      .select('id, product_type, is_active')
      .eq('id', productId)
      .maybeSingle()

    if (productError) throw new Error(productError.message)
    if (!product) return NextResponse.json({ ok: false, error: '선택한 완제품을 찾을 수 없습니다.' }, { status: 404 })
    if (product.product_type !== '완제품') return NextResponse.json({ ok: false, error: '완제품만 수출품목으로 등록할 수 있습니다.' }, { status: 400 })

    const payload = {
      id: createId(),
      product_id: productId,
      english_name: englishName,
      default_unit_price: unitPrice,
      currency,
      net_weight_kg: netWeight,
      gross_weight_kg: grossWeight,
      cbm,
      is_active: boolValue(body.is_active, true),
      updated_at: new Date().toISOString(),
    }

    const { error } = await supabase.from('export_product_settings').insert(payload)
    if (error) {
      if (error.code === '23505') return NextResponse.json({ ok: false, error: '이미 수출품목으로 등록된 완제품입니다.' }, { status: 409 })
      throw new Error(error.message || '수출품목 등록에 실패했습니다.')
    }

    const settings = await loadSettings()
    return NextResponse.json({ ok: true, settings }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : '수출품목 등록 중 오류가 발생했습니다.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) return NextResponse.json({ ok: false, error: '요청 본문이 필요합니다.' }, { status: 400 })

    const id = text(body.id)
    if (!id) return NextResponse.json({ ok: false, error: '수정할 수출품목 ID가 필요합니다.' }, { status: 400 })

    const englishName = text(body.english_name)
    const unitPrice = numberValue(body.default_unit_price)
    const currency = normalizeCurrency(body.currency)
    const netWeight = numberValue(body.net_weight_kg)
    const grossWeight = numberValue(body.gross_weight_kg)
    const cbm = numberValue(body.cbm)

    if (!englishName) return NextResponse.json({ ok: false, error: '완제품 영문이름을 입력해 주세요.' }, { status: 400 })
    if (unitPrice === null || unitPrice < 0 || !currency || netWeight === null || netWeight < 0 || grossWeight === null || grossWeight < 0 || cbm === null || cbm < 0) {
      return NextResponse.json({ ok: false, error: '수출품목 값을 정확히 입력해 주세요.' }, { status: 400 })
    }
    if (grossWeight > 0 && netWeight > 0 && grossWeight < netWeight) return NextResponse.json({ ok: false, error: 'Gross Weight는 Net Weight보다 작을 수 없습니다.' }, { status: 400 })

    const supabase = createMoniServiceRoleClient()
    const { error } = await supabase
      .from('export_product_settings')
      .update({
        english_name: englishName,
        default_unit_price: unitPrice,
        currency,
        net_weight_kg: netWeight,
        gross_weight_kg: grossWeight,
        cbm,
        is_active: boolValue(body.is_active, true),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)

    if (error) throw new Error(error.message || '수출품목 수정에 실패했습니다.')
    const settings = await loadSettings()
    return NextResponse.json({ ok: true, settings }, { status: 200 })
  } catch (error) {
    const message = error instanceof Error ? error.message : '수출품목 수정 중 오류가 발생했습니다.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = text(request.nextUrl.searchParams.get('id'))
    if (!id) return NextResponse.json({ ok: false, error: '삭제할 수출품목 ID가 필요합니다.' }, { status: 400 })

    const supabase = createMoniServiceRoleClient()
    const { error } = await supabase.from('export_product_settings').delete().eq('id', id)
    if (error) throw new Error(error.message || '수출품목 삭제에 실패했습니다.')

    const settings = await loadSettings()
    return NextResponse.json({ ok: true, settings }, { status: 200 })
  } catch (error) {
    const message = error instanceof Error ? error.message : '수출품목 삭제 중 오류가 발생했습니다.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
