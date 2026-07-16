import type { MetadataRoute } from "next";

// TODO: replace with the real production domain before launch.
const BASE_URL = "https://kvlgrowthos.com";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: BASE_URL,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
  ];
}
