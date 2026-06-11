import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  allowedDevOrigins: ["*.ngrok-free.app", "*.ngrok.io", "*.ngrok.app", "*.ngrok-free.dev"],
};

export default nextConfig;
