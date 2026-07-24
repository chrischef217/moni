import { NextRequest, NextResponse } from 'next/server'
import { createMoniServiceRoleClient } from '@/lib/moni/db'
import { getSessionFromRequest } from '@/lib/allowance/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SETTINGS_ID = 'default'
const KMA_ENDPOINT = 'https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtFcst'

type ForecastItem = {
  category?: string
  fcstDate?: string
  fcstTime?: string
  fcstValue?: string
}

type UiSettings = {
  background_mode: 'weather' | 'manual' | 'default'
  location_label: string
  kma_nx: number | null
  kma_ny: number | null
  weather_refresh_minutes: number
  manual_background_url: string | null
  default_background_url: string | null
  weather_backgrounds: Record<string, string>
  weather_last_condition: string | null
  weather_last_temperature: number | null
  weather_last_synced_at: string | null
}

function kstParts(date: Date) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]))
  return {
    date: `${parts.year}${parts.month}${parts.day}`,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    displayDate: `${parts.year}-${parts.month}-${parts.day}`,
    displayTime: `${parts.hour}:${parts.minute}`,
  }
}

function latestUltraShortBase(now: Date) {
  const shifted = new Date(now.getTime() - 45 * 60 * 1000)
  const parts = kstParts(shifted)
  return { baseDate: parts.date, baseTime: `${String(parts.hour).padStart(2, '0')}30` }
}

function isDaytime(date = new Date()) {
  const hour = kstParts(date).hour
  return hour >= 6 && hour < 19
}

function classifyCondition(sky: string | undefined, pty: string | undefined, daytime: boolean) {
  const suffix = daytime ? 'day' : 'night'
  const precipitation = Number(pty || 0)
  if ([3, 7].includes(precipitation)) return `snow_${suffix}`
  if ([1, 2, 5, 6].includes(precipitation)) return `rain_${suffix}`
  if (String(sky || '1') === '1') return `clear_${suffix}`
  return `cloudy_${suffix}`
}

function conditionLabel(condition: string) {
  if (condition.startsWith('clear')) return '맑음'
  if (condition.startsWith('rain')) return '비'
  if (condition.startsWith('snow')) return '눈'
  if (condition.startsWith('cloudy')) return '흐림/구름'
  return '기본 배경'
}

function fallbackCondition(settings: UiSettings) {
  const condition = settings.weather_last_condition || (isDaytime() ? 'clear_day' : 'clear_night')
  return {
    condition,
    condition_label: conditionLabel(condition),
    temperature: settings.weather_last_temperature,
    source: settings.weather_last_condition ? 'cached' : 'fallback',
    synced_at: settings.weather_last_synced_at,
  }
}

async function requireAdmin(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  if (!session || session.role !== 'admin') return null
  return session
}

export async function GET(request: NextRequest) {
  if (!await requireAdmin(request)) {
    return NextResponse.json({ ok: false, error: '관리자 권한이 필요합니다.' }, { status: 401 })
  }

  try {
    const db = createMoniServiceRoleClient()
    const { data, error } = await db
      .from('moni_ui_settings')
      .select('*')
      .eq('id', SETTINGS_ID)
      .single()

    if (error) throw new Error(error.message)
    const settings = data as UiSettings
    const fallback = fallbackCondition(settings)
    const key = process.env.KMA_SERVICE_KEY?.trim()

    if (!key || !settings.kma_nx || !settings.kma_ny) {
      return NextResponse.json({
        ok: true,
        weather: fallback,
        location_label: settings.location_label,
        refresh_minutes: settings.weather_refresh_minutes,
        background_mode: settings.background_mode,
        background_url: selectBackground(settings, fallback.condition),
        status: !key ? 'KMA_KEY_REQUIRED' : 'LOCATION_REQUIRED',
      })
    }

    const { baseDate, baseTime } = latestUltraShortBase(new Date())
    const url = new URL(KMA_ENDPOINT)
    url.searchParams.set('serviceKey', key)
    url.searchParams.set('pageNo', '1')
    url.searchParams.set('numOfRows', '1000')
    url.searchParams.set('dataType', 'JSON')
    url.searchParams.set('base_date', baseDate)
    url.searchParams.set('base_time', baseTime)
    url.searchParams.set('nx', String(settings.kma_nx))
    url.searchParams.set('ny', String(settings.kma_ny))

    const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(8000) })
    if (!response.ok) throw new Error(`기상청 응답 오류 ${response.status}`)
    const payload = await response.json() as any
    const resultCode = payload?.response?.header?.resultCode
    if (resultCode !== '00') throw new Error(payload?.response?.header?.resultMsg || `기상청 오류 ${resultCode || 'UNKNOWN'}`)

    const items = (payload?.response?.body?.items?.item || []) as ForecastItem[]
    if (!items.length) throw new Error('기상청 예보 데이터가 비어 있습니다.')

    const nowParts = kstParts(new Date())
    const currentKey = `${nowParts.date}${String(nowParts.hour).padStart(2, '0')}${String(nowParts.minute).padStart(2, '0')}`
    const forecastKeys = Array.from(new Set(items.map((item) => `${item.fcstDate || ''}${item.fcstTime || ''}`))).filter(Boolean).sort()
    const selectedKey = forecastKeys.find((keyValue) => keyValue >= currentKey) || forecastKeys[forecastKeys.length - 1]
    const selected = items.filter((item) => `${item.fcstDate || ''}${item.fcstTime || ''}` === selectedKey)
    const values = new Map(selected.map((item) => [String(item.category || ''), String(item.fcstValue || '')]))
    const condition = classifyCondition(values.get('SKY'), values.get('PTY'), isDaytime())
    const temperatureRaw = Number(values.get('T1H'))
    const temperature = Number.isFinite(temperatureRaw) ? temperatureRaw : null
    const syncedAt = new Date().toISOString()

    await db
      .from('moni_ui_settings')
      .update({
        weather_last_condition: condition,
        weather_last_temperature: temperature,
        weather_last_synced_at: syncedAt,
      })
      .eq('id', SETTINGS_ID)

    return NextResponse.json({
      ok: true,
      weather: {
        condition,
        condition_label: conditionLabel(condition),
        temperature,
        source: 'kma',
        synced_at: syncedAt,
      },
      location_label: settings.location_label,
      refresh_minutes: settings.weather_refresh_minutes,
      background_mode: settings.background_mode,
      background_url: selectBackground(settings, condition),
      status: 'LIVE',
    })
  } catch (error) {
    try {
      const db = createMoniServiceRoleClient()
      const { data } = await db.from('moni_ui_settings').select('*').eq('id', SETTINGS_ID).single()
      if (data) {
        const settings = data as UiSettings
        const fallback = fallbackCondition(settings)
        return NextResponse.json({
          ok: true,
          weather: fallback,
          location_label: settings.location_label,
          refresh_minutes: settings.weather_refresh_minutes,
          background_mode: settings.background_mode,
          background_url: selectBackground(settings, fallback.condition),
          status: 'FALLBACK',
          warning: error instanceof Error ? error.message : '날씨 조회에 실패해 마지막 정상값을 사용합니다.',
        })
      }
    } catch {
      // fall through
    }
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : '날씨 정보를 불러오지 못했습니다.' }, { status: 500 })
  }
}

function selectBackground(settings: UiSettings, condition: string) {
  if (settings.background_mode === 'manual') return settings.manual_background_url || settings.default_background_url || null
  if (settings.background_mode === 'default') return settings.default_background_url || null
  return settings.weather_backgrounds?.[condition] || settings.default_background_url || null
}
