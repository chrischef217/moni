/**
 * DOOBAE → Supabase 데이터 이전 API
 * GET /api/migrate 로 한 번만 호출하면 됩니다.
 * 중복 방지: upsert with ignoreDuplicates
 */
import { NextResponse } from 'next/server'
import { migrateDoobaeData } from '@/lib/migrate_doobae'

export async function GET() {
  try {
    const result = await migrateDoobaeData()

    return NextResponse.json({
      success: result.errors.length === 0,
      message: result.errors.length === 0
        ? '✓ DOOBAE 데이터 이전 완료'
        : '일부 오류가 발생했습니다.',
      counts: {
        products: result.products,
        raw_materials: result.raw_materials,
        productions: result.productions,
        packaging_materials: result.packaging_materials,
      },
      errors: result.errors,
    })
  } catch (error) {
    console.error('마이그레이션 오류:', error)
    return NextResponse.json(
      { success: false, message: '마이그레이션 중 오류 발생', error: String(error) },
      { status: 500 }
    )
  }
}
