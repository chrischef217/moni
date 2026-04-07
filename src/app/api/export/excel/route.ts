import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import {
  getMonthlyTransactions,
  getMonthlyProductions,
  getRawMaterialStock,
  getPackagingStock,
} from '@/lib/actions'
import { supabase } from '@/lib/supabase'

export async function GET() {
  try {
    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth() + 1
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)

    // 데이터 병렬 조회
    const [transactions, productions, rawMaterials, packaging] = await Promise.all([
      getMonthlyTransactions(),
      getMonthlyProductions(),
      getRawMaterialStock(),
      getPackagingStock(),
    ])

    // 원료 수불 내역 (이번달)
    const { data: rawTxns } = await supabase
      .from('raw_material_transactions')
      .select('*')
      .eq('business_id', 'default')
      .gte('txn_date', startOfMonth)
      .order('txn_date', { ascending: true })

    const income = transactions.filter((t) => t.type === 'income')
    const expense = transactions.filter((t) => t.type === 'expense')
    const totalIncome = income.reduce((s: number, t: { amount: number }) => s + t.amount, 0)
    const totalExpense = expense.reduce((s: number, t: { amount: number }) => s + t.amount, 0)
    const netProfit = totalIncome - totalExpense

    // 워크북 생성
    const wb = XLSX.utils.book_new()

    // ── 시트1: 매출 목록 ────────────────────────────────────
    const incomeRows = [
      ['날짜', '품목', '수량', '단가(원)', '금액(원)', '메모'],
      ...income.map((t: { created_at: string; description: string; quantity: number; unit_price: number; amount: number; memo: string }) => [
        new Date(t.created_at).toLocaleDateString('ko-KR'),
        t.description,
        t.quantity ?? '',
        t.unit_price ? t.unit_price.toLocaleString() : '',
        t.amount.toLocaleString(),
        t.memo ?? '',
      ]),
      [],
      ['', '', '', '합계', totalIncome.toLocaleString(), ''],
    ]
    const wsIncome = XLSX.utils.aoa_to_sheet(incomeRows)
    wsIncome['!cols'] = [{ wch: 12 }, { wch: 20 }, { wch: 8 }, { wch: 12 }, { wch: 14 }, { wch: 20 }]
    XLSX.utils.book_append_sheet(wb, wsIncome, '매출 목록')

    // ── 시트2: 매입 목록 ────────────────────────────────────
    const expenseRows = [
      ['날짜', '품목', '수량', '단가(원)', '금액(원)', '메모'],
      ...expense.map((t: { created_at: string; description: string; quantity: number; unit_price: number; amount: number; memo: string }) => [
        new Date(t.created_at).toLocaleDateString('ko-KR'),
        t.description,
        t.quantity ?? '',
        t.unit_price ? t.unit_price.toLocaleString() : '',
        t.amount.toLocaleString(),
        t.memo ?? '',
      ]),
      [],
      ['', '', '', '합계', totalExpense.toLocaleString(), ''],
    ]
    const wsExpense = XLSX.utils.aoa_to_sheet(expenseRows)
    wsExpense['!cols'] = [{ wch: 12 }, { wch: 20 }, { wch: 8 }, { wch: 12 }, { wch: 14 }, { wch: 20 }]
    XLSX.utils.book_append_sheet(wb, wsExpense, '매입 목록')

    // ── 시트3: 손익 요약 ────────────────────────────────────
    const summaryRows = [
      [`${year}년 ${month}월 손익 요약`],
      [],
      ['항목', '금액(원)'],
      ['총 매출', totalIncome.toLocaleString()],
      ['총 매입', totalExpense.toLocaleString()],
      ['순이익', netProfit.toLocaleString()],
      [],
      ['생성일시', new Date().toLocaleString('ko-KR')],
      ['생성 도구', 'Moni (모니) - 경영 고민? 모니한테 물어봐'],
    ]
    const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows)
    wsSummary['!cols'] = [{ wch: 16 }, { wch: 16 }]
    XLSX.utils.book_append_sheet(wb, wsSummary, '손익 요약')

    // ── 시트4: 생산 실적 (이번달) ───────────────────────────
    const prodRows = [
      [`${year}년 ${month}월 생산 실적`],
      [],
      ['작업일', '제품코드', '제품명', '지시량(kg)', '양품(kg)', '불량(kg)', '샘플(kg)', '시작', '종료', '상태', '비고'],
      ...productions.map((p: {
        work_date: string
        product_code: string
        product_name: string
        requested_quantity_g: number
        quantity_ok_g: number
        quantity_ng_g: number
        sample_quantity_g: number
        start_time: string
        end_time: string
        status: string
        note: string
      }) => [
        p.work_date,
        p.product_code ?? '',
        p.product_name,
        p.requested_quantity_g ? (p.requested_quantity_g / 1000).toFixed(2) : '',
        p.quantity_ok_g ? (p.quantity_ok_g / 1000).toFixed(2) : '',
        p.quantity_ng_g ? (p.quantity_ng_g / 1000).toFixed(2) : '',
        p.sample_quantity_g ? (p.sample_quantity_g / 1000).toFixed(2) : '',
        p.start_time ?? '',
        p.end_time ?? '',
        p.status ?? '',
        p.note ?? '',
      ]),
    ]
    const wsProd = XLSX.utils.aoa_to_sheet(prodRows)
    wsProd['!cols'] = [
      { wch: 12 }, { wch: 12 }, { wch: 24 }, { wch: 10 }, { wch: 10 },
      { wch: 10 }, { wch: 10 }, { wch: 8 }, { wch: 8 }, { wch: 10 }, { wch: 20 },
    ]
    XLSX.utils.book_append_sheet(wb, wsProd, '생산 실적')

    // ── 시트5: 원료 수불부 (이번달) ─────────────────────────
    const rawTxnRows = [
      [`${year}년 ${month}월 원료 수불부`],
      [],
      ['날짜', '원료코드', '원료명', '구분', '수량(kg)', '단가', '공급업체', '비고'],
      ...(rawTxns ?? []).map((t: {
        txn_date: string
        item_code: string
        item_name: string
        txn_type: string
        quantity_g: number
        unit_price: number
        supplier: string
        note: string
      }) => [
        t.txn_date,
        t.item_code,
        t.item_name,
        t.txn_type === 'INBOUND' ? '입고' : t.txn_type === 'OUTBOUND' ? '출고' : '조정',
        (t.quantity_g / 1000).toFixed(3),
        t.unit_price ? t.unit_price.toLocaleString() : '',
        t.supplier ?? '',
        t.note ?? '',
      ]),
    ]
    const wsRawTxn = XLSX.utils.aoa_to_sheet(rawTxnRows)
    wsRawTxn['!cols'] = [
      { wch: 12 }, { wch: 12 }, { wch: 24 }, { wch: 8 },
      { wch: 12 }, { wch: 10 }, { wch: 16 }, { wch: 20 },
    ]
    XLSX.utils.book_append_sheet(wb, wsRawTxn, '원료수불부')

    // ── 시트6: 포장재 현황 ───────────────────────────────────
    const pkgRows = [
      ['포장재 현황'],
      [],
      ['코드', '포장재명', '규격', '재질', '공급업체', '단가(원)', '현재고(개)'],
      ...packaging.map((m: {
        material_code: string
        material_name: string
        spec: string
        material_type: string
        supplier: string
        unit_price: number
        current_stock: number
      }) => [
        m.material_code,
        m.material_name,
        m.spec ?? '',
        m.material_type ?? '',
        m.supplier ?? '',
        m.unit_price ? m.unit_price.toLocaleString() : '',
        m.current_stock ?? 0,
      ]),
    ]

    // 원료 재고 현황도 추가
    const rawStockRows = [
      [],
      ['원료 재고 현황'],
      [],
      ['코드', '원료명', '공급업체', '현재고(kg)'],
      ...rawMaterials.map((m: {
        item_code: string
        item_name: string
        supplier: string
        current_stock_g: number
      }) => [
        m.item_code,
        m.item_name,
        m.supplier ?? '',
        m.current_stock_g ? (m.current_stock_g / 1000).toFixed(3) : '0',
      ]),
    ]

    const wsPkg = XLSX.utils.aoa_to_sheet([...pkgRows, ...rawStockRows])
    wsPkg['!cols'] = [
      { wch: 12 }, { wch: 24 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 10 }, { wch: 12 },
    ]
    XLSX.utils.book_append_sheet(wb, wsPkg, '포장재현황')

    // 엑셀 파일 버퍼 생성
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
    const filename = encodeURIComponent(`모니_경영정산_${year}년${String(month).padStart(2, '0')}월.xlsx`)

    return new NextResponse(buf, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename*=UTF-8''${filename}`,
      },
    })
  } catch (error) {
    console.error('엑셀 내보내기 오류:', error)
    return NextResponse.json({ error: '엑셀 파일 생성 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
