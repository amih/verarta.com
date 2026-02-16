import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // HTML pages: no caching so deploys take effect immediately
        source: '/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
        ],
        missing: [
          { type: 'header', key: 'x-nextjs-data' }, // don't affect data requests
        ],
      },
      {
        // Static assets (_next/static/) already have content hashes — cache forever
        source: '/_next/static/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
    ];
  },
};

export default nextConfig;
