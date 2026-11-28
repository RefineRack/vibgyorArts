import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: process.env.DISABLE_DEV_INDICATOR === "1" ? false : undefined,
  cacheComponents: true,
  partialPrefetching: true,
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
