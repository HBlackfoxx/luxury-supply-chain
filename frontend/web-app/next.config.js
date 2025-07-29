/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    domains: ['localhost', 'verify.luxe-bags.luxury'],
  },
  async rewrites() {
    return [
      {
        source: '/api/consensus/:path*',
        destination: 'http://localhost:3001/api/consensus/:path*',
      },
      {
        source: '/api/customer/:path*',
        destination: 'http://localhost:3002/api/customer/:path*',
      },
      {
        source: '/api/service-account/:path*',
        destination: 'http://localhost:3002/api/service-account/:path*',
      },
      {
        source: '/api/admin/:path*',
        destination: 'http://localhost:3002/api/admin/:path*',
      },
    ];
  },
};

module.exports = nextConfig;