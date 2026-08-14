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
      <MoniInternalChat mobile />
    </main>
  )
}
