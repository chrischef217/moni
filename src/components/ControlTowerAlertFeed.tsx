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
  if (value === 'critical') return 'border-red-400/30 bg-red-500/[0.07] text-red-100'
  if (value === 'high') return 'border-orange-400/25 bg-orange-500/[0.06] text-orange-100'
  if (value === 'attention') return 'border-amber-400/25 bg-amber-500/[0.05] text-amber-100'
  if (value === 'data') return 'border-blue-400/20 bg-blue-500/[0.04] text-blue-100'
  return 'border-white/10 bg-white/[0.025] text-slate-200'
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
    <section className="bg-[#071426] px-4 pb-8 text-slate-100 md:px-8">
      <div className="mx-auto max-w-[1700px] rounded-3xl border border-white/10 bg-[#0b1b30]/95 p-5 shadow-[0_20px_55px_rgba(2,6,23,0.28)] lg:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-cyan-300">
              MONI ALERTS
              {(data?.summary.unread_count ?? 0) > 0 && <span className="rounded-full bg-blue-400 px-2 py-0.5 text-[10px] tracking-normal text-slate-950">미확인 {data?.summary.unread_count}</span>}
            </div>
            <h2 className="mt-1 text-xl font-black text-white">지금 놓치면 안 되는 것</h2>
            <p className="mt-1 text-sm text-slate-500">확인·처리·해결 상태가 Intelligence Board와 동일하게 유지됩니다.</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-xl border border-white/10 px-3 py-2 text-xs font-bold text-slate-400">열린 알림 {data?.summary.open_count ?? 0}</span>
            <button type="button" onClick={() => void openBoard()} className="rounded-xl border border-cyan-400/25 bg-cyan-400/[0.06] px-4 py-2 text-xs font-black text-cyan-100">전체 Board →</button>
          </div>
        </div>

        {error && <div className="mt-4 rounded-xl border border-red-400/20 bg-red-400/[0.05] px-4 py-3 text-sm text-red-200">{error}</div>}

        <div className="mt-4 grid gap-3 xl:grid-cols-5">
          {loading && Array.from({ length: 5 }).map((_, index) => <div key={index} className="min-h-[132px] animate-pulse rounded-2xl border border-white/8 bg-white/[0.025]" />)}
          {!loading && openEvents.map((event) => (
            <button key={event.id} type="button" onClick={() => void openBoard(event)} className={`min-h-[132px] rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 hover:border-white/30 ${severityClass(event.severity)}`}>
              <div className="flex items-center justify-between gap-2 text-[11px] font-black">
                <span>{severityLabel(event.severity)} · {statusLabel(event.status)}</span>
                {!event.read_at && <span className="h-2 w-2 rounded-full bg-blue-300" />}
              </div>
              <div className="mt-2 line-clamp-2 text-sm font-black leading-5 text-white">{event.title}</div>
              <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] opacity-60">
                {event.impact_amount > 0 && <span>{won(event.impact_amount)}</span>}
                {event.due_date && <span>{event.due_date}</span>}
                <span>{new Date(event.last_detected_at).toLocaleDateString('ko-KR')}</span>
              </div>
            </button>
          ))}
          {!loading && openEvents.length === 0 && <div className="col-span-full rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.04] p-7 text-center"><b className="text-emerald-100">현재 열린 MONI 알림이 없습니다.</b><p className="mt-1 text-sm text-slate-500">관리자 화면 진입 시 Intelligence 조건이 자동 동기화됩니다.</p></div>}
        </div>
      </div>
    </section>
  )
}
