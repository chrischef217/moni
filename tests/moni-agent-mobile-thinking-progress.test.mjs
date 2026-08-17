import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const copyFix = fs.readFileSync('src/components/MoniMobileThinkingCopyFix.tsx', 'utf8')
const heartbeat = fs.readFileSync('src/components/MoniMobileHeartbeatBoost.tsx', 'utf8')
const statusRoute = fs.readFileSync('src/app/api/moni/agent-status/route.ts', 'utf8')
const mobilePage = fs.readFileSync('src/app/mobile/page.tsx', 'utf8')

test('THINKING progress rows stay visible and update from real runtime status', () => {
  assert.match(copyFix, /display:\s*grid\s*!important/)
  assert.match(copyFix, /visibility:\s*visible\s*!important/)
  assert.match(copyFix, /STATUS_REFRESH_MS\s*=\s*1200/)
  assert.match(copyFix, /payload\.run_status === 'RUNNING'/)
  assert.match(copyFix, /현재 진행 ·/)
  assert.match(copyFix, /진행 현황 ·/)
  assert.match(copyFix, /예상 대기 시간을 계산하고 있습니다/)
})

test('agent status reports actual running tool progress while ETA owns visible timing', () => {
  assert.match(statusRoute, /row\.status === 'RUNNING'/)
  assert.match(statusRoute, /현재 \$\{currentToolLabel\}을 확인하고 있습니다/)
  assert.match(statusRoute, /확인을 마쳤고 답변에 반영하고 있습니다/)
  assert.doesNotMatch(statusRoute, /처리 시작 후 \$\{elapsed\}초/)
  assert.match(statusRoute, /completed_tool_steps/)
  assert.match(statusRoute, /current_tool_label/)
  assert.match(statusRoute, /progress_detail/)
  assert.match(statusRoute, /elapsed_seconds/)
})

test('thinking heartbeat uses one gentle compressed source and is mounted on mobile', () => {
  assert.doesNotMatch(heartbeat, /BOOST_MULTIPLIER|gain\.setValueAtTime\(10/)
  assert.match(heartbeat, /createDynamicsCompressor/)
  assert.match(heartbeat, /oscillator\.type = 'sine'/)
  assert.match(heartbeat, /function playCuteHeartbeat/)
  assert.match(heartbeat, /STAGE_DELAY_MS/)
  assert.match(mobilePage, /<MoniMobileHeartbeatBoost \/>/)
})
