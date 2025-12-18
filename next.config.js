/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'picsum.photos',
      },
      {
        protocol: 'https',
        hostname: 'replicate.delivery',
      },
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
      {
        // Specific Supabase project URL
        protocol: 'https',
        hostname: 'osupcybolqbtnzbiszkl.supabase.co',
      },
      {
        // Whop favicon
        protocol: 'https',
        hostname: 'docs.whop.com',
      },
    ],
  },
  async rewrites() {
    return [
      {
        // Handle Whop's .html extension requests
        source: '/whop-embed.html',
        destination: '/whop-embed',
      },
    ]
  },
  async headers() {
    return [
      {
        // Allow embedding in Whop iframe
        source: '/:path*',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'ALLOWALL',
          },
          {
            key: 'Content-Security-Policy',
            value: "frame-ancestors 'self' https://*.whop.com https://whop.com http://localhost:*",
          },
        ],
      },
    ]
  },
}

module.exports = nextConfig
