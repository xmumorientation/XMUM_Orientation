import type { MetadataRoute } from "next";

// Crawling stays allowed on purpose: a search engine must fetch a page to see
// its noindex (layout.tsx metadata and the X-Robots-Tag header in
// next.config.ts), and that is how pages it indexed before are dropped.
// Blocking crawling here would keep them in results. No sitemap: the site is
// unlisted.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/dashboard", "/gm", "/committee", "/guardian"],
      },
    ],
  };
}
