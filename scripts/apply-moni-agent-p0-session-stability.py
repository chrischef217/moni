from pathlib import Path
import re


def replace_once(source: str, old: str, new: str, label: str) -> str:
    if new in source:
        return source
    count = source.count(old)
    if count != 1:
        raise SystemExit(f'{label} marker count={count}')
    return source.replace(old, new, 1)


route_path = Path('src/app/api/moni/agent-runtime/route.ts')
route = route_path.read_text()
route = replace_once(route, "import { Buffer } from 'node:buffer'\n", "import { Buffer } from 'node:buffer'\nimport { randomUUID } from 'node:crypto'\n", 'randomUUID import')
route = replace_once(route, "import { reportPmoEvent } from '@/lib/moni/agent/pmo'\n", "import { reportPmoEvent } from '@/lib/moni/agent/pmo'\nimport { claimAgentRequest, finishAgentRequest } from '@/lib/moni/agent/request-lease'\n", 'request lease import')
route = replace_once(route, "export const dynamic = 'force-dynamic'\n", "export const dynamic = 'force-dynamic'\nexport const maxDuration = 60\n", 'maxDuration')
route = replace_once(route, "  attachment_ids?: string[]\n}", "  attachment_ids?: string[]\n  client_request_id?: string\n}", 'client request type')
route = replace_once(
    route,
    "export async function POST(request: NextRequest) {\n  const legacyRequest = new NextRequest(request.clone())\n  try {",
    "export async function POST(request: NextRequest) {\n  const legacyRequest = new NextRequest(request.clone())\n  let requestTracker: { supabase: SupabaseClient; requestId: string } | null = null\n  try {",
    'request tracker',
)

claim_anchor = "    assertSafeUserRequest(message)\n"
claim_code = """

    const clientRequestId = text(body.client_request_id, 120) || randomUUID()
    const requestClaim = await claimAgentRequest({
      supabase,
      businessId: BUSINESS_ID,
      threadId: thread.id,
      clientRequestId,
      ttlSeconds: 120,
    })
    if (requestClaim.claim_status === 'REPLAY' && requestClaim.response_json) {
      return NextResponse.json({ ...requestClaim.response_json, idempotent_replay: true })
    }
    if (requestClaim.claim_status === 'IN_PROGRESS' || requestClaim.claim_status === 'BUSY') {
      return NextResponse.json({
        ok: false,
        error: '이 대화의 이전 요청을 아직 처리 중입니다. 완료 후 다시 시도해 주세요.',
        code: 'THREAD_BUSY',
        retryable: true,
        thread_id: thread.id,
      }, { status: 409 })
    }
    if (requestClaim.claim_status === 'DUPLICATE_FAILED') {
      return NextResponse.json({
        ok: false,
        error: '이미 실패 처리된 동일 요청입니다. 새 요청으로 다시 전송해 주세요.',
        code: 'REQUEST_ALREADY_FAILED',
        retryable: false,
        thread_id: thread.id,
      }, { status: 409 })
    }
    requestTracker = { supabase, requestId: requestClaim.request_id }
"""
if 'const clientRequestId = text(body.client_request_id' not in route:
    if route.count(claim_anchor) != 1:
        raise SystemExit(f'request claim anchor count={route.count(claim_anchor)}')
    route = route.replace(claim_anchor, claim_anchor + claim_code, 1)

success_pattern = re.compile(
    r"    return NextResponse\.json\(\{\n"
    r"      ok: true,\n"
    r"      text: result\.text,\n"
    r"      provider: 'openai',\n"
    r"      model,\n"
    r"      thread_id: thread\.id,\n"
    r"      read_only: true,\n"
    r"      agent_runtime: 'MONI_AGENT_SDK_V2',\n"
    r"      agent_run_id: result\.agentRunId,\n"
    r"      agent_steps: result\.stepCount,\n"
    r"      tool_call_count: result\.toolCallCount,\n"
    r"      tools_used: result\.toolsUsed,\n"
    r"      usage: result\.usage,\n"
    r"      memory_version: memoryRefresh\.memoryVersion,\n"
    r"      pmo_handoff_status: isPmoRequest \? 'REQUESTED' : thread\.pmo_handoff_status,\n"
    r"    \}\)"
)
success_code = """    const responseBody = {
      ok: true,
      text: result.text,
      provider: 'openai',
      model,
      thread_id: thread.id,
      read_only: true,
      agent_runtime: 'MONI_AGENT_SDK_V2',
      agent_run_id: result.agentRunId,
      agent_steps: result.stepCount,
      tool_call_count: result.toolCallCount,
      tools_used: result.toolsUsed,
      usage: result.usage,
      memory_version: memoryRefresh.memoryVersion,
      pmo_handoff_status: isPmoRequest ? 'REQUESTED' : thread.pmo_handoff_status,
    }
    await finishAgentRequest({
      supabase,
      requestId: requestTracker!.requestId,
      status: 'COMPLETED',
      agentRunId: result.agentRunId,
      responseJson: responseBody,
    })
    requestTracker = null
    return NextResponse.json(responseBody)"""
if 'const responseBody = {' not in route:
    route, count = success_pattern.subn(success_code, route, count=1)
    if count != 1:
        raise SystemExit(f'success response replacement count={count}')

catch_pattern = re.compile(
    r"  \} catch \(error\) \{\n"
    r"    const message = error instanceof Error \? error\.message : 'MONI Agent 응답 생성 중 오류가 발생했습니다\.'\n"
    r"    console\.error\('\[MONI_AGENT_SDK_ROUTE_ERROR\]', \{ message, occurred_at: new Date\(\)\.toISOString\(\) \}\)\n"
    r"    return NextResponse\.json\(\{ ok: false, error: message \}, \{ status: 500 \}\)\n"
    r"  \}\n\}"
)
catch_code = """  } catch (error) {
    const message = error instanceof Error ? error.message : 'MONI Agent 응답 생성 중 오류가 발생했습니다.'
    if (requestTracker) {
      const tracker = requestTracker
      await finishAgentRequest({
        supabase: tracker.supabase,
        requestId: tracker.requestId,
        status: 'FAILED',
        errorMessage: message,
      }).catch((finishError) => console.error('[MONI_AGENT_REQUEST_FINISH_ERROR]', {
        message: finishError instanceof Error ? finishError.message : String(finishError),
        request_id: tracker.requestId,
      }))
    }
    console.error('[MONI_AGENT_SDK_ROUTE_ERROR]', { message, occurred_at: new Date().toISOString() })
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}"""
if '[MONI_AGENT_REQUEST_FINISH_ERROR]' not in route:
    route, count = catch_pattern.subn(catch_code, route, count=1)
    if count != 1:
        raise SystemExit(f'route catch replacement count={count}')
route_path.write_text(route)

component_path = Path('src/components/GlobalMoniAgent.tsx')
component = component_path.read_text()
component = replace_once(component, "  pmo_handoff_status?: string\n}", "  pmo_handoff_status?: string\n  code?: string\n  retryable?: boolean\n}", 'response code type')
component = replace_once(component, "  const threadIdRef = useRef('')\n", "  const threadIdRef = useRef('')\n  const sendingRef = useRef(false)\n", 'sending ref')
component = replace_once(component, "    if ((!question && !readyAttachments.length) || sending || uploading) return\n", "    if ((!question && !readyAttachments.length) || sendingRef.current || uploading) return\n", 'same tick guard')
component = replace_once(component, "    const visibleQuestion = question || '첨부한 자료를 분석해 주세요.'\n", "    const visibleQuestion = question || '첨부한 자료를 분석해 주세요.'\n    const clientRequestId = crypto.randomUUID()\n    sendingRef.current = true\n", 'request UUID')
component = replace_once(
    component,
    "body: JSON.stringify({ message: question, messages: prior, page: pageContext(), thread_id: threadIdRef.current, attachment_ids: readyAttachments.map((item) => item.attachmentId) }),",
    "body: JSON.stringify({ message: question, messages: prior, page: pageContext(), thread_id: threadIdRef.current, attachment_ids: readyAttachments.map((item) => item.attachmentId), client_request_id: clientRequestId }),",
    'request body id',
)
payload_anchor = "      const payload = await response.json() as AgentResponse\n"
payload_code = """      if (response.status === 409 && (payload.code === 'THREAD_BUSY' || payload.code === 'REQUEST_ALREADY_FAILED')) {
        setMessages((current) => {
          const next = [...current]
          const last = next[next.length - 1]
          if (last?.role === 'user' && last.content === visibleQuestion) next.pop()
          return next
        })
        setError(payload.error || '이전 요청을 처리 중입니다.')
        return
      }
"""
if "payload.code === 'THREAD_BUSY'" not in component:
    if component.count(payload_anchor) != 1:
        raise SystemExit(f'payload anchor count={component.count(payload_anchor)}')
    component = component.replace(payload_anchor, payload_anchor + payload_code, 1)
component = replace_once(component, "    } finally { setSending(false) }\n", "    } finally { sendingRef.current = false; setSending(false) }\n", 'sending ref release')
component_path.write_text(component)
