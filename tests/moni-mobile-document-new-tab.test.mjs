import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const polish = readFileSync('src/components/MoniMobileUxPolish.tsx', 'utf8')

test('MONI mobile document links open in a separate tab and preserve chat', () => {
  assert.match(polish, /DOCUMENT_LINK_SELECTOR/)
  assert.match(polish, /link\.target = '_blank'/)
  assert.match(polish, /link\.rel = 'noopener noreferrer'/)
  assert.match(polish, /MutationObserver/)
  assert.match(polish, /answer-pdf/)
  assert.match(polish, /sales-statement-pdf/)
  assert.match(polish, /sales-management/)
})
