import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { AuditRecord } from './types'

const STORAGE_ROOT =
  process.env.AUDIT_STORAGE_DIR ||
  path.join(process.env.VERCEL ? os.tmpdir() : process.cwd(), 'storage', 'audit')
const RECORDS_FILE = path.join(STORAGE_ROOT, 'records.json')
const SUPABASE_BUCKET = process.env.AUDIT_SUPABASE_BUCKET || 'moni-audit'
const SUPABASE_RECORDS_PATH = 'records.json'

let supabaseStorageClient: SupabaseClient | null = null
let supabaseBucketReady = false

function readEnv(name: string) {
  return process.env[name]?.trim() ?? ''
}

function shouldUseSupabaseStorage() {
  if (process.env.AUDIT_STORAGE_BACKEND === 'local') return false
  if (process.env.AUDIT_STORAGE_BACKEND === 'supabase') return true
  return Boolean(process.env.VERCEL && readEnv('NEXT_PUBLIC_SUPABASE_URL') && readEnv('SUPABASE_SERVICE_ROLE_KEY'))
}

function getSupabaseStorageClient() {
  if (supabaseStorageClient) return supabaseStorageClient

  const supabaseUrl = readEnv('NEXT_PUBLIC_SUPABASE_URL')
  const serviceRoleKey = readEnv('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Supabase 감사 저장소를 사용하려면 NEXT_PUBLIC_SUPABASE_URL과 SUPABASE_SERVICE_ROLE_KEY가 필요합니다.')
  }

  supabaseStorageClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  })

  return supabaseStorageClient
}

async function ensureSupabaseBucket() {
  if (supabaseBucketReady) return

  const supabase = getSupabaseStorageClient()
  const current = await supabase.storage.getBucket(SUPABASE_BUCKET)

  if (current.error) {
    const created = await supabase.storage.createBucket(SUPABASE_BUCKET, {
      public: false,
    })

    if (created.error && !created.error.message.toLowerCase().includes('already exists')) {
      throw new Error(`감사 저장소 버킷 생성 실패: ${created.error.message}`)
    }
  }

  supabaseBucketReady = true
}

function auditObjectPath(recordId: string, storedName: string) {
  const objectPath = `${recordId}/files/${storedName}`

  if (!/^[A-Za-z0-9._/-]+$/.test(objectPath)) {
    throw new Error('감사 파일 저장 경로는 영문, 숫자, 하이픈, 언더스코어, 점만 사용할 수 있습니다.')
  }

  return objectPath
}

async function ensureStorage() {
  await fs.mkdir(STORAGE_ROOT, { recursive: true })
}

async function readSupabaseText(objectPath: string) {
  await ensureSupabaseBucket()
  const supabase = getSupabaseStorageClient()
  const { data, error } = await supabase.storage.from(SUPABASE_BUCKET).download(objectPath)

  if (error) {
    const statusCode = typeof error === 'object' && 'statusCode' in error ? String(error.statusCode) : ''
    if (statusCode === '404' || error.message.toLowerCase().includes('not found')) return null
    throw new Error(error.message)
  }

  return data.text()
}

async function writeSupabaseText(objectPath: string, value: string) {
  await ensureSupabaseBucket()
  const supabase = getSupabaseStorageClient()
  const { error } = await supabase.storage.from(SUPABASE_BUCKET).upload(objectPath, value, {
    contentType: 'application/json; charset=utf-8',
    upsert: true,
  })

  if (error) throw new Error(error.message)
}

export function getAuditStorageRoot() {
  return STORAGE_ROOT
}

export function getAuditRecordDir(recordId: string) {
  return path.join(STORAGE_ROOT, recordId)
}

export function getAuditFilesDir(recordId: string) {
  return path.join(getAuditRecordDir(recordId), 'files')
}

export async function readAuditRecords(): Promise<AuditRecord[]> {
  if (shouldUseSupabaseStorage()) {
    const raw = await readSupabaseText(SUPABASE_RECORDS_PATH)
    if (!raw) return []

    const parsed = JSON.parse(raw) as unknown
    return normalizeAuditRecords(parsed)
  }

  await ensureStorage()

  try {
    const raw = await fs.readFile(RECORDS_FILE, 'utf8')
    const parsed = JSON.parse(raw) as unknown
    return normalizeAuditRecords(parsed)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
}

function normalizeAuditRecords(value: unknown) {
  if (!Array.isArray(value)) return []

  return value
    .filter((record): record is AuditRecord => {
      return (
        typeof record === 'object' &&
        record !== null &&
        typeof (record as AuditRecord).id === 'string' &&
        typeof (record as AuditRecord).category === 'string' &&
        Array.isArray((record as AuditRecord).files)
      )
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export async function writeAuditRecords(records: AuditRecord[]) {
  if (shouldUseSupabaseStorage()) {
    const sorted = records.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    await writeSupabaseText(SUPABASE_RECORDS_PATH, JSON.stringify(sorted, null, 2))
    return
  }

  await ensureStorage()
  const sorted = records.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  await fs.writeFile(RECORDS_FILE, JSON.stringify(sorted, null, 2), 'utf8')
}

export async function addAuditRecord(record: AuditRecord) {
  const records = await readAuditRecords()
  await writeAuditRecords([record, ...records.filter((item) => item.id !== record.id)])
}

export async function findAuditRecord(recordId: string) {
  const records = await readAuditRecords()
  return records.find((record) => record.id === recordId) ?? null
}

export async function saveAuditFile({
  recordId,
  storedName,
  buffer,
  mimeType,
}: {
  recordId: string
  storedName: string
  buffer: Buffer
  mimeType: string
}) {
  if (shouldUseSupabaseStorage()) {
    await ensureSupabaseBucket()
    const supabase = getSupabaseStorageClient()
    const { error } = await supabase.storage.from(SUPABASE_BUCKET).upload(
      auditObjectPath(recordId, storedName),
      buffer,
      {
        contentType: mimeType || 'application/octet-stream',
        upsert: false,
      },
    )

    if (error) throw new Error(error.message)
    return
  }

  const filesDir = assertInsideAuditStorage(getAuditFilesDir(recordId))
  await fs.mkdir(filesDir, { recursive: true })
  await fs.writeFile(assertInsideAuditStorage(path.join(filesDir, storedName)), buffer)
}

export async function readAuditFile(recordId: string, storedName: string) {
  if (shouldUseSupabaseStorage()) {
    await ensureSupabaseBucket()
    const supabase = getSupabaseStorageClient()
    const { data, error } = await supabase.storage.from(SUPABASE_BUCKET).download(auditObjectPath(recordId, storedName))

    if (error) throw new Error(error.message)
    return Buffer.from(await data.arrayBuffer())
  }

  const filePath = assertInsideAuditStorage(path.join(getAuditFilesDir(recordId), storedName))
  return fs.readFile(filePath)
}

export function assertInsideAuditStorage(candidatePath: string) {
  const root = path.resolve(STORAGE_ROOT)
  const resolved = path.resolve(candidatePath)
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error('잘못된 파일 경로입니다.')
  }
  return resolved
}
