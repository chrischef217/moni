import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const chat=readFileSync('src/components/MoniMobileChat.tsx','utf8')
const ext=readFileSync('src/components/MoniMobileExtendedFormCard.tsx','utf8')
const biz=readFileSync('src/components/MoniMobileBusinessCards.tsx','utf8')
const raw=readFileSync('src/components/MoniMobileRawMaterialCardV2.tsx','utf8')
test('extended inputs keep stable identity',()=>{assert.match(ext,/function renderInputField\(item: FieldSchema\)/);assert.doesNotMatch(ext,/<InputField/)});
test('all card forms protect focused inputs from polling',()=>{for(const s of [ext,biz,raw]){assert.match(s,/document\.activeElement/);assert.match(s,/cardHasFocus/)}});
test('structured text writes do not enter thinking UI',()=>{assert.match(chat,/structuredRequest && threadId \? '\/api\/moni\/mobile-action-start'/);assert.match(chat,/sending && !structuredSubmitting \? 'thinking'/);assert.match(chat,/sending && !structuredSubmitting \? <ThinkingIndicator/)});
test('create and update button wording differs',()=>{assert.match(ext,/return '입력 내용 확인'/);assert.match(ext,/operation === 'UPDATE'\) return '변경 내용 확인'/)});
