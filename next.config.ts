import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Freshie control moved into the Admin area.
  async redirects() {
    return [
      { source: "/freshie-control", destination: "/admin/freshies", permanent: false },
      {
        source: "/freshie-control/:path*",
        destination: "/admin/freshies/:path*",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
