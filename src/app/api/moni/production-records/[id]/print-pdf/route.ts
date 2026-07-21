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
    /* 상단 LOT~생산단위 표: 라벨과 값 모두 가운데 정렬 */
    .compact {
      font-size: 12px !important;
    }
    .compact th,
    .compact td,
    .compact .number {
      text-align: center !important;
      vertical-align: middle !important;
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
      vertical-align: middle;
    }
    .stage-table th {
      white-space: normal !important;
      text-align: center;
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
      vertical-align: middle;
    }
    .material-table th {
      white-space: normal !important;
      text-align: center;
      vertical-align: middle;
      font-weight: 700;
    }
    .material-table th:first-child,
    .material-table td:first-child { width: 21%; }
    .material-table th:nth-child(2),
    .material-table td:nth-child(2) { width: 9%; }
    .material-table th:nth-child(3),
    .material-table td:nth-child(3) { width: 11%; }
    .material-table th:last-child,
    .material-table td:last-child { width: 12%; }
    .material-table .package-count,
    .material-table .package-unit {
      white-space: normal !important;
      text-align: center;
    }
    .material-table .number {
      white-space: nowrap !important;
      text-align: right;
    }

    /* 반제품이 없는 작업지시서는 불필요한 직접투입 열 없이 4열로 최적화 */
    .no-semi-material-table {
      font-size: 12px !important;
    }
    .no-semi-material-table th:first-child,
    .no-semi-material-table td:first-child { width: 42% !important; }
    .no-semi-material-table th:nth-child(2),
    .no-semi-material-table td:nth-child(2) { width: 16% !important; }
    .no-semi-material-table th:nth-child(3),
    .no-semi-material-table td:nth-child(3) { width: 20% !important; }
    .no-semi-material-table th:last-child,
    .no-semi-material-table td:last-child { width: 22% !important; }

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
      vertical-align: middle;
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
