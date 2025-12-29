/** @type {import('next').NextConfig} */
const nextConfig = {
  // For Next.js 15 and 16, serverActions config might still be under experimental 
  // OR the limit needs to be higher.
  // But let's verify if 'serverActions' is valid at root. 
  // Recent docs: experimental.serverActions.bodySizeLimit.

  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
};

export default nextConfig;
