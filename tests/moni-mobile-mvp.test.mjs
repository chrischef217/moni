import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const home = readFileSync('src/app/page.tsx', 'utf8')
const mobile = readFileSync('src/app/mobile/page.tsx', 'utf8')

test('mobile entry is session protected and keeps freelancer boundary', () => {
  assert.match(mobile, /getSessionFromCookies/)
  assert.match(mobile, /if \(!session\)/)
  assert.match(mobile, /session\.role === 'freelancer'/)
  assert.match(mobile, /redirect\('\/freelancer'\)/)
})

test('mobile admin entry goes directly to the MONI Custom GPT chat', () => {
  assert.match(mobile, /chatgpt\.com\/g\/g-6a7af9094b08819183be32a5dc97ef7b-moni/)
  assert.match(mobile, /redirect\(MONI_GPT_URL\)/)
  assert.doesNotMatch(mobile, /MoniMobileMvp/)
  assert.doesNotMatch(mobile, /\/api\/moni\/agent-runtime/)
  assert.doesNotMatch(mobile, /\/api\/moni\/chat/)
})

test('mobile traffic on the main entry cannot land on the PC control tower by default', () => {
  assert.match(home, /headers\(\)/)
  assert.match(home, /sec-ch-ua-mobile/)
  assert.match(home, /Android\|iPhone\|iPad\|iPod\|Mobile/)
  assert.match(home, /if \(isMobileRequest\(\) && legacy !== '1'\)/)
  assert.match(home, /redirect\('\/mobile'\)/)
})

test('mobile route contains no dashboard, lookup menu, or fake internal chat surface', () => {
  assert.doesNotMatch(mobile, /MainControlTowerDashboard/)
  assert.doesNotMatch(mobile, /월간 생산계획/)
  assert.doesNotMatch(mobile, /완제품 재고/)
  assert.doesNotMatch(mobile, /수금 · 미수금/)
  assert.doesNotMatch(mobile, /MONI 자체 채팅 화면/)
})

test('mobile entry keeps a real mobile viewport before the ChatGPT handoff', () => {
  assert.match(mobile, /width: 'device-width'/)
  assert.match(mobile, /viewportFit: 'cover'/)
})
