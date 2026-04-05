import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Moni — 경영 고민? 모니한테 물어봐',
  description: '한국 소규모 식품 공장을 위한 AI 경영관리 도우미',
  icons: { icon: '/favicon.ico' },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ko">
      <body className="antialiased">{children}</body>
    </html>
  )
}
