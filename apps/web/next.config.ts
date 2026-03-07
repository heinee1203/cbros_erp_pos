import type { NextConfig } from "next";
import { resolve } from "path";

const nextConfig: NextConfig = {
  transpilePackages: ["@apex/types"],
  outputFileTracingRoot: resolve(import.meta.dirname, "../../"),
};

export default nextConfig;
