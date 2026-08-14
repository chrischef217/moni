import type { Viewport } from 'next'
import { redirect } from 'next/navigation'
import AllowanceLogin from '@/components/AllowanceLogin'
import MoniMobileChatShell from '@/components/MoniMobileChatShell'
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

  return <MoniMobileChatShell />
}
