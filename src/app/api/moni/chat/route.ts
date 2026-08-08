import { NextRequest, NextResponse } from 'next/server'
import { POST as agentRuntimePOST } from '@/app/api/moni/agent-runtime/route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type LegacyAdminChatRequest = {
  message?: unknown
  context?: {
    mainMenu?: unknown
    productionTab?: unknown
  }
}

function text(value: unknown, max: number) {
  return String(value ?? '').trim().slice(0, max)
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as LegacyAdminChatRequest | null
  const message = text(body?.message, 6000)
  if (!message) {
    return NextResponse.json({ error: '메시지가 없습니다.' }, { status: 400, headers: { 'Cache-Control': 'no-store' } })
  }

  const mainMenu = text(body?.context?.mainMenu, 80)
  const productionTab = text(body?.context?.productionTab, 120)
  const page = {
    pathname: '/admin',
    search: [
      mainMenu ? `main=${encodeURIComponent(mainMenu)}` : '',
      productionTab ? `production=${encodeURIComponent(productionTab)}` : '',
    ].filter(Boolean).join('&'),
    title: 'MONI 관리자 대시보드',
    headings: [mainMenu, productionTab].filter(Boolean),
  }

  const forwardedHeaders = new Headers(request.headers)
  forwardedHeaders.set('content-type', 'application/json')
  const forwarded = new NextRequest(new URL('/api/moni/agent-runtime', request.nextUrl.origin), {
    method: 'POST',
    headers: forwardedHeaders,
    body: JSON.stringify({ message, page }),
  })

  const response = await agentRuntimePOST(forwarded)
  const payload = await response.json().catch(() => null) as Record<string, unknown> | null
  if (!response.ok || !payload?.ok) {
    return NextResponse.json({
      error: text(payload?.error, 2000) || 'MONI Agent 응답을 생성하지 못했습니다.',
    }, {
      status: response.status,
      headers: { 'Cache-Control': 'no-store' },
    })
  }

  return NextResponse.json({
    reply: text(payload.text, 30000),
    thread_id: text(payload.thread_id, 100),
    provider: payload.provider,
    model: payload.model,
    read_only: true,
  }, {
    status: 200,
    headers: { 'Cache-Control': 'no-store' },
  })
}

export async function GET() {
  return NextResponse.json({ error: 'Method Not Allowed' }, {
    status: 405,
    headers: { Allow: 'POST', 'Cache-Control': 'no-store' },
  })
}
