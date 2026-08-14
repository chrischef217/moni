import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const mobilePage = readFileSync('src/app/mobile/page.tsx', 'utf8')
const guard = readFileSync('src/components/MoniMobileRuntimeGuard.tsx', 'utf8')
const route = readFileSync('src/app/api/moni/agent-runtime/route.ts', 'utf8')

test('fresh mobile entry starts with a clean visible thread while reload keeps the active thread', () => {
  assert.match(mobilePage, /MoniMobileRuntimeGuard/)
  assert.match(guard, /getEntriesByType\('navigation'\)/)
  assert.match(guard, /navigation\?\.type === 'reload'/)
  assert.match(guard, /if \(!isReload\) window\.localStorage\.removeItem\(THREAD_KEY\)/)
})

test('mobile dictation does not finalize on silence or incidental SpeechRecognition end', () => {
  assert.match(guard, /code === 'no-speech' && this\.keepAlive && !this\.manualStop/)
  assert.match(guard, /this\.inner\.onend = \(\) =>/)
  assert.match(guard, /if \(this\.manualStop \|\| !this\.keepAlive \|\| !this\._continuous\)/)
  assert.match(guard, /this\.inner\.start\(\)/)
  assert.match(guard, /stop\(\) \{[\s\S]*this\.manualStop = true[\s\S]*this\.inner\.stop\(\)/)
})

test('broken OpenAI conversation tool chains rebuild automatically before surfacing an error', () => {
  assert.match(route, /no tool output found for function call/)
  assert.match(route, /no tool call found for function call output/)
  assert.match(route, /clearConversationState\(supabase, thread\.id\)/)
  assert.match(route, /runMoniConversationAgent\(\{ \.\.\.runInput, conversationId: null \}\)/)
  assert.match(route, /OpenAI Conversation 도구 체인 자동복구/)
})
