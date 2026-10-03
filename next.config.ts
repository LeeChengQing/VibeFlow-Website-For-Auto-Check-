import type { NextConfig } from 'next';
const localUploads = process.env.NODE_ENV !== 'production' && process.env.SITE_MANAGEMENT_LOCAL === 'true';
const config: NextConfig = { devIndicators: false, poweredByHeader: false, distDir: process.env.NEXT_DIST_DIR || '.next', images:{qualities:[75,100]}, experimental: { serverActions: { bodySizeLimit: localUploads ? '21mb' : '3mb' } } };
export default config;
