'use client'

import { useEffect, useMemo, useState } from 'react'

type Row = Record<string, any>

type Payload = {
  document: Row
  items: Row[]
  destination: Row
  sales_order: Row | null
  sales_order_items: Row[]
}

const text = (value: unknown) => String(value ?? '').trim()
const num = (value: unknown) => {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function firstLine(value: unknown) {
  return text(value).split(/\r?\n/).map((line) => line.trim()).find(Boolean) || '-'
}

function formatAmount(value: unknown, currency: string) {
  const amount = num(value)
  if (currency === 'KRW') return Math.round(amount).toLocaleString('ko-KR')
  return amount.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function currencyLabel(currency: string) {
  if (currency === 'USD') return '미화'
  if (currency === 'THB') return '바트'
  if (currency === 'EUR') return '유로'
  return '원'
}

function monthDay(value: unknown) {
  const date = text(value)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return date || '-'
  return date.slice(5)
}

export default function ExportSalesStatementPrintView({ id, autoPrint = false }: { id: string; autoPrint?: boolean }) {
  const [payload, setPayload] = useState<Payload | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    fetch(`/api/moni/export-shipment?id=${encodeURIComponent(id)}&_=${Date.now()}`, { cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json()
        if (!response.ok || !data.ok) throw new Error(data.error || '거래명세표를 불러오지 못했습니다.')
        return data as Payload
      })
      .then((data) => {
        if (active) setPayload(data)
      })
      .catch((loadError) => {
        if (active) setError(loadError instanceof Error ? loadError.message : '거래명세표를 불러오지 못했습니다.')
      })
    return () => { active = false }
  }, [id])

  const currency = text(payload?.sales_order?.currency) || text(payload?.items?.[0]?.currency) || 'KRW'
  const statementNumber = text(payload?.sales_order?.statement_number)

  useEffect(() => {
    if (!payload?.sales_order || !statementNumber) return
    const previousTitle = document.title
    document.title = `${statementNumber}_거래명세표`

    if (autoPrint) {
      let cancelled = false
      const timer = window.setTimeout(() => {
        const printReady = () => {
          window.requestAnimationFrame(() => {
            window.requestAnimationFrame(() => {
              if (!cancelled) window.print()
            })
          })
        }
        if (document.fonts?.ready) void document.fonts.ready.then(printReady, printReady)
        else printReady()
      }, 450)

      return () => {
        cancelled = true
        window.clearTimeout(timer)
        document.title = previousTitle
      }
    }

    return () => { document.title = previousTitle }
  }, [autoPrint, payload, statementNumber])

  const totals = useMemo(() => {
    if (!payload) return { supply: 0, vat: 0, total: 0 }
    return {
      supply: num(payload.sales_order?.supply_amount),
      vat: 0,
      total: num(payload.sales_order?.total_amount),
    }
  }, [payload])

  if (error) return <main className="min-h-screen bg-white p-10 text-center text-red-600">{error}</main>
  if (!payload) return <main className="min-h-screen bg-white p-10 text-center text-slate-500">거래명세표를 불러오는 중입니다.</main>
  if (!payload.sales_order) return <main className="min-h-screen bg-white p-10 text-center text-red-600">출고확정된 판매 거래명세표가 아직 없습니다.</main>

  return <main className="statement-print-root min-h-screen bg-[#edf1f4] py-5 text-[#111827]">
    <div className="no-print mx-auto mb-3 flex w-[210mm] justify-end px-2">
      <button type="button" onClick={() => window.print()} className="rounded-lg bg-[#315d75] px-4 py-2 text-sm font-black text-white">PDF 저장 / 인쇄</button>
    </div>

    <section className="statement-print korean-statement-a4 mx-auto bg-white shadow-xl">
      <KoreanStatementCopy payload={payload} copyLabel="공급받는자 보관용" currency={currency} statementNumber={statementNumber} totals={totals} />
      <div className="cut-line" aria-hidden="true"><span>절 취 선</span></div>
      <KoreanStatementCopy payload={payload} copyLabel="공급자 보관용" currency={currency} statementNumber={statementNumber} totals={totals} />
    </section>

    <style jsx global>{`
      .korean-statement-a4,
      .korean-statement-a4 * {
        box-sizing: border-box;
      }

      .korean-statement-a4 {
        width: 210mm;
        height: 297mm;
        padding: 4mm 5mm;
        overflow: hidden;
        color: #111827;
        font-family: 'Pretendard', 'Malgun Gothic', '맑은 고딕', sans-serif;
      }

      .korean-statement-copy {
        display: grid;
        grid-template-rows: 18mm 33mm 10mm 55mm 17mm;
        row-gap: 1.5mm;
        width: 200mm;
        height: 139mm;
        overflow: hidden;
      }

      .copy-header {
        position: relative;
        display: grid;
        grid-template-columns: 42mm 1fr 42mm;
        align-items: start;
        height: 18mm;
      }

      .copy-brand {
        padding: 1mm 0 0 2mm;
        color: #f06d2f;
        font-size: 20px;
        line-height: 1;
        font-weight: 900;
        letter-spacing: -0.06em;
        white-space: nowrap;
      }

      .copy-title-wrap {
        text-align: center;
        color: #1736e8;
      }

      .copy-title {
        margin: 0;
        padding-top: 0.2mm;
        font-size: 22px;
        font-weight: 900;
        line-height: 1.05;
        letter-spacing: 0.4em;
        text-indent: 0.4em;
        white-space: nowrap;
      }

      .copy-title-line {
        width: 72mm;
        height: 1mm;
        margin: 1.2mm auto 0;
        border-top: 1px solid #2942ef;
        border-bottom: 1px solid #2942ef;
      }

      .copy-label {
        margin-top: 1mm;
        font-size: 8.5px;
        font-weight: 800;
        white-space: nowrap;
      }

      .party-zone {
        display: grid;
        grid-template-columns: minmax(0, 0.88fr) minmax(0, 1.12fr);
        column-gap: 2mm;
        width: 200mm;
        height: 33mm;
        min-width: 0;
      }

      .buyer-table,
      .supplier-table,
      .statement-lines {
        width: 100%;
        border-collapse: collapse;
        border-spacing: 0;
        table-layout: fixed;
      }

      .buyer-table {
        height: 33mm;
        font-size: 8px;
      }

      .buyer-table col:first-child { width: 18mm; }

      .buyer-table th,
      .buyer-table td {
        height: 5.5mm;
        padding: 0.35mm 1mm;
        vertical-align: middle;
      }

      .buyer-table th {
        color: #2942ef;
        font-weight: 900;
        text-align: left;
        letter-spacing: 0.06em;
        white-space: nowrap;
      }

      .buyer-table td {
        border-bottom: 1px solid #b9c6ff;
        color: #111827;
        font-weight: 700;
      }

      .buyer-table .single-line {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: clip;
      }

      .buyer-table .address-cell {
        font-size: 7.4px;
        line-height: 1.12;
        white-space: normal;
        overflow: hidden;
        overflow-wrap: normal;
        word-break: keep-all;
      }

      .supplier-table {
        height: 33mm;
        border: 1.25px solid #2942ef;
        font-size: 7.8px;
      }

      .supplier-table col.label-col { width: 15mm; }
      .supplier-table col.value-col-a { width: 34mm; }
      .supplier-table col.value-col-b { width: 38mm; }

      .supplier-table th,
      .supplier-table td {
        border: 1px solid #2942ef;
        padding: 0.35mm 0.8mm;
        line-height: 1.05;
        vertical-align: middle;
      }

      .supplier-table tr:first-child th,
      .supplier-table tr:first-child td { border-top: 1.25px solid #2942ef; }
      .supplier-table tr:last-child th,
      .supplier-table tr:last-child td { border-bottom: 1.25px solid #2942ef; }
      .supplier-table tr > *:first-child { border-left: 1.25px solid #2942ef; }
      .supplier-table tr > *:last-child { border-right: 1.25px solid #2942ef; }

      .supplier-table th {
        color: #2942ef;
        font-weight: 900;
        text-align: center;
        letter-spacing: 0.04em;
        white-space: nowrap;
      }

      .supplier-table td {
        font-weight: 750;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: clip;
      }

      .supplier-table .supplier-address {
        font-size: 7.2px;
        white-space: nowrap;
        letter-spacing: -0.02em;
      }

      .supplier-table .supplier-phone {
        font-size: 7.5px;
        white-space: nowrap;
      }

      .total-banner {
        display: grid;
        grid-template-columns: 31mm 1fr 13mm;
        width: 200mm;
        height: 10mm;
        border: 1.25px solid #2942ef;
      }

      .total-banner > * {
        display: flex;
        align-items: center;
        justify-content: center;
        min-width: 0;
      }

      .total-banner-label {
        border-right: 1px solid #2942ef;
        color: #2942ef;
        font-size: 13px;
        font-weight: 900;
        letter-spacing: 0.12em;
        white-space: nowrap;
      }

      .total-banner-amount {
        font-size: 22px;
        font-weight: 900;
        line-height: 1;
        white-space: nowrap;
      }

      .total-banner-currency {
        border-left: 1px solid #2942ef;
        color: #2942ef;
        font-size: 8.5px;
        font-weight: 900;
        white-space: nowrap;
      }

      .statement-lines {
        width: 200mm;
        height: 55mm;
        border: 1.25px solid #2942ef;
        font-size: 7.7px;
      }

      .statement-lines th,
      .statement-lines td {
        border: 1px solid #2942ef;
        padding: 0.35mm 0.7mm;
        line-height: 1.05;
        vertical-align: middle;
        overflow: hidden;
      }

      .statement-lines tr > *:first-child { border-left: 1.25px solid #2942ef; }
      .statement-lines tr > *:last-child { border-right: 1.25px solid #2942ef; }
      .statement-lines tbody tr:last-child td { border-bottom: 1.25px solid #2942ef; }

      .statement-lines thead th {
        height: 6mm;
        background: #cfe5ff;
        color: #2942ef;
        font-weight: 900;
        text-align: center;
        white-space: nowrap;
      }

      .statement-lines td {
        white-space: nowrap;
        text-overflow: clip;
      }

      .statement-lines .name-cell {
        padding-left: 1.2mm;
        font-size: 7.6px;
        font-weight: 700;
        text-align: left;
        white-space: nowrap;
      }

      .statement-lines .num-cell {
        padding-right: 1.2mm;
        text-align: right;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }

      .statement-lines .center-cell {
        text-align: center;
        white-space: nowrap;
      }

      .statement-footer {
        width: 200mm;
        height: 17mm;
        border: 1.25px solid #2942ef;
        font-size: 7.5px;
        overflow: hidden;
      }

      .footer-row {
        display: grid;
        width: 100%;
        height: 8.5mm;
      }

      .footer-row + .footer-row { border-top: 1px solid #2942ef; }
      .footer-row:first-child { grid-template-columns: 21mm 89mm 16mm 34mm 16mm 24mm; }
      .footer-row:last-child { grid-template-columns: 18mm 30mm 16mm 28mm 22mm 30mm 15mm 41mm; }

      .footer-cell {
        display: flex;
        align-items: center;
        justify-content: center;
        min-width: 0;
        height: 100%;
        border-right: 1px solid #2942ef;
        padding: 0.4mm 0.8mm;
        white-space: nowrap;
        overflow: hidden;
      }

      .footer-cell:last-child { border-right: 0; }
      .footer-label { background: #d8eaff; color: #2942ef; font-weight: 900; }
      .footer-value {
        justify-content: flex-end;
        padding-right: 1.2mm;
        font-weight: 800;
        font-variant-numeric: tabular-nums;
      }

      .cut-line {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 200mm;
        height: 11mm;
        color: #6f7b84;
        font-size: 7px;
        letter-spacing: 0.34em;
      }

      .cut-line::before,
      .cut-line::after {
        content: '';
        flex: 1;
        border-top: 1px dashed #8b969e;
      }

      .cut-line span { padding: 0 4mm; white-space: nowrap; }

      @media print {
        @page { size: A4 portrait; margin: 0; }

        html,
        body {
          width: 210mm !important;
          height: 297mm !important;
          margin: 0 !important;
          padding: 0 !important;
          background: #fff !important;
          overflow: hidden !important;
        }

        body .statement-print-root { visibility: visible !important; }
        body .statement-print-root > *:not(.korean-statement-a4) { display: none !important; }
        body .korean-statement-a4,
        body .korean-statement-a4 * { visibility: visible !important; }

        body .korean-statement-a4 {
          position: absolute !important;
          inset: 0 !important;
          width: 210mm !important;
          height: 297mm !important;
          margin: 0 !important;
          padding: 4mm 5mm !important;
          box-shadow: none !important;
          overflow: hidden !important;
          page-break-after: avoid !important;
          break-after: avoid-page !important;
        }
      }
    `}</style>
  </main>
}

function KoreanStatementCopy({
  payload,
  copyLabel,
  currency,
  statementNumber,
  totals,
}: {
  payload: Payload
  copyLabel: string
  currency: string
  statementNumber: string
  totals: { supply: number; vat: number; total: number }
}) {
  const seller = payload.document.exporter_snapshot || {}
  const buyer = payload.document.consignee_snapshot || payload.destination || {}
  const saleDate = text(payload.sales_order?.sale_date) || text(payload.document.document_date)
  const rowCount = Math.max(7, payload.items.length)
  const rows: Array<Row | null> = [
    ...payload.items,
    ...Array.from({ length: Math.max(0, rowCount - payload.items.length) }, () => null),
  ]
  const rowHeightMm = Math.max(4.8, 49 / rowCount)

  return <section className="korean-statement-copy">
    <header className="copy-header">
      <div className="copy-brand">두배</div>
      <div className="copy-title-wrap">
        <h1 className="copy-title">거래명세표</h1>
        <div className="copy-title-line" />
        <div className="copy-label">[{copyLabel}]</div>
      </div>
      <div />
    </header>

    <div className="party-zone">
      <table className="buyer-table">
        <colgroup><col /><col /></colgroup>
        <tbody>
          <tr><th>일자</th><td className="single-line">{saleDate || '-'}</td></tr>
          <tr><th>거래번호</th><td className="single-line">{statementNumber || '-'}</td></tr>
          <tr><th>거래처</th><td className="single-line">{text(buyer.company_name) || '-'}</td></tr>
          <tr><th>주소</th><td className="address-cell">{text(buyer.address) || '-'}</td></tr>
          <tr><th>전화번호</th><td className="single-line">{text(buyer.phone) || '-'}</td></tr>
          <tr><th>팩스번호</th><td className="single-line">-</td></tr>
        </tbody>
      </table>

      <table className="supplier-table">
        <colgroup>
          <col className="label-col" />
          <col className="value-col-a" />
          <col className="label-col" />
          <col className="value-col-b" />
        </colgroup>
        <tbody>
          <tr><th>등록번호</th><td colSpan={3}>{text(seller.business_registration_number) || '-'}</td></tr>
          <tr><th>상호</th><td>{text(seller.company_name_ko) || '두배'}</td><th>성명</th><td>{text(seller.representative_name_ko) || '-'}</td></tr>
          <tr><th>주소</th><td colSpan={3} className="supplier-address">{text(seller.address_ko) || '-'}</td></tr>
          <tr><th>업태</th><td>{firstLine(seller.business_type)}</td><th>종목</th><td>{firstLine(seller.business_items)}</td></tr>
          <tr><th>전화번호</th><td className="supplier-phone">{text(seller.company_phone) || '-'}</td><th>팩스번호</th><td>-</td></tr>
        </tbody>
      </table>
    </div>

    <div className="total-banner">
      <div className="total-banner-label">합계금액</div>
      <div className="total-banner-amount">{formatAmount(totals.total, currency)}</div>
      <div className="total-banner-currency">{currencyLabel(currency)}</div>
    </div>

    <table className="statement-lines">
      <colgroup>
        <col style={{ width: '14mm' }} />
        <col style={{ width: '50mm' }} />
        <col style={{ width: '26mm' }} />
        <col style={{ width: '16mm' }} />
        <col style={{ width: '24mm' }} />
        <col style={{ width: '28mm' }} />
        <col style={{ width: '20mm' }} />
        <col style={{ width: '22mm' }} />
      </colgroup>
      <thead>
        <tr><th>월일</th><th>품목</th><th>규격</th><th>수량</th><th>단가</th><th>공급가액</th><th>세액</th><th>비고</th></tr>
      </thead>
      <tbody>
        {rows.map((item, index) => {
          const cartons = item ? num(item.cartons) : 0
          const unitPrice = item ? num(item.unit_price) : 0
          const supply = cartons * unitPrice
          const unitsPerCarton = item ? Math.max(0, Math.trunc(num(item.units_per_carton))) : 0
          return <tr key={item ? text(item.id) || index : `blank-${index}`} style={{ height: `${rowHeightMm}mm` }}>
            <td className="center-cell">{item ? monthDay(saleDate) : ''}</td>
            <td className="name-cell">{item ? text(item.product_name_ko) || '수출제품' : ''}</td>
            <td className="center-cell">{item && unitsPerCarton ? `${unitsPerCarton}개/박스` : ''}</td>
            <td className="num-cell">{item ? cartons.toLocaleString('ko-KR') : ''}</td>
            <td className="num-cell">{item ? formatAmount(unitPrice, currency) : ''}</td>
            <td className="num-cell">{item ? formatAmount(supply, currency) : ''}</td>
            <td className="num-cell">{item ? '0' : ''}</td>
            <td className="center-cell">{item ? '수출' : ''}</td>
          </tr>
        })}
      </tbody>
    </table>

    <div className="statement-footer">
      <div className="footer-row">
        <div className="footer-cell footer-label">전미수잔액</div><div className="footer-cell footer-value">-</div>
        <div className="footer-cell footer-label">합계</div><div className="footer-cell footer-value">{formatAmount(totals.supply, currency)}</div>
        <div className="footer-cell footer-label">세액</div><div className="footer-cell footer-value">0</div>
      </div>
      <div className="footer-row">
        <div className="footer-cell footer-label">총합계</div><div className="footer-cell footer-value">{formatAmount(totals.total, currency)}</div>
        <div className="footer-cell footer-label">입금액</div><div className="footer-cell footer-value">0</div>
        <div className="footer-cell footer-label">총미수잔액</div><div className="footer-cell footer-value">{formatAmount(totals.total, currency)}</div>
        <div className="footer-cell footer-label">인수자</div><div className="footer-cell" />
      </div>
    </div>
  </section>
}
