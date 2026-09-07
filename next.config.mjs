/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Puppeteer and the Prisma engine are native/large server-only deps. Keeping them
  // external stops Next from trying to bundle them into the serverless output.
  experimental: {
    serverComponentsExternalPackages: ['puppeteer', '@prisma/client', 'bullmq', 'ioredis'],
  },

  eslint: {
    dirs: ['src'],
  },

  images: {
    // Label photos are served either from local disk (/api/files/...) or from S3.
    remotePatterns: [
      { protocol: 'https', hostname: '*.amazonaws.com' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
    ],
  },

  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
    ];
  },
};

export default nextConfig;
