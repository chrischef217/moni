/** @type {import('next').NextConfig} */
const nextConfig = {
  // xlsx/docx 패키지가 서버 사이드에서만 동작하도록 설정
  experimental: {
    serverComponentsExternalPackages: ['xlsx', 'docx'],
  },
}

export default nextConfig
