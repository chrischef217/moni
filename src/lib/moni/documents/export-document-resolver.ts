import type { SupabaseClient } from '@supabase/supabase-js'

const text = (value: unknown, max = 500) => String(value ?? '').trim().slice(0, max)

export type ExportDocumentArtifact = {
  id: string
  invoice_no: string
  packing_list_no: string
  document_date: string
  status: string
  invoice_url: string
  packing_list_url: string
  combined_url: string
}

function firstMatch(value: string, pattern: RegExp) {
  const match = value.match(pattern)
  return match?.[0] || ''
}

function referenceFromText(value: string) {
  return {
    exportDocumentId: firstMatch(value, /\bEXPDOC-[A-Z0-9-]+\b/i),
    statementNumber: firstMatch(value, /\bDB-\d{8}-\d{3}\b/i),
    invoiceNumber: firstMatch(value, /\bINV-\d{8}-\d{3}\b/i),
    packingListNumber: firstMatch(value, /\bPL-\d{8}-\d{3}\b/i),
  }
}

export function isExportDocumentRequest(value: unknown) {
  const input = String(value ?? '')
  const hasDocument = /(?:인보이스|invoice|패킹\s*(?:리스트|list)|packing\s*list)/i.test(input)
  const hasAction = /(?:다운로드|저장|파일|열어|열기|보여|받을|받아|연결)/i.test(input)
  return hasDocument && hasAction
}

export function requestedExportDocumentKinds(value: unknown) {
  const input = String(value ?? '')
  const invoice = /(?:인보이스|invoice)/i.test(input)
  const packing = /(?:패킹\s*(?:리스트|list)|packing\s*list)/i.test(input)
  return {
    invoice: invoice || (!invoice && !packing),
    packing: packing || (!invoice && !packing),
  }
}

export async function resolveLinkedExportDocument(
  supabase: SupabaseClient,
  businessId: string,
  requestText: string,
  recentContextText = '',
): Promise<ExportDocumentArtifact | null> {
  const requestRefs = referenceFromText(text(requestText, 4000))
  const contextRefs = referenceFromText(text(recentContextText, 12000))

  let documentId = requestRefs.exportDocumentId
  const statementNumber = requestRefs.statementNumber || contextRefs.statementNumber
  const invoiceNumber = requestRefs.invoiceNumber || contextRefs.invoiceNumber
  const packingListNumber = requestRefs.packingListNumber || contextRefs.packingListNumber

  if (!documentId && statementNumber) {
    const { data: sale, error } = await supabase
      .from('sales_orders')
      .select('source_type,source_reference')
      .eq('business_id', businessId)
      .eq('statement_number', statementNumber)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (String(sale?.source_type || '').toUpperCase() === 'EXPORT') documentId = text(sale?.source_reference, 100)
  }

  let query = supabase
    .from('export_documents')
    .select('id,invoice_no,packing_list_no,document_date,status')
    .limit(1)

  if (documentId) {
    query = query.eq('id', documentId)
  } else if (invoiceNumber) {
    query = query.eq('invoice_no', invoiceNumber)
  } else if (packingListNumber) {
    query = query.eq('packing_list_no', packingListNumber)
  } else if (contextRefs.exportDocumentId) {
    query = query.eq('id', contextRefs.exportDocumentId)
  } else {
    return null
  }

  const { data: document, error } = await query.maybeSingle()
  if (error) throw new Error(error.message)
  if (!document) return null

  const id = text(document.id, 100)
  const encodedId = encodeURIComponent(id)
  return {
    id,
    invoice_no: text(document.invoice_no, 100),
    packing_list_no: text(document.packing_list_no, 100),
    document_date: text(document.document_date, 20),
    status: text(document.status, 40),
    invoice_url: `/sales-management/export/documents/${encodedId}/print?type=invoice&auto=1`,
    packing_list_url: `/sales-management/export/documents/${encodedId}/print?type=packing&auto=1`,
    combined_url: `/sales-management/export/documents/${encodedId}/print?type=both&auto=1`,
  }
}
