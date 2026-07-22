'use client'

export default function SidebarPinToggleVisualFix() {
  return (
    <style jsx global>{`
      [data-moni-global-sidebar] button[aria-pressed] > span:last-child {
        position: relative !important;
        width: 2.25rem !important;
        height: 1.25rem !important;
        flex: none !important;
        border-radius: 9999px !important;
      }

      [data-moni-global-sidebar] button[aria-pressed] > span:last-child > span {
        position: absolute !important;
        left: 0.125rem !important;
        top: 0.125rem !important;
        width: 1rem !important;
        height: 1rem !important;
        border-radius: 9999px !important;
        transform: translateX(0) !important;
        transition: transform 180ms ease !important;
      }

      [data-moni-global-sidebar] button[aria-pressed='true'] > span:last-child > span {
        transform: translateX(1rem) !important;
      }

      [data-moni-global-sidebar] button[aria-pressed='false'] > span:last-child > span {
        transform: translateX(0) !important;
      }
    `}</style>
  )
}
