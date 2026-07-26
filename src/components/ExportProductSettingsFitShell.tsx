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

        /* Keep the descriptive columns wide and reclaim space from compact numeric columns. */
        [data-export-settings-fit] section > div.overflow-x-auto > table col:nth-child(1) { width: 22% !important; }
        [data-export-settings-fit] section > div.overflow-x-auto > table col:nth-child(2) { width: 18% !important; }
        [data-export-settings-fit] section > div.overflow-x-auto > table col:nth-child(3) { width: 8% !important; }
        [data-export-settings-fit] section > div.overflow-x-auto > table col:nth-child(4) { width: 12% !important; }
        [data-export-settings-fit] section > div.overflow-x-auto > table col:nth-child(5) { width: 7.5% !important; }
        [data-export-settings-fit] section > div.overflow-x-auto > table col:nth-child(6) { width: 8% !important; }
        [data-export-settings-fit] section > div.overflow-x-auto > table col:nth-child(7) { width: 6.5% !important; }
        [data-export-settings-fit] section > div.overflow-x-auto > table col:nth-child(8) { width: 7% !important; }
        [data-export-settings-fit] section > div.overflow-x-auto > table col:nth-child(9) { width: 11% !important; }

        [data-export-settings-fit] section > div.overflow-x-auto > table th,
        [data-export-settings-fit] section > div.overflow-x-auto > table td {
          min-width: 0 !important;
          padding-left: 8px !important;
          padding-right: 8px !important;
          vertical-align: middle !important;
        }

        /* Only finished-product information stays left aligned. Everything else is centered. */
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
          overflow-wrap: normal !important;
          word-break: keep-all !important;
          line-height: 1.25 !important;
        }

        [data-export-settings-fit] section > div.overflow-x-auto > table th:nth-child(1),
        [data-export-settings-fit] section > div.overflow-x-auto > table th:nth-child(2),
        [data-export-settings-fit] section > div.overflow-x-auto > table th:nth-child(3),
        [data-export-settings-fit] section > div.overflow-x-auto > table th:nth-child(4),
        [data-export-settings-fit] section > div.overflow-x-auto > table th:nth-child(7),
        [data-export-settings-fit] section > div.overflow-x-auto > table th:nth-child(8),
        [data-export-settings-fit] section > div.overflow-x-auto > table th:nth-child(9) {
          white-space: nowrap !important;
        }

        /* Weight headers use a compact label so header text does not dictate column width. */
        [data-export-settings-fit] section > div.overflow-x-auto > table th:nth-child(5),
        [data-export-settings-fit] section > div.overflow-x-auto > table th:nth-child(6) {
          font-size: 0 !important;
          white-space: normal !important;
        }

        [data-export-settings-fit] section > div.overflow-x-auto > table th:nth-child(5)::before,
        [data-export-settings-fit] section > div.overflow-x-auto > table th:nth-child(6)::before {
          display: block;
          font-size: 12px;
          font-weight: 800;
          line-height: 1.15;
          white-space: nowrap;
        }

        [data-export-settings-fit] section > div.overflow-x-auto > table th:nth-child(5)::before {
          content: 'Net Wt.';
        }

        [data-export-settings-fit] section > div.overflow-x-auto > table th:nth-child(6)::before {
          content: 'Gross Wt.';
        }

        [data-export-settings-fit] section > div.overflow-x-auto > table th:nth-child(5)::after,
        [data-export-settings-fit] section > div.overflow-x-auto > table th:nth-child(6)::after {
          content: 'CTN';
          display: block;
          margin-top: 3px;
          font-size: 9px;
          font-weight: 700;
          line-height: 1;
          letter-spacing: 0.08em;
          opacity: 0.68;
        }

        [data-export-settings-fit] section > div.overflow-x-auto > table td:nth-child(1),
        [data-export-settings-fit] section > div.overflow-x-auto > table td:nth-child(2) {
          white-space: normal !important;
          overflow: hidden !important;
        }

        [data-export-settings-fit] section > div.overflow-x-auto > table td:nth-child(1) > div:first-child,
        [data-export-settings-fit] section > div.overflow-x-auto > table td:nth-child(1) > div:nth-child(2) {
          overflow: hidden !important;
          text-overflow: ellipsis !important;
          white-space: nowrap !important;
        }

        [data-export-settings-fit] section > div.overflow-x-auto > table td:nth-child(2) {
          overflow-wrap: normal !important;
          word-break: normal !important;
          line-height: 1.4 !important;
        }

        [data-export-settings-fit] section > div.overflow-x-auto > table td:nth-child(n+3) {
          white-space: nowrap !important;
        }

        [data-export-settings-fit] section > div.overflow-x-auto > table td:nth-child(3) span {
          min-width: 0 !important;
          padding-left: 6px !important;
          padding-right: 6px !important;
          font-size: 12px !important;
        }

        [data-export-settings-fit] section > div.overflow-x-auto > table td:nth-child(4),
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
          justify-content: center !important;
          gap: 5px !important;
        }

        [data-export-settings-fit] section > div.overflow-x-auto > table td:nth-child(9) button {
          min-width: 48px !important;
          padding-left: 7px !important;
          padding-right: 7px !important;
        }

        @media (max-width: 1280px) {
          [data-export-settings-fit] section > div.overflow-x-auto > table {
            font-size: 12px !important;
          }

          [data-export-settings-fit] section > div.overflow-x-auto > table th,
          [data-export-settings-fit] section > div.overflow-x-auto > table td {
            padding-left: 5px !important;
            padding-right: 5px !important;
          }

          [data-export-settings-fit] section > div.overflow-x-auto > table td:nth-child(9) button {
            min-width: 42px !important;
            padding-left: 5px !important;
            padding-right: 5px !important;
          }
        }
      `}</style>
    </div>
  )
}
