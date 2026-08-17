import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const copyFix = fs.readFileSync('src/components/MoniMobileThinkingCopyFix.tsx', 'utf8')
const heartbeat = fs.readFileSync('src/components/MoniMobileHeartbeatBoost.tsx', 'utf8')
const statusRoute = fs.readFileSync('src/app/api/moni/agent-status/route.ts', 'utf8')
const mobilePage = fs.readFileSync('src/app/mobile/page.tsx', 'utf8')

test('THINKING progress rows stay visible and update from real runtime status', () => {
  assert.match(copyFix, /display:\s*grid\s*!important/)
  assert.match(copyFix, /data-moni-progress-lines="true"\]\s*~\s*div/)
  assert.match(copyFix, /STATUS_REFRESH_MS\s*=\s*1800/)
  assert.match(copyFix, /payload\.run_status === 'RUNNING'/)
  assert.match(copyFix, /현재 단계 ·/)
  assert.match(copyFix, /진행 현황 ·/)
  assert.match(copyFix, /예상 대기 시간을 계산하고 있습니다/)
})

test('agent status reports actual running tool progress instead of hidden reasoning', () => {
  assert.match(statusRoute, /row\.status === 'RUNNING'/)
  assert.match(statusRoute, /현재 \$\{currentToolLabel\}을 확인하고 있습니다/)
  assert.match(statusRoute, /completed_tool_steps/)
  assert.match(statusRoute, /current_tool_label/)
  assert.match(statusRoute, /progress_detail/)
})

test('thinking heartbeat uses a ten-times pre-compressor boost and is mounted on mobile', () => {
  assert.match(heartbeat, /BOOST_MULTIPLIER\s*=\s*10/)
  assert.match(heartbeat, /createDynamicsCompressor/)
  assert.match(heartbeat, /boost\.gain\.setValueAtTime\(BOOST_MULTIPLIER/)
  assert.match(heartbeat, /STAGE_DELAY_MS/)
  assert.match(mobilePage, /<MoniMobileHeartbeatBoost \/>/)
})
