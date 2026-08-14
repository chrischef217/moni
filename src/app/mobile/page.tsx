import type { Viewport } from 'next'
import { redirect } from 'next/navigation'
import AllowanceLogin from '@/components/AllowanceLogin'
import MoniInternalChat from '@/components/MoniInternalChat'
import { getSessionFromCookies } from '@/lib/allowance/session'

export const dynamic = 'force-dynamic'

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default async function MoniMobilePage() {
  const session = await getSessionFromCookies()

  if (!session) {
    return <AllowanceLogin />
  }

  if (session.role === 'freelancer') {
    redirect('/freelancer')
  }

  return (
    <main
      data-moni-mobile-chat
      className="fixed inset-0 z-[1000] flex h-[100dvh] min-h-0 w-full flex-col overflow-hidden bg-[#f7fcfb] text-[#173b52]"
    >
      <header className="flex shrink-0 items-center gap-3 border-b border-[#d7e9e5] bg-white/95 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+12px)] backdrop-blur-xl">
        <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-[15px] border border-emerald-300/40 bg-gradient-to-br from-emerald-100 via-cyan-50 to-blue-100 shadow-inner">
          <span className="absolute left-2.5 top-2.5 h-1.5 w-1.5 rounded-full bg-[#0f8f78]" />
          <span className="absolute right-2.5 top-2.5 h-1.5 w-1.5 rounded-full bg-[#0f8f78]" />
          <span className="mt-3 h-1 w-3 rounded-full bg-[#0f8f78]/70" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="font-black text-[#173b52]">MONI</h1>
            <span className="rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[10px] font-black text-[#087d69]">MONI CHAT</span>
          </div>
          <p className="truncate text-xs text-[#607d8d]">MONI 자체 채팅 화면</p>
        </div>
      </header>

      <section className="min-h-0 flex flex-1 flex-col pb-[env(safe-area-inset-bottom)]">
        <MoniInternalChat />
      </section>
    </main>
  )
}
