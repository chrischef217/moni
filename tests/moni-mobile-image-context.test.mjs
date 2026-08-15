import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const mobile = readFileSync('src/components/MoniMobileChat.tsx', 'utf8')
const polish = readFileSync('src/components/MoniMobileUxPolish.tsx', 'utf8')
const runtime = readFileSync('src/app/api/moni/agent-runtime/route.ts', 'utf8')
const conversation = readFileSync('src/lib/moni/agent/conversation-runtime.ts', 'utf8')

test('mobile offers both camera capture and photo picker', () => {
  assert.match(mobile, /카메라로 촬영/)
  assert.match(mobile, /사진에서 선택/)
  assert.match(mobile, /capture="environment"/)
  assert.match(mobile, /multiple className="hidden"/)
  assert.match(mobile, /accept="image\/jpeg,image\/png,image\/webp,image\/gif"/)
})

test('mobile uploads photos through the existing signed attachment boundary', () => {
  assert.match(mobile, /\/api\/moni\/agent-files/)
  assert.match(mobile, /uploadToSignedUrl/)
  assert.match(mobile, /action: 'prepare'/)
  assert.match(mobile, /action: 'complete'/)
  assert.match(mobile, /attachment_ids: photos\.map/)
  assert.match(mobile, /pendingPhotos\.length === 0/)
})

test('agent runtime sends attached photos using the Agents SDK image field and binds them to the user message', () => {
  assert.match(runtime, /type: 'input_image'/)
  assert.match(runtime, /image: image\.dataUrl/)
  assert.doesNotMatch(runtime, /image_url: image\.dataUrl/)
  assert.match(runtime, /message_id: userMessage\.id/)
  assert.match(runtime, /referencesEarlierImage/)
  assert.match(runtime, /loadRecentReferencedImages/)
  assert.match(runtime, /첨부한 사진을 확인해줘/)
})

test('submitted photos leave the composer after the server accepts the turn even when model processing returns an error', () => {
  const sendBlock = mobile.slice(mobile.indexOf('async function send'), mobile.indexOf('function submit'))
  const clearIndex = sendBlock.indexOf('replacePendingPhotos([])')
  const validationIndex = sendBlock.indexOf("if (!response.ok || !payload.ok || !payload.text)")
  assert.ok(clearIndex >= 0, 'sent photos should be cleared from the composer')
  assert.ok(validationIndex >= 0, 'response validation should remain present')
  assert.ok(clearIndex < validationIndex, 'photo cleanup must happen before an HTTP/model error is surfaced')
  assert.match(mobile, /sending \|\| photoBusy\s*\? 'bg-\[#17191b\]'/)
})

test('MONI asks one useful follow-up only when photo intent is unclear', () => {
  assert.match(conversation, /첨부 사진은 업무 증거입니다/)
  assert.match(conversation, /흐릿하거나 가려진 글자·수량·제품명·LOT·금액을 추측하거나 보완하지 않습니다/)
  assert.match(conversation, /사용자가 무엇을 원하는지 명확히 말하지 않았다면/)
  assert.match(conversation, /질문을 딱 하나만 합니다/)
  assert.match(conversation, /사용자의 목적이 분명하면 불필요하게 다시 묻지 말고 바로 분석합니다/)
  assert.match(conversation, /첫 번째 사진/)
})

test('new conversation dialog is centered and uses plain user language', () => {
  assert.match(polish, /flex items-center justify-center/)
  assert.match(polish, /지금 대화를 비우고 새로 시작합니다/)
  assert.match(polish, /지금까지 나눈 대화는 화면에서 사라지고 새로운 대화를 시작합니다/)
  assert.doesNotMatch(polish, />MONI 대화 컨텍스트 초기화</)
  assert.doesNotMatch(polish, />[^<]*컨텍스트[^<]*</)
})
