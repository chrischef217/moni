import path from 'path'
import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { analyzeDocument, AUDIT_MODEL, type AnalyzeDocumentFile } from '@/app/audit/lib/analyzeDocument'
import { AUDIT_CATEGORY_META, isAuditCategory } from '@/app/audit/lib/prompts'
import { addAuditRecord, saveAuditFile } from '@/app/audit/lib/storage'
import type { AuditAnalyzeResponse, AuditRecord, AuditStoredFile } from '@/app/audit/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ALLOWED_MIME_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
const MAX_FILE_SIZE = 25 * 1024 * 1024
const MAX_TOTAL_SIZE = 90 * 1024 * 1024

function inferMimeType(file: File) {
  if (ALLOWED_MIME_TYPES.has(file.type)) return file.type

  const ext = path.extname(file.name).toLowerCase()
  if (ext === '.pdf') return 'application/pdf'
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  if (ext === '.png') return 'image/png'
  if (ext === '.webp') return 'image/webp'
  return file.type
}

function safeStoredExtension(name: string, mimeType: string) {
  const ext = path.extname(name).toLowerCase()
  if (ext === '.pdf' || ext === '.jpg' || ext === '.jpeg' || ext === '.png' || ext === '.webp') {
    return ext
  }

  if (mimeType === 'application/pdf') return '.pdf'
  if (mimeType === 'image/jpeg') return '.jpg'
  if (mimeType === 'image/png') return '.png'
  if (mimeType === 'image/webp') return '.webp'
  return ''
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : '문서 분석 중 오류가 발생했습니다.'
}

export async function POST(request: NextRequest) {
  const recordId = randomUUID()
  const createdAt = new Date().toISOString()
  let storedFiles: AuditStoredFile[] = []
  let recordCategory = 'etc' as keyof typeof AUDIT_CATEGORY_META

  try {
    const formData = await request.formData()
    const categoryValue = formData.get('category')
    const fileValues = formData.getAll('files')

    if (!isAuditCategory(categoryValue)) {
      return NextResponse.json<AuditAnalyzeResponse>(
        { ok: false, error: '올바른 감사 카테고리가 필요합니다.' },
        { status: 400 },
      )
    }

    const files = fileValues.filter((value): value is File => value instanceof File && value.size > 0)
    if (files.length === 0) {
      return NextResponse.json<AuditAnalyzeResponse>(
        { ok: false, error: '분석할 파일을 1개 이상 업로드해 주세요.' },
        { status: 400 },
      )
    }

    const totalSize = files.reduce((sum, file) => sum + file.size, 0)
    if (totalSize > MAX_TOTAL_SIZE) {
      return NextResponse.json<AuditAnalyzeResponse>(
        { ok: false, error: '한 번에 분석할 수 있는 전체 파일 용량은 90MB까지입니다.' },
        { status: 400 },
      )
    }

    const category = categoryValue
    recordCategory = category
    const analyzeFiles: AnalyzeDocumentFile[] = []

    for (const file of files) {
      const mimeType = inferMimeType(file)

      if (!ALLOWED_MIME_TYPES.has(mimeType)) {
        return NextResponse.json<AuditAnalyzeResponse>(
          { ok: false, error: `${file.name} 파일 형식은 지원하지 않습니다.` },
          { status: 400 },
        )
      }

      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json<AuditAnalyzeResponse>(
          { ok: false, error: `${file.name} 파일은 25MB를 초과합니다.` },
          { status: 400 },
        )
      }

      const fileId = randomUUID()
      const storedName = `${fileId}${safeStoredExtension(file.name, mimeType)}`
      const buffer = Buffer.from(await file.arrayBuffer())

      await saveAuditFile({
        recordId,
        storedName,
        buffer,
        mimeType,
      })

      storedFiles.push({
        id: fileId,
        category,
        originalName: file.name,
        storedName,
        size: file.size,
        mimeType,
        uploadedAt: createdAt,
      })

      analyzeFiles.push({
        name: file.name,
        mimeType,
        base64: buffer.toString('base64'),
      })
    }

    const analyzed = await analyzeDocument({ category, files: analyzeFiles })
    const record: AuditRecord = {
      id: recordId,
      category,
      categoryLabel: AUDIT_CATEGORY_META[category].label,
      status: 'completed',
      result: analyzed.text,
      model: analyzed.model,
      createdAt,
      files: storedFiles,
    }

    await addAuditRecord(record)

    return NextResponse.json<AuditAnalyzeResponse>({ ok: true, record }, { status: 200 })
  } catch (error) {
    const message = errorMessage(error)

    if (storedFiles.length > 0) {
      const failedRecord: AuditRecord = {
        id: recordId,
        category: recordCategory,
        categoryLabel: AUDIT_CATEGORY_META[recordCategory].label,
        status: 'failed',
        result: '',
        error: message,
        model: AUDIT_MODEL,
        createdAt,
        files: storedFiles,
      }

      await addAuditRecord(failedRecord).catch(() => undefined)

      return NextResponse.json<AuditAnalyzeResponse>(
        { ok: false, error: message, record: failedRecord },
        { status: 500 },
      )
    }

    return NextResponse.json<AuditAnalyzeResponse>({ ok: false, error: message }, { status: 500 })
  }
}
