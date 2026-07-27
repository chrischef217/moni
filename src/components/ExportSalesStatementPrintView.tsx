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
        if (!active) return
        setPayload(data)
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
      }, 420)
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

  return <main className="statement-print-root min-h-screen bg-[#e9eef2] py-6 text-[#111827]">
    <div className="no-print mx-auto mb-4 flex w-[210mm] justify-end px-2">
      <button type="button" onClick={() => window.print()} className="rounded-lg bg-[#315d75] px-4 py-2 text-sm font-black text-white">PDF 저장 / 인쇄</button>
    </div>

    <section className="statement-print korean-statement-a4 mx-auto bg-white shadow-xl">
      <KoreanStatementCopy payload={payload} copyLabel="공급받는자 보관용" currency={currency} statementNumber={statementNumber} totals={totals} />
      <div className="cut-line" aria-hidden="true"><span>절 취 선</span></div>
      <KoreanStatementCopy payload={payload} copyLabel="공급자 보관용" currency={currency} statementNumber={statementNumber} totals={totals} />
    </section>

    <style jsx global>{`
      .korean-statement-a4 {
        box-sizing: border-box;
        width: 210mm;
        height: 297mm;
        padding: 5mm 6mm;
        overflow: hidden;
        color: #111827;
        font-family: 'Pretendard', 'Malgun Gothic', '맑은 고딕', sans-serif;
      }
      .korean-statement-copy {
        height: 139mm;
        overflow: hidden;
      }
      .statement-blue { color: #1d34e8; }
      .statement-border { border-color: #2942ef !important; }
      .copy-header {
        display: grid;
        grid-template-columns: 42mm 1fr 42mm;
        align-items: start;
        height: 23mm;
      }
      .copy-brand {
        padding: 1mm 0 0 3mm;
        color: #f06d2f;
        font-size: 27px;
        font-weight: 900;
        letter-spacing: -0.06em;
      }
      .copy-title-wrap { text-align: center; color: #102ff0; }
      .copy-title {
        margin: 0;
        padding-top: 0.5mm;
        font-size: 24px;
        font-weight: 900;
        letter-spacing: 0.48em;
        text-indent: 0.48em;
        line-height: 1.15;
      }
      .copy-title-line {
        width: 74mm;
        margin: 1.8mm auto 0;
        border-top: 1.2px solid #2942ef;
        border-bottom: 1.2px solid #2942ef;
        height: 1.2mm;
      }
      .copy-label {
        margin-top: 1.5mm;
        font-size: 10px;
        font-weight: 800;
      }
      .party-zone {
        display: grid;
        grid-template-columns: 48% 52%;
        gap: 3mm;
        height: 40mm;
      }
      .buyer-box {
        display: grid;
        grid-template-columns: 16mm 1fr;
        grid-auto-rows: minmax(5.5mm, auto);
        align-content: start;
        padding: 0 0.8mm;
        color: #2942ef;
        font-size: 9px;
      }
      .buyer-label {
        font-weight: 900;
        letter-spacing: 0.08em;
        padding-top: 1mm;
      }
      .buyer-value {
        min-width: 0;
        border-bottom: 1px solid #c9d1ff;
        padding: 0.8mm 1mm 0.6mm;
        color: #111827;
        font-weight: 700;
        overflow-wrap: anywhere;
      }
      .supplier-table {
        width: 100%;
        height: 37mm;
        border-collapse: collapse;
        table-layout: fixed;
        border: 1.4px solid #2942ef;
        font-size: 8.5px;
      }
      .supplier-table th,
      .supplier-table td {
        border: 1px solid #2942ef;
        padding: 0.7mm 1mm;
        line-height: 1.15;
        vertical-align: middle;
      }
      .supplier-table th {
        width: 16mm;
        color: #2942ef;
        font-weight: 900;
        text-align: center;
        letter-spacing: 0.08em;
      }
      .supplier-table td { font-weight: 700; overflow-wrap: anywhere; }
      .total-banner {
        display: grid;
        grid-template-columns: 31mm 1fr 15mm;
        height: 11mm;
        border: 1.4px solid #2942ef;
        color: #111827;
      }
      .total-banner > * {
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .total-banner-label {
        border-right: 1px solid #2942ef;
        color: #2942ef;
        font-size: 14px;
        font-weight: 900;
        letter-spacing: 0.12em;
      }
      .total-banner-amount { font-size: 22px; font-weight: 900; letter-spacing: -0.03em; }
      .total-banner-currency { border-left: 1px solid #2942ef; color: #2942ef; font-size: 9px; font-weight: 900; }
      .statement-lines {
        width: 100%;
        height: 48mm;
        margin-top: 1mm;
        border-collapse: collapse;
        table-layout: fixed;
        border: 1.4px solid #2942ef;
        font-size: 8px;
      }
      .statement-lines th,
      .statement-lines td {
        border: 1px solid #2942ef;
        padding: 0.5mm 0.8mm;
        line-height: 1.1;
        overflow: hidden;
      }
      .statement-lines thead th {
        height: 6mm;
        background: #cfe5ff;
        color: #2942ef;
        font-weight: 900;
        text-align: center;
      }
      .statement-lines td { white-space: nowrap; text-overflow: ellipsis; }
      .statement-lines .name-cell { white-space: normal; line-height: 1.05; }
      .statement-lines .num-cell { text-align: right; }
      .statement-lines .center-cell { text-align: center; }
      .statement-footer {
        height: 15mm;
        border: 1.4px solid #2942ef;
        border-top: 0;
        color: #111827;
        font-size: 8.5px;
      }
      .footer-row {
        display: grid;
        min-height: 7.5mm;
      }
      .footer-row:first-child { grid-template-columns: 24mm 1fr 19mm 34mm 21mm 34mm; }
      .footer-row:last-child { grid-template-columns: 22mm 32mm 22mm 32mm 24mm 32mm 18mm 1fr; border-top: 1px solid #2942ef; }
      .footer-cell {
        display: flex;
        align-items: center;
        justify-content: center;
        border-right: 1px solid #2942ef;
        padding: 0.5mm 1mm;
        min-width: 0;
      }
      .footer-cell:last-child { border-right: 0; }
      .footer-label { background: #d8eaff; color: #2942ef; font-weight: 900; }
      .footer-value { justify-content: flex-end; font-weight: 800; }
      .cut-line {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        height: 9mm;
        color: #76838d;
        font-size: 7px;
        letter-spacing: 0.38em;
      }
      .cut-line::before,
      .cut-line::after {
        content: '';
        flex: 1;
        border-top: 1px dashed #8c98a1;
      }
      .cut-line span { padding: 0 4mm; }
      @media print {
        @page { size: A4 portrait; margin: 0; }
        html, body {
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
          padding: 5mm 6mm !important;
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
  const rowHeightMm = Math.max(4.1, 42 / rowCount)

  return <section className="korean-statement-copy">
    <header className="copy-header">
      <div className="copy-brand">doobae</div>
      <div className="copy-title-wrap">
        <h1 className="copy-title">거래명세표</h1>
        <div className="copy-title-line" />
        <div className="copy-label">[{copyLabel}]</div>
      </div>
      <div />
    </header>

    <div className="party-zone">
      <div className="buyer-box">
        <div className="buyer-label">일자</div><div className="buyer-value">{saleDate || '-'}</div>
        <div className="buyer-label">거래번호</div><div className="buyer-value">{statementNumber || '-'}</div>
        <div className="buyer-label">거래처</div><div className="buyer-value">{text(buyer.company_name) || '-'}</div>
        <div className="buyer-label">주소</div><div className="buyer-value">{text(buyer.address) || '-'}</div>
        <div className="buyer-label">전화번호</div><div className="buyer-value">{text(buyer.phone) || '-'}</div>
        <div className="buyer-label">팩스번호</div><div className="buyer-value">-</div>
      </div>

      <table className="supplier-table">
        <tbody>
          <tr><th>등록번호</th><td colSpan={3}>{text(seller.business_registration_number) || '-'}</td></tr>
          <tr><th>상호</th><td>{text(seller.company_name_ko) || '두배'}</td><th>성명</th><td>{text(seller.representative_name_ko) || '-'}</td></tr>
          <tr><th>주소</th><td colSpan={3}>{text(seller.address_ko) || '-'}</td></tr>
          <tr><th>업태</th><td>{firstLine(seller.business_type)}</td><th>종목</th><td>{firstLine(seller.business_items)}</td></tr>
          <tr><th>전화번호</th><td>{text(seller.company_phone) || '-'}</td><th>팩스번호</th><td>-</td></tr>
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
        <col style={{ width: '12mm' }} /><col /><col style={{ width: '28mm' }} /><col style={{ width: '18mm' }} />
        <col style={{ width: '24mm' }} /><col style={{ width: '28mm' }} /><col style={{ width: '22mm' }} /><col style={{ width: '22mm' }} />
      </colgroup>
      <thead><tr><th>월일</th><th>품목</th><th>규격</th><th>수량</th><th>단가</th><th>공급가액</th><th>세액</th><th>비고</th></tr></thead>
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
