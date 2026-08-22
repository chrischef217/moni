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
      {
        source: '/api/moni/mobile-business-actions',
        destination: '/api/moni/mobile-business-actions-v3',
      },
      {
        source: '/api/moni/mobile-sales-export-bundle',
        destination: '/api/moni/mobile-sales-export-bundle-v2',
      },
    ]
  },
}

export default nextConfig
