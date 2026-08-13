import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const runner = readFileSync('src/lib/moni/agent/live-eval.ts', 'utf8')
const route = readFileSync('src/app/api/moni/agent-evals/route.ts', 'utf8')
const panel = readFileSync('src/components/MoniAgentQualityPanel.tsx', 'utf8')
const page = readFileSync('src/app/intelligence/page.tsx', 'utf8')

test('live evaluation API is admin-only and bounded', () => {
  assert.match(route, /requireAdmin/)
  assert.match(route, /status: 401/)
  assert.match(route, /status: 403/)
  assert.match(route, /maxDuration = 60/)
  assert.match(route, /case_id/)
})

test('live evaluation only exposes explicit safe cases', () => {
  assert.match(runner, /LIVE_SAFE_CASE_IDS/)
  assert.match(runner, /production-month-summary/)
  assert.match(runner, /freelancer-finance-denied/)
  assert.doesNotMatch(runner, /LIVE_SAFE_CASE_IDS[\s\S]*pmo-data-quality[\s\S]*\]\)/)
  assert.doesNotMatch(runner, /LIVE_SAFE_CASE_IDS[\s\S]*no-write-production[\s\S]*\]\)/)
})

test('live evaluation executes the real read-only runtime and grades traces', () => {
  assert.match(runner, /runMoniConversationAgent/)
  assert.match(runner, /gradeCase/)
  assert.match(runner, /required_tool:/)
  assert.match(runner, /forbidden_tool:/)
  assert.match(runner, /required_argument:/)
})

test('live evaluation persists run and case result', () => {
  assert.match(runner, /moni_ai_eval_runs/)
  assert.match(runner, /moni_ai_eval_case_results/)
  assert.match(runner, /live-single-case-v2/)
  assert.match(runner, /status: grade\.passed \? 'PASSED' : 'FAILED'/)
})

test('failed grade creates a verified PMO capability event', () => {
  assert.match(runner, /VALIDATOR_DETECTED/)
  assert.match(runner, /MONI_LIVE_EVAL_V2/)
  assert.match(runner, /CAPABILITY_GAP/)
})

test('admin intelligence page exposes live evaluation panel', () => {
  assert.match(panel, /실모델 평가 실행/)
  assert.match(panel, /한 번에 한 사례만 실행/)
  assert.match(page, /MoniAgentQualityPanel/)
})
