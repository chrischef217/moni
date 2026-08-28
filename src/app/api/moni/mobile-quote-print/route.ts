import { NextRequest } from 'next/server'
import { getSessionFromRequest } from '@/lib/allowance/session'
import { createMoniServiceRoleClient } from '@/lib/moni/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BUSINESS_ID = '20220523011'
const PROFILE_ID = 'default'
const text = (value: unknown) => String(value ?? '').trim()
const num = (value: unknown) => { const parsed = Number(value ?? 0); return Number.isFinite(parsed) ? parsed : 0 }
const esc = (value: unknown) => text(value).replace(/[&<>"']/g, (char) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[char] || char))
const uuidLike = (value: unknown) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text(value))

function amount(value: unknown, currency: string) {
  const formatted = new Intl.NumberFormat(currency === 'USD' ? 'en-US' : 'ko-KR', { minimumFractionDigits: currency === 'USD' ? 2 : 0, maximumFractionDigits: currency === 'USD' ? 2 : 0 }).format(num(value))
  return currency === 'USD' ? `$${formatted}` : `${formatted}원`
}

export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  if (!session || session.role !== 'admin') return new Response('관리자 로그인이 필요합니다.', { status: 401 })

  const id = text(request.nextUrl.searchParams.get('id'))
  if (!uuidLike(id)) return new Response('견적서 ID를 확인해 주세요.', { status: 400 })

  const db = createMoniServiceRoleClient()
  const [quoteResult, companyResult] = await Promise.all([
    db.from('moni_quotes').select('*').eq('id', id).eq('business_id', BUSINESS_ID).maybeSingle(),
    db.from('company_profile').select('*').eq('id', PROFILE_ID).maybeSingle(),
  ])
  const error = quoteResult.error || companyResult.error
  if (error) return new Response(esc(error.message), { status: 500 })
  if (!quoteResult.data) return new Response('견적서를 찾을 수 없습니다.', { status: 404 })

  const q: any = quoteResult.data
  const c: any = companyResult.data || {}
  const currency = ['USD','KRW'].includes(text(q.currency)) ? text(q.currency) : 'KRW'
  const items = Array.isArray(q.items) ? q.items : []
  const rows = items.map((item: any, index: number) => `<tr><td>${index + 1}</td><td>${esc(item.name)}</td><td>${esc(item.quantity)}</td><td>${esc(item.unit || '')}</td><td class="num">${esc(amount(item.unit_price, currency))}</td><td class="num">${esc(amount(item.supply_amount, currency))}</td></tr>`).join('')
  const validUntil = q.valid_until ? esc(q.valid_until) : '-'
  const statusLabel = q.status === 'issued' ? '발행' : q.status === 'sent' ? '발송' : q.status === 'cancelled' ? '취소' : '작성중'

  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(q.quote_number)} 견적서</title><style>body{font-family:Arial,'Noto Sans KR',sans-serif;color:#173b52;margin:0;background:#f3f7f9}.actions{max-width:900px;margin:18px auto;display:flex;gap:8px}.actions button{border:0;border-radius:10px;padding:10px 16px;background:#1c8f7b;color:white;font-weight:800}.sheet{max-width:900px;margin:0 auto 24px;background:white;padding:36px;border:1px solid #d7e4e8;border-radius:18px}.head{display:flex;justify-content:space-between;gap:24px;border-bottom:2px solid #173b52;padding-bottom:18px}.head h1{margin:0;font-size:30px;letter-spacing:.08em}.company,.meta{font-size:12px;line-height:1.8;color:#607987}.meta{text-align:right}.client{margin-top:22px;display:grid;grid-template-columns:1fr 1fr;gap:10px;border:1px solid #dce7eb;border-radius:12px;padding:14px;font-size:13px}.client b{display:block;color:#183d53;margin-bottom:4px}table{width:100%;border-collapse:collapse;margin-top:24px;font-size:12px}th,td{border:1px solid #d9e4e8;padding:9px 8px}th{background:#eef5f6}.num{text-align:right}.totals{margin:18px 0 0 auto;width:min(360px,100%);font-size:13px}.totals div{display:flex;justify-content:space-between;padding:6px 0}.totals .grand{border-top:2px solid #173b52;margin-top:5px;padding-top:10px;font-size:16px;font-weight:900}.note{margin-top:24px;border-top:1px solid #dce7eb;padding-top:14px;white-space:pre-wrap;font-size:12px;color:#607987}@media print{body{background:white}.actions{display:none}.sheet{margin:0;max-width:none;border:0;border-radius:0;padding:16mm}}</style></head><body><div class="actions"><button onclick="window.print()">인쇄 / PDF 저장</button></div><main class="sheet"><div class="head"><div><h1>견 적 서</h1><div class="company">${esc(c.company_name_ko || '두배')}<br>사업자번호 ${esc(c.business_registration_number || '')}<br>대표 ${esc(c.representative_name_ko || '')}</div></div><div class="meta">견적번호 ${esc(q.quote_number)}<br>견적일 ${esc(q.quote_date)}<br>유효기간 ${validUntil}<br>상태 ${esc(statusLabel)}</div></div><section class="client"><div><b>수신</b>${esc(q.client_name)}</div><div><b>담당자</b>${esc(q.contact_name || '-')}</div></section><table><thead><tr><th>No.</th><th>품목</th><th>수량</th><th>단위</th><th>단가</th><th>공급가액</th></tr></thead><tbody>${rows || '<tr><td colspan="6" style="text-align:center">견적 품목이 없습니다.</td></tr>'}</tbody></table><div class="totals"><div><span>공급가액</span><b>${esc(amount(q.supply_amount, currency))}</b></div><div><span>VAT (${esc(q.vat_rate)}%)</span><b>${esc(amount(q.vat_amount, currency))}</b></div><div class="grand"><span>합계</span><b>${esc(amount(q.total_amount, currency))}</b></div></div>${q.note ? `<div class="note"><b>비고</b><br>${esc(q.note)}</div>` : ''}</main></body></html>`
  return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } })
}
