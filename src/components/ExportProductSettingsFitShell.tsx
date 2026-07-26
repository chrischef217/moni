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

        [data-export-settings-fit] section > div.overflow-x-auto > table col:nth-child(1) { width: 19% !important; }
        [data-export-settings-fit] section > div.overflow-x-auto > table col:nth-child(2) { width: 16% !important; }
        [data-export-settings-fit] section > div.overflow-x-auto > table col:nth-child(3) { width: 8% !important; }
        [data-export-settings-fit] section > div.overflow-x-auto > table col:nth-child(4) { width: 12% !important; }
        [data-export-settings-fit] section > div.overflow-x-auto > table col:nth-child(5) { width: 10% !important; }
        [data-export-settings-fit] section > div.overflow-x-auto > table col:nth-child(6) { width: 10% !important; }
        [data-export-settings-fit] section > div.overflow-x-auto > table col:nth-child(7) { width: 7% !important; }
        [data-export-settings-fit] section > div.overflow-x-auto > table col:nth-child(8) { width: 7% !important; }
        [data-export-settings-fit] section > div.overflow-x-auto > table col:nth-child(9) { width: 11% !important; }

        [data-export-settings-fit] section > div.overflow-x-auto > table th,
        [data-export-settings-fit] section > div.overflow-x-auto > table td {
          min-width: 0 !important;
          padding-left: 10px !important;
          padding-right: 10px !important;
          vertical-align: middle !important;
        }

        [data-export-settings-fit] section > div.overflow-x-auto > table th {
          white-space: normal !important;
          overflow-wrap: normal !important;
          word-break: keep-all !important;
          line-height: 1.3 !important;
        }

        [data-export-settings-fit] section > div.overflow-x-auto > table th:nth-child(1),
        [data-export-settings-fit] section > div.overflow-x-auto > table th:nth-child(2),
        [data-export-settings-fit] section > div.overflow-x-auto > table th:nth-child(3),
        [data-export-settings-fit] section > div.overflow-x-auto > table th:nth-child(8),
        [data-export-settings-fit] section > div.overflow-x-auto > table th:nth-child(9) {
          white-space: nowrap !important;
        }

        [data-export-settings-fit] section > div.overflow-x-auto > table td:nth-child(1),
        [data-export-settings-fit] section > div.overflow-x-auto > table td:nth-child(2) {
          white-space: normal !important;
          overflow: hidden !important;
        }

        [data-export-settings-fit] section > div.overflow-x-auto > table td:nth-child(1) > div:first-child {
          overflow: hidden !important;
          text-overflow: ellipsis !important;
          white-space: nowrap !important;
        }

        [data-export-settings-fit] section > div.overflow-x-auto > table td:nth-child(1) > div:nth-child(2) {
          overflow: hidden !important;
          text-overflow: ellipsis !important;
          white-space: nowrap !important;
        }

        [data-export-settings-fit] section > div.overflow-x-auto > table td:nth-child(2) {
          overflow-wrap: normal !important;
          word-break: normal !important;
          line-height: 1.45 !important;
        }

        [data-export-settings-fit] section > div.overflow-x-auto > table td:nth-child(n+3) {
          white-space: nowrap !important;
        }

        [data-export-settings-fit] section > div.overflow-x-auto > table td:nth-child(3) span {
          min-width: 0 !important;
          padding-left: 7px !important;
          padding-right: 7px !important;
          font-size: 12px !important;
        }

        [data-export-settings-fit] section > div.overflow-x-auto > table td:nth-child(4) {
          font-size: 12px !important;
        }

        [data-export-settings-fit] section > div.overflow-x-auto > table td:nth-child(5),
        [data-export-settings-fit] section > div.overflow-x-auto > table td:nth-child(6),
        [data-export-settings-fit] section > div.overflow-x-auto > table td:nth-child(7) {
          font-size: 12px !important;
        }

        [data-export-settings-fit] section > div.overflow-x-auto > table td:nth-child(8) span {
          min-width: 46px !important;
          padding-left: 7px !important;
          padding-right: 7px !important;
        }

        [data-export-settings-fit] section > div.overflow-x-auto > table td:nth-child(9) > div {
          gap: 5px !important;
        }

        [data-export-settings-fit] section > div.overflow-x-auto > table td:nth-child(9) button {
          min-width: 48px !important;
          padding-left: 8px !important;
          padding-right: 8px !important;
        }

        @media (max-width: 1280px) {
          [data-export-settings-fit] section > div.overflow-x-auto > table {
            font-size: 12px !important;
          }

          [data-export-settings-fit] section > div.overflow-x-auto > table th,
          [data-export-settings-fit] section > div.overflow-x-auto > table td {
            padding-left: 7px !important;
            padding-right: 7px !important;
          }

          [data-export-settings-fit] section > div.overflow-x-auto > table td:nth-child(9) button {
            min-width: 44px !important;
            padding-left: 6px !important;
            padding-right: 6px !important;
          }
        }
      `}</style>
    </div>
  )
}
