'use client'

import { useEffect, useMemo, useState } from 'react'

type ClientRow = {
  client_id: string
  client_name: string
  redirect_uris: string[]
  is_active: boolean
  created_at: string
  updated_at: string
}

type ConnectionRow = {
  id: string
  client_id: string
  scopes: string[]
  user_login_id: string
  user_display_name?: string | null
  user_role: string
  access_expires_at: string
  refresh_expires_at: string
  last_used_at?: string | null
  revoked_at?: string | null
  created_at: string
  updated_at: string
}

type ApiPayload = {
  ok: boolean
  error?: string
  generated_at?: string
  summary?: {
    client_count?: number
    active_connection_count?: number
    revoked_connection_count?: number
  }
  clients?: ClientRow[]
  connections?: ConnectionRow[]
}

function formatDate(value?: string | null) {
  if (!value) return '기록 없음'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Bangkok',
  }).format(parsed)
}

function connectionState(row: ConnectionRow) {
  if (row.revoked_at) return { label: '폐기됨', className: 'border-red-200 bg-red-50 text-red-700' }
  if (Date.parse(row.refresh_expires_at) <= Date.now()) return { label: '만료됨', className: 'border-slate-200 bg-slate-100 text-slate-600' }
  return { label: '연결됨', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' }
}

export default function MoniMcpConnectionsClient() {
  const [payload, setPayload] = useState<ApiPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState('')
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/moni/mcp-connections', { cache: 'no-store' })
      const next = await response.json() as ApiPayload
      if (!response.ok || !next.ok) throw new Error(next.error || '연결 정보를 불러오지 못했습니다.')
      setPayload(next)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '연결 정보를 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const clientsById = useMemo(() => new Map((payload?.clients ?? []).map((item) => [item.client_id, item])), [payload?.clients])

  async function mutate(body: Record<string, string>, confirmation: string) {
    if (!window.confirm(confirmation)) return
    const key = body.token_id || body.client_id || body.action
    setWorking(key)
    setError('')
    try {
      const response = await fetch('/api/moni/mcp-connections', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const result = await response.json() as { ok?: boolean; error?: string }
      if (!response.ok || !result.ok) throw new Error(result.error || '연결 변경에 실패했습니다.')
      await load()
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : '연결 변경에 실패했습니다.')
    } finally {
      setWorking('')
    }
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-bold text-slate-500">등록 클라이언트</p>
          <p className="mt-2 text-2xl font-black text-slate-900">{payload?.summary?.client_count ?? 0}</p>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
          <p className="text-xs font-bold text-emerald-700">활성 연결</p>
          <p className="mt-2 text-2xl font-black text-emerald-900">{payload?.summary?.active_connection_count ?? 0}</p>
        </div>
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 shadow-sm">
          <p className="text-xs font-bold text-red-700">폐기된 연결</p>
          <p className="mt-2 text-2xl font-black text-red-900">{payload?.summary?.revoked_connection_count ?? 0}</p>
        </div>
      </section>

      {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-bold text-red-700">{error}</div>}

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-black text-slate-900">ChatGPT 연결 세션</h2>
            <p className="mt-1 text-sm text-slate-500">토큰 원문과 해시는 화면에 표시하지 않습니다.</p>
          </div>
          <button type="button" onClick={() => void load()} disabled={loading} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            새로고침
          </button>
        </div>

        <div className="mt-5 space-y-4">
          {loading && <div className="rounded-2xl bg-slate-50 p-6 text-center text-sm font-bold text-slate-500">연결 정보를 확인하고 있습니다.</div>}
          {!loading && !(payload?.connections?.length) && <div className="rounded-2xl bg-slate-50 p-6 text-center text-sm text-slate-500">아직 ChatGPT 연결 기록이 없습니다.</div>}
          {(payload?.connections ?? []).map((connection) => {
            const client = clientsById.get(connection.client_id)
            const state = connectionState(connection)
            const active = !connection.revoked_at && Date.parse(connection.refresh_expires_at) > Date.now()
            return (
              <article key={connection.id} className="rounded-2xl border border-slate-200 p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-black text-slate-900">{connection.user_display_name || connection.user_login_id}</h3>
                      <span className={`rounded-full border px-2.5 py-1 text-[11px] font-black ${state.className}`}>{state.label}</span>
                      <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-black text-blue-700">{connection.user_role}</span>
                    </div>
                    <p className="mt-2 text-sm text-slate-600">{client?.client_name || connection.client_id}</p>
                    <dl className="mt-4 grid gap-x-8 gap-y-2 text-xs text-slate-500 sm:grid-cols-2">
                      <div><dt className="font-bold">연결 생성</dt><dd>{formatDate(connection.created_at)}</dd></div>
                      <div><dt className="font-bold">마지막 사용</dt><dd>{formatDate(connection.last_used_at)}</dd></div>
                      <div><dt className="font-bold">접근 토큰 만료</dt><dd>{formatDate(connection.access_expires_at)}</dd></div>
                      <div><dt className="font-bold">연결 갱신 만료</dt><dd>{formatDate(connection.refresh_expires_at)}</dd></div>
                    </dl>
                  </div>

                  {active && (
                    <button
                      type="button"
                      disabled={working === connection.id}
                      onClick={() => void mutate({ action: 'revoke_token', token_id: connection.id }, '이 ChatGPT 연결을 즉시 폐기하시겠습니까? 폐기 후 다시 승인해야 연결할 수 있습니다.')}
                      className="rounded-xl border border-red-300 bg-white px-4 py-2 text-sm font-black text-red-700 hover:bg-red-50 disabled:opacity-50"
                    >
                      연결 폐기
                    </button>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-7">
        <h2 className="text-lg font-black text-slate-900">등록된 ChatGPT 클라이언트</h2>
        <div className="mt-5 space-y-3">
          {(payload?.clients ?? []).map((client) => (
            <div key={client.client_id} className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 p-4">
              <div>
                <p className="font-black text-slate-900">{client.client_name}</p>
                <p className="mt-1 break-all font-mono text-xs text-slate-500">{client.client_id}</p>
                <p className="mt-2 text-xs text-slate-500">상태: {client.is_active ? '활성' : '비활성'} · 등록 {formatDate(client.created_at)}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={working === client.client_id}
                  onClick={() => void mutate({ action: 'revoke_client', client_id: client.client_id }, '이 클라이언트에서 발급된 모든 연결을 폐기하시겠습니까?')}
                  className="rounded-xl border border-amber-300 bg-white px-3 py-2 text-xs font-black text-amber-700 hover:bg-amber-50 disabled:opacity-50"
                >
                  전체 연결 폐기
                </button>
                {client.is_active && (
                  <button
                    type="button"
                    disabled={working === client.client_id}
                    onClick={() => void mutate({ action: 'disable_client', client_id: client.client_id }, '이 OAuth 클라이언트를 비활성화하고 모든 연결을 폐기하시겠습니까?')}
                    className="rounded-xl border border-red-300 bg-white px-3 py-2 text-xs font-black text-red-700 hover:bg-red-50 disabled:opacity-50"
                  >
                    클라이언트 비활성화
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
