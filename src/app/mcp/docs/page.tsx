import { MONI_MCP_VERSION, moniMcpResource } from '@/lib/moni/mcp/config'

export const dynamic = 'force-dynamic'

export default function MoniMcpDocsPage() {
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
            <li>OAuth 2.1, PKCE, 짧은 수명의 접근 토큰을 사용합니다.</li>
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
          </dl>
        </section>

        <section className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-6">
          <h2 className="font-black text-amber-900">현재 상태</h2>
          <p className="mt-2 text-sm leading-6 text-amber-900">
            보안 수용검사와 ChatGPT 플랜 연결 검증이 끝날 때까지 운영 연결은 비활성 상태입니다.
            기존 MONI 내부 AI는 수용검사 완료 전까지 유지합니다.
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
