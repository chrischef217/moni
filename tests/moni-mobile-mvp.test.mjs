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

test('PC character popup and mobile route render the exact same internal MONI chat component', () => {
  assert.match(globalAgent, /import MoniInternalChat from '@\/components\/MoniInternalChat'/)
  assert.match(globalAgent, /<MoniInternalChat \/>/)
  assert.match(mobile, /import MoniInternalChat from '@\/components\/MoniInternalChat'/)
  assert.match(mobile, /<MoniInternalChat \/>/)
  assert.match(mobile, /MONI 자체 채팅 화면/)
  assert.doesNotMatch(mobile, /chatgpt\.com/)
  assert.doesNotMatch(mobile, /MONI_GPT_URL/)
})

test('mobile internal chat talks to the authenticated MONI agent runtime', () => {
  assert.match(internalChat, /\/api\/moni\/agent-runtime/)
  assert.match(internalChat, /대화 상태 유지 · 변경 작업은 승인 절차 적용/)
  assert.match(internalChat, /새 대화/)
  assert.match(internalChat, /MONI에게 질문하세요/)
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
  assert.match(mobile, /safe-area-inset-top/)
  assert.match(mobile, /safe-area-inset-bottom/)
})
