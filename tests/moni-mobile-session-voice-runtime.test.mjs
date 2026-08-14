import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const mobilePage = readFileSync('src/app/mobile/page.tsx', 'utf8')
const guard = readFileSync('src/components/MoniMobileRuntimeGuard.tsx', 'utf8')
const route = readFileSync('src/app/api/moni/agent-runtime/route.ts', 'utf8')
const transcribeRoute = readFileSync('src/app/api/moni/transcribe/route.ts', 'utf8')

test('fresh mobile entry starts with a clean visible thread while reload keeps the active thread', () => {
  assert.match(mobilePage, /MoniMobileRuntimeGuard/)
  assert.match(guard, /getEntriesByType\('navigation'\)/)
  assert.match(guard, /navigation\?\.type === 'reload'/)
  assert.match(guard, /if \(!isReload\) window\.localStorage\.removeItem\(THREAD_KEY\)/)
})

test('mobile dictation uses one continuous MediaRecorder session until explicit confirmation', () => {
  assert.match(guard, /navigator\.mediaDevices\?\.getUserMedia/)
  assert.match(guard, /new MediaRecorder\(stream/)
  assert.match(guard, /recorder\.start\(1000\)/)
  assert.match(guard, /stop\(\) \{[\s\S]*this\.stoppedByUser = true[\s\S]*this\.recorder\.stop\(\)/)
  assert.doesNotMatch(guard, /this\.inner\.start\(\)/)
  assert.match(guard, /fetch\('\/api\/moni\/transcribe'/)
  assert.match(guard, /this\.onresult\?\.\(syntheticFinalEvent\(transcript\)\)/)
})

test('MONI voice transcription stays server-side and authenticated', () => {
  assert.match(transcribeRoute, /getSessionFromRequest/)
  assert.match(transcribeRoute, /OPENAI_API_KEY/)
  assert.match(transcribeRoute, /gpt-4o-mini-transcribe/)
  assert.match(transcribeRoute, /language', 'ko'/)
  assert.match(transcribeRoute, /\/v1\/audio\/transcriptions/)
  assert.match(transcribeRoute, /MAX_AUDIO_BYTES/)
})

test('broken OpenAI conversation tool chains rebuild automatically before surfacing an error', () => {
  assert.match(route, /no tool output found for function call/)
  assert.match(route, /no tool call found for function call output/)
  assert.match(route, /clearConversationState\(supabase, thread\.id\)/)
  assert.match(route, /runMoniConversationAgent\(\{ \.\.\.runInput, conversationId: null \}\)/)
  assert.match(route, /OpenAI Conversation 도구 체인 자동복구/)
})
