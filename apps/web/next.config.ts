import type { NextConfig } from "next";
import { resolve } from "path";

const nextConfig: NextConfig = {
  transpilePackages: ["@apex/types"],
  outputFileTracingRoot: resolve(import.meta.dirname, "../../"),
  async redirects() {
    return [
      {
        source: "/analytics/daily-sales",
        destination: "/analytics/sales-report?view=daily",
        permanent: true,
      },
      {
        source: "/analytics/monthly-sales",
        destination: "/analytics/sales-report?view=monthly",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
