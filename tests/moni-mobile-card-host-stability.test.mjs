import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const raw = readFileSync('src/components/MoniMobileRawMaterialCardV2.tsx', 'utf8')
const business = readFileSync('src/components/MoniMobileBusinessCards.tsx', 'utf8')

test('mobile card hosts never fight to become the last scroller child', () => {
  for (const source of [raw, business]) {
    assert.doesNotMatch(source, /scroller\.lastElementChild\s*!==\s*cardHost/)
    assert.match(source, /if \(cardHost\.parentElement !== scroller\) scroller\.appendChild\(cardHost\)/)
  }
})
