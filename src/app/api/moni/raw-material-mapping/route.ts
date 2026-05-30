import { NextRequest, NextResponse } from 'next/server'
import { createMoniServiceRoleClient } from '@/lib/moni/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function toText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value.trim())
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

export async function GET(request: NextRequest) {
  try {
    const foodTypeId = request.nextUrl.searchParams.get('food_type_id')?.trim() ?? ''
    const supabase = createMoniServiceRoleClient()

    let query = supabase
      .from('raw_material_mapping')
      .select('*')
      .order('created_at', { ascending: false })

    if (foodTypeId) query = query.eq('food_type_id', foodTypeId)

    const { data, error } = await query
    if (error) throw new Error(error.message || '실제원료 매핑 조회 실패')

    return NextResponse.json({ ok: true, mappings: data ?? [] }, { status: 200 })
  } catch (error) {
    const message = error instanceof Error ? error.message : '실제원료 매핑 조회 중 오류가 발생했습니다.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    const foodTypeId = toText(body?.food_type_id)
    const rawMaterialName = toText(body?.raw_material_name)

    if (!foodTypeId || !rawMaterialName) {
      return NextResponse.json({ ok: false, error: '식품유형과 실제원료명을 입력해 주세요.' }, { status: 400 })
    }

    const supabase = createMoniServiceRoleClient()
    const rawMaterialId = toNumber(body?.raw_material_id)
    const payload = {
      food_type_id: foodTypeId,
      raw_material_id: rawMaterialId,
      raw_material_name: rawMaterialName,
      packing_unit: toText(body?.packing_unit) || null,
      packing_weight_g: toNumber(body?.packing_weight_g),
      is_default: typeof body?.is_default === 'boolean' ? body.is_default : false,
      business_id: toText(body?.business_id) || 'default',
    }

    const { data, error } = await supabase.from('raw_material_mapping').insert(payload).select('*').single()
    if (error) throw new Error(error.message || '실제원료 매핑 저장 실패')

    return NextResponse.json({ ok: true, mapping: data }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : '실제원료 매핑 저장 중 오류가 발생했습니다.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get('id')?.trim() ?? ''
    if (!id) {
      return NextResponse.json({ ok: false, error: '삭제할 매핑 id가 필요합니다.' }, { status: 400 })
    }

    const supabase = createMoniServiceRoleClient()
    const { error } = await supabase.from('raw_material_mapping').delete().eq('id', id)
    if (error) throw new Error(error.message || '실제원료 매핑 삭제 실패')

    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (error) {
    const message = error instanceof Error ? error.message : '실제원료 매핑 삭제 중 오류가 발생했습니다.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
