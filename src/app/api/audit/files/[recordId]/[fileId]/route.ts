import { NextRequest, NextResponse } from 'next/server'
import { findAuditRecord, readAuditFile } from '@/app/audit/lib/storage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function encodeDownloadName(name: string) {
  return encodeURIComponent(name).replaceAll('%20', '+')
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { recordId: string; fileId: string } },
) {
  const record = await findAuditRecord(params.recordId)
  const file = record?.files.find((item) => item.id === params.fileId)

  if (!record || !file) {
    return NextResponse.json({ ok: false, error: '파일 기록을 찾지 못했습니다.' }, { status: 404 })
  }

  const buffer = await readAuditFile(record.id, file.storedName)

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': file.mimeType || 'application/octet-stream',
      'Content-Length': String(buffer.length),
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeDownloadName(file.originalName)}`,
      'Cache-Control': 'private, no-store',
    },
  })
}
