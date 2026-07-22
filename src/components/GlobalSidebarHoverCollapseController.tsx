'use client'

export default function GlobalSidebarHoverCollapseController() {
  return (
    <style jsx global>{`
      @media (min-width: 1024px) {
        [data-moni-global-sidebar] nav > div.mb-1:not(:hover) > div {
          grid-template-rows: 0fr !important;
          opacity: 0 !important;
        }

        [data-moni-global-sidebar] nav > div.mb-1:hover > div {
          grid-template-rows: 1fr !important;
          opacity: 1 !important;
        }

        [data-moni-global-sidebar] nav > div.mb-1:not(:hover) > button > span:last-child {
          transform: rotate(0deg) !important;
        }

        [data-moni-global-sidebar] nav > div.mb-1:hover > button > span:last-child {
          transform: rotate(180deg) !important;
        }
      }
    `}</style>
  )
}
