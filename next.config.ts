import type { NextConfig } from "next";

// Faci photos are served from the Supabase storage host.
const supabaseHost = (() => {
  try {
    return new URL((process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim()).hostname;
  } catch {
    return null;
  }
})();

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: supabaseHost
      ? [{ protocol: "https", hostname: supabaseHost, pathname: "/storage/v1/object/public/faci-avatars/**" }]
      : [],
  },
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
