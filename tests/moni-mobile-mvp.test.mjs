import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const home = readFileSync('src/app/page.tsx', 'utf8')
const mobile = readFileSync('src/app/mobile/page.tsx', 'utf8')
const globalAgent = readFileSync('src/components/GlobalMoniAgent.tsx', 'utf8')
const mobileChat = readFileSync('src/components/MoniMobileChat.tsx', 'utf8')

test('mobile entry is session protected and keeps freelancer boundary', () => {
  assert.match(mobile, /getSessionFromCookies/)
  assert.match(mobile, /if \(!session\)/)
  assert.match(mobile, /session\.role === 'freelancer'/)
  assert.match(mobile, /redirect\('\/freelancer'\)/)
})

test('mobile route uses the dedicated internal MONI chat surface and never redirects to ChatGPT', () => {
  assert.match(mobile, /import MoniMobileChat from '@\/components\/MoniMobileChat'/)
  assert.match(mobile, /<MoniMobileChat \/>/)
  assert.doesNotMatch(mobile, /chatgpt\.com/)
  assert.doesNotMatch(mobile, /MONI_GPT_URL/)
})

test('PC floating MONI character and speech bubble are suppressed on the mobile route', () => {
  assert.match(globalAgent, /usePathname/)
  assert.match(globalAgent, /pathname === '\/mobile'/)
  assert.match(globalAgent, /pathname\.startsWith\('\/mobile\/'\)/)
  assert.match(globalAgent, /return null/)
})

test('mobile chat talks to the authenticated MONI agent runtime', () => {
  assert.match(mobileChat, /\/api\/moni\/agent-runtime/)
  assert.match(mobileChat, /thread_id/)
  assert.match(mobileChat, /moni-global-agent-thread-v11/)
})

test('mobile header exposes animated MONI live, thinking, listening, and issue states', () => {
  assert.match(mobileChat, /MobileMoniCharacter/)
  assert.match(mobileChat, /'LIVE'/)
  assert.match(mobileChat, /'THINKING'/)
  assert.match(mobileChat, /'LISTENING'/)
  assert.match(mobileChat, /'ISSUE'/)
  assert.match(mobileChat, /moniLivePulse/)
  assert.match(mobileChat, /moniMobileFloat/)
  assert.match(mobileChat, /moniMobileBlink/)
})

test('mobile voice uses one Web Speech microphone owner and speech-activity waveform', () => {
  assert.match(mobileChat, /SpeechRecognition/)
  assert.match(mobileChat, /webkitSpeechRecognition/)
  assert.match(mobileChat, /onspeechstart/)
  assert.match(mobileChat, /onspeechend/)
  assert.match(mobileChat, /speechActive/)
  assert.match(mobileChat, /음성으로 입력/)
  assert.doesNotMatch(mobileChat, /getUserMedia/)
  assert.doesNotMatch(mobileChat, /createAnalyser/)
  assert.doesNotMatch(mobileChat, /AudioContext/)
})

test('voice confirmation waits for recognition end and leaves transcript in composer without sending', () => {
  assert.match(mobileChat, /function rebuildTranscript/)
  assert.match(mobileChat, /voiceDraftRef/)
  assert.match(mobileChat, /function finalizeVoiceDraft\(\)/)
  assert.match(mobileChat, /setInput\(combined\)/)
  assert.match(mobileChat, /function confirmVoiceInput\(\)/)
  assert.match(mobileChat, /recognition\.stop\(\)/)
  assert.match(mobileChat, /setTimeout\(\(\) => finalizeVoiceDraft\(\), 900\)/)
  assert.match(mobileChat, /확인/)
  const confirmBody = mobileChat.match(/function confirmVoiceInput\(\) \{([\s\S]*?)\n  \}/)?.[1] || ''
  assert.doesNotMatch(confirmBody, /send\(/)
})

test('mobile GPT-style composer is a single clean message surface', () => {
  assert.match(mobileChat, /data-moni-mobile-composer/)
  assert.match(mobileChat, /placeholder="MONI에게 메시지"/)
  assert.match(mobileChat, /aria-label="전송"/)
  assert.doesNotMatch(mobileChat, /모니에게 물어보세요/)
})

test('long responses expose elapsed thinking time instead of an endless generic spinner', () => {
  assert.match(mobileChat, /thinkingSeconds/)
  assert.match(mobileChat, /데이터 조회가 길어지고 있습니다/)
  assert.match(mobileChat, /초째 처리 중입니다/)
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
  assert.match(mobileChat, /safe-area-inset-top/)
  assert.match(mobileChat, /safe-area-inset-bottom/)
})
