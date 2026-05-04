const toCurrency = (value) => Number(value || 0).toLocaleString('ko-KR');

export default function SettlementStatement({ company, freelancer, payRecord, details, paymentDate }) {
  if (!company || !freelancer || !payRecord) {
    return null;
  }

  return (
    <div id="statement-print" className="print-area mx-auto w-[210mm] min-h-[297mm] bg-white p-8 text-black shadow-lg">
      <h1 className="mb-2 text-center text-3xl font-bold">수수료·수당 지급명세서</h1>
      <div className="mb-3 flex justify-end gap-8 text-sm">
        <span>[?] 지급자 보관용</span>
        <span>[?] 소득자 보관용</span>
      </div>

      <h2 className="mb-2 text-lg font-bold">1. 지급자</h2>
      <table className="mb-4 w-full border-collapse text-sm">
        <tbody>
          <tr>
            <th className="w-40 border border-black bg-slate-100 p-2 text-left">회사명</th>
            <td className="border border-black p-2" colSpan={3}>{company.company_name || ''}</td>
          </tr>
          <tr>
            <th className="border border-black bg-slate-100 p-2 text-left">대표자</th>
            <td className="border border-black p-2">{company.representative || ''}</td>
            <th className="border border-black bg-slate-100 p-2 text-left">사업자등록번호</th>
            <td className="border border-black p-2">{company.business_reg_number || ''}</td>
          </tr>
          <tr>
            <th className="border border-black bg-slate-100 p-2 text-left">업종/업태</th>
            <td className="border border-black p-2" colSpan={3}>{company.business_type || ''} / {company.business_sector || ''}</td>
          </tr>
          <tr>
            <th className="border border-black bg-slate-100 p-2 text-left">주소</th>
            <td className="border border-black p-2" colSpan={3}>{company.address || ''}</td>
          </tr>
          <tr>
            <th className="border border-black bg-slate-100 p-2 text-left">연락처</th>
            <td className="border border-black p-2" colSpan={3}>{company.phone || ''}</td>
          </tr>
        </tbody>
      </table>

      <h2 className="mb-2 text-lg font-bold">2. 지급 대상자</h2>
      <table className="mb-4 w-full border-collapse text-sm">
        <tbody>
          <tr>
            <th className="w-40 border border-black bg-slate-100 p-2 text-left">성명</th>
            <td className="border border-black p-2">{freelancer.name}</td>
            <th className="border border-black bg-slate-100 p-2 text-left">은행명</th>
            <td className="border border-black p-2">{freelancer.bank_name || ''}</td>
          </tr>
          <tr>
            <th className="border border-black bg-slate-100 p-2 text-left">주민등록번호</th>
            <td className="border border-black p-2">{freelancer.rrn || ''}</td>
            <th className="border border-black bg-slate-100 p-2 text-left">계좌번호</th>
            <td className="border border-black p-2">{freelancer.account_number || ''}</td>
          </tr>
          <tr>
            <th className="border border-black bg-slate-100 p-2 text-left">주소</th>
            <td className="border border-black p-2" colSpan={3}>{freelancer.address || ''}</td>
          </tr>
          <tr>
            <th className="border border-black bg-slate-100 p-2 text-left">연락처</th>
            <td className="border border-black p-2">{freelancer.phone || ''}</td>
            <th className="border border-black bg-slate-100 p-2 text-left">지급일</th>
            <td className="border border-black p-2">{paymentDate || ''}</td>
          </tr>
        </tbody>
      </table>

      <h2 className="mb-2 text-lg font-bold">■ 상세 내역</h2>
      <table className="mb-4 w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="border border-black bg-slate-100 p-2">거래처</th>
            <th className="border border-black bg-slate-100 p-2">제품명</th>
            <th className="border border-black bg-slate-100 p-2">수량(kg)</th>
            <th className="border border-black bg-slate-100 p-2">단가(원/kg)</th>
            <th className="border border-black bg-slate-100 p-2">수당액(원)</th>
          </tr>
        </thead>
        <tbody>
          {details.map((row) => (
            <tr key={row.id}>
              <td className="border border-black p-2">{row.Product?.Client?.name || ''}</td>
              <td className="border border-black p-2">{row.Product?.name || ''}</td>
              <td className="border border-black p-2 text-right">{toCurrency(row.quantity_kg)}</td>
              <td className="border border-black p-2 text-right">{toCurrency(row.Product?.price_per_kg)}</td>
              <td className="border border-black p-2 text-right">{toCurrency(row.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 className="mb-2 text-lg font-bold">■ 지급 내역</h2>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="border border-black bg-slate-100 p-2">Year</th>
            <th className="border border-black bg-slate-100 p-2">Month</th>
            <th className="border border-black bg-slate-100 p-2">금액</th>
            <th className="border border-black bg-slate-100 p-2">원천징수 세액</th>
            <th className="border border-black bg-slate-100 p-2">차인지급액</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="border border-black p-2 text-center">{payRecord.year}</td>
            <td className="border border-black p-2 text-center">{payRecord.month}</td>
            <td className="border border-black p-2 text-right">{toCurrency(payRecord.total_amount)}</td>
            <td className="border border-black p-2 text-right">{toCurrency(payRecord.withholding_tax)}</td>
            <td className="border border-black p-2 text-right">{toCurrency(payRecord.net_amount)}</td>
          </tr>
        </tbody>
      </table>

      <p className="mt-6 text-center text-base">위의 수익 금액을 영수합니다</p>
    </div>
  );
}

