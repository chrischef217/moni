import type { SupabaseClient } from '@supabase/supabase-js'

const text = (value: unknown, max = 500) => String(value ?? '').trim().slice(0, max)

export type ExportDocumentArtifact = {
  id: string
  invoice_no: string
  packing_list_no: string
  document_date: string
  status: string
  sales_order_id: string
  statement_number: string
  client_name: string
  statement_url: string
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

function asksForLatest(value: string) {
  return /(?:가장\s*)?(?:최근|최신|마지막|최근\s*출고|최근\s*생산|방금)/i.test(value)
}

function mentionsLaos(value: string) {
  return /(?:라오스|lao(?:\s*p\.?d\.?r\.?)?|vientiane)/i.test(value)
}

function isLaosDocument(row: any) {
  const snapshot = row?.consignee_snapshot && typeof row.consignee_snapshot === 'object'
    ? JSON.stringify(row.consignee_snapshot)
    : String(row?.consignee_snapshot || '')
  return mentionsLaos(`${text(row?.final_destination, 300)} ${snapshot}`)
}

function activeDocumentStatus(value: unknown) {
  return !/(?:CANCELLED|CANCELED|VOID|DELETED)/i.test(String(value ?? ''))
}

export function isExportDocumentRequest(value: unknown) {
  const input = String(value ?? '')
  const hasNamedDocument = /(?:인보이스|invoice|패킹\s*(?:리스트|list)|packing\s*list)/i.test(input)
  const hasGenericExportDocument = /수출[^\n.]{0,18}(?:서류|문서)/i.test(input)
  const hasAction = /(?:다운로드|재다운로드|저장|파일|열어|열기|보여|받을|받아|연결|링크|다시)/i.test(input)
  return (hasNamedDocument || hasGenericExportDocument) && hasAction
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

async function finalizeArtifact(
  supabase: SupabaseClient,
  businessId: string,
  document: any,
): Promise<ExportDocumentArtifact | null> {
  if (!document || !activeDocumentStatus(document.status)) return null
  const salesOrderId = text(document.sales_order_id, 100)
  if (!salesOrderId) return null

  const { data: sale, error: saleError } = await supabase
    .from('sales_orders')
    .select('id,statement_number,client_id,manual_client_name,business_id,source_type,source_reference')
    .eq('id', salesOrderId)
    .eq('business_id', businessId)
    .maybeSingle()
  if (saleError) throw new Error(saleError.message)
  if (!sale) return null

  let clientName = text(sale.manual_client_name, 200)
  const clientId = text(sale.client_id, 100)
  if (clientId) {
    const { data: client, error: clientError } = await supabase
      .from('sales_clients')
      .select('company_name')
      .eq('id', clientId)
      .eq('business_id', businessId)
      .maybeSingle()
    if (clientError) throw new Error(clientError.message)
    clientName = text(client?.company_name, 200) || clientName
  }

  const id = text(document.id, 100)
  const encodedId = encodeURIComponent(id)
  return {
    id,
    invoice_no: text(document.invoice_no, 100),
    packing_list_no: text(document.packing_list_no, 100),
    document_date: text(document.document_date, 20),
    status: text(document.status, 40),
    sales_order_id: salesOrderId,
    statement_number: text(sale.statement_number, 100),
    client_name: clientName || '거래처 미확인',
    statement_url: `/sales-management/export/documents/${encodedId}/statement?auto=1`,
    invoice_url: `/sales-management/export/documents/${encodedId}/print?type=invoice&auto=1`,
    packing_list_url: `/sales-management/export/documents/${encodedId}/print?type=packing&auto=1`,
    combined_url: `/sales-management/export/documents/${encodedId}/print?type=both&auto=1`,
  }
}

export async function resolveLinkedExportDocument(
  supabase: SupabaseClient,
  businessId: string,
  requestText: string,
  recentContextText = '',
): Promise<ExportDocumentArtifact | null> {
  const requestInput = text(requestText, 4000)
  const contextInput = text(recentContextText, 12000)
  const combinedInput = `${requestInput}\n${contextInput}`
  const requestRefs = referenceFromText(requestInput)
  const contextRefs = referenceFromText(contextInput)

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

  const selectFields = 'id,invoice_no,packing_list_no,document_date,status,sales_order_id,consignee_snapshot,final_destination,created_at'

  if (documentId || invoiceNumber || packingListNumber || contextRefs.exportDocumentId) {
    let query = supabase.from('export_documents').select(selectFields).limit(1)
    if (documentId) query = query.eq('id', documentId)
    else if (invoiceNumber) query = query.eq('invoice_no', invoiceNumber)
    else if (packingListNumber) query = query.eq('packing_list_no', packingListNumber)
    else query = query.eq('id', contextRefs.exportDocumentId)

    const { data: document, error } = await query.maybeSingle()
    if (error) throw new Error(error.message)
    return finalizeArtifact(supabase, businessId, document)
  }

  if (!asksForLatest(combinedInput)) return null

  const { data: recentDocuments, error: recentError } = await supabase
    .from('export_documents')
    .select(selectFields)
    .order('document_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(20)
  if (recentError) throw new Error(recentError.message)

  let candidates = (recentDocuments ?? []).filter((row: any) => activeDocumentStatus(row.status))
  if (mentionsLaos(combinedInput)) candidates = candidates.filter(isLaosDocument)

  for (const candidate of candidates) {
    const artifact = await finalizeArtifact(supabase, businessId, candidate)
    if (artifact) return artifact
  }
  return null
}
