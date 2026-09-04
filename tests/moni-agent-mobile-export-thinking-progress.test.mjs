import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const guard = readFileSync('src/components/MoniMobileExportWorkflowGuard.tsx', 'utf8')
const page = readFileSync('src/app/mobile/page.tsx', 'utf8')

test('mobile export bundle shows elapsed progress until the input card is actually ready', () => {
  assert.match(page, /MoniMobileExportWorkflowGuard/)
  assert.match(page, /<MoniMobileExportWorkflowGuard \/>/)
  assert.match(guard, /경과 시간 · \$\{elapsedText\(seconds\)\}/)
  assert.match(guard, /앞 대화에서 품목·수량·수출정보를 읽고 있습니다/)
  assert.match(guard, /등록된 수출처와 공식 수출품목을 대조하고 있습니다/)
  assert.match(guard, /포장단위와 CTN 수량을 계산하고 있습니다/)
  assert.match(guard, /EXPORT_DRAFT_READY/)
  assert.match(guard, /if \(draftReady\)[\s\S]*finishWaiting\(\)/)
})

test('export progress reuses the existing THINKING heartbeat contract', () => {
  assert.match(guard, /moni-live-state-thinking/)
  assert.match(guard, /moni-mobile-character-thinking/)
  assert.match(guard, /chatRoot\.dataset\.moniThinkingStage = thinkingStage\(seconds\)/)
  assert.match(guard, /setHeaderThinking\(chatRoot, true\)/)
})

test('generic legacy business card stays hidden for the whole export turn', () => {
  assert.match(guard, /data-moni-business-card-host/)
  assert.match(guard, /exportTurn = true/)
  assert.match(guard, /hideGenericCard\(chatRoot, true\)/)
  assert.match(guard, /if \(!exportTurn\)/)
})

test('a non-export user turn restores normal business cards and stops export thinking', () => {
  assert.match(guard, /exportTurn = false/)
  assert.match(guard, /hideGenericCard\(chatRoot, false\)/)
  assert.match(guard, /setHeaderThinking\(chatRoot, false\)/)
  assert.match(guard, /removeProgress\(\)/)
})
