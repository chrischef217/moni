/**
 * DOOBAE BOM 데이터 → Supabase bom_items 이전
 * GET /api/migrate-bom 으로 한 번만 실행
 */
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { BOM_DATA } from '@/lib/bom_data'

export async function GET() {
  try {
    const rows = BOM_DATA.map((b) => ({
      id: b.id,
      product_code: b.product_code,
      product_name: b.product_name,
      raw_code: b.raw_code ?? null,
      raw_name: b.raw_name,
      ratio_percent: b.ratio_percent,
      note: b.note ?? null,
      business_id: 'default',
    }))

    const { error } = await supabaseAdmin
      .from('bom_items')
      .upsert(rows, { onConflict: 'id', ignoreDuplicates: true })

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    // 몇 개 제품의 BOM인지 계산
    const productCount = new Set(rows.map((r) => r.product_code)).size

    return NextResponse.json({
      success: true,
      message: `✓ BOM 데이터 이전 완료`,
      counts: {
        bom_items: rows.length,
        products: productCount,
      },
    })
  } catch (error) {
    console.error('BOM 마이그레이션 오류:', error)
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 })
  }
}
