import { NextRequest, NextResponse } from 'next/server'
import { createMoniServiceRoleClient } from '@/lib/moni/db'

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

function mark(value: unknown) {
  return value === false ? '부적합' : '적합'
}

function note(value: unknown) {
  return escapeHtml(value || '-')
}

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createMoniServiceRoleClient()
    const { data, error } = await supabase.from('sanitation_logs').select('*').eq('id', params.id).maybeSingle()
    if (error) throw new Error(error.message || '위생점검 일지 조회 실패')
    if (!data) return NextResponse.json({ ok: false, error: '위생점검 일지를 찾을 수 없습니다.' }, { status: 404 })

    const html = `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <title>위생점검 일지 ${escapeHtml(data.check_date)}</title>
  <style>
    @page { size: A4; margin: 16mm; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Arial, "Malgun Gothic", sans-serif; color: #111827; background: #f3f4f6; }
    .page { width: 210mm; min-height: 297mm; margin: 0 auto; background: white; padding: 18mm; }
    h1 { margin: 0 0 16px; text-align: center; font-size: 26px; letter-spacing: 0; }
    .meta { display: grid; grid-template-columns: 1fr 1fr 1fr; border: 1px solid #111827; border-bottom: 0; }
    .meta div { padding: 10px; border-right: 1px solid #111827; font-size: 14px; }
    .meta div:last-child { border-right: 0; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th, td { border: 1px solid #111827; padding: 9px; vertical-align: top; }
    th { background: #e5e7eb; }
    .result { margin-top: 18px; border: 1px solid #111827; padding: 12px; font-size: 15px; }
    .sign { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 40px; }
    .sign div { height: 80px; border: 1px solid #111827; padding: 10px; text-align: right; }
    .no-print { margin: 16px auto; width: 210mm; text-align: right; }
    .no-print button { padding: 10px 14px; border: 1px solid #111827; background: #111827; color: white; cursor: pointer; }
    @media print {
      body { background: white; }
      .page { width: auto; min-height: auto; margin: 0; padding: 0; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="no-print"><button onclick="window.print()">인쇄 / PDF 저장</button></div>
  <main class="page">
    <h1>위생점검 일지</h1>
    <section class="meta">
      <div><strong>회사명</strong><br />MONI</div>
      <div><strong>점검일자</strong><br />${escapeHtml(data.check_date)}</div>
      <div><strong>점검자</strong><br />${escapeHtml(data.checker_name)}</div>
    </section>
    <table>
      <thead>
        <tr><th style="width: 24%">점검 항목</th><th style="width: 18%">결과</th><th>특이사항</th></tr>
      </thead>
      <tbody>
        <tr><td>작업장 청결</td><td>${mark(data.workplace_clean)}</td><td>${note(data.workplace_note)}</td></tr>
        <tr><td>작업자 위생</td><td>${mark(data.worker_hygiene)}</td><td>${note(data.worker_note)}</td></tr>
        <tr><td>원재료 보관</td><td>${mark(data.material_storage)}</td><td>${note(data.material_note)}</td></tr>
        <tr><td>설비·기구</td><td>${mark(data.equipment_clean)}</td><td>${note(data.equipment_note)}</td></tr>
        <tr><td>방충·방서</td><td>${mark(data.pest_control)}</td><td>${note(data.pest_note)}</td></tr>
        <tr><td>급수 위생</td><td>${mark(data.water_hygiene)}</td><td>${note(data.water_note)}</td></tr>
      </tbody>
    </table>
    <section class="result">
      <p><strong>종합결과:</strong> ${escapeHtml(data.overall_result)}</p>
      <p><strong>조치사항:</strong> ${note(data.action_taken)}</p>
    </section>
    <section class="sign">
      <div>점검자 서명: __________________</div>
      <div>확인자 서명: __________________</div>
    </section>
  </main>
  <script>window.addEventListener('load', () => setTimeout(() => window.print(), 300));</script>
</body>
</html>`

    return new NextResponse(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : '위생점검 일지 PDF 생성 중 오류가 발생했습니다.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
