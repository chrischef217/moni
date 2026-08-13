import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const chat = readFileSync('src/components/MoniInternalChat.tsx', 'utf8')
const runtime = readFileSync('src/lib/moni/agent/conversation-runtime.ts', 'utf8')

test('thinking indicator starts while waiting and always ends', () => {
  assert.match(chat, /생각 중/)
  assert.match(chat, /moni-thinking-dot/)
  assert.match(chat, /@keyframes moniThinkingDot/)
  assert.match(chat, /aria-live="polite"/)
  assert.match(chat, /finally[\s\S]*setSending\(false\)/)
})

test('markdown headings lists and tables render with narrow-window overflow', () => {
  assert.match(chat, /ReactMarkdown/)
  assert.match(chat, /remarkGfm/)
  assert.match(chat, /\.moni-markdown table \{ display: block/)
  assert.match(chat, /overflow-x: auto/)
  assert.match(chat, /\.moni-markdown ol/)
  assert.match(chat, /\.moni-markdown h2/)
  assert.match(runtime, /## 결론/)
  assert.match(runtime, /## 핵심 숫자/)
  assert.match(runtime, /## 지금 할 일/)
})

test('new conversation resets server thread reference and visible messages', () => {
  assert.match(chat, /setThreadId\(''\)/)
  assert.match(chat, /setMessages\(\[\]\)/)
  assert.match(chat, /localStorage\.removeItem/)
})
