import 'server-only'
import { createMoniServiceRoleClient } from '@/lib/moni/db'

const LEGACY_BUSINESS_ID = 'default'

function monthBounds() {
  const now = new Date()
  return {
    startDateTime: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(),
    endDateTime: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString(),
    startDate: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10),
  }
}

export async function getLegacyMonthlyTransactions() {
  const supabase = createMoniServiceRoleClient()
  const { startDateTime, endDateTime } = monthBounds()
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('business_id', LEGACY_BUSINESS_ID)
    .gte('created_at', startDateTime)
    .lte('created_at', endDateTime)
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function getLegacyMonthlyProductions() {
  const supabase = createMoniServiceRoleClient()
  const { startDate } = monthBounds()
  const { data, error } = await supabase
    .from('productions')
    .select('*')
    .eq('business_id', LEGACY_BUSINESS_ID)
    .gte('work_date', startDate)
    .order('work_date', { ascending: false })
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function getLegacyRawMaterialStock() {
  const supabase = createMoniServiceRoleClient()
  const { data, error } = await supabase
    .from('raw_materials')
    .select('*')
    .eq('business_id', LEGACY_BUSINESS_ID)
    .eq('is_active', true)
    .order('item_name', { ascending: true })
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function getLegacyPackagingStock() {
  const supabase = createMoniServiceRoleClient()
  const { data, error } = await supabase
    .from('packaging_materials')
    .select('*')
    .eq('business_id', LEGACY_BUSINESS_ID)
    .eq('is_active', true)
    .order('material_name', { ascending: true })
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function getLegacyMonthlyRawTransactions() {
  const supabase = createMoniServiceRoleClient()
  const { startDate } = monthBounds()
  const { data, error } = await supabase
    .from('raw_material_transactions')
    .select('*')
    .eq('business_id', LEGACY_BUSINESS_ID)
    .gte('txn_date', startDate)
    .order('txn_date', { ascending: true })
  if (error) throw new Error(error.message)
  return data ?? []
}
