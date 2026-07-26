import { NextRequest, NextResponse } from 'next/server'
import { createMoniServiceRoleClient } from '@/lib/moni/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BUSINESS_ID = '20220523011'

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
    .select('id, company_name, address, contact_name, phone, zip_code, country, sales_client_id, created_at, updated_at')
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

async function syncSalesClient(
  supabase: ReturnType<typeof createMoniServiceRoleClient>,
  destinationId: string,
  payload: { company_name: string; address: string; contact_name: string; phone: string; zip_code: string; country: string },
  linkedClientId?: string | null,
) {
  const marker = `[EXPORT_DESTINATION:${destinationId}]`
  const clientPayload = {
    business_id: BUSINESS_ID,
    company_name: payload.company_name,
    contact_name: payload.contact_name || null,
    phone: payload.phone || null,
    address: payload.address || null,
    status: 'active',
    payment_terms: '수출거래 · VAT 0%',
    payment_due_type: 'none',
    note: `${marker} ${payload.country}${payload.zip_code ? ` / ZIP ${payload.zip_code}` : ''}`,
    updated_at: new Date().toISOString(),
  }

  let clientId = text(linkedClientId)
  if (!clientId) {
    const existing = await supabase
      .from('sales_clients')
      .select('id')
      .eq('business_id', BUSINESS_ID)
      .like('note', `${marker}%`)
      .limit(1)
      .maybeSingle()
    if (existing.error) throw new Error(existing.error.message)
    clientId = text(existing.data?.id)
  }

  if (clientId) {
    const updated = await supabase.from('sales_clients').update(clientPayload).eq('id', clientId).eq('business_id', BUSINESS_ID).select('id').single()
    if (updated.error) throw new Error(updated.error.message || '판매관리 거래처 동기화에 실패했습니다.')
    return text(updated.data.id)
  }

  const inserted = await supabase.from('sales_clients').insert(clientPayload).select('id').single()
  if (inserted.error) throw new Error(inserted.error.message || '판매관리 거래처 생성에 실패했습니다.')
  return text(inserted.data.id)
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
    const id = createId()
    const inserted = await supabase.from('export_destinations').insert({
      id,
      ...validation.payload,
      updated_at: new Date().toISOString(),
    })
    if (inserted.error) throw new Error(inserted.error.message || '수출처 등록에 실패했습니다.')

    try {
      const salesClientId = await syncSalesClient(supabase, id, validation.payload)
      const linked = await supabase.from('export_destinations').update({ sales_client_id: salesClientId, updated_at: new Date().toISOString() }).eq('id', id)
      if (linked.error) throw new Error(linked.error.message)
    } catch (syncError) {
      await supabase.from('export_destinations').delete().eq('id', id)
      throw syncError
    }

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
    const current = await supabase.from('export_destinations').select('id,sales_client_id').eq('id', id).maybeSingle()
    if (current.error) throw new Error(current.error.message)
    if (!current.data) return NextResponse.json({ ok: false, error: '수정할 수출처를 찾을 수 없습니다.' }, { status: 404 })

    const salesClientId = await syncSalesClient(supabase, id, validation.payload, current.data.sales_client_id)
    const { error } = await supabase.from('export_destinations').update({
      ...validation.payload,
      sales_client_id: salesClientId,
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
    const current = await supabase.from('export_destinations').select('sales_client_id').eq('id', id).maybeSingle()
    if (current.error) throw new Error(current.error.message)

    const { error } = await supabase.from('export_destinations').delete().eq('id', id)
    if (error) throw new Error(error.message || '수출처 삭제에 실패했습니다.')

    const salesClientId = text(current.data?.sales_client_id)
    if (salesClientId) {
      const clientRow = await supabase.from('sales_clients').select('note').eq('id', salesClientId).eq('business_id', BUSINESS_ID).maybeSingle()
      if (!clientRow.error && clientRow.data) {
        const oldNote = text(clientRow.data.note)
        await supabase.from('sales_clients').update({
          status: 'inactive',
          note: [oldNote, '수출처 관리에서 삭제됨'].filter(Boolean).join(' / '),
          updated_at: new Date().toISOString(),
        }).eq('id', salesClientId).eq('business_id', BUSINESS_ID)
      }
    }

    return NextResponse.json({ ok: true, destinations: await loadDestinations() })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : '수출처 삭제 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
