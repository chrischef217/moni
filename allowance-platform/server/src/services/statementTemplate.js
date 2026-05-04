const dayjs = require('dayjs');

function calcPaymentDate(year, month, paymentDay) {
  const base = dayjs(`${year}-${String(month).padStart(2, '0')}-01`).add(1, 'month');
  const lastDay = base.endOf('month').date();
  const day = Math.min(paymentDay, lastDay);
  return base.date(day).format('YYYY년 MM월 DD일');
}

function currency(value) {
  return Number(value || 0).toLocaleString('ko-KR');
}

function renderStatementHtml({ company, freelancer, payRecord, details, paymentDate }) {
  const rows = details
    .map(
      (item) => `
      <tr>
        <td>${item.Product.Client.name}</td>
        <td>${item.Product.name}</td>
        <td style="text-align:right;">${currency(item.quantity_kg)}</td>
        <td style="text-align:right;">${currency(item.Product.price_per_kg)}</td>
        <td style="text-align:right;">${currency(item.amount)}</td>
      </tr>`
    )
    .join('');

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<style>
body { font-family: 'Malgun Gothic', sans-serif; margin: 0; padding: 24px; color: #111; }
.sheet { width: 794px; margin: 0 auto; }
h1 { text-align:center; margin: 0 0 12px; font-size: 30px; }
.line { display:flex; justify-content:flex-end; gap:24px; margin-bottom:12px; }
.section-title { font-size: 18px; font-weight: 700; margin: 12px 0 6px; }
table { width:100%; border-collapse: collapse; }
th, td { border:1px solid #222; padding: 8px; font-size: 14px; }
.note { margin-top: 16px; text-align: center; font-size: 16px; }
</style>
</head>
<body>
<div class="sheet">
<h1>수수료·수당 지급명세서</h1>
<div class="line"><span>[?] 지급자 보관용</span><span>[?] 소득자 보관용</span></div>
<div class="section-title">1. 지급자</div>
<table>
<tr><th>회사명</th><td colspan="3">${company.company_name || ''}</td></tr>
<tr><th>대표자</th><td>${company.representative || ''}</td><th>사업자등록번호</th><td>${company.business_reg_number || ''}</td></tr>
<tr><th>업종/업태</th><td colspan="3">${company.business_type || ''} / ${company.business_sector || ''}</td></tr>
<tr><th>주소</th><td colspan="3">${company.address || ''}</td></tr>
<tr><th>연락처</th><td colspan="3">${company.phone || ''}</td></tr>
</table>
<div class="section-title">2. 지급 대상자</div>
<table>
<tr><th>성명</th><td>${freelancer.name}</td><th>은행명</th><td>${freelancer.bank_name || ''}</td></tr>
<tr><th>주민등록번호</th><td>${freelancer.rrn || ''}</td><th>계좌번호</th><td>${freelancer.account_number || ''}</td></tr>
<tr><th>주소</th><td colspan="3">${freelancer.address || ''}</td></tr>
<tr><th>연락처</th><td>${freelancer.phone || ''}</td><th>지급일</th><td>${paymentDate}</td></tr>
</table>
<div class="section-title">■ 상세 내역</div>
<table>
<thead><tr><th>거래처</th><th>제품명</th><th>수량(kg)</th><th>단가(원/kg)</th><th>수당액(원)</th></tr></thead>
<tbody>${rows}</tbody>
</table>
<div class="section-title">■ 지급 내역</div>
<table>
<thead><tr><th>Year</th><th>Month</th><th>금액</th><th>원천징수 세액</th><th>차인지급액</th></tr></thead>
<tbody>
<tr>
<td>${payRecord.year}</td><td>${payRecord.month}</td>
<td style="text-align:right;">${currency(payRecord.total_amount)}</td>
<td style="text-align:right;">${currency(payRecord.withholding_tax)}</td>
<td style="text-align:right;">${currency(payRecord.net_amount)}</td>
</tr>
</tbody>
</table>
<div class="note">위의 수익 금액을 영수합니다</div>
</div>
</body>
</html>`;
}

module.exports = {
  calcPaymentDate,
  renderStatementHtml,
};

