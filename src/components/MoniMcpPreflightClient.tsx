'use client'

import { useEffect, useState } from 'react'

type Check = {
  key: string
  label: string
  status: 'PASS' | 'FAIL'
  detail: string
}

type Gate = {
  ready: boolean
  latest_run_id: string | null
  latest_status: string | null
  latest_finished_at: string | null
  expires_at: string | null
  catalog_hashes_match: boolean
  reason: string
}

type Latest = {
  id: string
  status: string
  requested_by_login_id: string
  requested_by_display_name: string | null
  admin_tool_catalog_hash: string
  freelancer_tool_catalog_hash: string
  checks: Check[]
  warnings: string[]
  errors: string[]
  started_at: string
  finished_at: string
}

type Payload = {
  ok?: boolean
  gate?: Gate
  latest?: Latest | null
  result?: Latest & { valid_until?: string | null }
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

function shortHash(value?: string | null) {
  if (!value) return '없음'
  return `${value.slice(0, 12)}…${value.slice(-8)}`
}

export default function MoniMcpPreflightClient() {
  const [gate, setGate] = useState<Gate | null>(null)
  const [latest, setLatest] = useState<Latest | null>(null)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    const response = await fetch('/api/moni/mcp-preflight', { cache: 'no-store' })
    const payload = await response.json() as Payload
    if (!response.ok || !payload.ok || !payload.gate) throw new Error(payload.error || 'MCP Preflight 상태를 읽지 못했습니다.')
    setGate(payload.gate)
    setLatest(payload.latest || null)
  }

  useEffect(() => {
    void load().catch((loadError) => setError(loadError instanceof Error ? loadError.message : 'MCP Preflight 상태 확인 실패'))
  }, [])

  async function runPreflight() {
    setWorking(true)
    setError('')
    try {
      const response = await fetch('/api/moni/mcp-preflight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
      const payload = await response.json() as Payload
      if (!payload.ok || !payload.gate) throw new Error(payload.error || 'MCP Preflight 실행 실패')
      await load()
      window.dispatchEvent(new Event('moni-mcp-preflight-updated'))
      if (!response.ok || !payload.gate.ready) {
        throw new Error(payload.gate.reason || 'Preflight가 PASS하지 못했습니다.')
      }
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : 'MCP Preflight 실행 실패')
      await load().catch(() => undefined)
    } finally {
      setWorking(false)
    }
  }

  return (
    <section className="mb-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-black text-slate-950">ChatGPT 연결 사전점검</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
            OAuth metadata, MCP CORS, 역할별 READ ONLY 도구목록, DB 저장소와 도구 카탈로그 해시를 검사합니다. PASS 결과는 30분 동안만 유효합니다.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-3 py-1.5 text-xs font-black ${gate?.ready ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
            {gate?.ready ? 'Preflight PASS' : '점검 필요'}
          </span>
          <button
            type="button"
            disabled={working}
            onClick={() => void runPreflight()}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-black text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {working ? '점검 중…' : '사전점검 실행'}
          </button>
        </div>
      </div>

      {error && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div>}

      <div className={`mt-5 rounded-2xl border p-4 text-sm ${gate?.ready ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
        <p className="font-black">{gate?.reason || 'Preflight 상태를 확인 중입니다.'}</p>
        <div className="mt-2 grid gap-1 text-xs sm:grid-cols-2">
          <span>최근 실행: {formatDate(gate?.latest_finished_at)}</span>
          <span>유효 종료: {formatDate(gate?.expires_at)}</span>
        </div>
      </div>

      {latest && (
        <div className="mt-5">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div className="rounded-xl bg-slate-50 p-4"><dt className="font-bold text-slate-500">Admin 도구 해시</dt><dd className="mt-1 font-mono text-xs font-black text-slate-900">{shortHash(latest.admin_tool_catalog_hash)}</dd></div>
            <div className="rounded-xl bg-slate-50 p-4"><dt className="font-bold text-slate-500">Freelancer 도구 해시</dt><dd className="mt-1 font-mono text-xs font-black text-slate-900">{shortHash(latest.freelancer_tool_catalog_hash)}</dd></div>
          </dl>

          <div className="mt-4 divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200">
            {(latest.checks || []).map((check) => (
              <div key={check.key} className="grid gap-1 bg-white px-4 py-3 text-sm sm:grid-cols-[180px_90px_1fr] sm:items-center">
                <span className="font-bold text-slate-800">{check.label}</span>
                <span className={`w-fit rounded-full px-2 py-1 text-xs font-black ${check.status === 'PASS' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{check.status}</span>
                <span className="text-xs leading-5 text-slate-500">{check.detail}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
