import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const ROOT = join(process.cwd(), 'src')
const SUPABASE_IMPORT = /import\s+[^;\n]*\bfrom\s+['"]([^'"]*\/?supabase)['"]/g
const TABLE_CALL = /\.from\(\s*['"]([^'"]+)['"]\s*\)/g

function walk(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    const stat = statSync(full)
    if (stat.isDirectory()) out.push(...walk(full))
    else if (/\.(?:ts|tsx|js|jsx)$/.test(name)) out.push(full)
  }
  return out
}

function normalize(path) {
  return relative(process.cwd(), path).split(sep).join('/')
}

function classify(file, source) {
  if (/^\s*['"]use client['"];?/m.test(source)) return 'CLIENT_EXPLICIT'
  if (/^\s*import\s+['"]server-only['"]/m.test(source) || file.includes('/app/api/')) return 'SERVER_EXPLICIT'
  return 'SHARED_OR_UNKNOWN'
}

const findings = []
for (const file of walk(ROOT)) {
  const source = readFileSync(file, 'utf8')
  const imports = [...source.matchAll(SUPABASE_IMPORT)].map((match) => match[1])
  const directPublicImport = imports.some((value) => value === './supabase' || value === '@/lib/supabase' || value.endsWith('/lib/supabase'))
  if (!directPublicImport) continue
  const tables = [...new Set([...source.matchAll(TABLE_CALL)].map((match) => match[1]))].sort()
  findings.push({ file: normalize(file), execution: classify(file, source), tables })
}

findings.sort((a, b) => a.file.localeCompare(b.file))
const tableToFiles = {}
for (const finding of findings) {
  for (const table of finding.tables) {
    tableToFiles[table] ||= []
    tableToFiles[table].push(finding.file)
  }
}

console.log('MONI_LEGACY_SUPABASE_AUDIT_START')
console.log(JSON.stringify({
  direct_public_supabase_importer_count: findings.length,
  direct_public_supabase_importers: findings,
  table_count: Object.keys(tableToFiles).length,
  tables: Object.fromEntries(Object.entries(tableToFiles).sort(([a], [b]) => a.localeCompare(b))),
}, null, 2))
console.log('MONI_LEGACY_SUPABASE_AUDIT_END')
