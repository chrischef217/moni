import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

type HolidayMap = Record<string, string[]>

function normalizeHolidayMap(value: unknown): HolidayMap {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}

  const result: HolidayMap = {}
  for (const [date, names] of Object.entries(value)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Array.isArray(names)) continue
    const normalizedNames = names.map((name) => String(name).trim()).filter(Boolean)
    if (normalizedNames.length > 0) result[date] = normalizedNames
  }
  return result
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const year = String(searchParams.get('year') ?? '').trim()

  if (!/^20\d{2}$/.test(year)) {
    return NextResponse.json({ ok: false, error: '연도 형식이 올바르지 않습니다.' }, { status: 400 })
  }

  const sourceUrl = `https://raw.githubusercontent.com/hyunbinseo/holidays-kr/main/public/${year}.json`

  try {
    const response = await fetch(sourceUrl, { next: { revalidate: 21600 } })

    if (response.status === 404) {
      return NextResponse.json({ ok: true, year, holidays: {} })
    }
    if (!response.ok) throw new Error(`holiday source ${response.status}`)

    const holidays = normalizeHolidayMap(await response.json())
    return NextResponse.json(
      { ok: true, year, holidays },
      { headers: { 'Cache-Control': 'public, s-maxage=21600, stale-while-revalidate=86400' } },
    )
  } catch {
    return NextResponse.json(
      { ok: false, error: '대한민국 휴일 정보를 불러오지 못했습니다.' },
      { status: 502 },
    )
  }
}
