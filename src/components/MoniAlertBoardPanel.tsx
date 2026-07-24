'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

type AlertStatus = 'new' | 'sent' | 'acknowledged' | 'in_progress' | 'resolved' | 'ignored' | 'deferred'
type AlertSeverity = 'critical' | 'high' | 'attention' | 'data' | 'info'

type AlertEvent = {
  id: string
  dedupe_key: string
  source_type: string
  source_ref?: string | null
  category: string
  severity: AlertSeverity
  status: AlertStatus
  title: string
  summary?: string | null
  recommended_action?: string | null
  impact_amount: number
  due_date?: string | null
  deep_link?: string | null
  evidence_json?: string[] | null
  read_at?: string | null
  acknowledged_at?: string | null
  deferred_until?: string | null
  resolved_at?: string | null
  first_detected_at: string
  last_detected_at: string
  view_count: number
  reopen_count: number
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
    acknowledged_count: number
    in_progress_count: number
    deferred_count: number
  }
}

const statusLabels: Record<AlertStatus, string> = {
  new: '새 알림',
  sent: '전송됨',
  acknowledged: '확인',
  in_progress: '처리중',
  resolved: '해결',
  ignored: '무시',
  deferred: '보류',
}

const severityLabels: Record<AlertSeverity, string> = {
  critical: '긴급',
  high: '높음',
  attention: '주의',
  data: '데이터',
  info: '정보',
}

function won(value: unknown) {
  const parsed = Number(value ?? 0)
  return `${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 }).format(Math.round(Number.isFinite(parsed) ? parsed : 0))}원`
}

function severityClass(value: AlertSeverity) {
  if (value === 'critical') return 'border-red-500/35 bg-red-500/[0.07] text-red-100'
  if (value === 'high') return 'border-orange-500/30 bg-orange-500/[0.06] text-orange-100'
  if (value === 'attention') return 'border-amber-500/25 bg-amber-500/[0.05] text-amber-100'
  if (value === 'data') return 'border-blue-500/25 bg-blue-500/[0.04] text-blue-100'
  return 'border-slate-600 bg-slate-800/45 text-slate-200'
}

function statusClass(value: AlertStatus) {
  if (value === 'new') return 'border-red-400/25 bg-red-400/10 text-red-200'
  if (value === 'sent') return 'border-violet-400/25 bg-violet-400/10 text-violet-200'
  if (value === 'acknowledged') return 'border-blue-400/25 bg-blue-400/10 text-blue-200'
  if (value === 'in_progress') return 'border-amber-400/25 bg-amber-400/10 text-amber-200'
  if (value === 'deferred') return 'border-slate-500/25 bg-slate-500/10 text-slate-300'
  if (value === 'resolved') return 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200'
  return 'border-slate-600 bg-slate-800 text-slate-400'
}

function categoryLabel(value: string) {
  if (value === 'collection') return '수금'
  if (value === 'cash') return '현금'
  if (value === 'sales') return '영업'
  if (value === 'production') return '생산'
  if (value === 'tax') return '세무'
  if (value === 'data') return '데이터'
  if (value === 'external') return '외부정보'
  return '시스템'
}

export default function MoniAlertBoardPanel() {
  const [data, setData] = useState<AlertPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [workingId, setWorkingId] = useState('')
  const [expandedId, setExpandedId] = useState('')
  const [filter, setFilter] = useState<'open' | 'all' | 'resolved'>('open')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/moni/alerts?limit=150&_=${Date.now()}`, { cache: 'no-store' })
      const payload = await response.json() as AlertPayload
      if (!response.ok || !payload.ok) throw new Error(payload.error || '알림 이력을 불러오지 못했습니다.')
      setData(payload)
      setError('')
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '알림 이력을 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [])

  const sync = useCallback(async (manual = false) => {
    if (manual) setSyncing(true)
    try {
      const response = await fetch('/api/moni/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sync_intelligence' }),
      })
      const payload = await response.json() as { ok: boolean; error?: string }
      if (!response.ok || !payload.ok) throw new Error(payload.error || '현재 Intelligence 상태를 동기화하지 못했습니다.')
      await load()
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : '현재 Intelligence 상태를 동기화하지 못했습니다.')
    } finally {
      if (manual) setSyncing(false)
    }
  }, [load])

  useEffect(() => {
    void sync()
    const timer = window.setInterval(() => void sync(), 5 * 60 * 1000)
    return () => window.clearInterval(timer)
  }, [sync])

  const visible = useMemo(() => {
    const events = data?.events ?? []
    if (filter === 'all') return events
    if (filter === 'resolved') return events.filter((event) => event.status === 'resolved' || event.status === 'ignored')
    return events.filter((event) => !['resolved', 'ignored'].includes(event.status))
  }, [data, filter])

  async function updateStatus(event: AlertEvent, status: AlertStatus, deferredUntil?: string) {
    setWorkingId(event.id)
    setError('')
    try {
      const response = await fetch('/api/moni/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_status', id: event.id, status, deferred_until: deferredUntil }),
      })
      const payload = await response.json() as { ok: boolean; error?: string }
      if (!response.ok || !payload.ok) throw new Error(payload.error || '알림 상태를 변경하지 못했습니다.')
      await load()
    } catch (workError) {
      setError(workError instanceof Error ? workError.message : '알림 상태를 변경하지 못했습니다.')
    } finally {
      setWorkingId('')
    }
  }

  async function openEvent(event: AlertEvent) {
    setExpandedId((current) => current === event.id ? '' : event.id)
    if (event.read_at) return
    fetch('/api/moni/alerts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'record_view', id: event.id }),
    }).then(() => load()).catch(() => null)
  }

  function deferOneDay(event: AlertEvent) {
    const date = new Date(Date.now() + 24 * 60 * 60 * 1000)
    void updateStatus(event, 'deferred', date.toISOString())
  }

  function go(event: AlertEvent) {
    const href = event.deep_link || ''
    if (!href) return
    if (href.includes('moni_target=production-overview')) {
      window.sessionStorage.setItem('moni-pending-nav', JSON.stringify({ category: 'production', target: '생산 개요', label: '생산 대시보드', parentTarget: '생산관리' }))
      window.location.href = '/?legacy=1'
      return
    }
    if (href.includes('moni_target=raw-materials')) {
      window.sessionStorage.setItem('moni-pending-nav', JSON.stringify({ category: 'production', target: '원재료 관리', label: '원재료 관리', parentTarget: '생산관리' }))
      window.location.href = '/?legacy=1'
      return
    }
    window.location.href = href
  }

  const summary = data?.summary
  return (
    <section className="bg-[#071426] px-4 pb-8 text-slate-100 md:px-8">
      <div className="mx-auto max-w-[1500px] rounded-3xl border border-slate-700 bg-[#0b1b30] p-5 shadow-xl lg:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-300">PERSISTENT ALERT BOARD · V10</p>
            <h2 className="mt-1 text-2xl font-black">MONI 알림 이력</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">현재 Intelligence 조건을 같은 Event ID로 추적합니다. 조건이 사라지면 자동 해결되고, 다시 발생하면 재오픈됩니다. 향후 LINE도 이 Event를 그대로 사용합니다.</p>
          </div>
          <button type="button" onClick={() => void sync(true)} disabled={syncing} className="rounded-xl border border-cyan-400/25 bg-cyan-400/[0.06] px-4 py-2.5 text-sm font-black text-cyan-100 disabled:opacity-50">{syncing ? '동기화 중...' : '현재 상태 동기화'}</button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-slate-700 bg-slate-950/30 p-4"><div className="text-xs text-slate-500">열린 알림</div><div className="mt-1 text-2xl font-black">{summary?.open_count ?? 0}</div></div>
          <div className="rounded-2xl border border-red-500/25 bg-red-500/[0.05] p-4"><div className="text-xs text-red-300/70">긴급</div><div className="mt-1 text-2xl font-black text-red-100">{summary?.critical_count ?? 0}</div></div>
          <div className="rounded-2xl border border-orange-500/25 bg-orange-500/[0.04] p-4"><div className="text-xs text-orange-300/70">높은 우선순위</div><div className="mt-1 text-2xl font-black text-orange-100">{summary?.high_count ?? 0}</div></div>
          <div className="rounded-2xl border border-blue-500/25 bg-blue-500/[0.04] p-4"><div className="text-xs text-blue-300/70">미확인</div><div className="mt-1 text-2xl font-black text-blue-100">{summary?.unread_count ?? 0}</div></div>
        </div>

        {error && <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/[0.07] p-3 text-sm text-red-200">{error}</div>}

        <div className="mt-5 flex flex-wrap gap-2">
          {([['open','진행중'],['all','전체'],['resolved','해결/무시']] as const).map(([key,label]) => <button key={key} type="button" onClick={() => setFilter(key)} className={`rounded-xl border px-3 py-2 text-xs font-black ${filter === key ? 'border-white/30 bg-white/10 text-white' : 'border-slate-700 text-slate-500'}`}>{label}</button>)}
        </div>

        <div className="mt-4 space-y-3">
          {loading && <div className="rounded-2xl border border-slate-700 p-8 text-center text-slate-500">알림 이력을 불러오는 중입니다.</div>}
          {!loading && visible.map((event) => {
            const working = workingId === event.id
            const expanded = expandedId === event.id
            const evidence = Array.isArray(event.evidence_json) ? event.evidence_json : []
            return <article key={event.id} className={`overflow-hidden rounded-2xl border ${severityClass(event.severity)} ${event.read_at ? '' : 'ring-1 ring-white/10'}`}>
              <div className="flex flex-wrap items-start gap-4 p-4">
                <button type="button" onClick={() => void openEvent(event)} className="min-w-0 flex-1 text-left">
                  <div className="flex flex-wrap items-center gap-2 text-xs font-black"><span>{severityLabels[event.severity]}</span><span className={`rounded-lg border px-2 py-0.5 ${statusClass(event.status)}`}>{statusLabels[event.status]}</span><span className="opacity-50">· {categoryLabel(event.category)}</span>{!event.read_at && <span className="rounded-full bg-blue-400 px-2 py-0.5 text-[10px] text-slate-950">NEW</span>}</div>
                  <h3 className="mt-2 text-base font-black text-white">{event.title}</h3>
                  {event.summary && <p className="mt-1 text-sm leading-5 opacity-65">{event.summary}</p>}
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs opacity-55"><span>최근 감지 {new Date(event.last_detected_at).toLocaleString('ko-KR')}</span>{event.impact_amount > 0 && <span>금액 영향 {won(event.impact_amount)}</span>}{event.due_date && <span>기준일 {event.due_date}</span>}{event.reopen_count > 0 && <span>재발 {event.reopen_count}회</span>}</div>
                </button>
                <div className="flex flex-wrap gap-2">
                  {!['acknowledged','in_progress','resolved','ignored'].includes(event.status) && <button type="button" disabled={working} onClick={() => void updateStatus(event, 'acknowledged')} className="rounded-lg border border-blue-400/25 px-3 py-2 text-xs font-bold text-blue-100 disabled:opacity-40">확인</button>}
                  {!['in_progress','resolved','ignored'].includes(event.status) && <button type="button" disabled={working} onClick={() => void updateStatus(event, 'in_progress')} className="rounded-lg border border-amber-400/25 px-3 py-2 text-xs font-bold text-amber-100 disabled:opacity-40">처리중</button>}
                  {!['resolved','ignored'].includes(event.status) && <button type="button" disabled={working} onClick={() => void updateStatus(event, 'resolved')} className="rounded-lg border border-emerald-400/25 px-3 py-2 text-xs font-bold text-emerald-100 disabled:opacity-40">해결</button>}
                  {!['resolved','ignored','deferred'].includes(event.status) && <button type="button" disabled={working} onClick={() => deferOneDay(event)} className="rounded-lg border border-slate-500/25 px-3 py-2 text-xs font-bold text-slate-300 disabled:opacity-40">24시간 보류</button>}
                </div>
              </div>
              {expanded && <div className="border-t border-current/15 bg-black/10 px-4 py-4 text-sm">
                <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
                  <div><div className="text-xs font-black uppercase tracking-[0.12em] opacity-45">근거</div><div className="mt-2 flex flex-wrap gap-2">{evidence.length ? evidence.map((item) => <span key={item} className="rounded-lg border border-current/15 px-2.5 py-1 text-xs opacity-75">{item}</span>) : <span className="text-xs opacity-50">등록된 근거 없음</span>}</div>{event.deferred_until && <div className="mt-3 text-xs opacity-60">보류 기한: {new Date(event.deferred_until).toLocaleString('ko-KR')}</div>}</div>
                  <div className="flex items-end gap-2">{event.deep_link && <button type="button" onClick={() => go(event)} className="rounded-xl bg-white px-4 py-2 text-xs font-black text-slate-900">관련 화면 열기 →</button>}{!['ignored','resolved'].includes(event.status) && <button type="button" disabled={working} onClick={() => void updateStatus(event, 'ignored')} className="rounded-xl border border-slate-500/30 px-4 py-2 text-xs font-bold text-slate-300">무시</button>}{['resolved','ignored'].includes(event.status) && <button type="button" disabled={working} onClick={() => void updateStatus(event, 'new')} className="rounded-xl border border-cyan-400/25 px-4 py-2 text-xs font-bold text-cyan-100">다시 열기</button>}</div>
                </div>
              </div>}
            </article>
          })}
          {!loading && visible.length === 0 && <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.04] p-8 text-center text-sm text-emerald-200">이 조건에 해당하는 알림 이력이 없습니다.</div>}
        </div>
      </div>
    </section>
  )
}
