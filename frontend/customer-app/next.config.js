/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_CUSTOMER_GATEWAY_URL: process.env.NEXT_PUBLIC_CUSTOMER_GATEWAY_URL || 'http://localhost:3010',
    NEXT_PUBLIC_RETAILER_API_URL: process.env.NEXT_PUBLIC_RETAILER_API_URL || 'http://localhost:4004',
  },
  images: {
    domains: ['localhost'],
  },
}

module.exports = nextConfig