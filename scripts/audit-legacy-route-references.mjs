import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const ROOT = join(process.cwd(), 'src')
const TARGETS = [
  '/api/chat',
  '/api/cron/morning-check',
  '/api/export/excel',
  '/api/export/report',
  '/api/migrate',
  '/api/migrate-bom',
]

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

function normalize(file) {
  return relative(process.cwd(), file).split(sep).join('/')
}

const refs = Object.fromEntries(TARGETS.map((target) => [target, []]))
for (const file of walk(ROOT)) {
  const source = readFileSync(file, 'utf8')
  const path = normalize(file)
  for (const target of TARGETS) {
    if (!source.includes(target)) continue
    const routeSelf = path === `src/app${target}/route.ts`
    refs[target].push({ file: path, route_self: routeSelf })
  }
}

console.log('MONI_LEGACY_ROUTE_AUDIT_START')
console.log(JSON.stringify(refs, null, 2))
console.log('MONI_LEGACY_ROUTE_AUDIT_END')
