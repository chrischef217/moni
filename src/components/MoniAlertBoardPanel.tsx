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
  if (value === 'critical') return 'border-[#f1b8be] bg-[#fff7f8] text-[#9b3945]'
  if (value === 'high') return 'border-[#eccb9e] bg-[#fff9f2] text-[#9c671d]'
  if (value === 'attention') return 'border-[#e6d59e] bg-[#fffcef] text-[#8b6b18]'
  if (value === 'data') return 'border-[#bfd9e9] bg-[#f5faff] text-[#3a7192]'
  return 'border-[#d3e1e9] bg-[#f9fbfc] text-[#5b7180]'
}

function statusClass(value: AlertStatus) {
  if (value === 'new') return 'border-[#efb7bc] bg-[#fff3f4] text-[#b64d57]'
  if (value === 'sent') return 'border-[#d9c8ee] bg-[#faf7ff] text-[#7654a2]'
  if (value === 'acknowledged') return 'border-[#bdd8e8] bg-[#f3f9fd] text-[#3d7393]'
  if (value === 'in_progress') return 'border-[#e9d29e] bg-[#fffaf0] text-[#9a721e]'
  if (value === 'deferred') return 'border-[#d5e0e6] bg-[#f7f9fa] text-[#657b89]'
  if (value === 'resolved') return 'border-[#b8dfce] bg-[#f1faf6] text-[#2f7c5c]'
  return 'border-[#d9e1e6] bg-[#f7f9fa] text-[#7b8c97]'
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

function severityDot(value: AlertSeverity) {
  if (value === 'critical') return 'bg-[#ef6b75]'
  if (value === 'high') return 'bg-[#ef9a39]'
  if (value === 'attention') return 'bg-[#d9ad34]'
  if (value === 'data') return 'bg-[#5aa5d2]'
  return 'bg-[#7f98a7]'
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
    <section className="bg-transparent px-4 pb-8 md:px-6">
      <div className="mx-auto max-w-[1500px] rounded-[26px] border border-[#cfe1eb] bg-white/95 p-5 text-[#17384d] shadow-[0_14px_36px_rgba(43,84,109,0.08)] lg:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#4f94b9]">PERSISTENT ALERT BOARD · V10</p>
            <h2 className="mt-1 text-2xl font-black tracking-[-0.025em] text-[#17384d]">MONI 알림 이력</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-[#718895]">현재 Intelligence 조건을 같은 Event ID로 추적합니다. 조건이 사라지면 자동 해결되고, 다시 발생하면 재오픈됩니다. 향후 LINE도 이 Event를 그대로 사용합니다.</p>
          </div>
          <button type="button" onClick={() => void sync(true)} disabled={syncing} className="rounded-xl border border-[#a9d7df] bg-[#f2fbfc] px-4 py-2.5 text-sm font-black text-[#33778a] shadow-sm disabled:opacity-50">{syncing ? '동기화 중...' : '현재 상태 동기화'}</button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-[#d6e4eb] bg-[#f8fbfd] p-4"><div className="text-xs font-bold text-[#7b919f]">열린 알림</div><div className="mt-1 text-2xl font-black text-[#17384d]">{summary?.open_count ?? 0}</div></div>
          <div className="rounded-2xl border border-[#efc2c7] bg-[#fff7f8] p-4"><div className="text-xs font-bold text-[#b75a63]">긴급</div><div className="mt-1 text-2xl font-black text-[#a7414c]">{summary?.critical_count ?? 0}</div></div>
          <div className="rounded-2xl border border-[#edcea3] bg-[#fff9f2] p-4"><div className="text-xs font-bold text-[#a26f29]">높은 우선순위</div><div className="mt-1 text-2xl font-black text-[#99631b]">{summary?.high_count ?? 0}</div></div>
          <div className="rounded-2xl border border-[#c8ddea] bg-[#f5faff] p-4"><div className="text-xs font-bold text-[#4c7f9e]">미확인</div><div className="mt-1 text-2xl font-black text-[#397492]">{summary?.unread_count ?? 0}</div></div>
        </div>

        {error && <div className="mt-4 rounded-xl border border-[#efb9be] bg-[#fff6f7] p-3 text-sm font-semibold text-[#a94752]">{error}</div>}

        <div className="mt-5 flex flex-wrap gap-2">
          {([['open','진행중'],['all','전체'],['resolved','해결/무시']] as const).map(([key,label]) => <button key={key} type="button" onClick={() => setFilter(key)} className={`rounded-xl border px-3 py-2 text-xs font-black ${filter === key ? 'border-[#9dc1d3] bg-[#edf6fb] text-[#244e66]' : 'border-[#d7e4eb] bg-white text-[#78909d]'}`}>{label}</button>)}
        </div>

        <div className="mt-4 space-y-3">
          {loading && <div className="rounded-2xl border border-[#d7e4eb] bg-[#fafcfd] p-8 text-center text-[#7b909d]">알림 이력을 불러오는 중입니다.</div>}
          {!loading && visible.map((event) => {
            const working = workingId === event.id
            const expanded = expandedId === event.id
            const evidence = Array.isArray(event.evidence_json) ? event.evidence_json : []
            return <article key={event.id} className={`overflow-hidden rounded-2xl border shadow-[0_5px_18px_rgba(49,84,106,0.035)] ${severityClass(event.severity)} ${event.read_at ? '' : 'ring-1 ring-[#9fc6d8]/40'}`}>
              <div className="flex flex-wrap items-start gap-4 p-4">
                <button type="button" onClick={() => void openEvent(event)} className="min-w-0 flex-1 text-left">
                  <div className="flex flex-wrap items-center gap-2 text-xs font-black"><span className={`h-2.5 w-2.5 rounded-full ${severityDot(event.severity)}`} /><span>{severityLabels[event.severity]}</span><span className={`rounded-lg border px-2 py-0.5 ${statusClass(event.status)}`}>{statusLabels[event.status]}</span><span className="font-semibold text-[#8a9ca7]">· {categoryLabel(event.category)}</span>{!event.read_at && <span className="rounded-full bg-[#dcecff] px-2 py-0.5 text-[10px] font-black text-[#2f6f9b]">NEW</span>}</div>
                  <h3 className="mt-2 text-base font-black text-[#17384d]">{event.title}</h3>
                  {event.summary && <p className="mt-1 text-sm leading-5 text-[#657d8c]">{event.summary}</p>}
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-medium text-[#8a9da8]"><span>최근 감지 {new Date(event.last_detected_at).toLocaleString('ko-KR')}</span>{event.impact_amount > 0 && <span>금액 영향 {won(event.impact_amount)}</span>}{event.due_date && <span>기준일 {event.due_date}</span>}{event.reopen_count > 0 && <span>재발 {event.reopen_count}회</span>}</div>
                </button>
                <div className="flex flex-wrap gap-2">
                  {!['acknowledged','in_progress','resolved','ignored'].includes(event.status) && <button type="button" disabled={working} onClick={() => void updateStatus(event, 'acknowledged')} className="rounded-lg border border-[#bdd8e8] bg-white/80 px-3 py-2 text-xs font-bold text-[#427795] disabled:opacity-40">확인</button>}
                  {!['in_progress','resolved','ignored'].includes(event.status) && <button type="button" disabled={working} onClick={() => void updateStatus(event, 'in_progress')} className="rounded-lg border border-[#ead3a2] bg-white/80 px-3 py-2 text-xs font-bold text-[#96701f] disabled:opacity-40">처리중</button>}
                  {!['resolved','ignored'].includes(event.status) && <button type="button" disabled={working} onClick={() => void updateStatus(event, 'resolved')} className="rounded-lg border border-[#bce0d0] bg-white/80 px-3 py-2 text-xs font-bold text-[#34795c] disabled:opacity-40">해결</button>}
                  {!['resolved','ignored','deferred'].includes(event.status) && <button type="button" disabled={working} onClick={() => deferOneDay(event)} className="rounded-lg border border-[#d3dfe6] bg-white/75 px-3 py-2 text-xs font-bold text-[#657a88] disabled:opacity-40">24시간 보류</button>}
                </div>
              </div>
              {expanded && <div className="border-t border-current/15 bg-white/55 px-4 py-4 text-sm">
                <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
                  <div><div className="text-xs font-black uppercase tracking-[0.12em] text-[#8296a3]">근거</div><div className="mt-2 flex flex-wrap gap-2">{evidence.length ? evidence.map((item) => <span key={item} className="rounded-lg border border-current/15 bg-white/70 px-2.5 py-1 text-xs font-semibold text-[#5f7786]">{item}</span>) : <span className="text-xs text-[#8a9ca7]">등록된 근거 없음</span>}</div>{event.deferred_until && <div className="mt-3 text-xs text-[#8296a3]">보류 기한: {new Date(event.deferred_until).toLocaleString('ko-KR')}</div>}</div>
                  <div className="flex items-end gap-2">{event.deep_link && <button type="button" onClick={() => go(event)} className="rounded-xl border border-[#d5e2e9] bg-white px-4 py-2 text-xs font-black text-[#17384d] shadow-sm">관련 화면 열기 →</button>}{!['ignored','resolved'].includes(event.status) && <button type="button" disabled={working} onClick={() => void updateStatus(event, 'ignored')} className="rounded-xl border border-[#d3dfe6] bg-white/75 px-4 py-2 text-xs font-bold text-[#687d8a]">무시</button>}{['resolved','ignored'].includes(event.status) && <button type="button" disabled={working} onClick={() => void updateStatus(event, 'new')} className="rounded-xl border border-[#add5df] bg-[#f4fbfc] px-4 py-2 text-xs font-bold text-[#34788a]">다시 열기</button>}</div>
                </div>
              </div>}
            </article>
          })}
          {!loading && visible.length === 0 && <div className="rounded-2xl border border-[#bee1d1] bg-[#f4fbf7] p-8 text-center text-sm font-semibold text-[#34755a]">이 조건에 해당하는 알림 이력이 없습니다.</div>}
        </div>
      </div>
    </section>
  )
}
