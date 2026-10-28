const isWindows = process.platform === 'win32';

/** @type {import('next').NextConfig} */
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

const nextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  experimental: {
    // Turbopack's disk cache uses atomic renames that fail on some Windows setups (os error 32,
    // files locked by antivirus/indexers). Disabled on Windows only; output is identical, just
    // without persistent caching. Linux/macOS (and Vercel) keep the cache.
    turbopackFileSystemCacheForBuild: !isWindows,
    turbopackFileSystemCacheForDev: !isWindows,
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
