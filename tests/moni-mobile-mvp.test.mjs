import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const home = readFileSync('src/app/page.tsx', 'utf8')
const mobile = readFileSync('src/app/mobile/page.tsx', 'utf8')
const globalAgent = readFileSync('src/components/GlobalMoniAgent.tsx', 'utf8')
const internalChat = readFileSync('src/components/MoniInternalChat.tsx', 'utf8')

test('mobile entry is session protected and keeps freelancer boundary', () => {
  assert.match(mobile, /getSessionFromCookies/)
  assert.match(mobile, /if \(!session\)/)
  assert.match(mobile, /session\.role === 'freelancer'/)
  assert.match(mobile, /redirect\('\/freelancer'\)/)
})

test('PC character popup and mobile route share the internal MONI chat runtime', () => {
  assert.match(globalAgent, /import MoniInternalChat from '@\/components\/MoniInternalChat'/)
  assert.match(globalAgent, /<MoniInternalChat \/>/)
  assert.match(mobile, /import MoniInternalChat from '@\/components\/MoniInternalChat'/)
  assert.match(mobile, /<MoniInternalChat mobile \/>/)
  assert.doesNotMatch(mobile, /chatgpt\.com/)
  assert.doesNotMatch(mobile, /MONI_GPT_URL/)
})

test('mobile chat talks to the authenticated MONI agent runtime', () => {
  assert.match(internalChat, /\/api\/moni\/agent-runtime/)
  assert.match(internalChat, /thread_id/)
  assert.match(internalChat, /변경 작업은 승인 절차 적용/)
})

test('mobile header exposes animated MONI live, thinking, listening, and issue states', () => {
  assert.match(internalChat, /MobileMoniCharacter/)
  assert.match(internalChat, /MONI/)
  assert.match(internalChat, /'LIVE'/)
  assert.match(internalChat, /'THINKING'/)
  assert.match(internalChat, /'LISTENING'/)
  assert.match(internalChat, /'ISSUE'/)
  assert.match(internalChat, /moniLivePulse/)
  assert.match(internalChat, /moniMobileFloat/)
  assert.match(internalChat, /moniMobileBlink/)
  assert.doesNotMatch(internalChat, /MONI 자체 채팅 화면/)
})

test('mobile composer provides browser speech recognition plus a live microphone level meter', () => {
  assert.match(internalChat, /SpeechRecognition/)
  assert.match(internalChat, /webkitSpeechRecognition/)
  assert.match(internalChat, /getUserMedia/)
  assert.match(internalChat, /createAnalyser/)
  assert.match(internalChat, /getByteFrequencyData/)
  assert.match(internalChat, /voiceLevels/)
  assert.match(internalChat, /음성으로 입력/)
  assert.match(internalChat, /듣고 있어요/)
})

test('mobile GPT-style composer is a single clean message surface', () => {
  assert.match(internalChat, /data-moni-mobile-composer/)
  assert.match(internalChat, /placeholder="MONI에게 메시지"/)
  assert.match(internalChat, /aria-label="전송"/)
  assert.doesNotMatch(internalChat, /모니에게 물어보세요/)
})

test('mobile traffic on the main entry cannot land on the PC control tower by default', () => {
  assert.match(home, /headers\(\)/)
  assert.match(home, /sec-ch-ua-mobile/)
  assert.match(home, /Android\|iPhone\|iPad\|iPod\|Mobile/)
  assert.match(home, /if \(isMobileRequest\(\) && legacy !== '1'\)/)
  assert.match(home, /redirect\('\/mobile'\)/)
})

test('mobile route contains no dashboard or lookup navigation', () => {
  assert.doesNotMatch(mobile, /MainControlTowerDashboard/)
  assert.doesNotMatch(mobile, /월간 생산계획/)
  assert.doesNotMatch(mobile, /완제품 재고/)
  assert.doesNotMatch(mobile, /수금 · 미수금/)
  assert.doesNotMatch(mobile, /href=/)
})

test('mobile chat fills the viewport and respects device safe areas', () => {
  assert.match(mobile, /width: 'device-width'/)
  assert.match(mobile, /viewportFit: 'cover'/)
  assert.match(mobile, /h-\[100dvh\]/)
  assert.match(internalChat, /safe-area-inset-top/)
  assert.match(internalChat, /safe-area-inset-bottom/)
})
