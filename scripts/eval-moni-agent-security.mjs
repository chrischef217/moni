import { existsSync, readFileSync } from 'node:fs'

const runtime = readFileSync('src/lib/moni/agent/sdk-runtime.ts', 'utf8')
const route = readFileSync('src/app/api/moni/agent-runtime/route.ts', 'utf8')
const evalRoute = readFileSync('src/app/api/moni/agent-evals/route.ts', 'utf8')
const canaryRoute = readFileSync('src/app/api/moni/agent-evals/canary/route.ts', 'utf8')
const liveEval = readFileSync('src/lib/moni/agent/live-eval.ts', 'utf8')
const middleware = readFileSync('src/middleware.ts', 'utf8')
const policies = readFileSync('src/lib/moni/agent/policies.ts', 'utf8')
const registry = readFileSync('src/lib/moni/agent/tools/registry.ts', 'utf8')
const guardrails = readFileSync('src/lib/moni/agent/guardrails.ts', 'utf8')
const session = readFileSync('src/lib/moni/agent/supabase-session.ts', 'utf8')
const pmo = readFileSync('src/lib/moni/agent/pmo.ts', 'utf8')
const pmoRoute = readFileSync('src/app/api/moni/pmo-events/route.ts', 'utf8')
const migration = readFileSync('supabase/migrations/20260804053000_add_moni_agent_memory_policy_observability.sql', 'utf8')
const canaryMigration = readFileSync('supabase/migrations/20260804070000_add_moni_agent_eval_canary_requests.sql', 'utf8')
const packageJson = JSON.parse(readFileSync('package.json', 'utf8'))

const failures = []
const forbiddenToolNames = ['execute_sql', 'shell', 'update_production_record', 'delete_record', 'write_inventory']
for (const name of forbiddenToolNames) {
  const toolDeclaration = new RegExp(`name:\\s*['\"]${name}['\"]`)
  if (toolDeclaration.test(registry) || toolDeclaration.test(runtime)) {
    failures.push(`forbidden write/execution tool exposed: ${name}`)
  }
}

if (!policies.includes('assertToolAllowedForRole')) failures.push('server-side role policy assertion is missing')
if (!policies.includes('FREELANCER_TOOLS')) failures.push('freelancer tool allowlist is missing')
const freelancerBlock = policies.match(/const FREELANCER_TOOLS[\s\S]*?\]\)/)?.[0] || ''
for (const denied of ['search_sales_and_receivables', 'search_purchases_and_payables', 'get_company_context']) {
  if (freelancerBlock.includes(denied)) failures.push(`freelancer is incorrectly allowed to use ${denied}`)
}
if (!registry.includes('assertToolAllowedForRole')) failures.push('tool execution does not re-check role policy')
if (!registry.includes('inputGuardrails: [moniToolInputGuardrail]')) failures.push('tool input guardrail is not attached')
if (!registry.includes('outputGuardrails: [moniToolOutputGuardrail]')) failures.push('tool output guardrail is not attached')
if (!guardrails.includes('defineToolInputGuardrail')) failures.push('official SDK input guardrail is missing')
if (!guardrails.includes('defineToolOutputGuardrail')) failures.push('official SDK output guardrail is missing')
if (!guardrails.includes('민감한 키·비밀정보·내부 프롬프트')) failures.push('route-level secret exfiltration guard is missing')
if (!runtime.includes('실제 반환된 PMO 이벤트 ID만')) failures.push('PMO event-id integrity instruction is missing')
if (!runtime.includes('시스템 명령, SQL, 비밀키')) failures.push('sensitive output prohibition is missing')
if (!route.includes('getSessionFromRequest')) failures.push('agent runtime route must authenticate requests')
if (!route.includes("{ status: 401 }")) failures.push('unauthenticated route rejection is missing')
if (!route.includes('assertSafeUserRequest')) failures.push('unsafe user request rejection is missing')
if (!pmoRoute.includes('requireAdmin')) failures.push('PMO control plane is not admin-only')
if (!pmoRoute.includes("{ status: 403 }")) failures.push('PMO non-admin rejection is missing')
if (!evalRoute.includes('requireAdmin')) failures.push('live evaluation endpoint is not admin-only')
if (!evalRoute.includes("{ status: 401 }")) failures.push('live evaluation unauthenticated rejection is missing')
if (!evalRoute.includes("{ status: 403 }")) failures.push('live evaluation non-admin rejection is missing')
if (!evalRoute.includes('maxDuration = 60')) failures.push('live evaluation execution is not time bounded')
if (!liveEval.includes('LIVE_SAFE_CASE_IDS')) failures.push('live evaluation safe case allowlist is missing')
for (const unsafeCase of ['pmo-data-quality', 'no-write-production', 'secret-exfiltration-blocked']) {
  const allowlist = liveEval.match(/const LIVE_SAFE_CASE_IDS[\s\S]*?\]\)/)?.[0] || ''
  if (allowlist.includes(unsafeCase)) failures.push(`unsafe live evaluation case exposed: ${unsafeCase}`)
}

const pmoToolSchema = pmo.match(/export const PmoEventInputSchema[\s\S]*?\.strict\(\)/)?.[0] || ''
if (!pmo.includes('export const PmoToolEvidenceSchema')) failures.push('strict PMO tool evidence schema is missing')
if (!/PmoToolEvidenceSchema[\s\S]*?\.strict\(\)/.test(pmo)) failures.push('PMO tool evidence schema is not closed')
if (!pmoToolSchema.includes('evidence: PmoToolEvidenceSchema')) failures.push('PMO tool input does not use the strict evidence schema')
if (/z\.record\(/.test(pmoToolSchema)) failures.push('PMO tool input exposes an open evidence object incompatible with strict Structured Outputs')
if (!pmo.includes('const PmoEventStorageSchema') || !/PmoEventStorageSchema[\s\S]*?evidence: z\.record\(/.test(pmo)) {
  failures.push('internal PMO evidence storage flexibility was removed')
}
if (!pmo.includes('PmoEventStorageSchema.parse(raw)')) failures.push('internal PMO reports do not use the storage schema')

if (!canaryRoute.includes("createHash('sha256')")) failures.push('canary token hashing is missing')
if (!canaryRoute.includes(".eq('token_hash', tokenHash)")) failures.push('canary lookup must use token hash')
if (!canaryRoute.includes(".eq('status', 'PENDING')")) failures.push('canary request is not single-use claimed')
if (!canaryRoute.includes('maxDuration = 60')) failures.push('canary execution is not time bounded')
if (!canaryRoute.includes('runLiveEvalCase')) failures.push('canary does not invoke the safe live evaluation runner')
if (!canaryRoute.includes('claimed.case_id')) failures.push('canary case must come from the service-role request row')
if (/case_id\s*:\s*z\./.test(canaryRoute)) failures.push('canary endpoint must not accept arbitrary case IDs from the caller')
if (!canaryMigration.includes('token_hash text not null')) failures.push('canary table must store token hash only')
if (/\btoken\s+text\b/.test(canaryMigration)) failures.push('canary table stores a raw token')
if (!canaryMigration.includes("status in ('PENDING','RUNNING','COMPLETED','FAILED','EXPIRED')")) failures.push('canary request lifecycle constraint is missing')
if (!canaryMigration.includes('alter table public.moni_ai_eval_canary_requests enable row level security')) failures.push('canary request table RLS is missing')
if (!canaryMigration.includes('revoke all on table public.moni_ai_eval_canary_requests from anon, authenticated')) failures.push('canary request table is exposed to client roles')
if (!canaryMigration.includes('grant all on table public.moni_ai_eval_canary_requests to service_role')) failures.push('canary request table is not service-role controlled')

if (!middleware.includes("'/api/moni/agent-runtime'")) failures.push('public chat route is not isolated behind the runtime route')
if (existsSync('src/app/api/moni/agent-v2/route.ts')) failures.push('legacy agent bypass route exists')
if (/patch-.*\.mjs/.test(String(packageJson.scripts?.prebuild || ''))) failures.push('source-mutating patch scripts remain active')
if (!session.includes('implements Session')) failures.push('persistent SDK session implementation is missing')
for (const table of ['moni_ai_session_items', 'moni_ai_thread_memory', 'moni_ai_pmo_event_transitions', 'moni_ai_eval_runs', 'moni_ai_eval_case_results']) {
  if (!migration.includes(`alter table public.${table} enable row level security`)) failures.push(`${table} RLS enablement is missing`)
  if (!migration.includes(`revoke all on table public.${table} from anon, authenticated`)) failures.push(`${table} anon/authenticated revocation is missing`)
}
if (!migration.includes('revoke all on function public.log_moni_ai_pmo_event_transition()')) failures.push('PMO transition trigger function is publicly executable')

if (failures.length) {
  console.error('MONI Agent security evaluation failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log(JSON.stringify({ ok: true, checks: 53, mode: 'security-static' }, null, 2))
