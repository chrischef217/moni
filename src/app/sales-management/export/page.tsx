import { redirect } from 'next/navigation'
import { getSessionFromCookies } from '@/lib/allowance/session'

export const dynamic = 'force-dynamic'

export default async function SalesExportManagementPage() {
  const session = await getSessionFromCookies()
  if (!session) redirect('/')
  if (session.role !== 'admin') redirect('/freelancer')

  return (
    <main className="min-h-screen bg-[#071426] px-4 py-6 text-slate-100 md:px-8">
      <div className="mx-auto max-w-[1600px] space-y-5">
        <header className="rounded-3xl border border-slate-700 bg-[#0b1b30] p-6 shadow-xl">
          <p className="text-sm font-bold text-blue-300">MONI SALES MANAGEMENT</p>
          <h1 className="mt-1 text-3xl font-black">수출 관리</h1>
          <p className="mt-2 text-sm text-slate-400">판매관리의 수출 업무 영역입니다. 현재는 메뉴와 진입 화면만 먼저 등록했습니다.</p>
        </header>

        <section className="rounded-3xl border border-dashed border-slate-600 bg-slate-900/40 p-12 text-center md:p-16">
          <div className="text-5xl">🌐</div>
          <h2 className="mt-5 text-2xl font-black">수출 관리</h2>
          <p className="mt-3 text-slate-400">수출 기능 준비 중</p>
          <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            실제 수출 데이터 구조와 문서·통관·수출실적 관리 범위는 판매관리 본개발에서 확정합니다.
            현재 단계에서는 임의 데이터나 미확정 업무 흐름을 만들지 않습니다.
          </p>
        </section>
      </div>
    </main>
  )
}
