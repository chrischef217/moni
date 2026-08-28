import { readFileSync } from 'node:fs'

const packageJson = JSON.parse(readFileSync('package.json', 'utf8'))
const prebuild = String(packageJson.scripts?.prebuild || '')
const runtimeWrapper = readFileSync('src/app/api/moni/agent-runtime/route.ts', 'utf8')
const runtimeBase = readFileSync('src/app/api/moni/agent-runtime/base-route.ts', 'utf8')
const runtimeRoute = `${runtimeWrapper}\n${runtimeBase}`
const directPriceLookup = readFileSync('src/lib/moni/agent/direct-price-lookup.ts', 'utf8')
const conversationRuntime = readFileSync('src/lib/moni/agent/conversation-runtime.ts', 'utf8')
const conversationTools = readFileSync('src/lib/moni/agent/conversation-tools.ts', 'utf8')
const memory = readFileSync('src/lib/moni/agent/memory.ts', 'utf8')
const capabilityDirect = readFileSync('src/lib/moni/agent/capability-direct.ts', 'utf8')
const capabilityMigration = readFileSync('supabase/migrations/202608280006_complete_moni_capability_coverage_audit.sql', 'utf8')
const globalAgent = readFileSync('src/components/GlobalMoniAgent.tsx', 'utf8')
const internalChat = readFileSync('src/components/MoniInternalChat.tsx', 'utf8')
const nextConfig = readFileSync('next.config.mjs', 'utf8')

const failures = []

if (!prebuild.includes('verify-moni-agent-source.mjs')) failures.push('prebuild must run MONI source verification')

if (!runtimeRoute.includes("agent_runtime: 'MONI_OPENAI_CONVERSATIONS_V1'")) failures.push('agent-runtime must identify the MONI OpenAI Conversations runtime')
if (!runtimeRoute.includes('runMoniConversationAgent')) failures.push('agent-runtime must call runMoniConversationAgent')
if (!runtimeRoute.includes('openai_conversation_id')) failures.push('agent-runtime must persist the OpenAI conversation id')
if (!runtimeRoute.includes("conversation_state: 'SERVER_MANAGED'")) failures.push('agent-runtime must report server-managed conversation state')
if (!runtimeWrapper.includes("POST as basePOST") || !runtimeWrapper.includes('return basePOST(request)')) failures.push('agent-runtime wrapper must delegate non-direct requests to the preserved base runtime')
if (!runtimeWrapper.includes('tryDirectPriceLookup')) failures.push('agent-runtime wrapper must run deterministic direct price lookup before model inference')

for (const required of [
  'raw_material_mapping',
  'raw_material_transactions',
  'raw_materials',
  'purchases',
  'products',
  'sales_product_settings',
  'sales_product_variants',
  'compactName',
  'DIRECT_PRICE_LOOKUP_V1',
  'direct_price_lookup',
]) {
  if (!directPriceLookup.includes(required)) failures.push(`direct price lookup missing required contract: ${required}`)
}
if (!directPriceLookup.includes("/(가격|단가|얼마)/")) failures.push('direct price lookup must recognize basic price-language intent')
if (!directPriceLookup.includes('raw_material') || !directPriceLookup.includes('product')) failures.push('direct price lookup must distinguish raw materials from finished products')
if (!directPriceLookup.includes('verification_status')) failures.push('direct raw-material pricing must preserve purchase data-quality status')

if (!conversationRuntime.includes('startOpenAIConversationsSession')) failures.push('conversation runtime must create OpenAI Conversations sessions')
if (!conversationRuntime.includes('conversationId')) failures.push('conversation runtime must pass conversationId to the Agents SDK')
if (conversationRuntime.includes('SupabaseMoniSession')) failures.push('conversation runtime must not reconstruct reasoning state through SupabaseMoniSession')
if (conversationRuntime.includes('previousResponseId') || conversationRuntime.includes('previous_response_id')) failures.push('conversation runtime must not manually chain response ids when using Conversations state')

for (const required of [
  'prepare_production_plan_change',
  'execute_production_plan_change',
  'prepare_production_operation',
  'execute_production_operation',
  'preexistingPendingConfirmationIds',
  'currentUserText',
]) {
  if (!conversationTools.includes(required)) failures.push(`conversation tools missing safety contract: ${required}`)
}
if (!conversationTools.includes('같은 턴의 prepare→execute는 금지')) failures.push('write tools must enforce separate-turn approval')
if (!conversationTools.includes('user_confirmation_text: context.currentUserText')) failures.push('execution approval text must come from the actual current user message')

// MONI self-knowledge must be deterministic, centralized, and deployment-gated.
if (!memory.includes("rpc('search_moni_capabilities'")) failures.push('thread memory must prefetch MONI capabilities from the registry RPC')
if (!memory.includes('capabilityPrefetch')) failures.push('thread memory must carry server-prefetched capability results')
if (!memory.includes('[MONI 기능 레지스트리 자동조회 · 서버 prefetch]')) failures.push('agent instructions must receive prefetched capability evidence')
if (!conversationRuntime.includes('resolveDirectCapabilityHowTo')) failures.push('conversation runtime must resolve high-confidence how-to requests before model inference')
if (!conversationRuntime.includes("state_mode: 'DIRECT_CAPABILITY_REGISTRY'")) failures.push('direct capability answers must be auditable in agent-run metadata')
if (!conversationRuntime.includes("toolName = 'search_moni_capabilities_prefetch'")) failures.push('direct capability answers must persist capability lookup evidence')
if (!capabilityDirect.includes('DIRECT_MIN_SCORE = 100')) failures.push('direct capability resolver must keep a minimum confidence threshold')
if (!capabilityDirect.includes('DIRECT_MIN_GAP = 35')) failures.push('direct capability resolver must require separation from ambiguous matches')
if (!capabilityDirect.includes('PC_ONLY')) failures.push('direct capability resolver must distinguish PC-only functions')
if (!capabilityDirect.includes("startsWith('/mobile')")) failures.push('direct capability resolver must distinguish mobile surface context')
if (!capabilityMigration.includes('moni_capability_required_routes')) failures.push('capability SSOT migration must preserve the required route manifest')
if (!capabilityMigration.includes('run_moni_capability_coverage_audit')) failures.push('capability SSOT migration must preserve automatic route coverage audit')
if (!capabilityMigration.includes('SALES_STATEMENT_MANAGEMENT')) failures.push('capability SSOT migration must cover sales statements')
if (!capabilityMigration.includes('ADMIN_COMPANY_SETTINGS')) failures.push('capability SSOT migration must cover administrator company settings')

if (!globalAgent.includes('moni-agent-character')) failures.push('MONI web UI must keep the MONI character launcher')
if (!globalAgent.includes('MoniInternalChat')) failures.push('MONI character shell must host the internal live chat')
if (globalAgent.includes('chatgpt.com/g/')) failures.push('MONI web UI must not redirect to an external Custom GPT')
if (!internalChat.includes("fetch('/api/moni/agent-runtime'")) failures.push('MONI internal chat must call the MONI agent runtime')
if (!internalChat.includes('THREAD_KEY')) failures.push('MONI internal chat must persist its thread id')

if (/source:\s*['"]\/api\/moni\/agent-runtime['"]/.test(nextConfig) || /source:\s*['"]\/api\/moni\/agent-chat['"]/.test(nextConfig)) {
  failures.push('Next config must not rewrite the live MONI agent endpoints to a disabled route')
}

if (failures.length) {
  console.error('MONI OpenAI Conversations source verification failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log('MONI OpenAI Conversations source verification passed.')
