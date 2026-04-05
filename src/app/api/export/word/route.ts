import { NextResponse } from 'next/server'
import {
  Document,
  Packer,
  Paragraph,
  Table,
  TableRow,
  TableCell,
  TextRun,
  HeadingLevel,
  AlignmentType,
  BorderStyle,
  WidthType,
} from 'docx'
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

    const borderStyle = {
      style: BorderStyle.SINGLE,
      size: 1,
      color: '94a3b8',
    }

    // 거래 목록 테이블 행 생성 헬퍼
    const makeTableRow = (cells: string[], isHeader = false) =>
      new TableRow({
        children: cells.map(
          (text) =>
            new TableCell({
              borders: {
                top: borderStyle,
                bottom: borderStyle,
                left: borderStyle,
                right: borderStyle,
              },
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text,
                      bold: isHeader,
                      size: 18,
                    }),
                  ],
                  alignment: AlignmentType.CENTER,
                }),
              ],
            })
        ),
      })

    // 문서 생성
    const doc = new Document({
      sections: [
        {
          children: [
            // 제목
            new Paragraph({
              text: `${year}년 ${month}월 경영 보고서`,
              heading: HeadingLevel.HEADING_1,
              alignment: AlignmentType.CENTER,
            }),
            new Paragraph({
              children: [
                new TextRun({
                  text: `생성일: ${now.toLocaleDateString('ko-KR')} | 생성 도구: Moni(모니)`,
                  size: 18,
                  color: '94a3b8',
                }),
              ],
              alignment: AlignmentType.CENTER,
            }),
            new Paragraph({ text: '' }),

            // 손익 요약 섹션
            new Paragraph({
              text: '1. 손익 요약',
              heading: HeadingLevel.HEADING_2,
            }),
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              rows: [
                makeTableRow(['항목', '금액'], true),
                makeTableRow(['총 매출', `${totalIncome.toLocaleString('ko-KR')}원`]),
                makeTableRow(['총 매입 (비용)', `${totalExpense.toLocaleString('ko-KR')}원`]),
                makeTableRow([
                  '순이익',
                  `${netProfit.toLocaleString('ko-KR')}원 ${netProfit >= 0 ? '(흑자)' : '(적자)'}`,
                ]),
              ],
            }),
            new Paragraph({ text: '' }),

            // 매출 상세
            new Paragraph({
              text: '2. 매출 상세 내역',
              heading: HeadingLevel.HEADING_2,
            }),
            income.length > 0
              ? new Table({
                  width: { size: 100, type: WidthType.PERCENTAGE },
                  rows: [
                    makeTableRow(['날짜', '품목', '수량', '금액'], true),
                    ...income.map((t: { created_at: string; description: string; quantity: number; amount: number }) =>
                      makeTableRow([
                        new Date(t.created_at).toLocaleDateString('ko-KR'),
                        t.description,
                        t.quantity ? String(t.quantity) : '-',
                        `${t.amount.toLocaleString('ko-KR')}원`,
                      ])
                    ),
                  ],
                })
              : new Paragraph({ text: '이번 달 매출 내역이 없습니다.' }),
            new Paragraph({ text: '' }),

            // 매입 상세
            new Paragraph({
              text: '3. 매입 상세 내역',
              heading: HeadingLevel.HEADING_2,
            }),
            expense.length > 0
              ? new Table({
                  width: { size: 100, type: WidthType.PERCENTAGE },
                  rows: [
                    makeTableRow(['날짜', '품목', '수량', '금액'], true),
                    ...expense.map((t: { created_at: string; description: string; quantity: number; amount: number }) =>
                      makeTableRow([
                        new Date(t.created_at).toLocaleDateString('ko-KR'),
                        t.description,
                        t.quantity ? String(t.quantity) : '-',
                        `${t.amount.toLocaleString('ko-KR')}원`,
                      ])
                    ),
                  ],
                })
              : new Paragraph({ text: '이번 달 매입 내역이 없습니다.' }),
            new Paragraph({ text: '' }),

            // 푸터
            new Paragraph({
              children: [
                new TextRun({
                  text: '본 보고서는 Moni(모니) AI 경영 도우미가 자동 생성하였습니다.',
                  size: 16,
                  color: '94a3b8',
                  italics: true,
                }),
              ],
              alignment: AlignmentType.CENTER,
            }),
          ],
        },
      ],
    })

    // Word 파일 버퍼 생성
    const buf = await Packer.toBuffer(doc)

    const filename = encodeURIComponent(`모니_경영보고서_${year}년${String(month).padStart(2, '0')}월.docx`)

    return new NextResponse(buf, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename*=UTF-8''${filename}`,
      },
    })
  } catch (error) {
    console.error('워드 내보내기 오류:', error)
    return NextResponse.json({ error: '워드 파일 생성 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
