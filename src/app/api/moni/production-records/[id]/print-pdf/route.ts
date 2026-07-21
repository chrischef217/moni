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
  const fontSize = columnCount >= 10 ? 7 : columnCount >= 8 ? 8 : columnCount >= 7 ? 8.5 : 9
  const cellPadding = columnCount >= 10 ? 2.5 : columnCount >= 8 ? 3.5 : 4.5
  const lineHeight = columnCount >= 9 ? 1.05 : 1.15

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
      padding: ${cellPadding}px ${Math.max(cellPadding - 0.5, 2)}px !important;
      overflow-wrap: anywhere;
      word-break: keep-all;
      line-height: ${lineHeight};
    }
    .material-table th {
      white-space: normal !important;
      text-align: center;
      vertical-align: middle;
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
    @media print {
      .material-table {
        width: 100% !important;
        max-width: 100% !important;
      }
      .material-table tr {
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
