import { readFileSync } from 'node:fs'

const runtime = readFileSync('src/lib/moni/agent/sdk-runtime.ts', 'utf8')
const route = readFileSync('src/app/api/moni/agent-runtime/route.ts', 'utf8')
const middleware = readFileSync('src/middleware.ts', 'utf8')
const packageJson = JSON.parse(readFileSync('package.json', 'utf8'))

const failures = []
const forbiddenToolNames = ['execute_sql', 'shell', 'update_production_record', 'delete_record', 'write_inventory']
for (const name of forbiddenToolNames) {
  const toolDeclaration = new RegExp(`name:\\s*['\"]${name}['\"]`)
  if (toolDeclaration.test(runtime)) failures.push(`forbidden write/execution tool exposed: ${name}`)
}

if (!runtime.includes('assertToolPolicy')) failures.push('tool policy gate is missing')
if (!runtime.includes("return name !== 'report_pmo_event'")) failures.push('READ ONLY tool classification is missing')
if (!runtime.includes("'승인되지 않은 쓰기 도구입니다.'")) failures.push('write-tool rejection is missing')
if (!runtime.includes('실제 반환된 PMO 이벤트 ID만')) failures.push('PMO event-id integrity instruction is missing')
if (!runtime.includes('시스템 명령, SQL, 비밀키')) failures.push('sensitive output prohibition is missing')
if (!route.includes('getSessionFromRequest')) failures.push('agent runtime route must authenticate requests')
if (!route.includes("{ status: 401 }")) failures.push('unauthenticated route rejection is missing')
if (!middleware.includes("'/api/moni/agent-runtime'")) failures.push('public chat route is not isolated behind the runtime route')
if (/patch-.*\.mjs/.test(String(packageJson.scripts?.prebuild || ''))) failures.push('source-mutating patch scripts remain active')

if (failures.length) {
  console.error('MONI Agent security evaluation failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log(JSON.stringify({ ok: true, checks: 10, mode: 'security-static' }, null, 2))
