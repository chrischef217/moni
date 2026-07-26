'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

type AlertEvent = {
  id: string
  category: string
  severity: 'critical' | 'high' | 'attention' | 'data' | 'info'
  status: 'new' | 'sent' | 'acknowledged' | 'in_progress' | 'resolved' | 'ignored' | 'deferred'
  title: string
  summary?: string | null
  impact_amount: number
  due_date?: string | null
  last_detected_at: string
  read_at?: string | null
}

type AlertPayload = {
  ok: boolean
  error?: string
  events: AlertEvent[]
  summary: {
    open_count: number
    critical_count: number
    high_count: number
    unread_count: number
  }
}

const OPEN = new Set(['new', 'sent', 'acknowledged', 'in_progress', 'deferred'])

function won(value: unknown) {
  const parsed = Number(value ?? 0)
  return `${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 }).format(Math.round(Number.isFinite(parsed) ? parsed : 0))}원`
}

function severityLabel(value: AlertEvent['severity']) {
  if (value === 'critical') return '긴급'
  if (value === 'high') return '높음'
  if (value === 'attention') return '주의'
  if (value === 'data') return '데이터'
  return '정보'
}

function severityClass(value: AlertEvent['severity']) {
  return `moni-alert-card moni-alert-card--${value}`
}

function statusLabel(value: AlertEvent['status']) {
  if (value === 'new') return '새 알림'
  if (value === 'sent') return '전송됨'
  if (value === 'acknowledged') return '확인'
  if (value === 'in_progress') return '처리중'
  if (value === 'deferred') return '보류'
  if (value === 'resolved') return '해결'
  return '무시'
}

export default function ControlTowerAlertFeed() {
  const [data, setData] = useState<AlertPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/moni/alerts?limit=30&_=${Date.now()}`, { cache: 'no-store' })
      const payload = await response.json() as AlertPayload
      if (!response.ok || !payload.ok) throw new Error(payload.error || '알림을 불러오지 못했습니다.')
      setData(payload)
      setError('')
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '알림을 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    const onSynced = () => void load()
    window.addEventListener('moni-alerts-synced', onSynced)
    const timer = window.setInterval(() => void load(), 5 * 60 * 1000)
    return () => {
      window.removeEventListener('moni-alerts-synced', onSynced)
      window.clearInterval(timer)
    }
  }, [load])

  const openEvents = useMemo(() => (data?.events ?? []).filter((event) => OPEN.has(event.status)).slice(0, 5), [data])

  async function openBoard(event?: AlertEvent) {
    if (event && !event.read_at) {
      fetch('/api/moni/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'record_view', id: event.id }),
      }).catch(() => null)
    }
    window.location.href = '/intelligence'
  }

  return (
    <section data-moni-alert-feed className="moni-alert-feed">
      <div className="moni-alert-feed__panel">
        <header className="moni-alert-feed__header">
          <div className="moni-alert-feed__heading">
            <div className="moni-alert-feed__kicker">
              <span className="moni-alert-feed__live-dot" aria-hidden="true" />
              <span>MONI ALERTS</span>
              {(data?.summary.unread_count ?? 0) > 0 && (
                <span className="moni-alert-feed__unread">미확인 {data?.summary.unread_count}</span>
              )}
            </div>
            <h2>지금 놓치면 안 되는 것</h2>
            <p>확인 · 처리 · 해결 상태가 Intelligence Board와 실시간으로 연결됩니다.</p>
          </div>

          <div className="moni-alert-feed__actions">
            <span className="moni-alert-feed__open-count">열린 알림 <b>{data?.summary.open_count ?? 0}</b></span>
            <button type="button" onClick={() => void openBoard()} className="moni-alert-feed__board-button">
              전체 Board <span aria-hidden="true">→</span>
            </button>
          </div>
        </header>

        {error && <div className="moni-alert-feed__error">{error}</div>}

        <div className="moni-alert-feed__grid">
          {loading && Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="moni-alert-card moni-alert-card--loading" />
          ))}

          {!loading && openEvents.map((event) => (
            <button
              key={event.id}
              type="button"
              onClick={() => void openBoard(event)}
              className={severityClass(event.severity)}
            >
              <div className="moni-alert-card__meta">
                <span className="moni-alert-card__severity">{severityLabel(event.severity)} · {statusLabel(event.status)}</span>
                {!event.read_at && <span className="moni-alert-card__unread-dot" aria-label="읽지 않은 알림" />}
              </div>

              <strong className="moni-alert-card__title">{event.title}</strong>

              <div className="moni-alert-card__footer">
                {event.impact_amount > 0 && <span>{won(event.impact_amount)}</span>}
                {event.due_date && <span>{event.due_date}</span>}
                <span>{new Date(event.last_detected_at).toLocaleDateString('ko-KR')}</span>
              </div>
            </button>
          ))}

          {!loading && openEvents.length === 0 && (
            <div className="moni-alert-feed__empty">
              <b>현재 열린 MONI 알림이 없습니다.</b>
              <p>관리자 화면 진입 시 Intelligence 조건이 자동 동기화됩니다.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
