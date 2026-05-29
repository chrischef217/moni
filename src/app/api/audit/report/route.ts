import { NextRequest, NextResponse } from 'next/server'
import { AUDIT_CATEGORIES, AUDIT_CATEGORY_META, type AuditCategoryKey } from '@/app/audit/lib/prompts'
import { readAuditRecords } from '@/app/audit/lib/storage'
import type { AuditRecord } from '@/app/audit/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Seoul',
  }).format(new Date(value))
}

function latestCompletedByCategory(records: AuditRecord[]) {
  const latest = new Map<AuditCategoryKey, AuditRecord>()
  for (const category of AUDIT_CATEGORIES) {
    const record = records.find((item) => item.category === category.key && item.status === 'completed')
    if (record) latest.set(category.key, record)
  }
  return latest
}

function reportRows(records: AuditRecord[]) {
  return records
    .map(
      (record) => `
        <tr>
          <td>${escapeHtml(record.categoryLabel)}</td>
          <td>${escapeHtml(formatDate(record.createdAt))}</td>
          <td class="number">${record.files.length}</td>
          <td>${record.status === 'completed' ? '완료' : '실패'}</td>
        </tr>`,
    )
    .join('')
}

function graphBars(records: AuditRecord[]) {
  const max = Math.max(...records.map((record) => record.files.length), 1)
  return records
    .map((record) => {
      const width = Math.max(8, Math.round((record.files.length / max) * 100))
      return `
        <div class="bar-row">
          <span>${escapeHtml(AUDIT_CATEGORY_META[record.category].shortLabel)}</span>
          <div class="bar-track"><div class="bar" style="width:${width}%"></div></div>
          <strong>${record.files.length}</strong>
        </div>`
    })
    .join('')
}

export async function GET(request: NextRequest) {
  try {
    const records = await readAuditRecords()
    const requestedIds = request.nextUrl.searchParams
      .get('recordIds')
      ?.split(',')
      .map((id) => id.trim())
      .filter(Boolean)

    const selectedRecords =
      requestedIds && requestedIds.length > 0
        ? requestedIds
            .map((id) => records.find((record) => record.id === id && record.status === 'completed'))
            .filter((record): record is AuditRecord => Boolean(record))
        : Array.from(latestCompletedByCategory(records).values())

    if (selectedRecords.length === 0) {
      return NextResponse.json({ ok: false, error: '리포트로 만들 분석 결과가 없습니다.' }, { status: 404 })
    }

    const generatedAt = new Date().toISOString()
    const modelLabel = Array.from(new Set(selectedRecords.map((record) => record.model).filter(Boolean))).join(', ')
    const detailsHtml = selectedRecords
      .map(
        (record) => `
          <section class="result-section">
            <h2>${escapeHtml(record.categoryLabel)}</h2>
            <p class="meta-line">분석일: ${escapeHtml(formatDate(record.createdAt))} · 파일 ${record.files.length}개 · ${escapeHtml(record.model)}</p>
            <pre>${escapeHtml(record.result)}</pre>
          </section>`,
      )
      .join('')

    const html = `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <title>재무감사 리포트</title>
  <style>
    @page { size: A4; margin: 14mm; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #e5e7eb; color: #111827; font-family: Arial, "Malgun Gothic", sans-serif; }
    .toolbar { width: 210mm; margin: 16px auto; text-align: right; }
    .toolbar button { border: 0; border-radius: 8px; background: #111827; color: white; padding: 10px 14px; font-weight: 700; cursor: pointer; }
    .page { width: 210mm; min-height: 297mm; margin: 0 auto 20px; background: white; padding: 16mm; box-shadow: 0 20px 50px rgba(15, 23, 42, 0.18); }
    h1 { margin: 0; font-size: 28px; letter-spacing: 0; }
    .subtitle { margin-top: 8px; color: #475569; font-size: 13px; }
    .summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 20px; }
    .metric { border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px; }
    .metric span { display: block; color: #64748b; font-size: 12px; }
    .metric strong { display: block; margin-top: 6px; font-size: 20px; }
    table { width: 100%; border-collapse: collapse; margin-top: 18px; font-size: 12px; }
    th, td { border: 1px solid #cbd5e1; padding: 8px 9px; text-align: left; vertical-align: top; }
    th { background: #f1f5f9; }
    td.number { text-align: right; }
    .chart { margin-top: 18px; border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px; }
    .bar-row { display: grid; grid-template-columns: 64px 1fr 32px; align-items: center; gap: 10px; margin: 8px 0; font-size: 12px; }
    .bar-track { height: 12px; border-radius: 999px; background: #e2e8f0; overflow: hidden; }
    .bar { height: 100%; border-radius: 999px; background: #16a34a; }
    .result-section { margin-top: 26px; break-inside: avoid; }
    h2 { margin: 0; font-size: 19px; }
    .meta-line { margin: 6px 0 10px; color: #64748b; font-size: 12px; }
    pre { margin: 0; white-space: pre-wrap; word-break: break-word; border: 1px solid #cbd5e1; border-radius: 8px; background: #f8fafc; padding: 12px; font-family: Arial, "Malgun Gothic", sans-serif; font-size: 12px; line-height: 1.7; }
    @media print {
      body { background: white; }
      .toolbar { display: none; }
      .page { width: auto; min-height: auto; margin: 0; padding: 0; box-shadow: none; }
    }
  </style>
</head>
<body>
  <div class="toolbar"><button onclick="window.print()">PDF로 저장 / 인쇄</button></div>
  <main class="page">
    <h1>재무감사 리포트</h1>
    <p class="subtitle">생성일: ${escapeHtml(formatDate(generatedAt))} · 두배 자체 회계감사용</p>
    <section class="summary-grid">
      <div class="metric"><span>완료 카테고리</span><strong>${selectedRecords.length} / ${AUDIT_CATEGORIES.length}</strong></div>
      <div class="metric"><span>첨부 파일</span><strong>${selectedRecords.reduce((sum, record) => sum + record.files.length, 0)}개</strong></div>
      <div class="metric"><span>분석 모델</span><strong>${escapeHtml(modelLabel || 'Claude')}</strong></div>
    </section>
    <table>
      <thead>
        <tr><th>카테고리</th><th>분석일</th><th>파일 수</th><th>상태</th></tr>
      </thead>
      <tbody>${reportRows(selectedRecords)}</tbody>
    </table>
    <section class="chart">
      <strong>카테고리별 첨부 자료량</strong>
      ${graphBars(selectedRecords)}
    </section>
    ${detailsHtml}
  </main>
  <script>window.addEventListener('load', () => setTimeout(() => window.print(), 350));</script>
</body>
</html>`

    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : '감사 리포트를 만들지 못했습니다.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
