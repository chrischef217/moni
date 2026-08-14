import { NextRequest, NextResponse } from 'next/server'

const MONI_API_PREFIX = '/api/moni/'
const SESSION_CHECK_PATH = '/api/allowance/auth/session'
const MONI_BUSINESS_ID = String(process.env.MONI_BUSINESS_ID || '20220523011').trim()
const LEGACY_BUSINESS_ID = 'default'
const BODY_TENANT_GUARD_EXEMPT_PATHS = new Set([
  '/api/moni/agent-chat',
  '/api/moni/agent-runtime',
  '/api/moni/agent-files',
])

// The live-eval canary is authenticated by its own short-lived, one-time capability token.
// Keep this exception exact so ordinary Agent/admin/business endpoints never bypass MONI login.
const SESSION_EXEMPT_PATHS = new Set([
  '/api/moni/agent-evals/canary',
])

function requiresMoniSession(pathname: string) {
  return pathname.startsWith(MONI_API_PREFIX) && !SESSION_EXEMPT_PATHS.has(pathname)
}

function isAllowedBusinessId(value: unknown) {
  const businessId = String(value ?? '').trim()
  return businessId === '' || businessId === MONI_BUSINESS_ID || businessId === LEGACY_BUSINESS_ID
}

function hasForeignTenantQuery(request: NextRequest) {
  return request.nextUrl.searchParams.getAll('business_id').some((value) => !isAllowedBusinessId(value))
}

async function hasForeignTenantBody(request: NextRequest) {
  if (BODY_TENANT_GUARD_EXEMPT_PATHS.has(request.nextUrl.pathname)) return false
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method.toUpperCase())) return false
  if (!String(request.headers.get('content-type') || '').toLowerCase().includes('application/json')) return false

  const payload = await request.clone().json().catch(() => null)
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false
  if (!Object.prototype.hasOwnProperty.call(payload, 'business_id')) return false
  return !isAllowedBusinessId((payload as Record<string, unknown>).business_id)
}

function foreignTenantResponse() {
  return NextResponse.json(
    { ok: false, error: '허용되지 않은 사업자 범위입니다.' },
    {
      status: 403,
      headers: {
        'Cache-Control': 'no-store',
        'X-MONI-Tenant': 'rejected',
      },
    },
  )
}

function isMobileBrowser(request: NextRequest) {
  if (request.headers.get('sec-ch-ua-mobile') === '?1') return true
  const userAgent = request.headers.get('user-agent') || ''
  return /Android|iPhone|iPod|Windows Phone|BlackBerry|Mobile/i.test(userAgent)
}

async function verifyMoniSession(request: NextRequest) {
  const sessionUrl = request.nextUrl.clone()
  sessionUrl.pathname = SESSION_CHECK_PATH
  sessionUrl.search = ''

  try {
    const response = await fetch(sessionUrl, {
      method: 'GET',
      headers: {
        cookie: request.headers.get('cookie') || '',
      },
      cache: 'no-store',
      redirect: 'manual',
    })

    if (response.ok) return null

    if (response.status === 401 || response.status === 403) {
      return NextResponse.json(
        { ok: false, error: 'MONI 로그인이 필요합니다.' },
        {
          status: 401,
          headers: {
            'Cache-Control': 'no-store',
            'X-MONI-Auth': 'required',
          },
        },
      )
    }

    return NextResponse.json(
      { ok: false, error: 'MONI 인증 상태를 확인할 수 없습니다.' },
      {
        status: 503,
        headers: {
          'Cache-Control': 'no-store',
          'X-MONI-Auth': 'unavailable',
        },
      },
    )
  } catch {
    return NextResponse.json(
      { ok: false, error: 'MONI 인증 상태를 확인할 수 없습니다.' },
      {
        status: 503,
        headers: {
          'Cache-Control': 'no-store',
          'X-MONI-Auth': 'unavailable',
        },
      },
    )
  }
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  // Mobile is an AI-first product surface, not a responsive copy of the PC dashboard.
  // Entering the root URL on a phone must land on the dedicated conversation shell.
  if (pathname === '/' && isMobileBrowser(request)) {
    const mobileUrl = request.nextUrl.clone()
    mobileUrl.pathname = '/mobile'
    return NextResponse.redirect(mobileUrl)
  }

  if (requiresMoniSession(pathname)) {
    const denied = await verifyMoniSession(request)
    if (denied) return denied

    if (hasForeignTenantQuery(request) || (await hasForeignTenantBody(request))) {
      return foreignTenantResponse()
    }
  }

  if (pathname === '/api/moni/agent-chat') {
    const rewritten = request.nextUrl.clone()
    rewritten.pathname = '/api/moni/agent-runtime'
    return NextResponse.rewrite(rewritten)
  }

  if (/^\/api\/moni\/production-records\/[^/]+\/pdf$/.test(pathname)) {
    if (request.nextUrl.searchParams.get('format') === 'json') {
      return NextResponse.next()
    }

    const rewritten = request.nextUrl.clone()
    rewritten.pathname = rewritten.pathname.replace(/\/pdf$/, '/print-pdf')
    return NextResponse.rewrite(rewritten)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/',
    '/api/moni/:path*',
  ],
}
