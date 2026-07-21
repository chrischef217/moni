import { NextRequest, NextResponse } from 'next/server'
import { createMoniServiceRoleClient } from '@/lib/moni/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const FIXED_WRITER_NAME = '윤대열'
const FIXED_REVIEWER_NAME = '배순애'

type SampleEntry = {
  label: string
  value: number
  unit: 'kg' | 'g'
  grams: number
}

function text(value: unknown): string {
  return String(value ?? '').trim()
}

function numberOrNull(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function normalizeSampleEntries(value: unknown): SampleEntry[] {
  if (!Array.isArray(value)) return []
  return value
    .map((entry, index) => {
      const row = (entry ?? {}) as Record<string, unknown>
      const unit = text(row.unit).toLowerCase() === 'kg' ? 'kg' : 'g'
      const rawValue = numberOrNull(row.value)
      if (rawValue === null || rawValue < 0) return null
      const grams = unit === 'kg' ? rawValue * 1000 : rawValue
      return {
        label: text(row.label) || `샘플 ${index + 1}`,
        value: rawValue,
        unit,
        grams,
      } satisfies SampleEntry
    })
    .filter((entry): entry is SampleEntry => Boolean(entry))
}

export async function GET(request: NextRequest) {
  try {
    const recordId = text(request.nextUrl.searchParams.get('record_id'))
    if (!recordId) {
      return NextResponse.json({ ok: false, error: 'record_id가 필요합니다.' }, { status: 400 })
    }

    const supabase = createMoniServiceRoleClient()
    const { data, error } = await supabase
      .from('production_completion_metadata')
      .select('*')
      .eq('production_record_id', recordId)
      .maybeSingle()

    if (error) throw new Error(error.message)
    return NextResponse.json({ ok: true, metadata: data ?? null }, { status: 200 })
  } catch (error) {
    const message = error instanceof Error ? error.message : '생산 완료 정보를 불러오지 못했습니다.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) {
      return NextResponse.json({ ok: false, error: '요청 본문이 필요합니다.' }, { status: 400 })
    }

    const recordId = text(body.record_id)
    if (!recordId) {
      return NextResponse.json({ ok: false, error: '작업지시서 정보가 없습니다.' }, { status: 400 })
    }

    const actualUnitRaw = text(body.actual_input_unit).toLowerCase()
    const defectUnitRaw = text(body.defect_input_unit).toLowerCase()
    const actualUnit = ['ea', 'kg', 'g'].includes(actualUnitRaw) ? actualUnitRaw : null
    const defectUnit = ['kg', 'g'].includes(defectUnitRaw) ? defectUnitRaw : null
    const sampleEntries = normalizeSampleEntries(body.sample_entries)

    const supabase = createMoniServiceRoleClient()
    const recordResult = await supabase.from('production_records').select('id').eq('id', recordId).maybeSingle()
    if (recordResult.error) throw new Error(recordResult.error.message)
    if (!recordResult.data) {
      return NextResponse.json({ ok: false, error: '작업지시서를 찾을 수 없습니다.' }, { status: 404 })
    }

    const payload = {
      production_record_id: recordId,
      writer_name: FIXED_WRITER_NAME,
      reviewer_name: FIXED_REVIEWER_NAME,
      actual_input_unit: actualUnit,
      actual_input_value: numberOrNull(body.actual_input_value),
      defect_input_unit: defectUnit,
      defect_input_value: numberOrNull(body.defect_input_value),
      sample_entries: sampleEntries,
      updated_at: new Date().toISOString(),
    }

    const { data, error } = await supabase
      .from('production_completion_metadata')
      .upsert(payload, { onConflict: 'production_record_id' })
      .select('*')
      .single()

    if (error) throw new Error(error.message)
    return NextResponse.json({ ok: true, metadata: data }, { status: 200 })
  } catch (error) {
    const message = error instanceof Error ? error.message : '생산 완료 정보를 저장하지 못했습니다.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
