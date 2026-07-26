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

function integerValue(value: unknown) {
  const parsed = numberValue(value)
  return parsed !== null && Number.isInteger(parsed) ? parsed : null
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
      'id', 'product_id', 'english_name', 'default_unit_price', 'currency',
      'units_per_carton', 'net_weight_kg', 'gross_weight_kg', 'cbm', 'is_active',
      'created_at', 'updated_at',
      'products!inner(id, product_name, product_code, report_number, product_spec, weight_g, product_type, is_active)',
    ].join(', '))
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message || '수출품목 설정 조회에 실패했습니다.')
  return data ?? []
}

function validate(body: Record<string, unknown>) {
  const productId = text(body.product_id)
  const englishName = text(body.english_name)
  const unitPrice = numberValue(body.default_unit_price)
  const currency = normalizeCurrency(body.currency)
  const unitsPerCarton = integerValue(body.units_per_carton)
  const netWeight = numberValue(body.net_weight_kg)
  const grossWeight = numberValue(body.gross_weight_kg)
  const cbm = numberValue(body.cbm)

  if (!productId) return { error: '기존 완제품을 선택해 주세요.' }
  if (!englishName) return { error: '완제품 영문이름을 입력해 주세요.' }
  if (unitPrice === null || unitPrice < 0) return { error: '기본 Unit Price를 정확히 입력해 주세요.' }
  if (!currency) return { error: '지원하지 않는 통화입니다.' }
  if (unitsPerCarton === null || unitsPerCarton < 1) return { error: '입수량은 1개 이상의 정수로 입력해 주세요.' }
  if (netWeight === null || netWeight < 0) return { error: '카톤 Net Weight를 정확히 입력해 주세요.' }
  if (grossWeight === null || grossWeight < 0) return { error: '카톤 Gross Weight를 정확히 입력해 주세요.' }
  if (grossWeight > 0 && netWeight > 0 && grossWeight < netWeight) return { error: 'Gross Weight는 Net Weight보다 작을 수 없습니다.' }
  if (cbm === null || cbm < 0) return { error: '카톤 CBM을 정확히 입력해 주세요.' }

  return { productId, englishName, unitPrice, currency, unitsPerCarton, netWeight, grossWeight, cbm }
}

export async function GET() {
  try {
    return NextResponse.json({ ok: true, settings: await loadSettings() })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : '수출품목 설정 조회 중 오류가 발생했습니다.' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) return NextResponse.json({ ok: false, error: '요청 본문이 필요합니다.' }, { status: 400 })
    const checked = validate(body)
    if ('error' in checked) return NextResponse.json({ ok: false, error: checked.error }, { status: 400 })

    const supabase = createMoniServiceRoleClient()
    const { data: product, error: productError } = await supabase
      .from('products').select('id, product_type').eq('id', checked.productId).maybeSingle()
    if (productError) throw new Error(productError.message)
    if (!product) return NextResponse.json({ ok: false, error: '선택한 완제품을 찾을 수 없습니다.' }, { status: 404 })
    if (product.product_type !== '완제품') return NextResponse.json({ ok: false, error: '완제품만 수출품목으로 등록할 수 있습니다.' }, { status: 400 })

    const { error } = await supabase.from('export_product_settings').insert({
      id: createId(),
      product_id: checked.productId,
      english_name: checked.englishName,
      default_unit_price: checked.unitPrice,
      currency: checked.currency,
      units_per_carton: checked.unitsPerCarton,
      net_weight_kg: checked.netWeight,
      gross_weight_kg: checked.grossWeight,
      cbm: checked.cbm,
      is_active: boolValue(body.is_active, true),
      updated_at: new Date().toISOString(),
    })
    if (error) {
      if (error.code === '23505') return NextResponse.json({ ok: false, error: '이미 수출품목으로 등록된 완제품입니다.' }, { status: 409 })
      throw new Error(error.message || '수출품목 등록에 실패했습니다.')
    }

    return NextResponse.json({ ok: true, settings: await loadSettings() }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : '수출품목 등록 중 오류가 발생했습니다.' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) return NextResponse.json({ ok: false, error: '요청 본문이 필요합니다.' }, { status: 400 })
    const id = text(body.id)
    if (!id) return NextResponse.json({ ok: false, error: '수정할 수출품목 ID가 필요합니다.' }, { status: 400 })
    const checked = validate(body)
    if ('error' in checked) return NextResponse.json({ ok: false, error: checked.error }, { status: 400 })

    const supabase = createMoniServiceRoleClient()
    const { error } = await supabase.from('export_product_settings').update({
      english_name: checked.englishName,
      default_unit_price: checked.unitPrice,
      currency: checked.currency,
      units_per_carton: checked.unitsPerCarton,
      net_weight_kg: checked.netWeight,
      gross_weight_kg: checked.grossWeight,
      cbm: checked.cbm,
      is_active: boolValue(body.is_active, true),
      updated_at: new Date().toISOString(),
    }).eq('id', id)
    if (error) throw new Error(error.message || '수출품목 수정에 실패했습니다.')

    return NextResponse.json({ ok: true, settings: await loadSettings() })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : '수출품목 수정 중 오류가 발생했습니다.' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = text(request.nextUrl.searchParams.get('id'))
    if (!id) return NextResponse.json({ ok: false, error: '삭제할 수출품목 ID가 필요합니다.' }, { status: 400 })
    const supabase = createMoniServiceRoleClient()
    const { error } = await supabase.from('export_product_settings').delete().eq('id', id)
    if (error) throw new Error(error.message || '수출품목 삭제에 실패했습니다.')
    return NextResponse.json({ ok: true, settings: await loadSettings() })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : '수출품목 삭제 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
