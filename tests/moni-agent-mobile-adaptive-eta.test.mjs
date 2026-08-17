import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const interaction = await readFile(new URL('../src/components/MoniMobileInteractionPolish.tsx', import.meta.url), 'utf8')
const etaLib = await readFile(new URL('../src/lib/moni/mobile-eta.ts', import.meta.url), 'utf8')
const etaRoute = await readFile(new URL('../src/app/api/moni/agent-eta/route.ts', import.meta.url), 'utf8')
const statusRoute = await readFile(new URL('../src/app/api/moni/agent-status/route.ts', import.meta.url), 'utf8')

test('thinking heartbeat is materially louder and accelerates by overtime stage', () => {
  assert.match(interaction, /peak: 0\.57/)
  assert.match(interaction, /peak: 0\.435/)
  assert.match(etaLib, /detail-1'\) return 820/)
  assert.match(etaLib, /detail-2'\) return 640/)
  assert.match(etaLib, /apology'\) return 500/)
  assert.match(interaction, /setHeartbeatStage\(stage\)/)
})

test('ETA learning uses runtime history plus local correction when error exceeds ten seconds', () => {
  assert.match(etaRoute, /moni_ai_agent_runs/)
  assert.match(etaRoute, /recent-runtime-history/)
  assert.match(etaRoute, /robustEtaEstimate/)
  assert.match(interaction, /predictionError > 10 \? 0\.72 : 0\.46/)
  assert.match(interaction, /central \* 0\.72 \+ local \* 0\.28/)
})

test('thinking copy escalates every ten overtime seconds and apologizes after thirty', () => {
  assert.match(etaLib, /overtime < 10/)
  assert.match(etaLib, /overtime < 20/)
  assert.match(etaLib, /overtime < 30/)
  assert.match(interaction, /예상보다 오래 걸리고 있습니다/)
  assert.match(interaction, /조금만 더 기다려 주세요/)
})

test('late-stage progress checks actual recent runtime tool status instead of inventing a step', () => {
  assert.match(interaction, /\/api\/moni\/agent-status/)
  assert.match(statusRoute, /moni_ai_tool_runs/)
  assert.match(statusRoute, /get_monthly_management_snapshot/)
  assert.match(statusRoute, /search_production_records/)
  assert.match(statusRoute, /search_sales_and_receivables/)
  assert.match(statusRoute, /progress/)
})
