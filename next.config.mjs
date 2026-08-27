/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['xlsx', 'docx'],
  },
  async rewrites() {
    return {
      beforeFiles: [
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
          destination: '/api/moni/mobile-sales-export-bundle-v3',
        },
        {
          source: '/api/moni/sales-orders-v4',
          destination: '/api/moni/sales-orders-v6',
        },
      ],
      afterFiles: [],
      fallback: [],
    }
  },
}

export default nextConfig