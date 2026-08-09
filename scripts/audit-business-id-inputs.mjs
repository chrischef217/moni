import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const ROOT = join(process.cwd(), 'src', 'app', 'api', 'moni')
const SIGNALS = [
  /searchParams\.get\(['"]business_id['"]\)/,
  /searchParams\.getAll\(['"]business_id['"]\)/,
  /\bbody\??\.business_id\b/,
  /\bbody\[['"]business_id['"]\]/,
  /\bbusiness_id\s*:\s*toText\(body\.business_id\)/,
  /\bbusiness_id\s*:\s*text\(body\.business_id\)/,
  /\bbusiness_id\s*:\s*String\(body\.business_id/,
  /\bbusiness_id\s*:\s*[^\n]*['"]default['"]/,
]

function walk(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    const stat = statSync(full)
    if (stat.isDirectory()) out.push(...walk(full))
    else if (name === 'route.ts' || name === 'route.js') out.push(full)
  }
  return out
}

function normalize(file) {
  return relative(process.cwd(), file).split(sep).join('/')
}

const findings = []
for (const file of walk(ROOT)) {
  const source = readFileSync(file, 'utf8')
  const lines = source.split(/\r?\n/)
  const matches = []
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (SIGNALS.some((pattern) => pattern.test(line))) {
      matches.push({ line: index + 1, text: line.trim().slice(0, 240) })
    }
  }
  if (matches.length) findings.push({ file: normalize(file), matches })
}

console.log('MONI_BUSINESS_ID_INPUT_AUDIT_START')
console.log(JSON.stringify({ route_count: findings.length, findings }, null, 2))
console.log('MONI_BUSINESS_ID_INPUT_AUDIT_END')
