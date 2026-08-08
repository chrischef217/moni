'use client'

import { useEffect, useState } from 'react'

type ActivationState = {
  enabled: boolean
  mode: 'PERMANENT_ENV' | 'ACCEPTANCE_WINDOW' | 'DISABLED'
  windowId: string | null
  enabledAt: string | null
  enabledUntil: string | null
  enabledByLoginId: string | null
  enabledByDisplayName: string | null
  reason: string | null
}

type Payload = {
  ok?: boolean
  state?: ActivationState
  error?: string
}

function formatDate(value?: string | null) {
  if (!value) return '없음'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'medium',
    timeStyle: 'medium',
    timeZone: 'Asia/Bangkok',
  }).format(date)
}

export default function MoniMcpActivationClient() {
  const [state, setState] = useState<ActivationState | null>(null)
  const [reason, setReason] = useState('ChatGPT 실제 도구 스캔 및 읽기 전용 수용검사')
  const [duration, setDuration] = useState(15)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    const response = await fetch('/api/moni/mcp-activation', { cache: 'no-store' })
    const payload = await response.json() as Payload
    if (!response.ok || !payload.ok || !payload.state) throw new Error(payload.error || 'MCP 활성화 상태를 읽지 못했습니다.')
    setState(payload.state)
  }

  useEffect(() => {
    void load().catch((loadError) => setError(loadError instanceof Error ? loadError.message : 'MCP 상태 확인 실패'))
  }, [])

  async function mutate(body: Record<string, unknown>) {
    setWorking(true)
    setError('')
    try {
      const response = await fetch('/api/moni/mcp-activation', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const payload = await response.json() as Payload
      if (!response.ok || !payload.ok || !payload.state) throw new Error(payload.error || 'MCP 활성화 변경 실패')
      setState(payload.state)
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : 'MCP 활성화 변경 실패')
    } finally {
      setWorking(false)
    }
  }

  const permanent = state?.mode === 'PERMANENT_ENV'
  const acceptance = state?.mode === 'ACCEPTANCE_WINDOW'

  return (
    <section className="mb-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-black text-slate-950">MCP 운영 활성화</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
            실제 ChatGPT 연결시험에만 최대 30분 동안 임시로 엽니다. 시간이 지나면 자동으로 비활성화됩니다. 영구 운영은 이 화면에서 켤 수 없습니다.
          </p>
        </div>
        <span className={`rounded-full px-3 py-1.5 text-xs font-black ${state?.enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
          {permanent ? '영구 운영' : acceptance ? '수용검사 창 열림' : '비활성'}
        </span>
      </div>

      {error && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div>}

      <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
        <div className="rounded-xl bg-slate-50 p-4"><dt className="font-bold text-slate-500">활성 방식</dt><dd className="mt-1 font-black text-slate-900">{state?.mode || '확인 중'}</dd></div>
        <div className="rounded-xl bg-slate-50 p-4"><dt className="font-bold text-slate-500">자동 종료</dt><dd className="mt-1 font-black text-slate-900">{formatDate(state?.enabledUntil)}</dd></div>
        <div className="rounded-xl bg-slate-50 p-4"><dt className="font-bold text-slate-500">승인 사용자</dt><dd className="mt-1 font-black text-slate-900">{state?.enabledByDisplayName || state?.enabledByLoginId || '없음'}</dd></div>
        <div className="rounded-xl bg-slate-50 p-4"><dt className="font-bold text-slate-500">사유</dt><dd className="mt-1 font-black text-slate-900">{state?.reason || '없음'}</dd></div>
      </dl>

      {!permanent && !acceptance && (
        <div className="mt-5 grid gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 md:grid-cols-[1fr_140px_auto]">
          <label className="grid gap-1 text-sm font-bold text-amber-950">
            수용검사 사유
            <input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} className="h-11 rounded-xl border border-amber-200 bg-white px-3 font-medium text-slate-800 outline-none focus:border-amber-500" />
          </label>
          <label className="grid gap-1 text-sm font-bold text-amber-950">
            활성 시간
            <select value={duration} onChange={(event) => setDuration(Number(event.target.value))} className="h-11 rounded-xl border border-amber-200 bg-white px-3 text-slate-800">
              <option value={5}>5분</option>
              <option value={10}>10분</option>
              <option value={15}>15분</option>
              <option value={20}>20분</option>
              <option value={30}>30분</option>
            </select>
          </label>
          <button
            type="button"
            disabled={working || reason.trim().length < 3}
            onClick={() => {
              if (!window.confirm(`${duration}분 동안 MONI MCP 수용검사 창을 여시겠습니까? 업무 데이터는 조회 전용입니다.`)) return
              void mutate({ action: 'open_acceptance_window', reason: reason.trim(), duration_minutes: duration })
            }}
            className="self-end rounded-xl bg-amber-600 px-4 py-3 text-sm font-black text-white hover:bg-amber-700 disabled:opacity-50"
          >
            수용검사 창 열기
          </button>
        </div>
      )}

      {acceptance && (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-bold text-red-800">테스트 창이 열려 있습니다. 시험이 끝나면 즉시 닫을 수 있으며, 닫지 않아도 만료시각 이후 자동 차단됩니다.</p>
          <button
            type="button"
            disabled={working}
            onClick={() => {
              if (!window.confirm('MONI MCP 수용검사 창을 지금 즉시 닫으시겠습니까?')) return
              void mutate({ action: 'close_acceptance_window' })
            }}
            className="rounded-xl border border-red-300 bg-white px-4 py-2 text-sm font-black text-red-700 hover:bg-red-100 disabled:opacity-50"
          >
            즉시 닫기
          </button>
        </div>
      )}
    </section>
  )
}
