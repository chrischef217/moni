'use client'

import { useEffect, useMemo, useState } from 'react'

type Check = {
  key: string
  label: string
  status: 'PASS' | 'PENDING' | 'FAIL' | 'MANUAL'
  detail: string
}

type AcceptanceStatus = {
  overall: 'NOT_STARTED' | 'IN_PROGRESS' | 'AUTOMATED_PASS' | 'FAIL'
  automated_ready: boolean
  mcp_url: string
  window: null | {
    id: string
    enabled_at: string
    enabled_until: string
    revoked_at: string | null
    preflight_run_id: string | null
    duration_minutes: number | null
    is_active: boolean
  }
  counts: {
    clients: number
    codes: number
    tokens: number
    tool_runs: number
    failed_tool_runs: number
    admin_tokens?: number
    freelancer_tokens?: number
  }
  checks: Check[]
  missing_admin_tools: string[]
  missing_freelancer_tools: string[]
  manual_remaining: string[]
}

type Payload = {
  ok?: boolean
  status?: AcceptanceStatus
  error?: string
}

function badge(status: Check['status']) {
  if (status === 'PASS') return 'bg-emerald-50 text-emerald-700'
  if (status === 'FAIL') return 'bg-red-50 text-red-700'
  if (status === 'MANUAL') return 'bg-blue-50 text-blue-700'
  return 'bg-amber-50 text-amber-700'
}

function overallBadge(status?: AcceptanceStatus['overall']) {
  if (status === 'AUTOMATED_PASS') return 'bg-emerald-50 text-emerald-700'
  if (status === 'FAIL') return 'bg-red-50 text-red-700'
  return 'bg-amber-50 text-amber-700'
}

export default function MoniMcpAcceptanceStatusClient() {
  const [status, setStatus] = useState<AcceptanceStatus | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function load() {
    const response = await fetch('/api/moni/mcp-acceptance-status', { cache: 'no-store' })
    const payload = await response.json() as Payload
    if (!response.ok || !payload.ok || !payload.status) throw new Error(payload.error || '수용검사 상태를 읽지 못했습니다.')
    setStatus(payload.status)
    setError('')
  }

  useEffect(() => {
    void load().catch((loadError) => setError(loadError instanceof Error ? loadError.message : '수용검사 상태 확인 실패'))
    const timer = window.setInterval(() => {
      void load().catch(() => undefined)
    }, 5000)
    const refresh = () => void load().catch(() => undefined)
    window.addEventListener('moni-mcp-preflight-updated', refresh)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('moni-mcp-preflight-updated', refresh)
    }
  }, [])

  async function refresh() {
    setLoading(true)
    try {
      await load()
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : '수용검사 상태 확인 실패')
    } finally {
      setLoading(false)
    }
  }

  const nextAction = useMemo(() => {
    if (!status) return '상태 확인 중'
    if (status.overall === 'NOT_STARTED') return '사전점검 PASS 후 수용검사 창을 여세요.'
    const firstPending = status.checks.find((item) => item.status === 'PENDING')
    if (firstPending) return firstPending.detail
    if (status.overall === 'FAIL') return 'FAIL 항목을 수정하고 새 Preflight부터 다시 시작해야 합니다.'
    if (status.automated_ready) return '자동 증거는 모두 통과했습니다. 남은 수동 교차검산 2건을 완료하면 GPT(PMO) 최종 승인 단계입니다.'
    return '수용검사를 계속 진행하세요.'
  }, [status])

  return (
    <section className="mb-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-black text-slate-950">실제 ChatGPT 수용검사 상태</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
            OAuth 등록·사용자 역할·실제 READ ONLY 도구 실행을 Supabase 감사기록에서 자동 판정합니다. 연결시험 중에는 5초마다 갱신됩니다.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-3 py-1.5 text-xs font-black ${overallBadge(status?.overall)}`}>
            {status?.overall || '확인 중'}
          </span>
          <button type="button" disabled={loading} onClick={() => void refresh()} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            {loading ? '갱신 중…' : '지금 갱신'}
          </button>
        </div>
      </div>

      {error && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div>}

      <div className="mt-5 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
        <p className="font-black">다음 작업</p>
        <p className="mt-1 leading-6">{nextAction}</p>
        {status?.mcp_url && <p className="mt-2 break-all font-mono text-xs text-blue-700">MCP URL: {status.mcp_url}</p>}
      </div>

      {status && (
        <>
          <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-5">
            <div className="rounded-xl bg-slate-50 p-4"><dt className="font-bold text-slate-500">OAuth client</dt><dd className="mt-1 text-xl font-black text-slate-950">{status.counts.clients}</dd></div>
            <div className="rounded-xl bg-slate-50 p-4"><dt className="font-bold text-slate-500">Token</dt><dd className="mt-1 text-xl font-black text-slate-950">{status.counts.tokens}</dd></div>
            <div className="rounded-xl bg-slate-50 p-4"><dt className="font-bold text-slate-500">Admin token</dt><dd className="mt-1 text-xl font-black text-slate-950">{status.counts.admin_tokens || 0}</dd></div>
            <div className="rounded-xl bg-slate-50 p-4"><dt className="font-bold text-slate-500">Freelancer token</dt><dd className="mt-1 text-xl font-black text-slate-950">{status.counts.freelancer_tokens || 0}</dd></div>
            <div className="rounded-xl bg-slate-50 p-4"><dt className="font-bold text-slate-500">Tool runs</dt><dd className="mt-1 text-xl font-black text-slate-950">{status.counts.tool_runs}</dd></div>
          </dl>

          <div className="mt-5 divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200">
            {status.checks.map((item) => (
              <div key={item.key} className="grid gap-1 bg-white px-4 py-3 text-sm sm:grid-cols-[190px_90px_1fr] sm:items-center">
                <span className="font-bold text-slate-800">{item.label}</span>
                <span className={`w-fit rounded-full px-2 py-1 text-xs font-black ${badge(item.status)}`}>{item.status}</span>
                <span className="text-xs leading-5 text-slate-500">{item.detail}</span>
              </div>
            ))}
          </div>

          {(status.missing_admin_tools.length > 0 || status.missing_freelancer_tools.length > 0) && (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs leading-5 text-slate-600">
                <p className="font-black text-slate-800">Admin 남은 smoke tools</p>
                <p className="mt-1 break-words font-mono">{status.missing_admin_tools.join(', ') || '없음'}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs leading-5 text-slate-600">
                <p className="font-black text-slate-800">Freelancer 남은 smoke tools</p>
                <p className="mt-1 break-words font-mono">{status.missing_freelancer_tools.join(', ') || '없음'}</p>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  )
}
