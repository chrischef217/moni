import { redirect } from 'next/navigation'
import AllowanceLogin from '@/components/AllowanceLogin'
import { getSessionFromCookies } from '@/lib/allowance/session'

export const dynamic = 'force-dynamic'

export default async function LoginPage() {
  const session = await getSessionFromCookies()

  if (session?.role === 'admin') redirect('/')
  if (session?.role === 'freelancer') redirect('/freelancer')

  return <AllowanceLogin />
}
