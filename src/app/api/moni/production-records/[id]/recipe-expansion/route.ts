import { NextRequest, NextResponse } from 'next/server'
import { createMoniServiceRoleClient } from '@/lib/moni/db'
import { expandProductionRecipe } from '@/lib/moni/recipeExpansion'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function text(value: unknown): string {
  return String(value ?? '').trim()
}

function numberValue(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createMoniServiceRoleClient()
    const result = await supabase.from('production_records').select('*').eq('id', params.id).maybeSingle()
    if (result.error) throw new Error(result.error.message)
    if (!result.data) {
      return NextResponse.json({ ok: false, error: '생산기록을 찾을 수 없습니다.' }, { status: 404 })
    }

    const record = result.data as Record<string, unknown>
    const basis = text(request.nextUrl.searchParams.get('basis')).toLowerCase()
    const plannedG = numberValue(record.planned_quantity_g)
    const actualG = numberValue(record.actual_quantity_g)
    const defectG = numberValue(record.defect_quantity_g)
    const sampleG = numberValue(record.sample_quantity_g)
    const enteredG = actualG + defectG + sampleG
    const quantityG = basis === 'actual' && enteredG > 0 ? enteredG : plannedG > 0 ? plannedG : enteredG

    if (!(quantityG > 0)) {
      return NextResponse.json({ ok: false, error: '반제품 필요량을 계산할 생산량이 없습니다.' }, { status: 422 })
    }

    const expansion = await expandProductionRecipe({
      productId: text(record.product_id),
      productName: text(record.product_name),
      quantityG,
      businessId: text(record.business_id) || '20220523011',
    })

    return NextResponse.json(
      {
        ok: expansion.unresolved_items.length === 0,
        basis: basis === 'actual' && enteredG > 0 ? 'actual_entered' : 'planned',
        record: {
          id: record.id,
          lot_number: record.lot_number,
          work_date: record.work_date,
          product_id: record.product_id,
          product_name: record.product_name,
          planned_quantity_g: plannedG,
          actual_quantity_g: actualG,
          defect_quantity_g: defectG,
          sample_quantity_g: sampleG,
          status: record.status,
        },
        expansion,
      },
      { status: expansion.unresolved_items.length === 0 ? 200 : 422 },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : '반제품 전개 중 오류가 발생했습니다.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
