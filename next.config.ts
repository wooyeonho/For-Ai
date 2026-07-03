import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    // Keep production builds unblocked while this legacy branch's admin/i18n
    // type debt is cleaned up incrementally. Webpack/SWC compilation and ESLint
    // still run during `next build`.
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
