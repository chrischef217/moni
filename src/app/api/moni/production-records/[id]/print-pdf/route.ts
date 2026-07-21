import { NextRequest, NextResponse } from 'next/server'
import { GET as getCompletedWorkOrderPdf } from '../completed-pdf/route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function countMaterialColumns(html: string): number {
  const match = html.match(/<table class="[^"]*\bmaterial-table\b[^"]*">[\s\S]*?<thead><tr>([\s\S]*?)<\/tr><\/thead>/)
  if (!match) return 0
  return (match[1].match(/<th\b/g) ?? []).length
}

function optimizeNoSemiProductMaterialTable(html: string): { html: string; noSemiProduct: boolean } {
  const tableMatch = html.match(/<table class="material-table">([\s\S]*?)<\/table>/)
  if (!tableMatch) return { html, noSemiProduct: false }

  const headerMatch = tableMatch[1].match(/<thead><tr>([\s\S]*?)<\/tr><\/thead>/)
  if (!headerMatch) return { html, noSemiProduct: false }

  const headers = headerMatch[1].match(/<th\b[^>]*>[\s\S]*?<\/th>/g) ?? []
  const noSemiProduct =
    headers.length === 5 &&
    headers.some((header) => header.includes('완제품 직접투입(g)')) &&
    headers.some((header) => header.includes('최종 투입량(g)'))

  if (!noSemiProduct) return { html, noSemiProduct: false }

  let optimizedTable = tableMatch[0]
    .replace('class="material-table"', 'class="material-table no-semi-material-table"')
    .replace(/\s*<th>완제품 직접투입\(g\)<\/th>/, '')

  optimizedTable = optimizedTable.replace(/<tbody>([\s\S]*?)<\/tbody>/, (_match, body: string) => {
    const optimizedRows = body.replace(/<tr\b([^>]*)>([\s\S]*?)<\/tr>/g, (row, attributes: string, content: string) => {
      const cells = content.match(/<td\b[^>]*>[\s\S]*?<\/td>/g)
      if (!cells || cells.length !== 5) return row

      cells.splice(3, 1)
      return `<tr${attributes}>${cells.join('')}</tr>`
    })
    return `<tbody>${optimizedRows}</tbody>`
  })

  let optimizedHtml = html.replace(tableMatch[0], optimizedTable)
  optimizedHtml = optimizedHtml.replace(
    /<div class="note">※ 준비수량은 최종 투입량과 포장단위를 기준으로 현장에서 준비해야 할 정수 ea로 표시합니다\. 반제품 열은 해당 반제품을 현장에서 제조할 때 투입할 원재료 수량입니다\.<\/div>/,
    '<div class="note">※ 준비수량은 최종 투입량과 포장단위를 기준으로 현장에서 준비해야 할 정수 ea로 표시합니다.</div>',
  )

  return { html: optimizedHtml, noSemiProduct: true }
}

export async function GET(request: NextRequest, context: { params: { id: string } }) {
  const baseResponse = await getCompletedWorkOrderPdf(request, context)
  const contentType = baseResponse.headers.get('content-type') ?? ''

  if (!contentType.includes('text/html')) return baseResponse

  let html = await baseResponse.text()
  html = html.replace(
    /(<div class="section-title">원재료 준비 체크리스트<\/div>\s*)<table>/,
    '$1<table class="material-table">',
  )

  const optimizedMaterialTable = optimizeNoSemiProductMaterialTable(html)
  html = optimizedMaterialTable.html

  // 모든 작업지시서의 담당자를 회사 고정값으로 표시합니다.
  html = html.replace(
    /(<tr>\s*<th>작성자<\/th>\s*<td>)[\s\S]*?(<\/td>\s*<\/tr>)/,
    '$1윤대열$2',
  )
  html = html.replace(
    /(<tr>\s*<th>확인자<\/th>\s*<td>)[\s\S]*?(<\/td>\s*<\/tr>)/,
    '$1배순애$2',
  )

  const columnCount = countMaterialColumns(html)
  const fontSize = columnCount >= 10 ? 10 : columnCount >= 8 ? 10.5 : 11.5
  const horizontalPadding = columnCount >= 10 ? 1.5 : columnCount >= 8 ? 2 : 2.5
  const lineHeight = columnCount >= 9 ? 1.12 : 1.2

  const responsiveCss = `
    /* 작업지시서의 모든 표 내용은 현장 오독 방지를 위해 가운데 정렬 */
    .page table th,
    .page table td,
    .page table .number {
      text-align: center !important;
      vertical-align: middle !important;
    }

    /* 상단 LOT~생산단위 표 */
    .compact {
      font-size: 12px !important;
    }

    /* 연결 반제품 표도 상단 제품 정보와 비슷한 크기로 유지 */
    .stage-table {
      font-size: 11.5px !important;
      table-layout: fixed;
    }
    .stage-table th,
    .stage-table td {
      min-height: 29px;
      height: 29px;
      padding: 6px 5px !important;
      line-height: 1.2;
    }
    .stage-table th {
      white-space: normal !important;
    }

    .material-table {
      width: 100% !important;
      max-width: 100% !important;
      table-layout: fixed !important;
      font-size: ${fontSize}px !important;
    }
    .material-table th,
    .material-table td {
      min-width: 0 !important;
      min-height: 30px;
      height: 30px;
      padding: 6px ${horizontalPadding}px !important;
      overflow-wrap: anywhere;
      word-break: keep-all;
      line-height: ${lineHeight};
    }
    .material-table th {
      white-space: normal !important;
      font-weight: 700;
    }

    /* 반제품 연결 표: 최종 투입량 열을 핵심 수치 열로 고정 확보 */
    .material-table th:first-child,
    .material-table td:first-child { width: 20%; }
    .material-table th:nth-child(2),
    .material-table td:nth-child(2) { width: 9%; }
    .material-table th:nth-child(3),
    .material-table td:nth-child(3) { width: 11%; }
    .material-table th:last-child,
    .material-table td:last-child { width: 24% !important; }

    .material-table .package-count,
    .material-table .package-unit {
      white-space: normal !important;
    }
    .material-table .number {
      white-space: nowrap !important;
    }

    /* 최종 투입량은 반제품 유무와 관계없이 가장 크고 명확하게 표시 */
    .material-table th:last-child {
      font-size: 12.5px !important;
      font-weight: 800 !important;
    }
    .material-table td.final-input,
    .material-table td:last-child {
      font-size: 14px !important;
      font-weight: 800 !important;
      letter-spacing: 0.1px;
    }

    /* 반제품이 없는 작업지시서는 최종 투입량을 가장 넓은 열로 배분 */
    .no-semi-material-table {
      font-size: 12px !important;
    }
    .no-semi-material-table th:first-child,
    .no-semi-material-table td:first-child { width: 32% !important; }
    .no-semi-material-table th:nth-child(2),
    .no-semi-material-table td:nth-child(2) { width: 14% !important; }
    .no-semi-material-table th:nth-child(3),
    .no-semi-material-table td:nth-child(3) { width: 18% !important; }
    .no-semi-material-table th:last-child,
    .no-semi-material-table td:last-child { width: 36% !important; }

    .note {
      font-size: 10.5px !important;
      line-height: 1.45 !important;
    }

    .completion-grid {
      grid-template-columns: 2fr 1fr !important;
      gap: 7px !important;
      margin-top: 5px !important;
      align-items: stretch;
    }
    .completion-table,
    .people-table {
      font-size: 11.5px !important;
      line-height: 1.18 !important;
    }
    .completion-table th,
    .completion-table td,
    .people-table th,
    .people-table td {
      padding: 4px 6px !important;
      height: 29px !important;
      min-height: 29px !important;
    }
    .completion-table th { width: 25% !important; }
    .completion-table td { height: 29px !important; min-height: 29px !important; }
    .completion-table tr:last-child td,
    .completion-table tr:last-child th {
      height: 44px !important;
      min-height: 44px !important;
    }
    .sample-list {
      min-height: 34px !important;
      gap: 2px !important;
      justify-content: center;
    }
    .blank-area { min-height: 30px !important; }
    .people-table th { width: 38% !important; }
    .people-table td {
      font-size: 11.5px !important;
      font-weight: 700;
    }

    @media print {
      .material-table {
        width: 100% !important;
        max-width: 100% !important;
      }
      .material-table tr,
      .stage-table tr {
        break-inside: avoid;
        page-break-inside: avoid;
      }
      .completion-grid {
        break-inside: avoid;
        page-break-inside: avoid;
      }
    }
  `

  html = html.replace('</style>', `${responsiveCss}\n  </style>`)

  return new NextResponse(html, {
    status: baseResponse.status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}
