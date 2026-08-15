import type { SupabaseClient } from '@supabase/supabase-js'

const text = (value: unknown, max = 500) => String(value ?? '').trim().slice(0, max)

export type SalesStatementArtifact = {
  order_id: string
  statement_number: string
  sale_date: string
  client_name: string
  total_amount: number
  currency: string
  status: string
  source_type: string
  pdf_url: string
  canonical_form_url: string | null
}

function requestedOrdinal(input: string) {
  const normalized = input.replace(/\s+/g, ' ').trim()
  const followUp = normalized.match(/(?:그|위|아까|방금)?\s*([1-5])\s*번\s*(?:거래|거|꺼|항목)?/i)
  if (!followUp) return null
  if (!/(?:거래\s*(?:명세표|명세서)|거래|그|위|아까|방금)/i.test(normalized)) return null
  const index = Number(followUp[1]) - 1
  return Number.isInteger(index) && index >= 0 ? index : null
}

export async function resolveSalesStatementArtifacts(
  supabase: SupabaseClient,
  businessId: string,
  requestText: string,
): Promise<{ matched: SalesStatementArtifact[]; candidates: SalesStatementArtifact[] }> {
  const input = text(requestText, 2000)
  const exactNumbers = [...input.matchAll(/\bDB-\d{8}-\d{3}\b/gi)].map((match) => match[0])

  const { data: clients, error: clientError } = await supabase
    .from('sales_clients')
    .select('id,company_name')
    .eq('business_id', businessId)
    .limit(500)
  if (clientError) throw new Error(clientError.message)

  const clientMap = new Map((clients ?? []).map((row: any) => [String(row.id), text(row.company_name, 200)]))
  const mentionedClientIds = (clients ?? [])
    .filter((row: any) => {
      const company = text(row.company_name, 200)
      return company.length >= 2 && input.toLowerCase().includes(company.toLowerCase())
    })
    .map((row: any) => String(row.id))

  let query = supabase
    .from('sales_orders')
    .select('id,statement_number,sale_date,client_id,manual_client_name,status,total_amount,currency,source_type,source_reference')
    .eq('business_id', businessId)
    .order('sale_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(12)

  if (exactNumbers.length) query = query.in('statement_number', exactNumbers)
  else if (mentionedClientIds.length === 1) query = query.eq('client_id', mentionedClientIds[0])

  const { data: rows, error } = await query
  if (error) throw new Error(error.message)

  const artifacts: SalesStatementArtifact[] = (rows ?? []).map((row: any) => {
    const orderId = text(row.id, 100)
    const sourceType = text(row.source_type, 30).toUpperCase()
    const sourceReference = text(row.source_reference, 100)
    return {
      order_id: orderId,
      statement_number: text(row.statement_number, 100) || orderId,
      sale_date: text(row.sale_date, 20),
      client_name: clientMap.get(String(row.client_id)) || text(row.manual_client_name, 200) || '거래처 미확인',
      total_amount: Number(row.total_amount || 0),
      currency: text(row.currency, 10) || 'KRW',
      status: text(row.status, 40),
      source_type: sourceType || 'MANUAL',
      pdf_url: `/api/moni/sales-statement-pdf?order_id=${encodeURIComponent(orderId)}`,
      canonical_form_url: sourceType === 'EXPORT' && sourceReference
        ? `/sales-management/export/documents/${encodeURIComponent(sourceReference)}/statement`
        : null,
    }
  })

  let matched = artifacts.filter((artifact) => {
    if (exactNumbers.some((value) => value.toLowerCase() === artifact.statement_number.toLowerCase())) return true
    if (artifact.client_name.length >= 2 && input.toLowerCase().includes(artifact.client_name.toLowerCase())) return true
    return false
  })

  if (matched.length === 0) {
    const ordinal = requestedOrdinal(input)
    if (ordinal !== null && artifacts[ordinal]) matched = [artifacts[ordinal]]
    else if (artifacts.length === 1) matched = [artifacts[0]]
  }

  return { matched, candidates: artifacts }
}

export function salesStatementSelectionText(artifacts: SalesStatementArtifact[]) {
  if (!artifacts.length) return ''
  return artifacts.slice(0, 5).map((artifact, index) => {
    const amount = Number(artifact.total_amount || 0).toLocaleString('ko-KR')
    return `${index + 1}. ${artifact.sale_date || '-'} · ${artifact.client_name} · ${artifact.statement_number} · ${amount} ${artifact.currency}`
  }).join('\n')
}
