import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const fix = readFileSync('src/components/MoniMobileThinkingCopyFix.tsx', 'utf8')
const interaction = readFileSync('src/components/MoniMobileInteractionPolish.tsx', 'utf8')
const page = readFileSync('src/app/mobile/page.tsx', 'utf8')

test('mobile mounts the thinking copy fix after interaction polish', () => {
  assert.match(page, /import MoniMobileThinkingCopyFix from '@\/components\/MoniMobileThinkingCopyFix'/)
  assert.match(page, /<MoniMobileInteractionPolish \/>\s*<MoniMobileThinkingCopyFix \/>/)
})

test('thinking progress uses only ETA plus one visible current-progress row', () => {
  assert.match(fix, /data-moni-progress-lines/)
  assert.match(fix, /data-moni-progress-main-line/)
  assert.match(fix, /data-moni-progress-detail-line/)
  assert.doesNotMatch(fix, /data-moni-progress-meta-line/)
  assert.match(fix, /data-moni-adaptive-progress="true"\] > div\[data-moni-progress-lines="true"\]:not\(\[data-never-match\]\)/)
  assert.match(fix, /display: grid !important/)
  assert.match(fix, /visibility: visible !important/)
  assert.match(fix, /content: none !important/)
  assert.doesNotMatch(fix, /\\\\A/)
})

test('thinking detail keeps one current-progress label and removes duplicate progress-status copy', () => {
  assert.match(fix, /현재 진행 ·/)
  assert.doesNotMatch(fix, /진행 현황 ·/)
  assert.match(fix, /질문에 필요한 대상·기간·데이터 범위를 확인하고 있습니다/)
  assert.match(fix, /STATUS_REFRESH_MS = 1200/)
  assert.match(fix, /payload\.run_status === 'RUNNING'/)
})

test('current progress stays visually active without inventing a completion ratio', () => {
  assert.match(fix, /moni-progress-dots/)
  assert.match(fix, /content: '  •••'/)
  assert.match(fix, /prefers-reduced-motion: reduce/)
  assert.doesNotMatch(fix, /진행률|완료율|aria-valuenow/)
})

test('duplicate runtime elapsed seconds are removed because ETA already owns timing', () => {
  assert.match(fix, /function stripDuplicateElapsedTime/)
  assert.match(fix, /\(\?:처리\|실행\).*시작.*후.*\\d\+.*초/)
  assert.match(fix, /liveProgress = stripDuplicateElapsedTime/)
  assert.doesNotMatch(fix, /liveProgressDetail/)
  assert.match(interaction, /function stripDuplicateElapsedTime/)
  assert.match(interaction, /activeProgress = stripDuplicateElapsedTime\(payload\.progress\)/)
  assert.match(interaction, /cleanedProgress \|\| fallbackProgressText/)
})
