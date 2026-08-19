import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const safety = readFileSync('src/components/MoniMobileFormSafetyStyles.tsx', 'utf8')
const page = readFileSync('src/app/mobile/page.tsx', 'utf8')
const extended = readFileSync('src/components/MoniMobileExtendedFormCard.tsx', 'utf8')
const business = readFileSync('src/components/MoniMobileBusinessCards.tsx', 'utf8')

test('shared safety layer is mounted before mobile business forms', () => {
  assert.match(page, /MoniMobileFormSafetyStyles/)
  assert.match(page, /<MoniMobileFormSafetyStyles \/>/)
  assert.ok(page.indexOf('<MoniMobileFormSafetyStyles />') < page.indexOf('<MoniMobileBusinessCards />'))
})

test('core and PC form cards are width-contained with border-box sizing', () => {
  assert.match(safety, /\.moni-crud-card,[\s\S]*?\.moni-pc-card/)
  assert.match(safety, /box-sizing: border-box !important/)
  assert.match(safety, /max-width: 100% !important/)
  assert.match(safety, /min-width: 0 !important/)
})

test('two-column grids use minmax zero to prevent right-edge overflow', () => {
  assert.match(safety, /grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\)/)
  assert.match(safety, /\.moni-crud-field/)
  assert.match(safety, /\.moni-pc-grid label/)
  assert.match(safety, /width: 100% !important/)
})

test('PC common form input fields stay direct-rendered and focus polling is guarded', () => {
  assert.match(extended, /renderInputField\(item\)/)
  assert.match(extended, /cardHasFocus/)
  assert.doesNotMatch(extended, /<DraftFields\s*\/>/)
})

test('legacy core editable subtree no longer mounts DraftFields as an unstable component', () => {
  assert.doesNotMatch(business, /<DraftFields\s*\/>/)
  assert.match(business, /\{DraftFields\(\)\}/)
})
