import { redirect } from 'next/navigation'
import AllowanceLogin from '@/components/AllowanceLogin'
import MoniMobileMvp from '@/components/MoniMobileMvp'
import { getSessionFromCookies } from '@/lib/allowance/session'

export const dynamic = 'force-dynamic'

export default async function MoniMobilePage() {
  const session = await getSessionFromCookies()

  if (!session) {
    return <AllowanceLogin />
  }

  if (session.role === 'freelancer') {
    redirect('/freelancer')
  }

  return <MoniMobileMvp displayName={session.displayName || session.loginId} />
}
