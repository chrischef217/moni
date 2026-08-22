import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const bridge = readFileSync('src/components/MoniMobileExportThinkingBridge.tsx', 'utf8')
const page = readFileSync('src/app/mobile/page.tsx', 'utf8')

test('mobile export bundle shows elapsed progress until the input card is actually ready', () => {
  assert.match(page, /MoniMobileExportThinkingBridge/)
  assert.match(bridge, /경과 시간 · \{elapsedText\(seconds\)\}/)
  assert.match(bridge, /앞 대화에서 품목·수량·수출정보를 읽고 있습니다/)
  assert.match(bridge, /등록된 수출처와 공식 수출품목을 대조하고 있습니다/)
  assert.match(bridge, /포장단위와 CTN 수량을 계산하고 있습니다/)
  assert.match(bridge, /BUNDLE_CARD_SELECTOR/)
  assert.match(bridge, /cardReady\(\).*stopThinking\(\)/s)
})

test('export progress reuses the existing THINKING heartbeat contract', () => {
  assert.match(bridge, /moni-live-state-thinking/)
  assert.match(bridge, /moni-mobile-character-thinking/)
  assert.match(bridge, /root\.dataset\.moniThinkingStage = thinkingStage\(elapsed\)/)
  assert.match(bridge, /syncHeader\(true\)/)
})

test('generic legacy business card stays hidden for the whole export turn', () => {
  assert.match(bridge, /data-moni-business-card-host/)
  assert.match(bridge, /exportTurnRef\.current = true/)
  assert.match(bridge, /hideGenericCard\(true\)/)
  assert.match(bridge, /if \(exportTurnRef\.current\) hideGenericCard\(true\)/)
})

test('a non-export user turn restores normal business cards and stops export thinking', () => {
  assert.match(bridge, /exportTurnRef\.current = false/)
  assert.match(bridge, /hideGenericCard\(false\)/)
  assert.match(bridge, /stopThinking\(\)/)
})
