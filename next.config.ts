import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Template and master-list uploads are limited to 1 MB; leave room for form overhead.
  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
  },
  // exceljs and the Postgres driver run on the server only.
  serverExternalPackages: ["exceljs", "pg"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
