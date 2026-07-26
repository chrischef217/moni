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

function money(value: unknown, currency: string) {
  const amount = num(value)
  if (currency === 'KRW') return `${currency} ${Math.round(amount).toLocaleString('ko-KR')}`
  return `${currency} ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
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
    document.title = `${statementNumber}_TRANSACTION_STATEMENT`
    if (autoPrint) {
      const timer = window.setTimeout(() => window.print(), 260)
      return () => { window.clearTimeout(timer); document.title = previousTitle }
    }
    return () => { document.title = previousTitle }
  }, [autoPrint, payload, statementNumber])

  const totals = useMemo(() => {
    if (!payload) return { supply: 0, vat: 0, total: 0 }
    return {
      supply: num(payload.sales_order?.supply_amount),
      vat: num(payload.sales_order?.vat_amount),
      total: num(payload.sales_order?.total_amount),
    }
  }, [payload])

  if (error) return <main className="min-h-screen bg-white p-10 text-center text-red-600">{error}</main>
  if (!payload) return <main className="min-h-screen bg-white p-10 text-center text-slate-500">거래명세표를 불러오는 중입니다.</main>
  if (!payload.sales_order) return <main className="min-h-screen bg-white p-10 text-center text-red-600">출고확정된 판매 거래명세표가 아직 없습니다.</main>

  const seller = payload.document.exporter_snapshot || {}
  const buyer = payload.document.consignee_snapshot || payload.destination || {}

  return <main className="statement-print-root min-h-screen bg-[#eef3f6] py-8 text-[#111827]">
    <div className="print-toolbar mx-auto mb-4 flex w-[210mm] justify-end gap-2 px-2">
      <button type="button" onClick={() => window.print()} className="rounded-lg bg-[#315d75] px-4 py-2 text-sm font-black text-white">PDF 저장 / 인쇄</button>
    </div>

    <section className="transaction-statement-paper mx-auto box-border min-h-[297mm] w-[210mm] bg-white px-[12mm] py-[11mm] shadow-xl">
      <header className="border-b-2 border-[#172b3a] pb-4 text-center">
        <h1 className="text-[24px] font-black tracking-[0.08em]">거래명세표</h1>
        <p className="mt-1 text-[12px] font-bold tracking-[0.12em] text-[#526776]">TRANSACTION STATEMENT</p>
      </header>

      <div className="mt-5 grid grid-cols-2 gap-4 text-[11px] leading-[1.55]">
        <div className="border border-[#98aab6]">
          <div className="bg-[#edf3f6] px-3 py-2 font-black">SUPPLIER / 공급자</div>
          <div className="space-y-1 px-3 py-3">
            <p className="font-black">{text(seller.company_name_en) || text(seller.company_name_ko) || 'DOOBAE'}</p>
            <p>{text(seller.address_en) || text(seller.address_ko)}</p>
            <p>Business No. {text(seller.business_registration_number) || '-'}</p>
            <p>Tel. {text(seller.company_phone) || '-'}</p>
          </div>
        </div>
        <div className="border border-[#98aab6]">
          <div className="bg-[#edf3f6] px-3 py-2 font-black">CUSTOMER / 거래처</div>
          <div className="space-y-1 px-3 py-3">
            <p className="font-black">{text(buyer.company_name)}</p>
            <p>{text(buyer.address)}</p>
            <p>{[text(buyer.country), text(buyer.zip_code)].filter(Boolean).join(' / ')}</p>
            <p>Contact. {text(buyer.contact_name)} · {text(buyer.phone)}</p>
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-4 border border-[#98aab6] text-[10.5px]">
        <Info label="거래명세표 No." value={statementNumber} />
        <Info label="Sale Date" value={text(payload.sales_order.sale_date)} />
        <Info label="Invoice No." value={text(payload.document.invoice_no)} />
        <Info label="Currency" value={currency} />
      </div>

      <table className="mt-5 w-full border-collapse text-[10.5px]">
        <thead>
          <tr className="bg-[#edf3f6]">
            <Th>No.</Th><Th>DESCRIPTION</Th><Th>HS CODE</Th><Th>QTY</Th><Th>UNIT</Th><Th>UNIT PRICE</Th><Th>AMOUNT</Th>
          </tr>
        </thead>
        <tbody>
          {payload.items.map((item, index) => <tr key={text(item.id) || index}>
            <Td center>{index + 1}</Td>
            <Td><strong>{text(item.product_name_en) || text(item.product_name_ko)}</strong><br /><span className="text-[9px] text-[#607585]">{text(item.product_name_ko)}</span></Td>
            <Td center>{text(item.hs_code) || '-'}</Td>
            <Td right>{num(item.cartons).toLocaleString('en-US')}</Td>
            <Td center>CTN</Td>
            <Td right>{money(item.unit_price, text(item.currency) || currency)}</Td>
            <Td right>{money(num(item.cartons) * num(item.unit_price), text(item.currency) || currency)}</Td>
          </tr>)}
        </tbody>
      </table>

      <div className="ml-auto mt-4 w-[86mm] border border-[#98aab6] text-[11px]">
        <Total label="Supply Amount / 공급가액" value={money(totals.supply, currency)} />
        <Total label="VAT" value={`${money(totals.vat, currency)}  (0% · EXPORT)`} />
        <Total label="TOTAL" value={money(totals.total, currency)} strong />
      </div>

      <div className="mt-5 border border-[#98aab6] px-3 py-3 text-[10px] leading-[1.55]">
        <p><strong>Reference:</strong> {text(payload.document.invoice_no)} / {text(payload.document.packing_list_no)}</p>
        <p><strong>Tax:</strong> Export transaction · VAT 0%</p>
        <p><strong>Note:</strong> This statement was automatically generated when the export shipment was confirmed.</p>
      </div>

      <div className="statement-sign mt-8 flex justify-between gap-6 text-[10px]">
        <div className="w-[45%] border-t border-[#6f8492] pt-2">Customer Confirmation</div>
        <div className="w-[45%] border-t border-[#6f8492] pt-2 text-right">Supplier Confirmation · {text(seller.representative_name_en) || text(seller.representative_name_ko)}</div>
      </div>
    </section>

    <style jsx global>{`
      @media print {
        @page { size: A4 portrait; margin: 0; }
        html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
        body * { visibility: hidden !important; }
        body .transaction-statement-paper,
        body .transaction-statement-paper * { visibility: visible !important; }
        body .transaction-statement-paper {
          position: absolute !important;
          left: 0 !important;
          top: 0 !important;
          width: 210mm !important;
          min-height: 297mm !important;
          margin: 0 !important;
          padding: 9mm 10mm !important;
          box-shadow: none !important;
          overflow: hidden !important;
        }
        body .print-toolbar { display: none !important; }
        body .statement-sign { break-inside: avoid !important; page-break-inside: avoid !important; }
      }
    `}</style>
  </main>
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="min-h-[14mm] border-r border-[#98aab6] px-2.5 py-2 last:border-r-0"><p className="text-[9px] font-bold text-[#607585]">{label}</p><p className="mt-1 font-black">{value || '-'}</p></div>
}
function Th({ children }: { children: React.ReactNode }) { return <th className="border border-[#98aab6] px-2 py-2 text-center font-black">{children}</th> }
function Td({ children, center = false, right = false }: { children: React.ReactNode; center?: boolean; right?: boolean }) { return <td className={`border border-[#98aab6] px-2 py-2 ${center ? 'text-center' : ''} ${right ? 'text-right' : ''}`}>{children}</td> }
function Total({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) { return <div className={`grid grid-cols-[1fr_auto] gap-4 border-b border-[#98aab6] px-3 py-2 last:border-b-0 ${strong ? 'font-black' : ''}`}><span>{label}</span><span>{value}</span></div> }
