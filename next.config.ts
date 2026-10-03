import type { NextConfig } from 'next';
const config: NextConfig = { devIndicators: false, poweredByHeader: false, distDir: process.env.NEXT_DIST_DIR || '.next', images:{qualities:[75,100]} };
export default config;
