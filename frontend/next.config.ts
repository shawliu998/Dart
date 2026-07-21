import type { NextConfig } from "next";

const extraDevOrigins = (process.env.BIDEVIDENCE_ALLOWED_DEV_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
  allowedDevOrigins: ["localhost", "127.0.0.1", ...extraDevOrigins],
};

export default nextConfig;
