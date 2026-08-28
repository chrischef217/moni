import { readFileSync } from 'node:fs'

const middleware = readFileSync('src/middleware.ts', 'utf8')
const page = readFileSync('src/app/mobile/page.tsx', 'utf8')
const v4 = readFileSync('src/app/api/moni/mobile-capability-v4/route.ts', 'utf8')
const v5 = readFileSync('src/app/api/moni/mobile-capability-v5/route.ts', 'utf8')
const dailyV2 = readFileSync('src/app/api/moni/production-daily-v2/route.ts', 'utf8')
const settlementPrint = readFileSync('src/app/api/moni/mobile-settlement-print/route.ts', 'utf8')
const quotePrint = readFileSync('src/app/api/moni/mobile-quote-print/route.ts', 'utf8')
const migration = readFileSync('supabase/migrations/202608280007_mobile_capability_v4_core.sql', 'utf8')

const failures = []
const requireText = (source, token, message) => { if (!source.includes(token)) failures.push(message) }

requireText(page, 'MoniMobileCapabilityV4', 'mobile page must mount the V4 capability card')
requireText(middleware, "pathname === '/api/moni/mobile-capability-v4'", 'mobile V4 requests must be routed through V5')
requireText(middleware, "url.pathname='/api/moni/mobile-capability-v5'", 'mobile V5 rewrite target is missing')
requireText(middleware, "pathname === '/api/moni/production-daily'", 'production daily compatibility rewrite is missing')
requireText(middleware, "url.pathname='/api/moni/production-daily-v2'", 'production daily V2 rewrite target is missing')
requireText(dailyV2, "url.searchParams.set('from', date)", 'mobile production daily must convert date to from')
requireText(dailyV2, "url.searchParams.set('to', date)", 'mobile production daily must convert date to to')
requireText(v4, "domain==='sales_commission_settlement'||domain==='freelancer_monthly_settlement'", 'V4 settlement workflows must remain available')
requireText(v5, "text(item.source_type) === 'sales'", 'sales commission execution must be sales-only')
requireText(v5, "CANONICAL_PC_SETTLEMENT_ENGINE_SALES_ONLY", 'sales-only settlement verification marker is missing')
requireText(v5, ".in('id', ids)", 'HR document history must resolve attachments across prior threads')
requireText(v5, ".eq('status', 'active').limit(1)", 'HR document deletion must recompute active-document readiness')
requireText(v5, "item.key === 'client_name' ? { ...item, required: false }", 'quote client name must be optional when a client is selected')
requireText(v5, '/api/moni/mobile-quote-print?id=', 'quote execution/read must expose printable quote links')
requireText(settlementPrint, "const PROFILE_ID = 'default'", 'settlement print must use canonical company profile id')
requireText(settlementPrint, ".eq('id',PROFILE_ID)", 'settlement print company lookup must use profile id')
requireText(quotePrint, "const PROFILE_ID = 'default'", 'quote print must use canonical company profile id')
requireText(quotePrint, ".eq('id', PROFILE_ID)", 'quote print company lookup must use profile id')
for (const table of ['moni_quotes', 'moni_sales_tax_invoices', 'moni_hr_required_documents']) {
  requireText(migration, `create table if not exists public.${table}`, `V4 migration missing ${table}`)
}

if (failures.length) {
  console.error('MONI mobile V5 source verification failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log('MONI mobile V5 source verification passed.')
