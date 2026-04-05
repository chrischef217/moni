import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { getMonthlyTransactions } from '@/lib/actions'

export async function GET() {
  try {
    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth() + 1

    // 현재 달 거래 내역 조회
    const transactions = await getMonthlyTransactions()

    const income = transactions.filter((t) => t.type === 'income')
    const expense = transactions.filter((t) => t.type === 'expense')
    const totalIncome = income.reduce((s: number, t: { amount: number }) => s + t.amount, 0)
    const totalExpense = expense.reduce((s: number, t: { amount: number }) => s + t.amount, 0)
    const netProfit = totalIncome - totalExpense

    // 워크북 생성
    const wb = XLSX.utils.book_new()

    // 시트1: 매출 목록
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

    // 시트2: 매입 목록
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

    // 시트3: 손익 요약
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

    // 엑셀 파일 버퍼 생성
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

    const filename = encodeURIComponent(`모니_손익정산_${year}년${String(month).padStart(2, '0')}월.xlsx`)

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
