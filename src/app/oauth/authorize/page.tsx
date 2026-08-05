import { redirect } from 'next/navigation'
import { getSessionFromCookies } from '@/lib/allowance/session'
import { validateAuthorizationRequest } from '@/lib/moni/mcp/oauth'

export const dynamic = 'force-dynamic'

type SearchParams = Record<string, string | string[] | undefined>

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || '' : value || ''
}

function queryString(searchParams: SearchParams) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(searchParams)) {
    const current = first(value)
    if (current) params.set(key, current)
  }
  return params.toString()
}

export default async function MoniOAuthAuthorizePage({ searchParams = {} }: { searchParams?: SearchParams }) {
  let authorization
  try {
    authorization = await validateAuthorizationRequest({
      client_id: first(searchParams.client_id),
      redirect_uri: first(searchParams.redirect_uri),
      response_type: first(searchParams.response_type),
      state: first(searchParams.state),
      code_challenge: first(searchParams.code_challenge),
      code_challenge_method: first(searchParams.code_challenge_method),
      scope: first(searchParams.scope),
      resource: first(searchParams.resource),
    })
  } catch (error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6 text-slate-800">
        <section className="w-full max-w-lg rounded-3xl border border-red-200 bg-white p-8 shadow-xl">
          <h1 className="text-xl font-black text-red-700">MONI 연결 요청을 확인할 수 없습니다.</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">{error instanceof Error ? error.message : '잘못된 OAuth 요청입니다.'}</p>
        </section>
      </main>
    )
  }

  const session = await getSessionFromCookies()
  if (!session) {
    const returnTo = `/oauth/authorize?${queryString(searchParams)}`
    redirect(`/?return_to=${encodeURIComponent(returnTo)}`)
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50 p-6 text-slate-800">
      <section className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-8 shadow-2xl">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 text-sm font-black text-white">MONI</div>
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-blue-700">ChatGPT 연결</p>
            <h1 className="text-xl font-black">MONI 읽기 전용 데이터 접근 승인</h1>
          </div>
        </div>

        <div className="space-y-3 rounded-2xl bg-slate-50 p-5 text-sm leading-6">
          <p><strong>로그인 사용자:</strong> {session.displayName} ({session.loginId})</p>
          <p><strong>권한:</strong> {session.role}</p>
          <p><strong>허용 범위:</strong> 생산·재고·제품 조회{session.role === 'admin' ? ', 판매·미수금·매입·회사 문맥 조회' : ''}</p>
          <p className="font-bold text-emerald-700">업무 데이터 생성·수정·삭제는 허용하지 않습니다.</p>
        </div>

        <form action="/oauth/authorize/complete" method="post" className="mt-6 grid gap-3">
          <input type="hidden" name="client_id" value={authorization.clientId} />
          <input type="hidden" name="redirect_uri" value={authorization.redirectUri} />
          <input type="hidden" name="state" value={authorization.state} />
          <input type="hidden" name="code_challenge" value={authorization.codeChallenge} />
          <input type="hidden" name="code_challenge_method" value="S256" />
          <input type="hidden" name="response_type" value="code" />
          <input type="hidden" name="scope" value={authorization.scope} />
          <input type="hidden" name="resource" value={authorization.resource} />
          <button type="submit" name="decision" value="approve" className="min-h-12 rounded-xl bg-blue-700 px-5 font-black text-white hover:bg-blue-800">
            ChatGPT 연결 승인
          </button>
          <button type="submit" name="decision" value="deny" className="min-h-11 rounded-xl border border-slate-300 bg-white px-5 font-bold text-slate-600 hover:bg-slate-50">
            취소
          </button>
        </form>
        <p className="mt-5 text-xs leading-5 text-slate-500">연결은 언제든 MONI 관리 기능에서 취소할 수 있도록 후속 관리 화면을 추가할 예정입니다.</p>
      </section>
    </main>
  )
}
