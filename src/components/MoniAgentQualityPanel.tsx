'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

type EvalCase = {
  id: string
  role?: string
  prompt: string
}

type EvalRun = {
  id: string
  model: string
  status: string
  triggered_by?: string | null
  passed_count: number
  failed_count: number
  metrics?: Record<string, unknown>
  error_message?: string | null
  started_at: string
  finished_at?: string | null
}

type LiveResult = {
  caseId: string
  passed: boolean
  score: number
  checks: Array<{ name: string; passed: boolean; detail: string }>
  agentRunId: string
  toolsUsed: string[]
  usage: {
    requests: number
    inputTokens: number
    outputTokens: number
    totalTokens: number
  }
  durationMs: number
  answerText: string
}

const number = (value: unknown) => Number(value || 0).toLocaleString('ko-KR')

export default function MoniAgentQualityPanel() {
  const [cases, setCases] = useState<EvalCase[]>([])
  const [runs, setRuns] = useState<EvalRun[]>([])
  const [selectedCaseId, setSelectedCaseId] = useState('')
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<LiveResult | null>(null)

  const selectedCase = useMemo(
    () => cases.find((item) => item.id === selectedCaseId) || null,
    [cases, selectedCaseId],
  )

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/moni/agent-evals', { cache: 'no-store' })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok || !payload.ok) throw new Error(payload.error || '평가 목록을 불러오지 못했습니다.')
      const nextCases = Array.isArray(payload.cases) ? payload.cases : []
      setCases(nextCases)
      setRuns(Array.isArray(payload.runs) ? payload.runs : [])
      setSelectedCaseId((current) => current || nextCases[0]?.id || '')
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '평가 목록을 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const runCase = async () => {
    if (!selectedCaseId || running) return
    setRunning(true)
    setError('')
    setResult(null)
    try {
      const response = await fetch('/api/moni/agent-evals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ case_id: selectedCaseId }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok || !payload.ok) throw new Error(payload.error || '실모델 평가에 실패했습니다.')
      setResult(payload.result as LiveResult)
      await load()
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : '실모델 평가에 실패했습니다.')
    } finally {
      setRunning(false)
    }
  }

  return (
    <section className="mx-auto mt-6 w-full max-w-7xl px-4 pb-6 sm:px-6 lg:px-8">
      <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">MONI Agent Quality</p>
            <h2 className="mt-1 text-xl font-bold text-neutral-950">실모델 단일 사례 평가</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-600">
              실제 OpenAI 모델과 MONI 읽기 전용 도구를 실행하고, 도구 선택·권한·인자·답변 용어를 자동 채점합니다.
              업무 데이터는 변경하지 않으며 한 번에 한 사례만 실행합니다.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading || running}
            className="rounded-xl border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-800 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            기록 새로고침
          </button>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div>
            <label htmlFor="moni-eval-case" className="mb-2 block text-sm font-semibold text-neutral-800">평가 사례</label>
            <select
              id="moni-eval-case"
              value={selectedCaseId}
              onChange={(event) => setSelectedCaseId(event.target.value)}
              disabled={loading || running}
              className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-3 text-sm text-neutral-950 outline-none focus:border-neutral-950 disabled:opacity-50"
            >
              {cases.map((item) => (
                <option key={item.id} value={item.id}>{item.id} · {item.role || 'admin'}</option>
              ))}
            </select>
            {selectedCase ? <p className="mt-2 text-sm leading-6 text-neutral-600">{selectedCase.prompt}</p> : null}
          </div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={() => void runCase()}
              disabled={!selectedCaseId || loading || running}
              className="w-full rounded-xl bg-neutral-950 px-5 py-3 text-sm font-bold text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50 lg:w-auto"
            >
              {running ? '평가 실행 중…' : '실모델 평가 실행'}
            </button>
          </div>
        </div>

        {error ? <div className="mt-4 rounded-xl border border-neutral-300 bg-neutral-50 px-4 py-3 text-sm font-medium text-neutral-900">{error}</div> : null}

        {result ? (
          <div className="mt-5 rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-neutral-950">{result.caseId}</p>
                <p className="mt-1 text-sm text-neutral-600">Agent Run: {result.agentRunId}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-sm font-bold ${result.passed ? 'bg-white text-neutral-950 ring-1 ring-neutral-300' : 'bg-neutral-950 text-white'}`}>
                {result.passed ? 'PASS' : 'FAIL'} · {(result.score * 100).toFixed(1)}점
              </span>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Metric label="도구 호출" value={number(result.toolsUsed.length)} />
              <Metric label="총 토큰" value={number(result.usage.totalTokens)} />
              <Metric label="모델 요청" value={number(result.usage.requests)} />
              <Metric label="소요시간" value={`${number(Math.round(result.durationMs / 1000))}초`} />
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <div>
                <p className="text-sm font-bold text-neutral-900">자동 채점</p>
                <div className="mt-2 space-y-2">
                  {result.checks.map((check) => (
                    <div key={check.name} className="flex items-start justify-between gap-3 rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-neutral-200">
                      <span className="break-all text-neutral-700">{check.name}</span>
                      <span className="shrink-0 font-bold text-neutral-950">{check.passed ? 'PASS' : 'FAIL'}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-sm font-bold text-neutral-900">MONI 답변</p>
                <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-white p-3 text-xs leading-6 text-neutral-800 ring-1 ring-neutral-200">{result.answerText}</pre>
              </div>
            </div>
          </div>
        ) : null}

        <div className="mt-6">
          <p className="text-sm font-bold text-neutral-900">최근 평가 기록</p>
          <div className="mt-2 overflow-x-auto rounded-xl border border-neutral-200">
            <table className="min-w-full divide-y divide-neutral-200 text-sm">
              <thead className="bg-neutral-50 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="px-3 py-3">시각</th>
                  <th className="px-3 py-3">사례</th>
                  <th className="px-3 py-3">모델</th>
                  <th className="px-3 py-3">상태</th>
                  <th className="px-3 py-3">결과</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 bg-white">
                {runs.length ? runs.map((run) => (
                  <tr key={run.id}>
                    <td className="whitespace-nowrap px-3 py-3 text-neutral-600">{new Date(run.started_at).toLocaleString('ko-KR')}</td>
                    <td className="px-3 py-3 font-medium text-neutral-950">{String(run.metrics?.case_id || '-')}</td>
                    <td className="px-3 py-3 text-neutral-600">{run.model}</td>
                    <td className="px-3 py-3 text-neutral-600">{run.status}</td>
                    <td className="px-3 py-3 font-semibold text-neutral-950">{run.passed_count ? 'PASS' : run.failed_count ? 'FAIL' : '-'}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={5} className="px-3 py-8 text-center text-neutral-500">아직 실행된 실모델 평가가 없습니다.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white p-3 ring-1 ring-neutral-200">
      <p className="text-xs font-semibold text-neutral-500">{label}</p>
      <p className="mt-1 text-lg font-bold text-neutral-950">{value}</p>
    </div>
  )
}
