import { readFileSync } from 'node:fs'

const packageJson = JSON.parse(readFileSync('package.json', 'utf8'))
const prebuild = String(packageJson.scripts?.prebuild || '')
const runtimeRoute = readFileSync('src/app/api/moni/agent-runtime/route.ts', 'utf8')
const legacyChatRoute = readFileSync('src/app/api/moni/agent-chat/route.ts', 'utf8')
const chatRoute = readFileSync('src/app/api/moni/chat/route.ts', 'utf8')
const evalRoute = readFileSync('src/app/api/moni/agent-evals/route.ts', 'utf8')
const evalCanaryRoute = readFileSync('src/app/api/moni/agent-evals/canary/route.ts', 'utf8')
const chatgptOnlyRoute = readFileSync('src/app/api/moni/chatgpt-only/route.ts', 'utf8')
const globalAgent = readFileSync('src/components/GlobalMoniAgent.tsx', 'utf8')
const actionInstructions = readFileSync('src/lib/moni/chatgpt-actions.ts', 'utf8')
const envExample = readFileSync('.env.example', 'utf8')
const qualityWorkflow = readFileSync('.github/workflows/moni-agent-quality.yml', 'utf8')
const readme = readFileSync('README.md', 'utf8')

const failures = []
const blockedRoutes = [
  ['agent-runtime', runtimeRoute],
  ['agent-chat', legacyChatRoute],
  ['chat', chatRoute],
  ['agent-evals', evalRoute],
  ['agent-evals-canary', evalCanaryRoute],
]

if (!prebuild.includes('verify-moni-agent-source.mjs')) failures.push('prebuild must run MONI source verification')

for (const [name, source] of blockedRoutes) {
  if (!source.includes('moni_server_model_inference: false')) failures.push(`${name} must explicitly disable MONI server model inference`)
  if (!source.includes('status: 410')) failures.push(`${name} must remain disabled with HTTP 410`)
  if (source.includes('OPENAI_API_KEY') || source.includes('runMoniSdkAgent') || source.includes('runLiveEvalCase') || source.includes("from '@openai/agents'")) failures.push(`${name} must not call a server-side AI model`)
}

for (const [name, source] of [['agent-runtime', runtimeRoute], ['agent-chat', legacyChatRoute], ['chat', chatRoute]]) {
  if (!source.includes("integration: 'CHATGPT_CUSTOM_GPT_ACTIONS'")) failures.push(`${name} must identify ChatGPT Custom GPT Actions`)
  if (!source.includes("intelligence_runtime: 'CHATGPT_PRODUCT'")) failures.push(`${name} must identify ChatGPT product intelligence`)
}

if (!chatgptOnlyRoute.includes('moni_server_model_inference: false')) failures.push('chatgpt-only guard must disable server model inference')
if (!globalAgent.includes('moni-agent-character')) failures.push('MONI web UI must keep the MONI character launcher')
if (!globalAgent.includes('MONI 자체 채팅 화면')) failures.push('MONI web UI must keep an internal MONI chat shell')
if (globalAgent.includes('chatgpt.com/g/')) failures.push('MONI web UI must not redirect the character launcher to an external Custom GPT')
if (globalAgent.includes('/api/moni/agent-runtime') || globalAgent.includes('/api/moni/agent-chat') || globalAgent.includes('/api/moni/chat')) failures.push('MONI web UI must not call disabled legacy AI chat endpoints')
if (/\bprovider\b|\bmodel\b/.test(globalAgent)) failures.push('MONI web UI must not expose a server AI provider/model')
if (!actionInstructions.includes('CHATGPT') || !actionInstructions.includes('서버')) failures.push('ChatGPT Action instructions must preserve ChatGPT-product/server separation')

const forbiddenEnvKeys = [
  'OPENAI_API_KEY',
  'OPENAI_MONI_MODEL',
  'OPENAI_MONI_MEMORY_MODEL',
  'OPENAI_AGENTS_DISABLE_TRACING',
  'MONI_AGENT_V2_DISABLED',
  'GOOGLE_AI_API_KEY',
  'GEMINI_MODEL',
  'GEMMA_MODEL',
]
for (const key of forbiddenEnvKeys) {
  if (new RegExp(`^${key}=`, 'm').test(envExample)) failures.push(`.env.example must not advertise legacy MONI model config: ${key}`)
  if (new RegExp(`^\\s*${key}:`, 'm').test(qualityWorkflow)) failures.push(`CI must not inject legacy MONI model config: ${key}`)
}

if (!readme.includes('ChatGPT Only')) failures.push('README must document the ChatGPT-only MONI architecture')
if (/MONI 지능을 위해[^\n]*(?:OPENAI_API_KEY|GOOGLE_AI_API_KEY)/.test(readme) === false) failures.push('README must explicitly state that MONI intelligence does not require model API keys')
if (!readme.includes('MONI 캐릭터와 자체 채팅 UI')) failures.push('README must preserve the MONI character and internal chat UI requirement')

if (failures.length) {
  console.error('MONI ChatGPT-only source verification failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log('MONI ChatGPT-only source verification passed.')
