import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const route = readFileSync('src/app/api/moni/transcribe/route.ts', 'utf8')

test('MONI mobile voice transcription defaults to gpt-4o-transcribe and pins Korean guidance', () => {
  assert.match(route, /DEFAULT_TRANSCRIBE_MODEL = 'gpt-4o-transcribe'/)
  assert.match(route, /upstream\.append\('language', 'ko'\)/)
  assert.match(route, /upstream\.append\('response_format', 'json'\)/)
  assert.match(route, /요약하거나 의미를 바꾸지 마세요/)
  assert.match(route, /숫자, 날짜, 월, 수량, 제품명, 회사명, LOT 표기를 특히 정확하게 보존하세요/)
})
