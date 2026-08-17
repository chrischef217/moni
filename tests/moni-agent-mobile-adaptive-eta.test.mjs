import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const interaction = await readFile(new URL('../src/components/MoniMobileInteractionPolish.tsx', import.meta.url), 'utf8')
const heartbeat = await readFile(new URL('../src/components/MoniMobileHeartbeatBoost.tsx', import.meta.url), 'utf8')
const etaLib = await readFile(new URL('../src/lib/moni/mobile-eta.ts', import.meta.url), 'utf8')
const etaRoute = await readFile(new URL('../src/app/api/moni/agent-eta/route.ts', import.meta.url), 'utf8')
const statusRoute = await readFile(new URL('../src/app/api/moni/agent-status/route.ts', import.meta.url), 'utf8')

test('thinking heartbeat is single-source, soft, and accelerates by overtime stage', () => {
  assert.doesNotMatch(interaction, /createOscillator|playHeartbeat|heartbeatTimer/)
  assert.match(heartbeat, /oscillator\.type = 'sine'/)
  assert.match(heartbeat, /peak: 0\.17/)
  assert.match(heartbeat, /peak: 0\.125/)
  assert.match(heartbeat, /normal: 1320/)
  assert.match(heartbeat, /'detail-1': 820/)
  assert.match(heartbeat, /'detail-2': 640/)
  assert.match(heartbeat, /apology: 500/)
})

test('ETA learning uses runtime history plus local correction when error exceeds ten seconds', () => {
  assert.match(etaRoute, /moni_ai_agent_runs/)
  assert.match(etaRoute, /recent-runtime-history/)
  assert.match(etaRoute, /robustEtaEstimate/)
  assert.match(interaction, /predictionError > 10 \? 0\.72 : 0\.46/)
  assert.match(interaction, /central \* 0\.72 \+ local \* 0\.28/)
})

test('thinking copy escalates every ten overtime seconds and stays factual', () => {
  assert.match(etaLib, /overtime < 10/)
  assert.match(etaLib, /overtime < 20/)
  assert.match(etaLib, /overtime < 30/)
  assert.match(interaction, /예상보다 오래 걸리고 있습니다/)
  assert.match(interaction, /fallbackProgressText/)
})

test('progress checks actual recent runtime status from the first stage', () => {
  assert.match(interaction, /void refreshRuntimeProgress\(\)/)
  assert.match(interaction, /STATUS_REFRESH_MS = 1500/)
  assert.match(statusRoute, /moni_ai_tool_runs/)
  assert.match(statusRoute, /get_monthly_management_snapshot/)
  assert.match(statusRoute, /search_production_records/)
  assert.match(statusRoute, /search_sales_and_receivables/)
  assert.match(statusRoute, /elapsed_seconds/)
})
