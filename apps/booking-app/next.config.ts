import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@calcom/lib",
    "@calcom/features",
    "@calcom/app-store",
    "@calcom/dayjs",
    "@calcom/types",
  ],
  serverExternalPackages: ["@calcom/prisma"],
  typescript: {
    ignoreBuildErrors: true,
  },
  outputFileTracingRoot: path.join(__dirname, "../../"),
};

export default nextConfig;
