import { NextRequest } from 'next/server'
import { getSessionFromRequest } from '@/lib/allowance/session'
import { createMoniServiceRoleClient } from '@/lib/moni/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const text = (value: unknown, max = 12000) => String(value ?? '').trim().slice(0, max)
const escapeHtml = (value: unknown) => text(value).replace(/[&<>"']/g, (char) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[char] || char))
const multiline = (value: unknown) => escapeHtml(value).replace(/\r?\n/g, '<br/>')
const safeImage = (value: unknown) => {
  const src = text(value, 200000)
  return /^(?:data:image\/(?:png|jpeg|jpg|webp);base64,|https:\/\/|\/)/i.test(src) ? escapeHtml(src) : ''
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(request)
  if (!session) return new Response('로그인이 필요합니다.', { status: 401 })
  if (session.role !== 'admin') return new Response('관리자만 공문을 출력할 수 있습니다.', { status: 403 })

  const id = text(params.id, 140)
  if (!id) return new Response('공문 ID가 필요합니다.', { status: 400 })

  const db = createMoniServiceRoleClient()
  const [docResult, profileResult] = await Promise.all([
    db.from('official_documents').select('*').eq('id', id).maybeSingle(),
    db.from('company_profile').select('*').eq('id', 'default').maybeSingle(),
  ])
  if (docResult.error) return new Response(escapeHtml(docResult.error.message), { status: 500, headers: { 'Content-Type':'text/plain; charset=utf-8' } })
  if (!docResult.data) return new Response('공문을 찾을 수 없습니다.', { status: 404 })
  if (profileResult.error) return new Response(escapeHtml(profileResult.error.message), { status: 500, headers: { 'Content-Type':'text/plain; charset=utf-8' } })

  const doc: any = docResult.data
  const company: any = doc.sender_snapshot && typeof doc.sender_snapshot === 'object' ? doc.sender_snapshot : (profileResult.data || {})
  const logo = safeImage(company.logo_data_url || company.logo_url)
  const signature = doc.use_signature ? safeImage(company.signature_data_url || company.signature_url) : ''
  const attachments = Array.isArray(doc.attachment_names) ? doc.attachment_names.map((item: unknown) => text(item, 300)).filter(Boolean) : []
  const status = text(doc.status).toUpperCase()
  const companyName = company.company_name_ko || company.company_name || '두배'
  const representative = company.representative_name_ko || company.representative_name || ''

  const html = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/>
<title>${escapeHtml(doc.document_no || '공문')} · ${escapeHtml(doc.title)}</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#eef2f5;color:#172b3a;font-family:Arial,'Noto Sans KR',sans-serif}.toolbar{position:sticky;top:0;z-index:10;display:flex;gap:8px;justify-content:flex-end;padding:10px;background:rgba(238,242,245,.96);border-bottom:1px solid #d8e0e6}.toolbar button{border:0;border-radius:12px;padding:11px 16px;background:#173b52;color:#fff;font-weight:800;font-size:14px}.sheet{width:min(210mm,calc(100% - 20px));min-height:297mm;margin:12px auto 40px;background:#fff;padding:18mm 17mm;box-shadow:0 12px 36px rgba(15,35,55,.13)}.head{display:flex;justify-content:space-between;gap:20px;align-items:flex-start;border-bottom:3px solid #173b52;padding-bottom:14px}.brand{display:flex;gap:12px;align-items:center}.logo{width:58px;height:58px;object-fit:contain}.company{font-size:21px;font-weight:900}.small{font-size:11px;color:#61727e;line-height:1.55}.docno{text-align:right;font-size:12px;line-height:1.65}.title{text-align:center;font-size:28px;font-weight:900;letter-spacing:.08em;margin:34px 0 28px}.meta{border-top:1px solid #9cabb5;border-bottom:1px solid #9cabb5;padding:12px 0;display:grid;grid-template-columns:92px 1fr;gap:7px 10px;font-size:13px}.label{font-weight:800;color:#435866}.body{font-size:14px;line-height:1.95;margin-top:28px}.body p{margin:0 0 18px}.summary{margin-top:24px;padding:14px 16px;background:#f5f8fa;border-left:4px solid #173b52;font-weight:700;line-height:1.75}.attachments{margin-top:24px;font-size:12px;line-height:1.7}.sign{display:flex;justify-content:flex-end;margin-top:48px;text-align:center}.signbox{min-width:220px}.signature{max-width:150px;max-height:70px;object-fit:contain;display:block;margin:4px auto -12px}.rep{font-weight:900;font-size:16px}.status{display:inline-block;border:1px solid #b9c5cc;border-radius:999px;padding:3px 8px;font-size:10px;font-weight:800}.draft{position:fixed;inset:45% 0 auto;text-align:center;transform:rotate(-18deg);font-size:72px;font-weight:900;color:rgba(170,25,25,.08);pointer-events:none}@media(max-width:680px){.sheet{width:100%;min-height:0;margin:0;padding:24px 18px;box-shadow:none}.title{font-size:23px}.meta{grid-template-columns:78px 1fr}.toolbar{position:sticky}.head{gap:10px}.company{font-size:17px}}@media print{body{background:#fff}.toolbar{display:none}.sheet{width:210mm;min-height:297mm;margin:0;padding:17mm;box-shadow:none}.draft{position:fixed}@page{size:A4;margin:0}}
</style></head><body>
<div class="toolbar"><button type="button" onclick="window.print()">인쇄 / PDF 저장</button></div>
${status === 'DRAFT' ? '<div class="draft">DRAFT</div>' : ''}
<main class="sheet">
<header class="head"><div class="brand">${logo ? `<img class="logo" src="${logo}" alt="회사 로고"/>` : ''}<div><div class="company">${escapeHtml(companyName)}</div><div class="small">${escapeHtml(company.address_ko || company.address || '')}<br/>${escapeHtml(company.company_phone || company.phone || '')}${company.company_email ? ` · ${escapeHtml(company.company_email)}` : ''}</div></div></div><div class="docno"><span class="status">${escapeHtml(status || 'DRAFT')}</span><br/>문서번호 ${escapeHtml(doc.document_no || '미발행')}<br/>시행일자 ${escapeHtml(doc.document_date || '')}</div></header>
<h1 class="title">공 문</h1>
<section class="meta"><div class="label">수 신</div><div>${escapeHtml(doc.recipient_company_name || '')}${doc.recipient_contact_name ? ` · ${escapeHtml(doc.recipient_contact_name)}` : ''}</div><div class="label">주 소</div><div>${escapeHtml(doc.recipient_address || '')}</div><div class="label">제 목</div><div><strong>${escapeHtml(doc.title || '')}</strong></div>${doc.reference_text ? `<div class="label">관련 근거</div><div>${multiline(doc.reference_text)}</div>` : ''}</section>
<section class="body">${doc.greeting ? `<p>${multiline(doc.greeting)}</p>` : ''}<p>${multiline(doc.body)}</p>${doc.request_summary ? `<div class="summary">${multiline(doc.request_summary)}</div>` : ''}</section>
${attachments.length ? `<section class="attachments"><strong>첨부</strong><br/>${attachments.map((item:string,index:number)=>`${index+1}. ${escapeHtml(item)}`).join('<br/>')}</section>` : ''}
<footer class="sign"><div class="signbox"><div class="small">${escapeHtml(companyName)}</div>${signature ? `<img class="signature" src="${signature}" alt="대표 서명"/>` : '<div style="height:34px"></div>'}<div class="rep">${escapeHtml(representative || doc.approver_name || '')}</div></div></footer>
</main></body></html>`

  return new Response(html, { status:200, headers:{ 'Content-Type':'text/html; charset=utf-8', 'Cache-Control':'private, no-store, max-age=0', 'X-Content-Type-Options':'nosniff' } })
}
