import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const home = readFileSync('src/app/page.tsx', 'utf8')
const mobile = readFileSync('src/app/mobile/page.tsx', 'utf8')
const mobileShell = readFileSync('src/components/MoniMobileChatShell.tsx', 'utf8')
const chat = readFileSync('src/components/MoniInternalChat.tsx', 'utf8')
const globalAgent = readFileSync('src/components/GlobalMoniAgent.tsx', 'utf8')
const layout = readFileSync('src/app/layout.tsx', 'utf8')
const middleware = readFileSync('src/middleware.ts', 'utf8')

test('mobile entry is session protected and keeps freelancer boundary', () => {
  assert.match(mobile, /getSessionFromCookies/)
  assert.match(mobile, /if \(!session\)/)
  assert.match(mobile, /session\.role === 'freelancer'/)
  assert.match(mobile, /redirect\('\/freelancer'\)/)
})

test('PC character popup and mobile route use the same internal MONI chat', () => {
  assert.match(globalAgent, /import MoniInternalChat from '@\/components\/MoniInternalChat'/)
  assert.match(globalAgent, /<MoniInternalChat \/>/)
  assert.match(mobile, /MoniMobileChatShell/)
  assert.match(mobileShell, /import MoniInternalChat from '@\/components\/MoniInternalChat'/)
  assert.match(mobileShell, /<MoniInternalChat \/>/)
  assert.match(chat, /\/api\/moni\/agent-runtime/)
  assert.doesNotMatch(mobile, /chatgpt\.com|MONI_GPT_URL/)
})

test('mobile traffic on the main entry cannot land on the PC control tower by default', () => {
  assert.match(home, /headers\(\)/)
  assert.match(home, /sec-ch-ua-mobile/)
  assert.match(home, /Android\|iPhone\|iPad\|iPod\|Mobile/)
  assert.match(home, /if \(isMobileRequest\(\) && legacy !== '1'\)/)
  assert.match(home, /redirect\('\/mobile'\)/)
})

test('mobile route contains no PC dashboard or numeric widget surface', () => {
  assert.doesNotMatch(mobile, /MainControlTowerDashboard/)
  assert.doesNotMatch(mobileShell, /MainControlTowerDashboard/)
  assert.doesNotMatch(mobileShell, /매출 카드|생산 달성률|수금 카드|목표 매출|경영 대시보드|생산 현황 카드/)
  assert.doesNotMatch(mobile, /월간 생산계획|완제품 재고|수금 · 미수금|href=/)
})

test('mobile entry keeps a real viewport and full-height safe-area chat', () => {
  assert.match(mobile, /width: 'device-width'/)
  assert.match(mobile, /viewportFit: 'cover'/)
  assert.match(mobileShell, /h-\[100dvh\]/)
  assert.match(mobileShell, /safe-area-inset-top/)
  assert.match(mobileShell, /safe-area-inset-bottom/)
  assert.match(mobileShell, /overflow-hidden/)
})

test('mobile shell suppresses all PC admin chrome at the root layout boundary', () => {
  assert.match(middleware, /pathname === '\/mobile'/)
  assert.match(middleware, /x-moni-mobile-shell/)
  assert.match(layout, /headers\(\)\.get\('x-moni-mobile-shell'\)/)
  assert.match(layout, /session\?\.role === 'admin' && !isMobileShell/)
})

test('same-screen chat supports continuous and new conversations', () => {
  assert.match(chat, /THREAD_KEY/)
  assert.match(chat, /thread_id: threadId/)
  assert.match(chat, /새 대화/)
  assert.match(chat, /setMessages\(\[\]\)/)
})
