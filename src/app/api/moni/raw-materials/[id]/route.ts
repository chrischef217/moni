import { NextRequest, NextResponse } from 'next/server'
import { createMoniServiceRoleClient } from '@/lib/moni/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function text(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
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

function boolValue(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const lowered = value.toLowerCase()
    if (lowered === 'true' || lowered === '1' || lowered === 'y') return true
    if (lowered === 'false' || lowered === '0' || lowered === 'n') return false
  }
  return null
}

function normalizeName(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value.trim().replace(/\s+/g, ' ').toLowerCase()
}

function isMissingColumnError(message: string, columnName: string): boolean {
  const text = message.toLowerCase()
  const column = columnName.toLowerCase()
  return text.includes(column) && (text.includes('does not exist') || text.includes('schema cache') || text.includes('column'))
}

type MappingRow = {
  id: string
  raw_material_name: string | null
  business_id: string | null
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const id = String(params.id ?? '').trim()
    if (!id) {
      return NextResponse.json({ ok: false, error: '원재료 id가 필요합니다.' }, { status: 400 })
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) {
      return NextResponse.json({ ok: false, error: '요청 본문이 필요합니다.' }, { status: 400 })
    }

    const isActive = boolValue(body.is_active)
    const payload = {
      item_name: text(body.item_name),
      food_type: text(body.food_type),
      country_of_origin: text(body.country_of_origin),
      spec: text(body.spec),
      storage_type: text(body.storage_type),
      shelf_life_days: numberValue(body.shelf_life_days),
      supplier: text(body.supplier),
      supplier_contact: text(body.supplier_contact),
      supplier_address: text(body.supplier_address),
      supplier_biz_number: text(body.supplier_biz_number),
      ...(isActive === null ? {} : { is_active: isActive }),
    }

    const supabase = createMoniServiceRoleClient()

    const { data: beforeRow, error: beforeError } = await supabase
      .from('raw_materials')
      .select('id, item_name, business_id')
      .eq('id', id)
      .maybeSingle()
    if (beforeError) throw new Error(beforeError.message || '원재료 조회 실패')
    if (!beforeRow) {
      return NextResponse.json({ ok: false, error: '원재료를 찾을 수 없습니다.' }, { status: 404 })
    }

    const oldName = text(beforeRow.item_name) ?? ''
    const businessId = text(beforeRow.business_id)

    const { data, error } = await supabase.from('raw_materials').update(payload).eq('id', id).select('*').maybeSingle()
    if (error) throw new Error(error.message || '원재료 수정 실패')
    if (!data) {
      return NextResponse.json({ ok: false, error: '원재료를 찾을 수 없습니다.' }, { status: 404 })
    }

    const newName = text(data.item_name) ?? ''
    const oldKey = normalizeName(oldName)
    const newKey = normalizeName(newName)
    const shouldSyncMapping = oldKey.length > 0 && newKey.length > 0 && oldKey !== newKey

    if (shouldSyncMapping) {
      const { error: refMappingError } = await supabase
        .from('raw_material_mapping')
        .update({ raw_material_name: newName })
        .eq('raw_material_ref_id', id)
      if (refMappingError && !isMissingColumnError(refMappingError.message, 'raw_material_ref_id')) {
        throw new Error(refMappingError.message || '?먯옱猷??곌껐紐?媛깆떊 ?ㅽ뙣')
      }

      const candidates: MappingRow[] = []
      if (businessId) {
        const [sameBusinessResult, nullBusinessResult] = await Promise.all([
          supabase
            .from('raw_material_mapping')
            .select('id, raw_material_name, business_id')
            .eq('business_id', businessId),
          supabase
            .from('raw_material_mapping')
            .select('id, raw_material_name, business_id')
            .is('business_id', null),
        ])
        if (sameBusinessResult.error) throw new Error(sameBusinessResult.error.message || '원재료 연결 조회 실패')
        if (nullBusinessResult.error) throw new Error(nullBusinessResult.error.message || '원재료 연결 조회 실패')
        candidates.push(...((sameBusinessResult.data ?? []) as MappingRow[]), ...((nullBusinessResult.data ?? []) as MappingRow[]))
      } else {
        const { data: nullBusinessRows, error: nullBusinessError } = await supabase
          .from('raw_material_mapping')
          .select('id, raw_material_name, business_id')
          .is('business_id', null)
        if (nullBusinessError) throw new Error(nullBusinessError.message || '원재료 연결 조회 실패')
        candidates.push(...((nullBusinessRows ?? []) as MappingRow[]))
      }

      const mappingIds = Array.from(
        new Set(
          candidates
            .filter((row) => normalizeName(row.raw_material_name ?? '') === oldKey)
            .map((row) => String(row.id))
            .filter(Boolean),
        ),
      )

      if (mappingIds.length > 0) {
        const { error: mappingError } = await supabase
          .from('raw_material_mapping')
          .update({ raw_material_name: newName })
          .in('id', mappingIds)
        if (mappingError) throw new Error(mappingError.message || '원재료 연결명 갱신 실패')
      }
    }

    return NextResponse.json({ ok: true, material: data }, { status: 200 })
  } catch (error) {
    const message = error instanceof Error ? error.message : '원재료 수정 중 오류가 발생했습니다.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
