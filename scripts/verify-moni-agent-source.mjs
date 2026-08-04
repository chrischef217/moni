import { existsSync, readFileSync, readdirSync } from 'node:fs'

const packageJson = JSON.parse(readFileSync('package.json', 'utf8'))
const prebuild = String(packageJson.scripts?.prebuild || '')
const middleware = readFileSync('src/middleware.ts', 'utf8')
const route = readFileSync('src/app/api/moni/agent-runtime/route.ts', 'utf8')
const runtime = readFileSync('src/lib/moni/agent/sdk-runtime.ts', 'utf8')
const scripts = readdirSync('scripts')

const failures = []

if (/patch-.*\.mjs/.test(prebuild)) {
  failures.push('prebuild must not mutate TypeScript source through patch scripts')
}
if (scripts.some((name) => /^patch-.*\.mjs$/.test(name))) {
  failures.push('obsolete source-mutating patch scripts must not remain in the repository')
}
if (existsSync('src/app/api/moni/agent-v2/route.ts')) {
  failures.push('the bypassable legacy /api/moni/agent-v2 route must not exist')
}
if (!prebuild.includes('verify-moni-agent-source.mjs')) {
  failures.push('prebuild must run immutable source verification')
}
if (!middleware.includes("'/api/moni/agent-chat'")) {
  failures.push('src/middleware.ts must route the public MONI chat endpoint')
}
if (!middleware.includes("'/api/moni/agent-runtime'")) {
  failures.push('src/middleware.ts must route MONI chat to the production agent runtime')
}
if (!route.includes("@/lib/moni/agent/sdk-runtime")) {
  failures.push('agent runtime API must import the SDK runtime directly')
}
if (!runtime.includes("from '@openai/agents'")) {
  failures.push('MONI runtime must use the official OpenAI Agents SDK')
}
if (!runtime.includes('outputType: MoniAnswerSchema')) {
  failures.push('MONI runtime must use a structured final output schema')
}
if (!runtime.includes('maxTurns: 8')) {
  failures.push('MONI runtime must enforce a bounded agent loop')
}

if (failures.length) {
  console.error('MONI Agent source verification failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log('MONI Agent source verification passed.')
