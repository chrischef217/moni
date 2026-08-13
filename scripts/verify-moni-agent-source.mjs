import { readFileSync } from 'node:fs'

const packageJson = JSON.parse(readFileSync('package.json', 'utf8'))
const prebuild = String(packageJson.scripts?.prebuild || '')
const runtimeRoute = readFileSync('src/app/api/moni/agent-runtime/route.ts', 'utf8')
const conversationRuntime = readFileSync('src/lib/moni/agent/conversation-runtime.ts', 'utf8')
const conversationTools = readFileSync('src/lib/moni/agent/conversation-tools.ts', 'utf8')
const globalAgent = readFileSync('src/components/GlobalMoniAgent.tsx', 'utf8')
const internalChat = readFileSync('src/components/MoniInternalChat.tsx', 'utf8')
const nextConfig = readFileSync('next.config.mjs', 'utf8')

const failures = []

if (!prebuild.includes('verify-moni-agent-source.mjs')) failures.push('prebuild must run MONI source verification')

if (!runtimeRoute.includes("agent_runtime: 'MONI_OPENAI_CONVERSATIONS_V1'")) failures.push('agent-runtime must identify the MONI OpenAI Conversations runtime')
if (!runtimeRoute.includes('runMoniConversationAgent')) failures.push('agent-runtime must call runMoniConversationAgent')
if (!runtimeRoute.includes('openai_conversation_id')) failures.push('agent-runtime must persist the OpenAI conversation id')
if (!runtimeRoute.includes("conversation_state: 'SERVER_MANAGED'")) failures.push('agent-runtime must report server-managed conversation state')

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
