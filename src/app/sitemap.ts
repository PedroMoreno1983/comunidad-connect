import type { MetadataRoute } from "next";
import { CANONICAL_SITE_URL } from "@/lib/config";

const publicRoutes = [
  "",
  "/onboarding",
  "/support",
  "/soporte",
  "/privacy",
  "/terms",
];

export default function sitemap(): MetadataRoute.Sitemap {
  return publicRoutes.map((route) => ({
    url: `${CANONICAL_SITE_URL}${route}`,
    lastModified: new Date(),
    changeFrequency: route === "" ? "weekly" : "monthly",
    priority: route === "" ? 1 : 0.7,
  }));
}
