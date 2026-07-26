'use client'

import type { ReactNode } from 'react'

export default function ExportProductSettingsFitShell({ children }: { children: ReactNode }) {
  return (
    <div data-export-settings-fit>
      {children}
      <style jsx global>{`
        [data-export-settings-fit] section > div.overflow-x-auto {
          overflow-x: hidden !important;
        }

        [data-export-settings-fit] section > div.overflow-x-auto > table {
          width: 100% !important;
          min-width: 0 !important;
          table-layout: fixed !important;
        }

        [data-export-settings-fit] section > div.overflow-x-auto > table col:nth-child(1) { width: 20% !important; }
        [data-export-settings-fit] section > div.overflow-x-auto > table col:nth-child(2) { width: 15% !important; }
        [data-export-settings-fit] section > div.overflow-x-auto > table col:nth-child(3) { width: 10% !important; }
        [data-export-settings-fit] section > div.overflow-x-auto > table col:nth-child(4) { width: 7% !important; }
        [data-export-settings-fit] section > div.overflow-x-auto > table col:nth-child(5) { width: 11% !important; }
        [data-export-settings-fit] section > div.overflow-x-auto > table col:nth-child(6) { width: 7% !important; }
        [data-export-settings-fit] section > div.overflow-x-auto > table col:nth-child(7) { width: 7.5% !important; }
        [data-export-settings-fit] section > div.overflow-x-auto > table col:nth-child(8) { width: 6% !important; }
        [data-export-settings-fit] section > div.overflow-x-auto > table col:nth-child(9) { width: 6.5% !important; }
        [data-export-settings-fit] section > div.overflow-x-auto > table col:nth-child(10) { width: 10% !important; }

        [data-export-settings-fit] section > div.overflow-x-auto > table th,
        [data-export-settings-fit] section > div.overflow-x-auto > table td {
          min-width: 0 !important;
          padding-left: 6px !important;
          padding-right: 6px !important;
          vertical-align: middle !important;
        }

        [data-export-settings-fit] section > div.overflow-x-auto > table th:first-child,
        [data-export-settings-fit] section > div.overflow-x-auto > table td:first-child {
          text-align: left !important;
        }

        [data-export-settings-fit] section > div.overflow-x-auto > table th:nth-child(n+2),
        [data-export-settings-fit] section > div.overflow-x-auto > table td:nth-child(n+2) {
          text-align: center !important;
        }

        [data-export-settings-fit] section > div.overflow-x-auto > table th {
          white-space: normal !important;
          word-break: keep-all !important;
          line-height: 1.2 !important;
        }

        [data-export-settings-fit] section > div.overflow-x-auto > table th:nth-child(6),
        [data-export-settings-fit] section > div.overflow-x-auto > table th:nth-child(7) {
          font-size: 0 !important;
        }

        [data-export-settings-fit] section > div.overflow-x-auto > table th:nth-child(6)::before,
        [data-export-settings-fit] section > div.overflow-x-auto > table th:nth-child(7)::before {
          display: block;
          font-size: 12px;
          font-weight: 800;
          white-space: nowrap;
        }

        [data-export-settings-fit] section > div.overflow-x-auto > table th:nth-child(6)::before { content: 'Net Wt.'; }
        [data-export-settings-fit] section > div.overflow-x-auto > table th:nth-child(7)::before { content: 'Gross Wt.'; }

        [data-export-settings-fit] section > div.overflow-x-auto > table th:nth-child(6)::after,
        [data-export-settings-fit] section > div.overflow-x-auto > table th:nth-child(7)::after {
          content: 'CTN';
          display: block;
          margin-top: 3px;
          font-size: 9px;
          font-weight: 700;
          letter-spacing: .08em;
          opacity: .68;
        }

        [data-export-settings-fit] section > div.overflow-x-auto > table td:first-child > div {
          overflow: hidden !important;
          text-overflow: ellipsis !important;
          white-space: nowrap !important;
        }

        [data-export-settings-fit] section > div.overflow-x-auto > table td:nth-child(n+3) {
          white-space: nowrap !important;
        }

        [data-export-settings-fit] section > div.overflow-x-auto > table td:nth-child(2) {
          white-space: normal !important;
          overflow-wrap: normal !important;
          word-break: normal !important;
          line-height: 1.35 !important;
        }

        [data-export-settings-fit] section > div.overflow-x-auto > table td:nth-child(3),
        [data-export-settings-fit] section > div.overflow-x-auto > table td:nth-child(5),
        [data-export-settings-fit] section > div.overflow-x-auto > table td:nth-child(6),
        [data-export-settings-fit] section > div.overflow-x-auto > table td:nth-child(7),
        [data-export-settings-fit] section > div.overflow-x-auto > table td:nth-child(8) {
          font-size: 12px !important;
        }

        [data-export-settings-fit] section > div.overflow-x-auto > table td:nth-child(4) span {
          min-width: 0 !important;
          padding-left: 5px !important;
          padding-right: 5px !important;
          font-size: 11px !important;
        }

        [data-export-settings-fit] section > div.overflow-x-auto > table td:nth-child(9) span {
          min-width: 44px !important;
          padding-left: 6px !important;
          padding-right: 6px !important;
        }

        [data-export-settings-fit] section > div.overflow-x-auto > table td:nth-child(10) > div {
          justify-content: center !important;
          gap: 4px !important;
        }

        [data-export-settings-fit] section > div.overflow-x-auto > table td:nth-child(10) button {
          min-width: 42px !important;
          padding-left: 5px !important;
          padding-right: 5px !important;
        }

        @media (max-width: 1280px) {
          [data-export-settings-fit] section > div.overflow-x-auto > table { font-size: 11px !important; }
          [data-export-settings-fit] section > div.overflow-x-auto > table th,
          [data-export-settings-fit] section > div.overflow-x-auto > table td {
            padding-left: 4px !important;
            padding-right: 4px !important;
          }
        }
      `}</style>
    </div>
  )
}
