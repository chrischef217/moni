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
    return {
      backgroundImage: `linear-gradient(rgba(10, 40, 70, 0.10), rgba(10, 40, 70, 0.12)), url(${JSON.stringify(payload.background_url).slice(1, -1)})`,
      backgroundColor: '#8fcff5',
    }
  }
  return { backgroundImage: gradient, backgroundColor: '#8fcff5' }
}

export default function MoniWeatherShell({ children }: { children: React.ReactNode }) {
  const [weather, setWeather] = useState<WeatherResponse | null>(null)

  const loadWeather = useCallback(async () => {
    try {
      const response = await fetch(`/api/moni/weather?_=${Date.now()}`, { cache: 'no-store' })
      const payload = await response.json() as WeatherResponse
      if (response.ok && payload.ok) setWeather(payload)
    } catch {
      // Keep the last successful/fallback visual. The application itself must remain usable.
    }
  }, [])

  useEffect(() => {
    void loadWeather()
  }, [loadWeather])

  useEffect(() => {
    const minutes = Math.max(10, Math.min(180, Number(weather?.refresh_minutes || 30)))
    const timer = window.setInterval(() => void loadWeather(), minutes * 60 * 1000)
    return () => window.clearInterval(timer)
  }, [weather?.refresh_minutes, loadWeather])

  const stageStyle = useMemo(() => backgroundStyle(weather), [weather])
  const temperature = weather?.weather?.temperature

  return (
    <div data-moni-weather-stage className="moni-weather-stage" style={stageStyle}>
      <div className="moni-weather-stage__veil" aria-hidden="true" />
      <div data-moni-app-shell className="moni-app-shell">
        <div data-moni-app-content className="moni-app-content">
          {children}
        </div>
        <div className="moni-weather-badge" aria-live="polite">
          <div className="moni-weather-badge__dot" data-condition={weather?.weather?.condition || 'clear_day'} />
          <div>
            <div className="moni-weather-badge__location">{weather?.location_label || '대한민국'}</div>
            <div className="moni-weather-badge__status">
              {weather?.weather?.condition_label || '날씨 연결 준비'}
              {typeof temperature === 'number' ? ` · ${Math.round(temperature)}°C` : ''}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
