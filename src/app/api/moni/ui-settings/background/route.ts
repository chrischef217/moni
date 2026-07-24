import { NextRequest, NextResponse } from 'next/server'
import { createMoniServiceRoleClient } from '@/lib/moni/db'
import { getSessionFromRequest } from '@/lib/allowance/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SETTINGS_ID = 'default'
const BUCKET = 'moni-backgrounds'
const MAX_BYTES = 10 * 1024 * 1024
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const WEATHER_SLOTS = new Set([
  'clear_day',
  'clear_night',
  'cloudy_day',
  'cloudy_night',
  'rain_day',
  'rain_night',
  'snow_day',
  'snow_night',
])

function extensionFor(type: string) {
  if (type === 'image/png') return 'png'
  if (type === 'image/webp') return 'webp'
  return 'jpg'
}

export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ ok: false, error: '관리자 권한이 필요합니다.' }, { status: 401 })
  }

  try {
    const formData = await request.formData()
    const file = formData.get('file')
    const slot = String(formData.get('slot') || '').trim()

    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: '업로드할 이미지를 선택해 주세요.' }, { status: 400 })
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json({ ok: false, error: 'JPG, PNG, WEBP 이미지만 사용할 수 있습니다.' }, { status: 400 })
    }
    if (file.size <= 0 || file.size > MAX_BYTES) {
      return NextResponse.json({ ok: false, error: '배경 이미지는 10MB 이하만 업로드할 수 있습니다.' }, { status: 400 })
    }
    if (slot !== 'manual' && slot !== 'default' && !WEATHER_SLOTS.has(slot)) {
      return NextResponse.json({ ok: false, error: '배경 슬롯이 올바르지 않습니다.' }, { status: 400 })
    }

    const db = createMoniServiceRoleClient()
    const filePath = `default/${slot}/${Date.now()}-${crypto.randomUUID()}.${extensionFor(file.type)}`
    const bytes = new Uint8Array(await file.arrayBuffer())
    const { error: uploadError } = await db.storage.from(BUCKET).upload(filePath, bytes, {
      contentType: file.type,
      cacheControl: '3600',
      upsert: false,
    })
    if (uploadError) throw new Error(uploadError.message)

    const { data: publicUrlData } = db.storage.from(BUCKET).getPublicUrl(filePath)
    const publicUrl = publicUrlData.publicUrl

    const { data: current, error: readError } = await db
      .from('moni_ui_settings')
      .select('weather_backgrounds')
      .eq('id', SETTINGS_ID)
      .single()
    if (readError) throw new Error(readError.message)

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (slot === 'manual') update.manual_background_url = publicUrl
    else if (slot === 'default') update.default_background_url = publicUrl
    else update.weather_backgrounds = { ...(current?.weather_backgrounds || {}), [slot]: publicUrl }

    const { error: updateError } = await db.from('moni_ui_settings').update(update).eq('id', SETTINGS_ID)
    if (updateError) throw new Error(updateError.message)

    return NextResponse.json({ ok: true, url: publicUrl, slot })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : '배경 이미지 업로드에 실패했습니다.' }, { status: 500 })
  }
}
