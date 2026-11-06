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
  // Dev server opened from another device or VM (e.g. 192.168.56.1).
  allowedDevOrigins: ["192.168.56.1"],
  images: {
    remotePatterns: supabaseHost
      ? [{ protocol: "https", hostname: supabaseHost, pathname: "/storage/v1/object/public/faci-avatars/**" }]
      : [],
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-store" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      // Unlisted site: no search engine indexes any page, file or API route.
      {
        source: "/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
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
