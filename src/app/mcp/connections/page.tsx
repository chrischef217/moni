import { redirect } from 'next/navigation'
import MoniMcpPreflightClient from '@/components/MoniMcpPreflightClient'
import MoniMcpActivationClient from '@/components/MoniMcpActivationClient'
import MoniMcpConnectionsClient from '@/components/MoniMcpConnectionsClient'
import { getStrictMcpSessionFromCookies } from '@/lib/moni/mcp/session'

export const dynamic = 'force-dynamic'

export default async function MoniMcpConnectionsPage() {
  const session = await getStrictMcpSessionFromCookies()
  if (!session || session.role !== 'admin') redirect('/')

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-800 md:px-8 md:py-12">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-700">MONI × ChatGPT</p>
            <h1 className="mt-2 text-3xl font-black text-slate-950">ChatGPT 연결 관리</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
              먼저 사전점검을 PASS한 뒤 실제 연결 수용검사 창을 최대 30분 동안 엽니다. ChatGPT가 승인할 도구 스냅샷이 점검 이후 바뀌면 수용검사 창은 자동으로 차단됩니다.
            </p>
          </div>
          <a href="/mcp/docs" className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">
            연결 안내 보기
          </a>
        </div>

        <MoniMcpPreflightClient />
        <MoniMcpActivationClient />
        <MoniMcpConnectionsClient />
      </div>
    </main>
  )
}
