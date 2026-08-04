import { existsSync, readFileSync, readdirSync } from 'node:fs'

const packageJson = JSON.parse(readFileSync('package.json', 'utf8'))
const prebuild = String(packageJson.scripts?.prebuild || '')
const middleware = readFileSync('src/middleware.ts', 'utf8')
const route = readFileSync('src/app/api/moni/agent-runtime/route.ts', 'utf8')
const runtime = readFileSync('src/lib/moni/agent/sdk-runtime.ts', 'utf8')
const policies = readFileSync('src/lib/moni/agent/policies.ts', 'utf8')
const memory = readFileSync('src/lib/moni/agent/memory.ts', 'utf8')
const session = readFileSync('src/lib/moni/agent/supabase-session.ts', 'utf8')
const guardrails = readFileSync('src/lib/moni/agent/guardrails.ts', 'utf8')
const telemetry = readFileSync('src/lib/moni/agent/telemetry.ts', 'utf8')
const pmoRoute = readFileSync('src/app/api/moni/pmo-events/route.ts', 'utf8')
const scripts = readdirSync('scripts')

const failures = []

if (/patch-.*\.mjs/.test(prebuild)) failures.push('prebuild must not mutate TypeScript source through patch scripts')
if (scripts.some((name) => /^patch-.*\.mjs$/.test(name))) failures.push('obsolete source-mutating patch scripts must not remain in the repository')
if (existsSync('src/app/api/moni/agent-v2/route.ts')) failures.push('the bypassable legacy /api/moni/agent-v2 route must not exist')
if (!prebuild.includes('verify-moni-agent-source.mjs')) failures.push('prebuild must run immutable source verification')
if (!middleware.includes("'/api/moni/agent-chat'")) failures.push('src/middleware.ts must route the public MONI chat endpoint')
if (!middleware.includes("'/api/moni/agent-runtime'")) failures.push('src/middleware.ts must route MONI chat to the production agent runtime')
if (!route.includes("@/lib/moni/agent/sdk-runtime")) failures.push('agent runtime API must import the SDK runtime directly')
if (!route.includes('loadThreadMemory') || !route.includes('loadPinnedProjectContext')) failures.push('agent route must load layered memory')
if (!route.includes('maybeRefreshThreadMemory')) failures.push('agent route must refresh thread memory')
if (!runtime.includes("from '@openai/agents'")) failures.push('MONI runtime must use the official OpenAI Agents SDK')
if (!runtime.includes('outputType: MoniAnswerSchema')) failures.push('MONI runtime must use a structured final output schema')
if (!runtime.includes('maxTurns: MAX_AGENT_TURNS')) failures.push('MONI runtime must enforce a bounded agent loop')
if (!runtime.includes('SupabaseMoniSession')) failures.push('MONI runtime must use persistent SDK sessions')
if (!runtime.includes('createMoniTools(context.session.role)')) failures.push('MONI runtime must expose tools by role')
if (!runtime.includes('markAgentRunCompleted')) failures.push('MONI runtime must persist usage and latency telemetry')
if (!policies.includes('FREELANCER_TOOLS') || !policies.includes('search_sales_and_receivables')) failures.push('role policy must explicitly separate financial tools')
if (!memory.includes('MONI Memory Curator') || !memory.includes('MEMORY_REFRESH_MESSAGE_DELTA')) failures.push('thread memory curator is missing')
if (!session.includes('implements Session') || !session.includes('moni_ai_session_items')) failures.push('Supabase SDK session implementation is missing')
if (!guardrails.includes('defineToolInputGuardrail') || !guardrails.includes('defineToolOutputGuardrail')) failures.push('tool input/output guardrails are missing')
if (!telemetry.includes('input_tokens') || !telemetry.includes('latency_ms')) failures.push('usage and latency telemetry fields are missing')
if (!pmoRoute.includes('allowed_transitions') || !pmoRoute.includes('requireAdmin')) failures.push('admin PMO control-plane transition API is missing')

if (failures.length) {
  console.error('MONI Agent source verification failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log('MONI Agent source verification passed.')
