/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['xlsx', 'docx'],
  },
  async rewrites() {
    return [
      {
        source: '/api/moni/mobile-extended-actions',
        destination: '/api/moni/mobile-extended-actions-v2',
      },
    ]
  },
}

export default nextConfig
