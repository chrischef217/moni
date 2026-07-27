'use client'

import { useEffect, useMemo, useState } from 'react'

type Row = Record<string, any>

type Payload = {
  document: Row
  items: Row[]
  destination: Row
  sales_order: Row | null
  sales_order_items: Row[]
  company_profile?: Row | null
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

    Promise.all([
      fetch(`/api/moni/export-shipment?id=${encodeURIComponent(id)}&_=${Date.now()}`, { cache: 'no-store' }),
      fetch(`/api/moni/company-profile?_=${Date.now()}`, { cache: 'no-store' }),
    ])
      .then(async ([shipmentResponse, profileResponse]) => {
        const shipment = await shipmentResponse.json()
        if (!shipmentResponse.ok || !shipment.ok) throw new Error(shipment.error || '거래명세표를 불러오지 못했습니다.')

        const profilePayload = await profileResponse.json().catch(() => null)
        return {
          ...(shipment as Payload),
          company_profile: profileResponse.ok && profilePayload?.ok ? profilePayload.profile || null : null,
        } as Payload
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
  const invoiceNumber = text(payload?.document?.invoice_no)

  useEffect(() => {
    if (!payload?.sales_order) return
    const previousTitle = document.title
    document.title = `${invoiceNumber || '수출'}_거래명세표`

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
      }, 500)

      return () => {
        cancelled = true
        window.clearTimeout(timer)
        document.title = previousTitle
      }
    }

    return () => { document.title = previousTitle }
  }, [autoPrint, payload, invoiceNumber])

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
      <KoreanStatementCopy payload={payload} copyLabel="공급받는자 보관용" currency={currency} totals={totals} />
      <div className="cut-line" aria-hidden="true"><span>절 취 선</span></div>
      <KoreanStatementCopy payload={payload} copyLabel="공급자 보관용" currency={currency} totals={totals} />
    </section>

    <style jsx global>{`
      .korean-statement-a4,
      .korean-statement-a4 * { box-sizing: border-box; }

      .korean-statement-a4 {
        width: 210mm;
        height: 297mm;
        padding: 4mm 5mm;
        overflow: hidden;
        color: #152f42;
        font-family: 'Pretendard', 'Malgun Gothic', '맑은 고딕', sans-serif;
      }

      .korean-statement-copy {
        --statement-font: 9.4px;
        display: grid;
        grid-template-rows: 17mm 31mm 10mm 54mm 18mm;
        row-gap: 1.5mm;
        width: 200mm;
        height: 136mm;
        overflow: hidden;
        font-size: var(--statement-font);
        line-height: 1.12;
      }

      .copy-header {
        display: grid;
        grid-template-columns: 42mm 1fr 42mm;
        align-items: start;
        height: 17mm;
      }

      .copy-logo-box {
        display: flex;
        height: 14mm;
        align-items: center;
        justify-content: flex-start;
        padding-left: 2mm;
      }

      .copy-logo {
        display: block;
        max-width: 36mm;
        max-height: 10mm;
        object-fit: contain;
      }

      .copy-title-wrap { text-align: center; color: #1736e8; }
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
        margin: 1.1mm auto 0;
        border-top: 1px solid #2942ef;
        border-bottom: 1px solid #2942ef;
      }
      .copy-label {
        margin-top: 0.8mm;
        font-size: 8.5px;
        font-weight: 800;
        white-space: nowrap;
      }

      .party-zone {
        display: grid;
        grid-template-columns: 104mm 92mm;
        column-gap: 4mm;
        width: 200mm;
        height: 31mm;
        min-width: 0;
      }

      .buyer-table,
      .supplier-table,
      .statement-lines,
      .statement-footer-table {
        width: 100%;
        border-collapse: collapse;
        border-spacing: 0;
        table-layout: fixed;
        font-size: var(--statement-font);
      }

      .buyer-table { height: 31mm; }
      .buyer-table col:first-child { width: 18mm; }
      .buyer-table th,
      .buyer-table td {
        height: 5.6mm;
        padding: 0.35mm 1.2mm;
        vertical-align: middle;
        font-size: var(--statement-font);
      }
      .buyer-table tr.address-row th,
      .buyer-table tr.address-row td { height: 8.6mm; }
      .buyer-table th {
        color: #2942ef;
        font-weight: 900;
        text-align: left;
        white-space: nowrap;
      }
      .buyer-table td {
        border-bottom: 1px solid #c2cdfa;
        color: #152f42;
        font-weight: 800;
      }
      .buyer-table .single-line {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: clip;
      }
      .buyer-table .address-cell {
        white-space: normal;
        overflow: hidden;
        word-break: keep-all;
        overflow-wrap: anywhere;
        line-height: 1.15;
      }

      .supplier-table {
        height: 31mm;
        border: 1.25px solid #2942ef;
      }
      .supplier-table col.label-col { width: 14mm; }
      .supplier-table col.value-col-a { width: 31mm; }
      .supplier-table col.value-col-b { width: 33mm; }
      .supplier-table th,
      .supplier-table td {
        height: 6.2mm;
        border: 1px solid #2942ef;
        padding: 0.35mm 0.7mm;
        vertical-align: middle;
        text-align: center;
        font-size: var(--statement-font);
        line-height: 1.08;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: clip;
      }
      .supplier-table th { color: #2942ef; font-weight: 900; }
      .supplier-table td { color: #152f42; font-weight: 800; }
      .supplier-table tr:first-child > * { border-top: 1.25px solid #2942ef; }
      .supplier-table tr:last-child > * { border-bottom: 1.25px solid #2942ef; }
      .supplier-table tr > *:first-child { border-left: 1.25px solid #2942ef; }
      .supplier-table tr > *:last-child { border-right: 1.25px solid #2942ef; }
      .supplier-table .supplier-address { white-space: nowrap; }

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
        font-size: var(--statement-font);
        font-weight: 900;
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
        font-size: var(--statement-font);
        font-weight: 900;
        white-space: nowrap;
      }

      .statement-lines {
        width: 200mm;
        height: 54mm;
        border: 1.25px solid #2942ef;
      }
      .statement-lines th,
      .statement-lines td {
        border: 1px solid #2942ef;
        padding: 0.35mm 0.75mm;
        vertical-align: middle;
        overflow: hidden;
        font-size: var(--statement-font);
        line-height: 1.08;
        white-space: nowrap;
        text-overflow: clip;
      }
      .statement-lines thead th {
        height: 6mm;
        background: #cfe5ff;
        color: #2942ef;
        font-weight: 900;
        text-align: center;
      }
      .statement-lines tr > *:first-child { border-left: 1.25px solid #2942ef; }
      .statement-lines tr > *:last-child { border-right: 1.25px solid #2942ef; }
      .statement-lines tbody tr:last-child td { border-bottom: 1.25px solid #2942ef; }
      .statement-lines .name-cell {
        padding-left: 1.2mm;
        font-weight: 800;
        text-align: left;
      }
      .statement-lines .num-cell {
        padding-right: 1.2mm;
        text-align: right;
        font-variant-numeric: tabular-nums;
      }
      .statement-lines .center-cell { text-align: center; }

      .statement-footer-table {
        width: 200mm;
        height: 18mm;
        border: 1.25px solid #2942ef;
      }
      .statement-footer-table th,
      .statement-footer-table td {
        height: 9mm;
        border: 1px solid #2942ef;
        padding: 0.45mm 1mm;
        vertical-align: middle;
        font-size: var(--statement-font);
        line-height: 1.08;
        white-space: nowrap;
        overflow: hidden;
      }
      .statement-footer-table th {
        background: #d8eaff;
        color: #2942ef;
        font-weight: 900;
        text-align: center;
      }
      .statement-footer-table td {
        color: #152f42;
        font-weight: 800;
        text-align: right;
        padding-right: 1.2mm;
        font-variant-numeric: tabular-nums;
      }
      .statement-footer-table tr:first-child > * { border-top: 1.25px solid #2942ef; }
      .statement-footer-table tr:last-child > * { border-bottom: 1.25px solid #2942ef; }
      .statement-footer-table tr > *:first-child { border-left: 1.25px solid #2942ef; }
      .statement-footer-table tr > *:last-child { border-right: 1.25px solid #2942ef; }
      .statement-footer-table .receiver-cell { text-align: left; }

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
  totals,
}: {
  payload: Payload
  copyLabel: string
  currency: string
  totals: { supply: number; vat: number; total: number }
}) {
  const seller = payload.company_profile || payload.document.exporter_snapshot || {}
  const buyer = payload.document.consignee_snapshot || payload.destination || {}
  const saleDate = text(payload.sales_order?.sale_date) || text(payload.document.document_date)
  const rowCount = Math.max(7, payload.items.length)
  const rows: Array<Row | null> = [
    ...payload.items,
    ...Array.from({ length: Math.max(0, rowCount - payload.items.length) }, () => null),
  ]
  const rowHeightMm = Math.max(6.2, 48 / rowCount)
  const logoDataUrl = text(seller.logo_data_url)

  return <section className="korean-statement-copy">
    <header className="copy-header">
      <div className="copy-logo-box">{logoDataUrl ? <img src={logoDataUrl} alt="회사 로고" className="copy-logo" /> : null}</div>
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
          <tr><th>거래처</th><td className="single-line">{text(buyer.company_name) || '-'}</td></tr>
          <tr className="address-row"><th>주소</th><td className="address-cell">{text(buyer.address) || '-'}</td></tr>
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
          <tr><th>상호</th><td>{text(seller.company_name_ko) || '-'}</td><th>성명</th><td>{text(seller.representative_name_ko) || '-'}</td></tr>
          <tr><th>주소</th><td colSpan={3} className="supplier-address">{text(seller.address_ko) || '-'}</td></tr>
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
        <col style={{ width: '13mm' }} />
        <col style={{ width: '60mm' }} />
        <col style={{ width: '26mm' }} />
        <col style={{ width: '12mm' }} />
        <col style={{ width: '25mm' }} />
        <col style={{ width: '29mm' }} />
        <col style={{ width: '17mm' }} />
        <col style={{ width: '18mm' }} />
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

    <table className="statement-footer-table">
      <colgroup>
        <col style={{ width: '18mm' }} /><col style={{ width: '30mm' }} />
        <col style={{ width: '16mm' }} /><col style={{ width: '28mm' }} />
        <col style={{ width: '22mm' }} /><col style={{ width: '30mm' }} />
        <col style={{ width: '16mm' }} /><col style={{ width: '40mm' }} />
      </colgroup>
      <tbody>
        <tr>
          <th>전미수잔액</th><td colSpan={3}>-</td><th>합계</th><td>{formatAmount(totals.supply, currency)}</td><th>세액</th><td>0</td>
        </tr>
        <tr>
          <th>총합계</th><td>{formatAmount(totals.total, currency)}</td><th>입금액</th><td>0</td><th>총미수잔액</th><td>{formatAmount(totals.total, currency)}</td><th>인수자</th><td className="receiver-cell" />
        </tr>
      </tbody>
    </table>
  </section>
}
