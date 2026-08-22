import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const config = readFileSync('next.config.mjs', 'utf8')
const adapterV2 = readFileSync('src/app/api/moni/mobile-sales-export-bundle-v2/route.ts', 'utf8')
const adapterV3 = readFileSync('src/app/api/moni/mobile-sales-export-bundle-v3/route.ts', 'utf8')
const businessAdapter = readFileSync('src/app/api/moni/mobile-business-actions-v3/route.ts', 'utf8')
const extractor = readFileSync('src/lib/moni/mobile-sales-export-context.ts', 'utf8')

test('production routes mobile export through V3 matching and generic business cards through stale-card isolation', () => {
  assert.match(config, /source: '\/api\/moni\/mobile-sales-export-bundle'/)
  assert.match(config, /destination: '\/api\/moni\/mobile-sales-export-bundle-v3'/)
  assert.match(config, /source: '\/api\/moni\/mobile-business-actions'/)
  assert.match(config, /destination: '\/api\/moni\/mobile-business-actions-v3'/)
})

test('V2 safety adapter keeps deterministic canonical matching and exact carton conversion', () => {
  assert.match(adapterV2, /function dedupeItems/)
  assert.match(adapterV2, /function uniqueProductMatch/)
  assert.match(adapterV2, /value\.startsWith\('두배'\)/)
  assert.match(adapterV2, /unit === 'EA'/)
  assert.match(adapterV2, /unit === 'KG'/)
  assert.match(adapterV2, /Math\.abs\(ratio - Math\.round\(ratio\)\) < 0\.000001/)
})

test('V3 matching strips conversational notes and the 두배 prefix before ranking official products', () => {
  assert.match(adapterV3, /const withoutNotes = txt\(value\)\.replace/)
  assert.match(adapterV3, /const normalized = norm\(withoutNotes\)/)
  assert.match(adapterV3, /normalized\.startsWith\('두배'\) \? normalized\.slice\(2\)/)
  assert.match(adapterV3, /function scoreCandidate/)
  assert.match(adapterV3, /if \(first\.score >= 130\) return first\.option/)
  assert.match(adapterV3, /first\.score - second\.score >= 25/)
})

test('V3 auto-selects only a strong unique candidate and preserves user correction through the existing selected product field', () => {
  assert.match(adapterV3, /uniqueStrongMatch\(row\?\.source_query, row\?\.source_specification, options\)/)
  assert.match(adapterV3, /export_product_setting_id: txt\(selected\.id, 120\)/)
  assert.match(adapterV3, /match_mode: existing \? \(row\?\.match_mode \|\| 'canonical'\) : 'auto_similar'/)
  assert.match(adapterV3, /suggestionRows\(row\?\.source_query, row\?\.source_specification, options\)/)
})

test('V3 removes semantic duplicate rows after canonical matching', () => {
  assert.match(adapterV3, /function semanticKey/)
  assert.match(adapterV3, /function dedupeSemantic/)
  assert.match(adapterV3, /const items = dedupeSemantic\(matchedRows\)/)
  assert.match(adapterV3, /seen\.has\(key\)/)
})

test('laos destination hint remains deterministic by requiring one registered country match', () => {
  assert.match(adapterV2, /query: \['라오스', 'laos', 'laopdr'\]/)
  assert.match(adapterV2, /return byCountry\.length === 1 \? byCountry\[0\] : null/)
})

test('extractor does not send the current user turn twice and removes exact duplicate extracted rows', () => {
  assert.match(extractor, /const priorHistory = \[\.\.\.historyRows\]/)
  assert.match(extractor, /priorHistory\.splice\(index, 1\)/)
  assert.match(extractor, /const seen = new Set<string>\(\)/)
  assert.match(extractor, /if \(seen\.has\(key\)\) return false/)
  assert.match(extractor, /같은 품목·규격·수량·단위가 대화에 중복 노출되어도 한 번만 추출하세요/)
})

test('generic mobile business card is bound to the latest user turn and never renders during an export bundle turn', () => {
  assert.match(businessAdapter, /async function latestUserTurn/)
  assert.match(businessAdapter, /intent\?\.domain === 'sales_export_bundle'/)
  assert.match(businessAdapter, /cardSource && cardSource !== text\(current\.id, 100\)/)
  assert.match(businessAdapter, /payload\?\.card\?\.domain === 'sales_export_bundle'/)
})

test('V3 export matching preserves the already approved V2 POST execution path', () => {
  assert.match(adapterV3, /POST as safePOST/)
  assert.match(adapterV3, /return safePOST\(request\)/)
})
