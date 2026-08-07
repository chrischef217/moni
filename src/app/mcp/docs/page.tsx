import {
  isMoniMcpEnabled,
  MONI_MCP_VERSION,
  moniMcpResource,
} from '@/lib/moni/mcp/config'

export const dynamic = 'force-dynamic'

const readiness = [
  { label: 'OAuth 2.1 + PKCE S256', state: '완료' },
  { label: '읽기 전용 역할별 도구', state: '완료' },
  { label: 'Supabase RLS · service_role 전용 보호', state: '완료' },
  { label: 'fallback 세션 MCP 차단 · 현재 사용자 재검증', state: '완료' },
  { label: 'access/refresh token 해시 저장 · 폐기 기능', state: '완료' },
  { label: 'unknown scope 차단 · refresh token 원자적 회전', state: '완료' },
  { label: 'ChatGPT 도구 스캔', state: '지원 플랜 전환 후' },
  { label: 'Admin/Freelancer 실제 조회 교차검산', state: '실제 연결 후' },
  { label: 'GPT(PMO) 최종 전환 승인', state: '대기' },
] as const

export default function MoniMcpDocsPage() {
  const enabled = isMoniMcpEnabled()

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-12 text-slate-800">
      <article className="mx-auto max-w-3xl rounded-3xl border border-slate-200 bg-white p-8 shadow-xl md:p-12">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-700">MONI × ChatGPT</p>
        <h1 className="mt-3 text-3xl font-black">MONI 읽기 전용 MCP 연결</h1>
        <p className="mt-4 leading-7 text-slate-600">
          MONI의 생산·재고·제품·판매·수금·매입 데이터를 ChatGPT가 승인된 도구로 조회하도록 연결합니다.
          MONI 업무 화면과 원본 데이터는 그대로 유지하고, ChatGPT가 분석과 대화를 담당합니다.
        </p>

        <section className="mt-8 grid gap-4 rounded-2xl bg-emerald-50 p-6">
          <h2 className="text-lg font-black text-emerald-900">보호 원칙</h2>
          <ul className="list-disc space-y-2 pl-5 text-sm leading-6 text-emerald-900">
            <li>모든 도구는 조회 전용입니다.</li>
            <li>생산·재고·판매·회계 데이터 생성·수정·삭제 도구는 제공하지 않습니다.</li>
            <li>사용자 역할에 따라 조회 가능한 업무영역을 제한합니다.</li>
            <li>각 도구 실행과 관리자 폐기 작업은 MONI 감사 테이블에 기록합니다.</li>
            <li>OAuth 2.1, PKCE, 짧은 수명의 접근 토큰과 회전식 refresh token을 사용합니다.</li>
          </ul>
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-black">연결 정보</h2>
          <dl className="mt-4 grid gap-3 text-sm">
            <div className="rounded-xl border border-slate-200 p-4">
              <dt className="font-bold text-slate-500">MCP URL</dt>
              <dd className="mt-1 break-all font-mono text-slate-800">{moniMcpResource()}</dd>
            </div>
            <div className="rounded-xl border border-slate-200 p-4">
              <dt className="font-bold text-slate-500">버전</dt>
              <dd className="mt-1 font-mono text-slate-800">{MONI_MCP_VERSION}</dd>
            </div>
            <div className="rounded-xl border border-slate-200 p-4">
              <dt className="font-bold text-slate-500">운영 MCP 호출</dt>
              <dd className={`mt-1 font-black ${enabled ? 'text-emerald-700' : 'text-amber-700'}`}>
                {enabled ? '활성' : '비활성 — 실제 ChatGPT 수용검사 전 보호 상태'}
              </dd>
            </div>
          </dl>
        </section>

        <section className="mt-8 rounded-2xl border border-slate-200 bg-slate-50 p-6">
          <h2 className="text-lg font-black text-slate-900">운영 준비 체크리스트</h2>
          <div className="mt-4 divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
            {readiness.map((item) => {
              const done = item.state === '완료'
              return (
                <div key={item.label} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                  <span className="font-bold text-slate-700">{item.label}</span>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-black ${done ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                    {item.state}
                  </span>
                </div>
              )
            })}
          </div>
        </section>

        <section className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-6">
          <h2 className="font-black text-amber-900">현재 상태</h2>
          <p className="mt-2 text-sm leading-6 text-amber-900">
            서버 기반·보안·DB 보호 검증은 완료됐습니다. 실제 ChatGPT 지원 플랜에서 도구 스캔과 역할별 실데이터 교차검산을 완료하기 전까지 운영 MCP 호출은 비활성 상태로 유지합니다.
            기존 MONI 내부 AI도 최종 전환 승인 전까지 유지합니다.
          </p>
        </section>

        <div className="mt-8 flex flex-wrap gap-3">
          <a href="/mcp/connections" className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-black text-white hover:bg-slate-800">
            관리자 연결관리 열기
          </a>
          <a href="/" className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50">
            MONI로 돌아가기
          </a>
        </div>
      </article>
    </main>
  )
}
