import { NextRequest, NextResponse } from 'next/server'
import { createMoniServiceRoleClient } from '@/lib/moni/db'
import { getSessionFromRequest } from '@/lib/allowance/session'
import { toKmaGrid } from '@/lib/moni/kma-grid'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SETTINGS_ID = 'default'
const BACKGROUND_MODES = new Set(['weather', 'manual', 'default'])
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

type UiSettingsRow = {
  id: string
  background_mode: 'weather' | 'manual' | 'default'
  location_label: string
  latitude: number | null
  longitude: number | null
  kma_nx: number | null
  kma_ny: number | null
  weather_refresh_minutes: number
  manual_background_url: string | null
  default_background_url: string | null
  weather_backgrounds: Record<string, string>
  weather_last_condition: string | null
  weather_last_temperature: number | null
  weather_last_synced_at: string | null
  updated_at: string
}

async function requireAdmin(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  if (!session || session.role !== 'admin') return null
  return session
}

async function readSettings() {
  const db = createMoniServiceRoleClient()
  const { data, error } = await db
    .from('moni_ui_settings')
    .select('*')
    .eq('id', SETTINGS_ID)
    .maybeSingle()

  if (error) throw new Error(error.message)

  if (data) return data as UiSettingsRow

  const { data: inserted, error: insertError } = await db
    .from('moni_ui_settings')
    .insert({ id: SETTINGS_ID })
    .select('*')
    .single()

  if (insertError) throw new Error(insertError.message)
  return inserted as UiSettingsRow
}

export async function GET(request: NextRequest) {
  if (!await requireAdmin(request)) {
    return NextResponse.json({ ok: false, error: '관리자 권한이 필요합니다.' }, { status: 401 })
  }

  try {
    const settings = await readSettings()
    return NextResponse.json({
      ok: true,
      settings,
      kma_configured: Boolean(process.env.KMA_SERVICE_KEY?.trim()),
    })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : '화면 설정을 불러오지 못했습니다.' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  if (!await requireAdmin(request)) {
    return NextResponse.json({ ok: false, error: '관리자 권한이 필요합니다.' }, { status: 401 })
  }

  try {
    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    if (!body) return NextResponse.json({ ok: false, error: '저장할 설정이 없습니다.' }, { status: 400 })

    const current = await readSettings()
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() }

    if (typeof body.background_mode === 'string') {
      if (!BACKGROUND_MODES.has(body.background_mode)) {
        return NextResponse.json({ ok: false, error: '배경 모드가 올바르지 않습니다.' }, { status: 400 })
      }
      update.background_mode = body.background_mode
    }

    if (typeof body.location_label === 'string') {
      const label = body.location_label.trim()
      if (!label) return NextResponse.json({ ok: false, error: '기준 위치명을 입력해 주세요.' }, { status: 400 })
      update.location_label = label.slice(0, 120)
    }

    const latitude = body.latitude === null || body.latitude === '' ? null : Number(body.latitude)
    const longitude = body.longitude === null || body.longitude === '' ? null : Number(body.longitude)
    if (body.latitude !== undefined || body.longitude !== undefined) {
      if (latitude === null || longitude === null) {
        update.latitude = null
        update.longitude = null
        update.kma_nx = null
        update.kma_ny = null
      } else {
        const grid = toKmaGrid(latitude, longitude)
        update.latitude = latitude
        update.longitude = longitude
        update.kma_nx = grid.nx
        update.kma_ny = grid.ny
      }
    }

    if (body.weather_refresh_minutes !== undefined) {
      const minutes = Number(body.weather_refresh_minutes)
      if (!Number.isInteger(minutes) || minutes < 10 || minutes > 180) {
        return NextResponse.json({ ok: false, error: '날씨 갱신 주기는 10~180분 사이로 설정해 주세요.' }, { status: 400 })
      }
      update.weather_refresh_minutes = minutes
    }

    for (const field of ['manual_background_url', 'default_background_url'] as const) {
      if (body[field] !== undefined) {
        const value = typeof body[field] === 'string' ? body[field].trim() : ''
        update[field] = value || null
      }
    }

    if (body.weather_backgrounds && typeof body.weather_backgrounds === 'object') {
      const nextBackgrounds = { ...(current.weather_backgrounds || {}) }
      for (const [slot, rawUrl] of Object.entries(body.weather_backgrounds as Record<string, unknown>)) {
        if (!WEATHER_SLOTS.has(slot)) continue
        const url = typeof rawUrl === 'string' ? rawUrl.trim() : ''
        if (url) nextBackgrounds[slot] = url
        else delete nextBackgrounds[slot]
      }
      update.weather_backgrounds = nextBackgrounds
    }

    const db = createMoniServiceRoleClient()
    const { data, error } = await db
      .from('moni_ui_settings')
      .update(update)
      .eq('id', SETTINGS_ID)
      .select('*')
      .single()

    if (error) throw new Error(error.message)

    return NextResponse.json({ ok: true, settings: data as UiSettingsRow })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : '화면 설정 저장에 실패했습니다.' }, { status: 500 })
  }
}
