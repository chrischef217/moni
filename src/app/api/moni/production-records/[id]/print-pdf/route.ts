import { NextRequest, NextResponse } from 'next/server'
import { GET as getCompletedWorkOrderPdf } from '../completed-pdf/route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function countMaterialColumns(html: string): number {
  const match = html.match(/<table class="material-table">[\s\S]*?<thead><tr>([\s\S]*?)<\/tr><\/thead>/)
  if (!match) return 0
  return (match[1].match(/<th\b/g) ?? []).length
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

  const columnCount = countMaterialColumns(html)
  const fontSize = columnCount >= 10 ? 7.2 : columnCount >= 8 ? 8 : columnCount >= 7 ? 8.5 : 9
  const horizontalPadding = columnCount >= 10 ? 2 : columnCount >= 8 ? 2.8 : 3.5
  const lineHeight = columnCount >= 9 ? 1.08 : 1.18

  const responsiveCss = `
    .material-table {
      width: 100% !important;
      max-width: 100% !important;
      table-layout: fixed !important;
      font-size: ${fontSize}px !important;
    }
    .material-table th,
    .material-table td {
      min-width: 0 !important;
      min-height: 27px;
      height: 27px;
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

    .completion-grid {
      grid-template-columns: 2fr 1fr !important;
      gap: 7px !important;
      margin-top: 5px !important;
      align-items: stretch;
    }
    .completion-table,
    .people-table {
      font-size: 10px !important;
      line-height: 1.15 !important;
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
      font-size: 11px !important;
      font-weight: 700;
    }

    @media print {
      .material-table {
        width: 100% !important;
        max-width: 100% !important;
      }
      .material-table tr {
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
