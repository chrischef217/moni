import type { Viewport } from 'next'
import { redirect } from 'next/navigation'
import AllowanceLogin from '@/components/AllowanceLogin'
import { getSessionFromCookies } from '@/lib/allowance/session'

export const dynamic = 'force-dynamic'

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

const MONI_GPT_URL = 'https://chatgpt.com/g/g-6a7af9094b08819183be32a5dc97ef7b-moni'

export default async function MoniMobilePage() {
  const session = await getSessionFromCookies()

  if (!session) {
    return <AllowanceLogin />
  }

  if (session.role === 'freelancer') {
    redirect('/freelancer')
  }

  redirect(MONI_GPT_URL)
}
