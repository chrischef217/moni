'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

type WeatherResponse = {
  ok: boolean
  error?: string
  warning?: string
  status?: string
  location_label?: string
  refresh_minutes?: number
  background_mode?: 'weather' | 'manual' | 'default'
  background_url?: string | null
  weather?: {
    condition: string
    condition_label: string
    temperature: number | null
    humidity: number | null
    wind_speed_mps: number | null
    source: string
    synced_at: string | null
  }
}

const FALLBACK_GRADIENTS: Record<string, string> = {
  clear_day: 'linear-gradient(160deg, #56b8ff 0%, #b9e7ff 48%, #d8f1d0 100%)',
  clear_night: 'linear-gradient(160deg, #071426 0%, #173a67 50%, #385f87 100%)',
  cloudy_day: 'linear-gradient(160deg, #8fb7d6 0%, #d8e6ef 54%, #b7c8d1 100%)',
  cloudy_night: 'linear-gradient(160deg, #111c2f 0%, #34465d 55%, #59697c 100%)',
  rain_day: 'linear-gradient(160deg, #55788f 0%, #91aabd 52%, #4e6a72 100%)',
  rain_night: 'linear-gradient(160deg, #07111d 0%, #21374b 52%, #3e5964 100%)',
  snow_day: 'linear-gradient(160deg, #b7d9ed 0%, #edf7fd 55%, #d9e7ec 100%)',
  snow_night: 'linear-gradient(160deg, #15243a 0%, #6c88a4 52%, #d3e2ea 100%)',
}

function backgroundStyle(payload: WeatherResponse | null) {
  const condition = payload?.weather?.condition || 'clear_day'
  const gradient = FALLBACK_GRADIENTS[condition] || FALLBACK_GRADIENTS.clear_day
  if (payload?.background_url) {
    const safeUrl = payload.background_url.replace(/["'()\\]/g, '')
    return {
      backgroundImage: `linear-gradient(rgba(10, 40, 70, 0.10), rgba(10, 40, 70, 0.12)), url("${safeUrl}")`,
      backgroundColor: '#8fcff5',
    }
  }
  return { backgroundImage: gradient, backgroundColor: '#8fcff5' }
}

function weatherDateLabel() {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(new Date()).replace(/\s([월화수목금토일])요일$/, ' · $1요일')
}

function WeatherIcon({ condition }: { condition: string }) {
  const common = { width: 34, height: 34, viewBox: '0 0 40 40', fill: 'none' }

  if (condition.startsWith('rain')) {
    return <svg {...common} aria-hidden="true"><path d="M12 25.5h16a6 6 0 0 0 .7-11.96A9 9 0 0 0 11.3 15 5.3 5.3 0 0 0 12 25.5Z" fill="#90B8D3"/><path d="M14 29l-1.3 3M20 29l-1.3 3M26 29l-1.3 3" stroke="#4C9BD4" strokeWidth="2.2" strokeLinecap="round"/></svg>
  }
  if (condition.startsWith('snow')) {
    return <svg {...common} aria-hidden="true"><path d="M12 24h16a6 6 0 0 0 .7-11.96A9 9 0 0 0 11.3 13.5 5.3 5.3 0 0 0 12 24Z" fill="#A8C8DD"/><path d="M15 29h4M17 27v4M23 29h4M25 27v4" stroke="#6FA7C8" strokeWidth="1.7" strokeLinecap="round"/></svg>
  }
  if (condition.startsWith('cloudy')) {
    return <svg {...common} aria-hidden="true"><circle cx="14" cy="14" r="7" fill="#FFD86B"/><path d="M12 27h17a6.5 6.5 0 0 0 .4-12.98A8.3 8.3 0 0 0 13.5 17 5.2 5.2 0 0 0 12 27Z" fill="#A9C4D7"/></svg>
  }
  if (condition.endsWith('night')) {
    return <svg {...common} aria-hidden="true"><path d="M26.7 27.8A12 12 0 0 1 15.2 9.2 12 12 0 1 0 26.7 27.8Z" fill="#6B8EB8"/><circle cx="29" cy="11" r="1.8" fill="#C7DCF0"/></svg>
  }
  return <svg {...common} aria-hidden="true"><circle cx="20" cy="20" r="7.2" fill="#FFC23C"/><g stroke="#F4AD19" strokeWidth="2.2" strokeLinecap="round"><path d="M20 5v5M20 30v5M5 20h5M30 20h5M9.5 9.5l3.5 3.5M27 27l3.5 3.5M30.5 9.5 27 13M13 27l-3.5 3.5"/></g></svg>
}

function LocationIcon() {
  return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 21s7-6.1 7-12a7 7 0 1 0-14 0c0 5.9 7 12 7 12Z" stroke="currentColor" strokeWidth="2"/><circle cx="12" cy="9" r="2.2" fill="currentColor"/></svg>
}

function HumidityIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3s5 6 5 10a5 5 0 0 1-10 0c0-4 5-10 5-10Z" stroke="currentColor" strokeWidth="1.8"/><path d="M9.2 14.4c.7 1.3 1.6 1.9 2.8 1.9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
}

function WindIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 8h10.5c2.7 0 2.7-4 0-4-1.3 0-2.1.7-2.4 1.5M3 12h15c3 0 3 4.5 0 4.5-1.4 0-2.3-.8-2.6-1.7M3 16h7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
}

export default function MoniWeatherShell({ children }: { children: React.ReactNode }) {
  const [weather, setWeather] = useState<WeatherResponse | null>(null)

  const loadWeather = useCallback(async () => {
    try {
      const response = await fetch(`/api/moni/weather?_=${Date.now()}`, { cache: 'no-store' })
      const payload = await response.json() as WeatherResponse
      if (response.ok && payload.ok) setWeather(payload)
    } catch {
      // The app must remain usable even if the external weather API is unavailable.
    }
  }, [])

  useEffect(() => { void loadWeather() }, [loadWeather])

  useEffect(() => {
    const minutes = Math.max(10, Math.min(180, Number(weather?.refresh_minutes || 30)))
    const timer = window.setInterval(() => void loadWeather(), minutes * 60 * 1000)
    return () => window.clearInterval(timer)
  }, [weather?.refresh_minutes, loadWeather])

  const stageStyle = useMemo(() => backgroundStyle(weather), [weather])
  const current = weather?.weather
  const temperature = current?.temperature
  const humidity = current?.humidity
  const windSpeed = current?.wind_speed_mps
  const condition = current?.condition || 'clear_day'

  return (
    <div data-moni-weather-stage className="moni-weather-stage" style={stageStyle}>
      <div className="moni-weather-stage__veil" aria-hidden="true" />
      <div data-moni-app-shell className="moni-app-shell">
        <div data-moni-app-content className="moni-app-content">{children}</div>
        <a className="moni-weather-badge moni-weather-card" href="/settings/appearance" aria-label="날씨 및 배경 설정 열기">
          <div className="moni-weather-card__date">{weatherDateLabel()}</div>
          <div className="moni-weather-card__main">
            <span className="moni-weather-card__icon"><WeatherIcon condition={condition} /></span>
            <span className="moni-weather-card__temperature">
              <strong>{typeof temperature === 'number' ? `${Math.round(temperature)}°C` : '--°C'}</strong>
              <small>{current?.condition_label || '날씨 연결 준비'}</small>
            </span>
          </div>
          <div className="moni-weather-card__location"><LocationIcon /><span>{weather?.location_label || '대한민국'}</span></div>
          <div className="moni-weather-card__metrics">
            <div><span><HumidityIcon />습도</span><b>{typeof humidity === 'number' ? `${Math.round(humidity)}%` : '--'}</b></div>
            <div><span><WindIcon />풍속</span><b>{typeof windSpeed === 'number' ? `${windSpeed.toFixed(1)} m/s` : '--'}</b></div>
          </div>
        </a>
      </div>
    </div>
  )
}
