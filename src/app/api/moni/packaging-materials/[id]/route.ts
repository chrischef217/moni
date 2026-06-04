import { NextRequest, NextResponse } from 'next/server'
import { createMoniServiceRoleClient } from '@/lib/moni/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function text(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const trimmed = String(value).trim()
  return trimmed.length > 0 ? trimmed : null
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
  if (typeof value === 'string') {
    const lowered = value.toLowerCase()
    if (lowered === 'true' || lowered === '1' || lowered === 'y') return true
    if (lowered === 'false' || lowered === '0' || lowered === 'n') return false
  }
  return fallback
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const id = String(params.id ?? '').trim()
    if (!id) {
      return NextResponse.json({ ok: false, error: '부재료 id가 필요합니다.' }, { status: 400 })
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) {
      return NextResponse.json({ ok: false, error: '요청 본문이 필요합니다.' }, { status: 400 })
    }

    const payload = {
      material_name: text(body.material_name),
      spec: text(body.spec),
      material_type: text(body.material_type),
      supplier: text(body.supplier),
      current_stock: numberValue(body.current_stock),
      unit_price: numberValue(body.unit_price),
      is_active: boolValue(body.is_active, true),
    }

    const supabase = createMoniServiceRoleClient()
    const { data, error } = await supabase.from('packaging_materials').update(payload).eq('id', id).select('*').maybeSingle()
    if (error) throw new Error(error.message || '부재료 수정에 실패했습니다.')
    if (!data) {
      return NextResponse.json({ ok: false, error: '부재료를 찾을 수 없습니다.' }, { status: 404 })
    }

    return NextResponse.json({ ok: true, material: data }, { status: 200 })
  } catch (error) {
    const message = error instanceof Error ? error.message : '부재료 수정 중 오류가 발생했습니다.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
