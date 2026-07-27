import { NextRequest, NextResponse } from 'next/server'
import { createMoniServiceRoleClient } from '@/lib/moni/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PROFILE_ID = 'default'

function text(value: unknown) {
  if (typeof value !== 'string' && typeof value !== 'number') return ''
  return String(value).trim()
}

function validateImageDataUrl(value: string, label: string) {
  if (!/^data:image\/(png|jpeg|jpg|webp);base64,/i.test(value)) {
    throw new Error(`${label} 이미지는 PNG, JPG 또는 WEBP 형식만 사용할 수 있습니다.`)
  }
  if (value.length > 2_800_000) {
    throw new Error(`${label} 이미지가 너무 큽니다. 2MB 이하 이미지를 사용해 주세요.`)
  }
}

async function loadProfile() {
  const supabase = createMoniServiceRoleClient()
  const { data, error } = await supabase
    .from('company_profile')
    .select('*')
    .eq('id', PROFILE_ID)
    .maybeSingle()

  if (error) throw new Error(error.message || '회사 기본정보 조회에 실패했습니다.')
  return data
}

export async function GET() {
  try {
    const profile = await loadProfile()
    return NextResponse.json({ ok: true, profile }, { status: 200 })
  } catch (error) {
    const message = error instanceof Error ? error.message : '회사 기본정보 조회 중 오류가 발생했습니다.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) return NextResponse.json({ ok: false, error: '요청 본문이 필요합니다.' }, { status: 400 })

    const payload: Record<string, unknown> = {
      company_name_ko: text(body.company_name_ko),
      company_name_en: text(body.company_name_en),
      business_registration_number: text(body.business_registration_number),
      representative_name_ko: text(body.representative_name_ko),
      representative_name_en: text(body.representative_name_en),
      opening_date: text(body.opening_date) || null,
      address_ko: text(body.address_ko),
      address_en: text(body.address_en),
      company_email: text(body.company_email),
      company_phone: text(body.company_phone),
      business_type: text(body.business_type),
      business_items: text(body.business_items),
      updated_at: new Date().toISOString(),
    }

    if (!payload.company_name_ko) return NextResponse.json({ ok: false, error: '상호를 입력해 주세요.' }, { status: 400 })
    if (!payload.business_registration_number) return NextResponse.json({ ok: false, error: '사업자등록번호를 입력해 주세요.' }, { status: 400 })
    if (!payload.representative_name_ko) return NextResponse.json({ ok: false, error: '대표자명을 입력해 주세요.' }, { status: 400 })

    if (Object.prototype.hasOwnProperty.call(body, 'signature_data_url')) {
      const signatureDataUrl = body.signature_data_url === null ? null : text(body.signature_data_url)
      if (signatureDataUrl) validateImageDataUrl(signatureDataUrl, '서명')
      payload.signature_data_url = signatureDataUrl
      payload.signature_file_name = signatureDataUrl ? text(body.signature_file_name) || 'signature.png' : null
    }

    if (Object.prototype.hasOwnProperty.call(body, 'logo_data_url')) {
      const logoDataUrl = body.logo_data_url === null ? null : text(body.logo_data_url)
      if (logoDataUrl) validateImageDataUrl(logoDataUrl, '회사 로고')
      payload.logo_data_url = logoDataUrl
      payload.logo_file_name = logoDataUrl ? text(body.logo_file_name) || 'company-logo.png' : null
    }

    const supabase = createMoniServiceRoleClient()
    const { error } = await supabase.from('company_profile').update(payload).eq('id', PROFILE_ID)
    if (error) throw new Error(error.message || '회사 기본정보 저장에 실패했습니다.')

    const profile = await loadProfile()
    return NextResponse.json({ ok: true, profile }, { status: 200 })
  } catch (error) {
    const message = error instanceof Error ? error.message : '회사 기본정보 저장 중 오류가 발생했습니다.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
