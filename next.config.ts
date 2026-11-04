import type { NextConfig } from 'next';

const localUploads = process.env.NODE_ENV !== 'production' && process.env.SITE_MANAGEMENT_LOCAL === 'true';

const config: NextConfig = {
  devIndicators: false,
  poweredByHeader: false,
  distDir: process.env.NEXT_DIST_DIR || '.next',
  images: { qualities: [75, 100] },
  experimental: {
    serverActions: { bodySizeLimit: localUploads ? '21mb' : '3mb' },
  },
  async headers() {
    return [
      {
        source: '/success',
        headers: [
          { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate, proxy-revalidate' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
        ],
      },
      {
        source: '/api/checkout/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
        ],
      },
    ];
  },
};

export default config;
