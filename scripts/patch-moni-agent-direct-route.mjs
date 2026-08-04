import { readFileSync, writeFileSync } from 'node:fs'

const legacyPath = 'src/app/api/moni/agent-chat/route.ts'
const agentPath = 'src/app/api/moni/agent-v2/route.ts'

let legacy = readFileSync(legacyPath, 'utf8')
let agent = readFileSync(agentPath, 'utf8')

const legacyExport = 'export async function POST(request: NextRequest) {'
const renamedExport = 'export async function legacyPOST(request: NextRequest) {'
const wrapperMarker = "[MONI_AGENT_DIRECT_ROUTE]"
const wrapper = `\n\nexport async function POST(request: NextRequest) {\n  console.info('${wrapperMarker}', { occurred_at: new Date().toISOString() })\n  const agentRoute = await import('@/app/api/moni/agent-v2/route')\n  return agentRoute.POST(request)\n}\n`

if (!legacy.includes(renamedExport)) {
  const index = legacy.lastIndexOf(legacyExport)
  if (index < 0) throw new Error('MONI legacy POST export was not found; build stopped.')
  legacy = `${legacy.slice(0, index)}${renamedExport}${legacy.slice(index + legacyExport.length)}`
  console.log('Renamed MONI legacy POST handler.')
} else {
  console.log('MONI legacy POST handler is already renamed.')
}

if (!legacy.includes(wrapperMarker)) {
  legacy += wrapper
  console.log('Added direct MONI Agent V2 POST entrypoint.')
} else {
  console.log('Direct MONI Agent V2 POST entrypoint is already present.')
}

const oldImport = "import { GET as legacyGET, POST as legacyPOST } from '@/app/api/moni/agent-chat/route'"
const newImport = "import { GET as legacyGET, legacyPOST } from '@/app/api/moni/agent-chat/route'"
if (agent.includes(oldImport)) {
  agent = agent.replace(oldImport, newImport)
  console.log('Updated MONI Agent legacy handoff import.')
} else if (agent.includes(newImport)) {
  console.log('MONI Agent legacy handoff import is already updated.')
} else {
  throw new Error('MONI Agent legacy import was not found; build stopped.')
}

writeFileSync(legacyPath, legacy, 'utf8')
writeFileSync(agentPath, agent, 'utf8')
console.log('MONI direct Agent routing patch completed.')
