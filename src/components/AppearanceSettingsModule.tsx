'use client'

import { useEffect, useMemo, useState } from 'react'

type Mode = 'weather' | 'manual' | 'default'

type Settings = {
  background_mode: Mode
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
}

type SettingsResponse = { ok: boolean; error?: string; settings?: Settings; kma_configured?: boolean }

const WEATHER_SLOTS = [
  ['clear_day', '맑음 · 낮'],
  ['clear_night', '맑음 · 밤'],
  ['cloudy_day', '구름/흐림 · 낮'],
  ['cloudy_night', '구름/흐림 · 밤'],
  ['rain_day', '비 · 낮'],
  ['rain_night', '비 · 밤'],
  ['snow_day', '눈 · 낮'],
  ['snow_night', '눈 · 밤'],
] as const

function Preview({ url, label }: { url?: string | null; label: string }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[#cfe1ef] bg-[#eef6fc]">
      <div className="aspect-[16/9] bg-gradient-to-br from-[#7ec8f5] via-[#dff2fc] to-[#d8efcf]" style={url ? { backgroundImage: `url(${JSON.stringify(url).slice(1, -1)})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined} />
      <div className="px-3 py-2 text-xs font-semibold text-[#516f83]">{label}</div>
    </div>
  )
}

export default function AppearanceSettingsModule() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [kmaConfigured, setKmaConfigured] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`/api/moni/ui-settings?_=${Date.now()}`, { cache: 'no-store' })
      const payload = await response.json() as SettingsResponse
      if (!response.ok || !payload.ok || !payload.settings) throw new Error(payload.error || '설정을 불러오지 못했습니다.')
      setSettings(payload.settings)
      setKmaConfigured(Boolean(payload.kma_configured))
    } catch (err) {
      setError(err instanceof Error ? err.message : '설정을 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const locationReady = useMemo(() => Boolean(settings?.kma_nx && settings?.kma_ny), [settings?.kma_nx, settings?.kma_ny])

  async function save() {
    if (!settings) return
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const response = await fetch('/api/moni/ui-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
      const payload = await response.json() as SettingsResponse
      if (!response.ok || !payload.ok || !payload.settings) throw new Error(payload.error || '설정 저장에 실패했습니다.')
      setSettings(payload.settings)
      setMessage('화면 및 날씨 배경 설정을 저장했습니다.')
      window.setTimeout(() => window.location.reload(), 450)
    } catch (err) {
      setError(err instanceof Error ? err.message : '설정 저장에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setError('이 브라우저에서는 위치 확인을 사용할 수 없습니다.')
      return
    }
    setError('')
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setSettings((current) => current ? {
          ...current,
          latitude: Number(position.coords.latitude.toFixed(6)),
          longitude: Number(position.coords.longitude.toFixed(6)),
          kma_nx: null,
          kma_ny: null,
        } : current)
        setMessage('현재 위치를 입력했습니다. 저장하면 기상청 격자로 자동 변환됩니다.')
      },
      () => setError('현재 위치를 가져오지 못했습니다. 브라우저 위치 권한을 확인해 주세요.'),
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  async function upload(slot: string, file: File | null) {
    if (!file) return
    setUploading(slot)
    setError('')
    setMessage('')
    try {
      const formData = new FormData()
      formData.append('slot', slot)
      formData.append('file', file)
      const response = await fetch('/api/moni/ui-settings/background', { method: 'POST', body: formData })
      const payload = await response.json() as { ok: boolean; error?: string; url?: string }
      if (!response.ok || !payload.ok || !payload.url) throw new Error(payload.error || '이미지 업로드에 실패했습니다.')
      await load()
      setMessage('배경 이미지를 변경했습니다.')
    } catch (err) {
      setError(err instanceof Error ? err.message : '이미지 업로드에 실패했습니다.')
    } finally {
      setUploading('')
    }
  }

  if (loading) return <main className="min-h-full p-8 text-[#5e7484]">화면 설정을 불러오는 중입니다.</main>
  if (!settings) return <main className="min-h-full p-8 text-red-600">{error || '화면 설정을 사용할 수 없습니다.'}</main>

  return (
    <main className="min-h-full p-5 text-[#183648] md:p-8">
      <div className="mx-auto max-w-6xl space-y-5">
        <header className="rounded-3xl border border-[#cfe1ef] bg-white/75 p-6 shadow-[0_16px_36px_rgba(47,92,124,0.08)]">
          <p className="text-xs font-bold tracking-[0.12em] text-[#208fe4]">MONI APPEARANCE</p>
          <h1 className="mt-2 text-3xl font-black">화면 · 날씨 배경 설정</h1>
          <p className="mt-2 text-sm leading-6 text-[#6b8292]">PC에서는 날씨 배경 위에 MONI가 작은 Floating App으로 표시됩니다. 모바일은 작업공간 확보를 위해 전체 화면을 사용합니다.</p>
        </header>

        {(error || message) && <div className={`rounded-2xl border px-4 py-3 text-sm ${error ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>{error || message}</div>}

        <section className="grid gap-5 lg:grid-cols-2">
          <div className="rounded-3xl border border-[#cfe1ef] bg-white/75 p-5">
            <h2 className="text-lg font-black">배경 동작</h2>
            <div className="mt-4 grid gap-2">
              {([
                ['weather', '날씨 자동', '기상청 현재 예보 상태에 맞는 배경을 자동 선택합니다.'],
                ['manual', '수동 고정', '관리자가 선택한 한 장의 배경을 계속 사용합니다.'],
                ['default', '기본 배경', '날씨와 무관하게 기본 배경 한 장을 사용합니다.'],
              ] as const).map(([value, label, description]) => (
                <label key={value} className={`flex cursor-pointer gap-3 rounded-2xl border p-4 ${settings.background_mode === value ? 'border-[#74bdf0] bg-[#edf8ff]' : 'border-[#dbe8f2] bg-white/60'}`}>
                  <input type="radio" checked={settings.background_mode === value} onChange={() => setSettings({ ...settings, background_mode: value })} />
                  <span><b className="block">{label}</b><span className="mt-1 block text-xs leading-5 text-[#7890a0]">{description}</span></span>
                </label>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-[#cfe1ef] bg-white/75 p-5">
            <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-black">대한민국 기준 위치</h2><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${kmaConfigured && locationReady ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{kmaConfigured && locationReady ? '날씨 자동 준비됨' : '설정 필요'}</span></div>
            <label className="mt-4 block text-sm font-semibold">표시 위치명<input value={settings.location_label} onChange={(event) => setSettings({ ...settings, location_label: event.target.value })} className="mt-1 w-full rounded-xl border px-3 py-2.5" placeholder="예: 경기도 여주시 점동면" /></label>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <label className="text-sm font-semibold">위도<input type="number" step="0.000001" value={settings.latitude ?? ''} onChange={(event) => setSettings({ ...settings, latitude: event.target.value ? Number(event.target.value) : null, kma_nx: null, kma_ny: null })} className="mt-1 w-full rounded-xl border px-3 py-2.5" /></label>
              <label className="text-sm font-semibold">경도<input type="number" step="0.000001" value={settings.longitude ?? ''} onChange={(event) => setSettings({ ...settings, longitude: event.target.value ? Number(event.target.value) : null, kma_nx: null, kma_ny: null })} className="mt-1 w-full rounded-xl border px-3 py-2.5" /></label>
            </div>
            <button type="button" onClick={useCurrentLocation} className="mt-3 rounded-xl border border-[#b8d7eb] bg-white px-3 py-2 text-sm font-bold text-[#2678ad]">현재 브라우저 위치 사용</button>
            <div className="mt-4 rounded-2xl bg-[#f2f8fc] p-3 text-xs leading-5 text-[#6d8494]">저장 후 위도·경도는 기상청 격자 X/Y로 자동 변환됩니다. 현재 격자: {settings.kma_nx ?? '-'} / {settings.kma_ny ?? '-'}</div>
            <label className="mt-4 block text-sm font-semibold">날씨 갱신 주기<select value={settings.weather_refresh_minutes} onChange={(event) => setSettings({ ...settings, weather_refresh_minutes: Number(event.target.value) })} className="mt-1 w-full rounded-xl border px-3 py-2.5"><option value={10}>10분</option><option value={30}>30분</option><option value={60}>60분</option><option value={120}>120분</option></select></label>
            {!kmaConfigured && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-800">MONI 서버에 KMA_SERVICE_KEY가 아직 설정되지 않았습니다. 키가 없을 때는 마지막 정상 날씨 또는 기본 배경으로 안전하게 표시됩니다.</p>}
          </div>
        </section>

        <section className="rounded-3xl border border-[#cfe1ef] bg-white/75 p-5">
          <div><h2 className="text-lg font-black">기본 · 수동 배경</h2><p className="mt-1 text-xs text-[#7890a0]">JPG, PNG, WEBP · 최대 10MB</p></div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div><Preview url={settings.default_background_url} label="Fallback 기본 배경" /><label className="mt-2 block cursor-pointer rounded-xl border border-dashed border-[#9fc7e2] bg-[#f5fbff] px-3 py-2 text-center text-sm font-bold text-[#2678ad]">{uploading === 'default' ? '업로드 중...' : '기본 배경 업로드'}<input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" disabled={Boolean(uploading)} onChange={(event) => void upload('default', event.target.files?.[0] || null)} /></label></div>
            <div><Preview url={settings.manual_background_url} label="수동 고정 배경" /><label className="mt-2 block cursor-pointer rounded-xl border border-dashed border-[#9fc7e2] bg-[#f5fbff] px-3 py-2 text-center text-sm font-bold text-[#2678ad]">{uploading === 'manual' ? '업로드 중...' : '수동 배경 업로드'}<input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" disabled={Boolean(uploading)} onChange={(event) => void upload('manual', event.target.files?.[0] || null)} /></label></div>
          </div>
        </section>

        <section className="rounded-3xl border border-[#cfe1ef] bg-white/75 p-5">
          <h2 className="text-lg font-black">날씨별 사진 라이브러리</h2>
          <p className="mt-1 text-xs leading-5 text-[#7890a0]">날씨 자동 모드에서 현재 상태에 맞는 사진을 선택합니다. 사진이 없는 상태는 기본 배경으로 Fallback합니다.</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {WEATHER_SLOTS.map(([slot, label]) => <div key={slot}><Preview url={settings.weather_backgrounds?.[slot]} label={label} /><label className="mt-2 block cursor-pointer rounded-xl border border-dashed border-[#9fc7e2] bg-[#f5fbff] px-3 py-2 text-center text-xs font-bold text-[#2678ad]">{uploading === slot ? '업로드 중...' : '사진 변경'}<input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" disabled={Boolean(uploading)} onChange={(event) => void upload(slot, event.target.files?.[0] || null)} /></label></div>)}
          </div>
        </section>

        <div className="sticky bottom-4 flex justify-end"><button type="button" onClick={() => void save()} disabled={saving} className="rounded-2xl bg-[#208fe4] px-6 py-3 text-sm font-black text-white shadow-[0_10px_24px_rgba(32,143,228,0.22)] disabled:opacity-50">{saving ? '저장 중...' : '전체 설정 저장'}</button></div>
      </div>
    </main>
  )
}
