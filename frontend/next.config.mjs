/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  async rewrites() {
    return [
      // output endpoints are handled by the Route Handler (no timeout limit)
      {
        source: '/api/output/:path*',
        destination: '/api/output/:path*',
      },
      {
        source: '/api/:path*',
        destination: 'http://127.0.0.1:5000/:path*'
      }
    ]
  }
};

export default nextConfig;
