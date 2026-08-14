import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const page = readFileSync('src/app/mobile/page.tsx', 'utf8')
const actions = readFileSync('src/components/MoniMobileAnswerActions.tsx', 'utf8')
const feedback = readFileSync('src/app/api/moni/answer-feedback/route.ts', 'utf8')
const report = readFileSync('src/app/api/moni/answer-report/route.ts', 'utf8')
const migration = readFileSync('supabase/migrations/202608150001_create_moni_ai_answer_feedback.sql', 'utf8')
const learning = readFileSync('docs/MONI_ANSWER_FEEDBACK_LEARNING_V1.md', 'utf8')

test('mobile MONI mounts GPT-style answer actions under assistant replies', () => {
  assert.match(page, /MoniMobileAnswerActions/)
  assert.match(actions, /좋아요/)
  assert.match(actions, /싫어요/)
  assert.match(actions, /답변 복사/)
  assert.match(actions, /답변 공유/)
  assert.match(actions, /보고서 다운로드/)
  assert.match(actions, /\.moni-markdown/)
})

test('answer rating is explicit authenticated candidate learning evidence', () => {
  assert.match(feedback, /getSessionFromRequest/)
  assert.match(feedback, /assistant_message_id/)
  assert.match(feedback, /rating !== 'UP' && rating !== 'DOWN'/)
  assert.match(feedback, /learning_status: 'CANDIDATE'/)
  assert.match(feedback, /user_login_id.*session\.loginId/s)
  assert.match(migration, /unique \(business_id, assistant_message_id, actor_login_id\)/)
  assert.match(migration, /learning_status.*CANDIDATE.*PMO_VERIFIED.*REJECTED/s)
  assert.match(learning, /복사 \/ 공유 \/ 보고서 다운로드.*품질의 긍정·부정 증거로 사용하지 않는다/)
  assert.match(learning, /최종 승인권은 GPT\(PMO\)/)
})

test('report download uses authenticated server-side stored conversation data', () => {
  assert.match(report, /getSessionFromRequest/)
  assert.match(report, /eq\('role', 'assistant'\)/)
  assert.match(report, /lt\('created_at', answer\.created_at\)/)
  assert.match(report, /Packer\.toBuffer/)
  assert.match(report, /MONI AI 업무 보고서/)
  assert.match(report, /application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document/)
  assert.match(report, /Content-Disposition/)
  assert.match(actions, /URL\.createObjectURL/)
})
