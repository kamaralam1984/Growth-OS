import type { MetadataRoute } from "next";

// TODO: replace with the real production domain before launch.
const BASE_URL = "https://kvlgrowthos.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
