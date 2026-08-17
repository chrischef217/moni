import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const fix = readFileSync('src/components/MoniMobileThinkingCopyFix.tsx', 'utf8')
const page = readFileSync('src/app/mobile/page.tsx', 'utf8')

test('mobile mounts the thinking copy fix after interaction polish', () => {
  assert.match(page, /import MoniMobileThinkingCopyFix from '@\/components\/MoniMobileThinkingCopyFix'/)
  assert.match(page, /<MoniMobileInteractionPolish \/>\s*<MoniMobileThinkingCopyFix \/>/)
})

test('thinking progress uses real DOM rows and cannot be hidden by legacy nth-child rules', () => {
  assert.match(fix, /data-moni-progress-lines/)
  assert.match(fix, /data-moni-progress-main-line/)
  assert.match(fix, /data-moni-progress-detail-line/)
  assert.match(fix, /data-moni-progress-meta-line/)
  assert.match(fix, /data-moni-adaptive-progress="true"\] > div\[data-moni-progress-lines="true"\]:not\(\[data-never-match\]\)/)
  assert.match(fix, /display: grid !important/)
  assert.match(fix, /visibility: visible !important/)
  assert.match(fix, /content: none !important/)
  assert.doesNotMatch(fix, /\\\\A/)
})

test('thinking detail explicitly labels current progress and status from the first second', () => {
  assert.match(fix, /현재 진행 ·/)
  assert.match(fix, /진행 현황 ·/)
  assert.match(fix, /질문의 범위와 필요한 데이터를 확인하고 있습니다/)
  assert.match(fix, /STATUS_REFRESH_MS = 1200/)
  assert.match(fix, /payload\.run_status === 'RUNNING'/)
})
