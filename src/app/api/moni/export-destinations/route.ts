import { NextRequest, NextResponse } from 'next/server'
import { createMoniServiceRoleClient } from '@/lib/moni/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function text(value: unknown) {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : ''
}

function createId() {
  const stamp = Date.now().toString(36).toUpperCase()
  const random = Math.floor(Math.random() * 1_000_000).toString(36).toUpperCase().padStart(4, '0')
  return `EXPDST-${stamp}-${random}`
}

async function loadDestinations() {
  const supabase = createMoniServiceRoleClient()
  const { data, error } = await supabase
    .from('export_destinations')
    .select('id, company_name, address, contact_name, phone, zip_code, country, created_at, updated_at')
    .order('company_name', { ascending: true })

  if (error) throw new Error(error.message || '수출처 조회에 실패했습니다.')
  return data ?? []
}

function validate(body: Record<string, unknown>) {
  const payload = {
    company_name: text(body.company_name),
    address: text(body.address),
    contact_name: text(body.contact_name),
    phone: text(body.phone),
    zip_code: text(body.zip_code),
    country: text(body.country),
  }

  if (!payload.company_name) return { error: '회사명(Company Name)을 입력해 주세요.' }
  if (!payload.address) return { error: '주소(Address)를 입력해 주세요.' }
  if (!payload.contact_name) return { error: '담당자명(Contact Name)을 입력해 주세요.' }
  if (!payload.phone) return { error: '전화번호(Phone)를 입력해 주세요.' }
  if (!payload.zip_code) return { error: '우편번호(ZIP Code)를 입력해 주세요.' }
  if (!payload.country) return { error: '국가(Country)를 입력해 주세요.' }

  return { payload }
}

export async function GET() {
  try {
    return NextResponse.json({ ok: true, destinations: await loadDestinations() })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : '수출처 조회 중 오류가 발생했습니다.' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    if (!body) return NextResponse.json({ ok: false, error: '요청 본문이 필요합니다.' }, { status: 400 })

    const validation = validate(body)
    if ('error' in validation) return NextResponse.json({ ok: false, error: validation.error }, { status: 400 })

    const supabase = createMoniServiceRoleClient()
    const { error } = await supabase.from('export_destinations').insert({
      id: createId(),
      ...validation.payload,
      updated_at: new Date().toISOString(),
    })
    if (error) throw new Error(error.message || '수출처 등록에 실패했습니다.')

    return NextResponse.json({ ok: true, destinations: await loadDestinations() }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : '수출처 등록 중 오류가 발생했습니다.' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    if (!body) return NextResponse.json({ ok: false, error: '요청 본문이 필요합니다.' }, { status: 400 })

    const id = text(body.id)
    if (!id) return NextResponse.json({ ok: false, error: '수정할 수출처 ID가 필요합니다.' }, { status: 400 })

    const validation = validate(body)
    if ('error' in validation) return NextResponse.json({ ok: false, error: validation.error }, { status: 400 })

    const supabase = createMoniServiceRoleClient()
    const { error } = await supabase.from('export_destinations').update({
      ...validation.payload,
      updated_at: new Date().toISOString(),
    }).eq('id', id)
    if (error) throw new Error(error.message || '수출처 수정에 실패했습니다.')

    return NextResponse.json({ ok: true, destinations: await loadDestinations() })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : '수출처 수정 중 오류가 발생했습니다.' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = text(request.nextUrl.searchParams.get('id'))
    if (!id) return NextResponse.json({ ok: false, error: '삭제할 수출처 ID가 필요합니다.' }, { status: 400 })

    const supabase = createMoniServiceRoleClient()
    const { error } = await supabase.from('export_destinations').delete().eq('id', id)
    if (error) throw new Error(error.message || '수출처 삭제에 실패했습니다.')

    return NextResponse.json({ ok: true, destinations: await loadDestinations() })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : '수출처 삭제 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
