import { NextRequest } from 'next/server'
import { GET as legacyGET } from '../production-daily/route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function isDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
}

export async function GET(request: NextRequest) {
  const date = String(request.nextUrl.searchParams.get('date') || '').trim()
  if (!isDate(date) || request.nextUrl.searchParams.has('from') || request.nextUrl.searchParams.has('to')) {
    return legacyGET(request)
  }

  const url = request.nextUrl.clone()
  url.searchParams.delete('date')
  url.searchParams.set('from', date)
  url.searchParams.set('to', date)
  return legacyGET(new NextRequest(url, { method: 'GET', headers: request.headers }))
}
