import { redirect } from 'next/navigation'
import MoniMcpConnectionsClient from '@/components/MoniMcpConnectionsClient'
import { getStrictMcpSessionFromCookies } from '@/lib/moni/mcp/session'

export const dynamic = 'force-dynamic'

export default async function MoniMcpConnectionsPage() {
  const session = await getStrictMcpSessionFromCookies()
  if (!session) redirect('/?return_to=%2Fmcp%2Fconnections')
  if (session.role !== 'admin') redirect('/')

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-800 md:px-8 md:py-12">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-700">MONI × ChatGPT</p>
            <h1 className="mt-2 text-3xl font-black text-slate-950">ChatGPT 연결 관리</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
              MONI 데이터에 접근하도록 승인된 ChatGPT 연결을 확인하고 즉시 폐기합니다. 연결 폐기는 생산·재고·판매 등 업무 데이터를 변경하지 않습니다.
            </p>
          </div>
          <a href="/mcp/docs" className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">
            연결 안내 보기
          </a>
        </div>

        <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm leading-6 text-amber-900">
          현재 MCP 운영 연결은 기능 플래그로 비활성 상태입니다. 이 화면과 폐기 기능은 실제 연결을 열기 전에 관리·복구 경로를 준비하기 위한 것입니다.
        </div>

        <MoniMcpConnectionsClient />
      </div>
    </main>
  )
}
