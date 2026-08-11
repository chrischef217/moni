/** @type {import('next').NextConfig} */
const nextConfig = {
  // xlsx/docx 패키지가 서버 사이드에서만 동작하도록 설정
  experimental: {
    serverComponentsExternalPackages: ['xlsx', 'docx'],
  },
  async rewrites() {
    return [
      {
        source: '/api/moni/agent-chat',
        destination: '/api/moni/chatgpt-only',
      },
      {
        source: '/api/moni/agent-runtime',
        destination: '/api/moni/chatgpt-only',
      },
    ]
  },
}

export default nextConfig
