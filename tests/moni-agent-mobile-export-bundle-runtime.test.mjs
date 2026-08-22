import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const config = readFileSync('next.config.mjs', 'utf8')
const adapter = readFileSync('src/app/api/moni/mobile-sales-export-bundle-v2/route.ts', 'utf8')
const businessAdapter = readFileSync('src/app/api/moni/mobile-business-actions-v3/route.ts', 'utf8')
const extractor = readFileSync('src/lib/moni/mobile-sales-export-context.ts', 'utf8')

test('production routes mobile export and generic business cards through safety adapters', () => {
  assert.match(config, /source: '\/api\/moni\/mobile-sales-export-bundle'/)
  assert.match(config, /destination: '\/api\/moni\/mobile-sales-export-bundle-v2'/)
  assert.match(config, /source: '\/api\/moni\/mobile-business-actions'/)
  assert.match(config, /destination: '\/api\/moni\/mobile-business-actions-v3'/)
})

test('bundle adapter de-duplicates draft lines and only auto-matches a unique canonical product candidate', () => {
  assert.match(adapter, /function dedupeItems/)
  assert.match(adapter, /seen\.has\(key\)/)
  assert.match(adapter, /function uniqueProductMatch/)
  assert.match(adapter, /value\.startsWith\('두배'\)/)
  assert.match(adapter, /alias\.includes\(needle\) \|\| needle\.includes\(alias\)/)
  assert.match(adapter, /return best\.length === 1 \? best\[0\]\.option : null/)
})

test('laos destination hint remains deterministic by requiring one registered country match', () => {
  assert.match(adapter, /query: \['라오스', 'laos', 'laopdr'\]/)
  assert.match(adapter, /return byCountry\.length === 1 \? byCountry\[0\] : null/)
})

test('canonical packing metadata automatically converts exact KG and EA quantities to cartons', () => {
  assert.match(adapter, /unit === 'EA'/)
  assert.match(adapter, /unit === 'KG'/)
  assert.match(adapter, /Math\.abs\(ratio - Math\.round\(ratio\)\) < 0\.000001/)
  assert.match(adapter, /cartons: cartons \|\| row\?\.cartons \|\| ''/)
})

test('extractor does not send the current user turn twice and removes exact duplicate extracted rows', () => {
  assert.match(extractor, /const priorHistory = \[\.\.\.historyRows\]/)
  assert.match(extractor, /priorHistory\.splice\(index, 1\)/)
  assert.match(extractor, /const seen = new Set<string>\(\)/)
  assert.match(extractor, /if \(seen\.has\(key\)\) return false/)
  assert.match(extractor, /같은 품목·규격·수량·단위가 대화에 중복 노출되어도 한 번만 추출하세요/)
})

test('legacy generic mobile card never renders a sales export bundle', () => {
  assert.match(businessAdapter, /payload\?\.card\?\.domain === 'sales_export_bundle'/)
  assert.match(businessAdapter, /payload\.card = null/)
})

test('adapter preserves legacy approval-safe POST execution path', () => {
  assert.match(adapter, /POST as legacyPOST/)
  assert.match(adapter, /return legacyPOST\(request\)/)
})
