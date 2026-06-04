import { NextRequest, NextResponse } from 'next/server'
import { createMoniServiceRoleClient } from '@/lib/moni/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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

function boolValue(value: unknown, fallback = true): boolean {
  if (typeof value === 'boolean') return value
  const raw = text(value).toLowerCase()
  if (raw === 'true' || raw === '1' || raw === 'y') return true
  if (raw === 'false' || raw === '0' || raw === 'n') return false
  return fallback
}

function makePackagingId() {
  return `PKG-${Date.now()}`
}

export async function GET(request: NextRequest) {
  try {
    const includeInactive = ['1', 'true', 'all'].includes(
      String(request.nextUrl.searchParams.get('include_inactive') ?? '').toLowerCase(),
    )
    const status = String(request.nextUrl.searchParams.get('status') ?? '').toLowerCase()
    const inactiveOnly = status === 'inactive'

    const supabase = createMoniServiceRoleClient()
    const { data, error } = await supabase
      .from('packaging_materials')
      .select('*')
      .order('material_name', { ascending: true })
    if (error) throw new Error(error.message || '부재료 목록 조회에 실패했습니다.')

    const allMaterials = (data ?? []) as Array<Record<string, unknown>>
    const activeMaterials = allMaterials.filter((item) => item.is_active !== false)
    const inactiveMaterials = allMaterials.filter((item) => item.is_active === false)

    const materials = inactiveOnly
      ? inactiveMaterials
      : includeInactive
        ? allMaterials
        : activeMaterials

    return NextResponse.json(
      {
        ok: true,
        materials,
        summary: {
          total: allMaterials.length,
          active: activeMaterials.length,
          inactive: inactiveMaterials.length,
        },
      },
      { status: 200 },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : '부재료 목록 조회 중 오류가 발생했습니다.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    const materialName = text(body?.material_name)
    if (!materialName) {
      return NextResponse.json({ ok: false, error: '부재료명을 입력해 주세요.' }, { status: 400 })
    }

    const codeFromBody = text(body?.material_code)
    const generatedCode = makePackagingId()
    const materialCode = codeFromBody || generatedCode
    const payload = {
      id: materialCode,
      material_name: materialName,
      material_code: materialCode,
      spec: text(body?.spec) || null,
      material_type: text(body?.material_type) || null,
      supplier: text(body?.supplier) || null,
      current_stock: numberValue(body?.current_stock) ?? 0,
      unit_price: numberValue(body?.unit_price) ?? 0,
      is_active: boolValue(body?.is_active, true),
      business_id: text(body?.business_id) || '20220523011',
    }

    const supabase = createMoniServiceRoleClient()
    const { data, error } = await supabase.from('packaging_materials').insert(payload).select('*').single()
    if (error) throw new Error(error.message || '부재료 등록에 실패했습니다.')
    return NextResponse.json({ ok: true, material: data }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : '부재료 등록 중 오류가 발생했습니다.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
