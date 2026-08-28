import { NextRequest } from 'next/server'
import { getSessionFromRequest } from '@/lib/allowance/session'
import { createMoniServiceRoleClient } from '@/lib/moni/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BUSINESS_ID = '20220523011'
const text = (value: unknown) => String(value ?? '').trim()
const num = (value: unknown) => { const parsed = Number(value ?? 0); return Number.isFinite(parsed) ? parsed : 0 }
const esc = (value: unknown) => text(value).replace(/[&<>"']/g, (char) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[char] || char))
const won = (value: unknown) => `${Math.round(num(value)).toLocaleString('ko-KR')}원`
const monthNow = () => new Intl.DateTimeFormat('sv-SE', { timeZone:'Asia/Seoul', year:'numeric', month:'2-digit' }).format(new Date()).slice(0,7)

export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  if (!session || session.role !== 'admin') return new Response('관리자 로그인이 필요합니다.', { status: 401 })
  const month = /^\d{4}-\d{2}$/.test(text(request.nextUrl.searchParams.get('month'))) ? text(request.nextUrl.searchParams.get('month')) : monthNow()
  const db = createMoniServiceRoleClient()
  const [settlements, people, company] = await Promise.all([
    db.from('freelancer_settlements').select('*').eq('business_id',BUSINESS_ID).eq('settlement_month',`${month}-01`).order('source_type'),
    db.from('business_people').select('id,name,bank_name,bank_account_holder,bank_account_number').eq('business_id',BUSINESS_ID),
    db.from('company_profile').select('*').eq('business_id',BUSINESS_ID).maybeSingle(),
  ])
  const error = settlements.error || people.error || company.error
  if (error) return new Response(esc(error.message), { status: 500 })
  const peopleById = new Map((people.data ?? []).map((row:any)=>[row.id,row]))
  const rows = (settlements.data ?? []).map((row:any) => {
    const person:any = peopleById.get(row.person_id) || {}
    return `<tr><td>${esc(person.name || '인력')}</td><td>${esc(row.source_type === 'sales' ? '영업' : '생산')}</td><td class="num">${esc(won(row.gross_amount))}</td><td class="num">${esc(won(row.withholding_amount))}</td><td class="num strong">${esc(won(row.net_amount))}</td><td>${esc(row.status)}</td><td>${esc([person.bank_name,person.bank_account_number].filter(Boolean).join(' '))}</td></tr>`
  }).join('')
  const totalGross=(settlements.data??[]).reduce((sum:number,row:any)=>sum+num(row.gross_amount),0)
  const totalWithholding=(settlements.data??[]).reduce((sum:number,row:any)=>sum+num(row.withholding_amount),0)
  const totalNet=(settlements.data??[]).reduce((sum:number,row:any)=>sum+num(row.net_amount),0)
  const c:any = company.data || {}
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(month)} 프리랜서 정산서</title><style>body{font-family:Arial,'Noto Sans KR',sans-serif;color:#173b52;margin:0;background:#f4f8fa}.sheet{max-width:900px;margin:20px auto;background:white;padding:34px;border:1px solid #d8e4e9;border-radius:18px}.head{display:flex;justify-content:space-between;gap:20px;border-bottom:2px solid #173b52;padding-bottom:18px}.head h1{margin:0;font-size:26px}.meta{text-align:right;font-size:12px;line-height:1.7;color:#617b89}table{width:100%;border-collapse:collapse;margin-top:24px;font-size:12px}th,td{border:1px solid #d9e4e8;padding:9px 8px}th{background:#f0f6f7}.num{text-align:right}.strong{font-weight:800}.totals{margin-top:18px;display:flex;justify-content:flex-end;gap:22px;font-size:13px}.actions{margin:18px auto;max-width:900px;display:flex;gap:8px}.actions button{border:0;border-radius:10px;padding:10px 16px;background:#1c8f7b;color:white;font-weight:800}@media print{body{background:white}.actions{display:none}.sheet{margin:0;max-width:none;border:0;border-radius:0;padding:18mm}}</style></head><body><div class="actions"><button onclick="window.print()">인쇄 / PDF 저장</button></div><main class="sheet"><div class="head"><div><h1>${esc(month)} 프리랜서 정산서</h1><div>${esc(c.company_name_ko || c.company_name || '두배')}</div></div><div class="meta">사업자번호 ${esc(c.business_registration_number || '')}<br>대표 ${esc(c.representative_name_ko || '')}<br>${esc(c.company_phone || '')} ${esc(c.company_email || '')}</div></div><table><thead><tr><th>성명</th><th>구분</th><th>총액</th><th>원천징수</th><th>차인지급</th><th>상태</th><th>계좌</th></tr></thead><tbody>${rows || '<tr><td colspan="7" style="text-align:center">저장된 정산 내역이 없습니다.</td></tr>'}</tbody></table><div class="totals"><span>총액 <b>${esc(won(totalGross))}</b></span><span>원천징수 <b>${esc(won(totalWithholding))}</b></span><span>차인지급 <b>${esc(won(totalNet))}</b></span></div></main></body></html>`
  return new Response(html, { status:200, headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'} })
}
