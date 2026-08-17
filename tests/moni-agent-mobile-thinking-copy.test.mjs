import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const fix = readFileSync('src/components/MoniMobileThinkingCopyFix.tsx', 'utf8')
const page = readFileSync('src/app/mobile/page.tsx', 'utf8')

test('mobile mounts the thinking copy fix after interaction polish', () => {
  assert.match(page, /import MoniMobileThinkingCopyFix from '@\/components\/MoniMobileThinkingCopyFix'/)
  assert.match(page, /<MoniMobileInteractionPolish \/>\s*<MoniMobileThinkingCopyFix \/>/)
})

test('thinking progress uses two real DOM lines instead of escaped CSS newline text', () => {
  assert.match(fix, /data-moni-progress-lines/)
  assert.match(fix, /data-moni-progress-main-line/)
  assert.match(fix, /data-moni-progress-detail-line/)
  assert.match(fix, /content: none !important/)
  assert.doesNotMatch(fix, /\\\\A/)
})

test('thinking detail explicitly labels the current progress for readability', () => {
  assert.match(fix, /현재 진행 ·/)
  assert.match(fix, /질문의 범위와 필요한 데이터를 확인하고 있습니다/)
  assert.match(fix, /확인된 내용을 정리하고 답변을 마무리하고 있습니다/)
})
