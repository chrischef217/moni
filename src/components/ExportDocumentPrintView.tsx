'use client'

import { useEffect, useMemo, useState } from 'react'

type PrintType = 'invoice' | 'packing' | 'both'

type Item = {
  id: string
  product_name_ko: string
  product_name_en: string
  hs_code: string
  cartons: number
  units_per_carton: number
  unit_price: number | string
  currency: string
  net_weight_per_carton_kg: number | string
  gross_weight_per_carton_kg: number | string
  cbm_per_carton: number | string
}

type DocumentData = {
  id: string
  invoice_no: string
  packing_list_no: string
  document_date: string
  exporter_snapshot: Record<string, any>
  consignee_snapshot: Record<string, any>
  bill_to: string
  port_of_loading: string
  final_destination: string
  vessel_flight: string
  sailing_date: string | null
  notify_party: string
  lc_enabled: boolean
  lc_no: string
  lc_date: string | null
  lc_issuing_bank: string
  terms_delivery_payment: string
  other_reference: string
  incoterm: string
  country_of_origin: string
  reason_for_export: string
  export_document_items: Item[]
}

function money(value: number, currency: string) {
  const normalized = currency || 'KRW'
  const digits = normalized === 'KRW' ? 0 : 2
  return `${normalized} ${new Intl.NumberFormat(normalized === 'KRW' ? 'ko-KR' : 'en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value)}`
}

function number(value: number, digits = 3) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: digits }).format(value)
}

function formatDate(value?: string | null) {
  if (!value) return ''
  const [year, month, day] = value.slice(0, 10).split('-')
  return `${day}.${month}.${year}`
}

function PartyBlock({ title, party }: { title: string; party: Record<string, any> }) {
  return <div className="party"><b>{title}</b><strong>{party.company_name || '-'}</strong><span>{party.address || '-'}</span><span>{[party.zip_code, party.country].filter(Boolean).join(', ')}</span><span>{party.contact_name ? `Attn: ${party.contact_name}` : ''}</span><span>{party.phone ? `Tel: ${party.phone}` : ''}</span></div>
}

function ExporterBlock({ profile }: { profile: Record<string, any> }) {
  const company = profile.company_name_en || 'DOOBAE'
  const address = profile.address_en || ''
  return <div className="exporter"><strong>{company}</strong><span>{address}</span><span>{profile.company_email || ''}{profile.company_phone ? ` · ${profile.company_phone}` : ''}</span><span>{profile.business_registration_number ? `Business Registration No. ${profile.business_registration_number}` : ''}</span></div>
}

function Signature({ profile }: { profile: Record<string, any> }) {
  return <div className="signature"><div className="signature-line">Authorized Signature</div>{profile.signature_data_url ? <img src={profile.signature_data_url} alt="Authorized signature" /> : <div className="signature-placeholder" />}<b>{profile.representative_name_en || ''}</b><span>{profile.company_name_en || ''}</span></div>
}

export default function ExportDocumentPrintView({ id, type, autoPrint }: { id: string; type: PrintType; autoPrint: boolean }) {
  const [document, setDocument] = useState<DocumentData | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    fetch(`/api/moni/export-documents?id=${encodeURIComponent(id)}&_=${Date.now()}`, { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json()
        if (!response.ok || !payload.ok || !payload.document) throw new Error(payload.error || '수출서류를 불러오지 못했습니다.')
        if (active) setDocument(payload.document)
      })
      .catch((loadError) => { if (active) setError(loadError instanceof Error ? loadError.message : '수출서류를 불러오지 못했습니다.') })
    return () => { active = false }
  }, [id])

  useEffect(() => {
    if (!document || !autoPrint) return
    const timer = window.setTimeout(() => window.print(), 500)
    return () => window.clearTimeout(timer)
  }, [autoPrint, document])

  const totals = useMemo(() => {
    if (!document) return null
    const result = { cartons: 0, pieces: 0, netKg: 0, grossKg: 0, cbm: 0, amounts: new Map<string, number>() }
    for (const item of document.export_document_items) {
      const cartons = Number(item.cartons || 0)
      result.cartons += cartons
      result.pieces += cartons * Number(item.units_per_carton || 0)
      result.netKg += cartons * Number(item.net_weight_per_carton_kg || 0)
      result.grossKg += cartons * Number(item.gross_weight_per_carton_kg || 0)
      result.cbm += cartons * Number(item.cbm_per_carton || 0)
      result.amounts.set(item.currency, (result.amounts.get(item.currency) || 0) + cartons * Number(item.unit_price || 0))
    }
    return result
  }, [document])

  if (error) return <main className="p-8 text-red-700">{error}</main>
  if (!document || !totals) return <main className="p-8 text-slate-600">문서를 준비하는 중입니다.</main>

  const profile = document.exporter_snapshot || {}
  const consignee = document.consignee_snapshot || {}
  const showInvoice = type === 'invoice' || type === 'both'
  const showPacking = type === 'packing' || type === 'both'

  return <>
    <div className="print-toolbar"><button type="button" onClick={() => window.print()}>PDF 저장 / 인쇄</button><button type="button" onClick={() => window.close()}>닫기</button></div>

    {showInvoice && <article className="paper invoice-paper">
      <header className="doc-header"><div><h1>COMMERCIAL INVOICE</h1><ExporterBlock profile={profile} /></div><div className="doc-meta"><div><b>Invoice No.</b><span>{document.invoice_no}</span></div><div><b>Date</b><span>{formatDate(document.document_date)}</span></div></div></header>
      <div className="party-grid"><PartyBlock title="CONSIGNEE" party={consignee} /><div className="party"><b>BILL TO</b><strong>{document.bill_to || 'SAME AS CONSIGNEE'}</strong></div></div>
      <section className="info-grid"><div><b>Port of Loading</b><span>{document.port_of_loading || '-'}</span></div><div><b>Final Destination</b><span>{document.final_destination || '-'}</span></div><div><b>Vessel / Flight</b><span>{document.vessel_flight || '-'}</span></div><div><b>Sailing Date</b><span>{formatDate(document.sailing_date) || '-'}</span></div><div className="wide"><b>Notify Party</b><span>{document.notify_party || '-'}</span></div></section>
      {document.lc_enabled && <section className="info-grid lc"><div><b>L/C No.</b><span>{document.lc_no || '-'}</span></div><div><b>L/C Date</b><span>{formatDate(document.lc_date) || '-'}</span></div><div className="wide"><b>L/C Issuing Bank</b><span>{document.lc_issuing_bank || '-'}</span></div><div><b>Terms of Delivery and Payment</b><span>{document.terms_delivery_payment || '-'}</span></div><div><b>Other Reference</b><span>{document.other_reference || '-'}</span></div></section>}

      <table className="doc-table invoice-table"><thead><tr><th>No.</th><th>Description of Goods</th><th>HS Code</th><th>Qty</th><th>EA/CTN</th><th>Unit Price/CTN</th><th>Amount</th></tr></thead><tbody>{document.export_document_items.map((item, index) => <tr key={item.id}><td>{index + 1}</td><td className="left"><b>{item.product_name_en}</b></td><td className="hs-code">{item.hs_code || '2103.90-9090'}</td><td>{item.cartons} CTN</td><td>{item.units_per_carton}</td><td>{money(Number(item.unit_price), item.currency)}</td><td>{money(Number(item.cartons) * Number(item.unit_price), item.currency)}</td></tr>)}</tbody></table>

      <div className="totals invoice-totals"><div><b>TOTAL CARTONS</b><span>{totals.cartons} CTN</span></div><div><b>TOTAL PIECES</b><span>{totals.pieces} EA</span></div>{[...totals.amounts.entries()].map(([currency, amount]) => <div key={currency}><b>TOTAL AMOUNT</b><span>{money(amount, currency)}</span></div>)}</div>
      <section className="footer-info"><div><b>INCOTERMS® 2020</b><span>{document.incoterm || '-'}</span></div><div><b>COUNTRY OF ORIGIN</b><span>{document.country_of_origin}</span></div><div className="wide"><b>REASON FOR EXPORT</b><span>{document.reason_for_export}</span></div></section>
      <Signature profile={profile} />
    </article>}

    {showPacking && <article className={`paper packing-paper ${showInvoice ? 'page-break' : ''}`}>
      <header className="doc-header"><div><h1>PACKING LIST</h1><ExporterBlock profile={profile} /></div><div className="doc-meta"><div><b>Packing List No.</b><span>{document.packing_list_no}</span></div><div><b>Invoice No.</b><span>{document.invoice_no}</span></div><div><b>Date</b><span>{formatDate(document.document_date)}</span></div></div></header>
      <PartyBlock title="CONSIGNEE" party={consignee} />
      <section className="info-grid"><div><b>Port of Loading</b><span>{document.port_of_loading || '-'}</span></div><div><b>Final Destination</b><span>{document.final_destination || '-'}</span></div><div><b>Vessel / Flight</b><span>{document.vessel_flight || '-'}</span></div><div><b>Sailing Date</b><span>{formatDate(document.sailing_date) || '-'}</span></div><div className="wide"><b>Notify Party</b><span>{document.notify_party || '-'}</span></div></section>

      <table className="doc-table packing-table"><thead><tr><th>No.</th><th>Description</th><th>HS Code</th><th>CTN</th><th>EA/CTN</th><th>Total EA</th><th>Net Wt.</th><th>Gross Wt.</th><th>CBM</th></tr></thead><tbody>{document.export_document_items.map((item, index) => { const cartons = Number(item.cartons); return <tr key={item.id}><td>{index + 1}</td><td className="left"><b>{item.product_name_en}</b></td><td className="hs-code">{item.hs_code || '2103.90-9090'}</td><td>{cartons}</td><td>{item.units_per_carton}</td><td>{cartons * Number(item.units_per_carton)}</td><td>{number(cartons * Number(item.net_weight_per_carton_kg))} kg</td><td>{number(cartons * Number(item.gross_weight_per_carton_kg))} kg</td><td>{number(cartons * Number(item.cbm_per_carton), 6)}</td></tr> })}</tbody></table>

      <div className="totals packing-totals"><div><b>TOTAL CARTONS</b><span>{totals.cartons} CTN</span></div><div><b>TOTAL QUANTITY</b><span>{totals.pieces} EA</span></div><div><b>TOTAL NET WEIGHT</b><span>{number(totals.netKg)} KG</span></div><div><b>TOTAL GROSS WEIGHT</b><span>{number(totals.grossKg)} KG</span></div><div><b>TOTAL CBM</b><span>{number(totals.cbm, 6)} CBM</span></div></div>
      <section className="footer-info"><div><b>COUNTRY OF ORIGIN</b><span>{document.country_of_origin}</span></div></section>
      <Signature profile={profile} />
    </article>}

    <style jsx global>{`
      html, body { background: #eef3f6 !important; color: #111 !important; }
      body { margin: 0; font-family: Arial, Helvetica, sans-serif; }
      .print-toolbar { position: sticky; top: 0; z-index: 10; display: flex; justify-content: center; gap: 8px; padding: 12px; background: rgba(15, 30, 44, .92); }
      .print-toolbar button { border: 0; border-radius: 8px; padding: 10px 18px; background: white; font-weight: 800; cursor: pointer; }
      .paper { box-sizing: border-box; width: 210mm; min-height: 297mm; margin: 18px auto; padding: 12mm 13mm; background: white; box-shadow: 0 10px 30px rgba(20, 42, 57, .14); font-size: 10.2px; line-height: 1.35; }
      .doc-header { display: grid; grid-template-columns: 1fr 68mm; gap: 10mm; padding-bottom: 5mm; border-bottom: 2px solid #111; }
      .doc-header h1 { margin: 0 0 5mm; font-size: 25px; letter-spacing: .04em; }
      .exporter { display: flex; flex-direction: column; gap: 1.5mm; }
      .exporter strong { font-size: 13px; }
      .doc-meta { display: flex; flex-direction: column; gap: 2mm; }
      .doc-meta > div { display: grid; grid-template-columns: 30mm 1fr; border-bottom: 1px solid #bbb; padding: 1.5mm 0; }
      .doc-meta span { text-align: right; font-weight: 700; }
      .party-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 7mm; margin-top: 5mm; }
      .party { display: flex; min-height: 29mm; flex-direction: column; gap: 1.4mm; padding: 3mm; border: 1px solid #bbb; }
      .party > b { font-size: 9px; letter-spacing: .08em; }
      .party strong { font-size: 12px; }
      .info-grid { display: grid; grid-template-columns: 1fr 1fr; margin-top: 5mm; border: 1px solid #bbb; border-bottom: 0; }
      .info-grid > div { display: grid; grid-template-columns: 35mm 1fr; min-height: 8mm; align-items: center; padding: 1.8mm 2.5mm; border-bottom: 1px solid #bbb; }
      .info-grid > div:nth-child(odd):not(.wide) { border-right: 1px solid #bbb; }
      .info-grid .wide { grid-column: 1 / -1; }
      .info-grid b { font-size: 9.5px; }
      .lc { margin-top: 3mm; }
      .doc-table { width: 100%; margin-top: 5mm; border-collapse: collapse; table-layout: fixed; font-size: 9px; }
      .doc-table th, .doc-table td { border: 1px solid #999; padding: 1.8mm 1mm; text-align: center; vertical-align: middle; overflow-wrap: anywhere; }
      .doc-table th { background: #f1f3f4; font-size: 8.5px; line-height: 1.15; }
      .doc-table .left { text-align: left; }
      .doc-table .left b, .doc-table .left small { display: block; }
      .doc-table .left small { margin-top: 1mm; color: #555; }
      .doc-table .hs-code { white-space: nowrap; font-weight: 700; font-size: 8.7px; }
      .invoice-table th:nth-child(1) { width: 5%; }
      .invoice-table th:nth-child(2) { width: 27%; }
      .invoice-table th:nth-child(3) { width: 14%; }
      .invoice-table th:nth-child(4) { width: 10%; }
      .invoice-table th:nth-child(5) { width: 8%; }
      .invoice-table th:nth-child(6) { width: 17%; }
      .invoice-table th:nth-child(7) { width: 19%; }
      .packing-table th:nth-child(1) { width: 4.5%; }
      .packing-table th:nth-child(2) { width: 22%; }
      .packing-table th:nth-child(3) { width: 12.5%; }
      .packing-table th:nth-child(4) { width: 7%; }
      .packing-table th:nth-child(5) { width: 7.5%; }
      .packing-table th:nth-child(6) { width: 8%; }
      .packing-table th:nth-child(7) { width: 12%; }
      .packing-table th:nth-child(8) { width: 13%; }
      .packing-table th:nth-child(9) { width: 13.5%; }
      .totals { margin-top: 4mm; margin-left: auto; width: 78mm; border-top: 2px solid #111; }
      .totals > div { display: grid; grid-template-columns: 1fr 1fr; padding: 1.3mm 0; border-bottom: 1px solid #ccc; }
      .totals span { text-align: right; font-weight: 800; }
      .packing-totals { width: 90mm; }
      .footer-info { display: grid; grid-template-columns: 1fr 1fr; gap: 3mm 8mm; margin-top: 7mm; padding-top: 4mm; border-top: 1px solid #999; }
      .footer-info > div { display: flex; flex-direction: column; gap: 1mm; }
      .footer-info .wide { grid-column: 1 / -1; }
      .footer-info b { font-size: 9px; }
      .signature { width: 62mm; margin: 12mm 0 0 auto; text-align: center; }
      .signature-line { border-bottom: 1px solid #111; padding-bottom: 1.5mm; font-size: 9px; }
      .signature img { display: block; max-width: 52mm; max-height: 22mm; margin: 2mm auto 0; object-fit: contain; }
      .signature-placeholder { height: 22mm; }
      .signature b, .signature span { display: block; margin-top: 1mm; }
      .page-break { break-before: page; page-break-before: always; }
      @media print {
        @page { size: A4 portrait; margin: 0; }
        html, body { background: white !important; }
        .print-toolbar { display: none !important; }
        .paper { width: 210mm; min-height: 297mm; margin: 0; box-shadow: none; break-after: page; page-break-after: always; }
        .paper:last-of-type { break-after: auto; page-break-after: auto; }
      }
    `}</style>
  </>
}