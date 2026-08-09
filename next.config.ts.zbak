import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  allowedDevOrigins: [
    'preview-chat-cd89f9cd-a7a2-497d-beed-b3d9e9595038.space-z.ai',
    'space-z.ai',
    '*.space-z.ai',
  ],
  headers: async () => [
    {
      source: "/sw.js",
      headers: [
        {
          key: "Cache-Control",
          value: "no-cache, no-store, must-revalidate",
        },
        {
          key: "Service-Worker-Allowed",
          value: "/",
        },
      ],
    },
    // Allow preview panel (iframe cross-origin) to load all resources
    {
      source: "/:path*",
      headers: [
        {
          key: "Access-Control-Allow-Origin",
          value: "*",
        },
        {
          key: "Access-Control-Allow-Methods",
          value: "GET, OPTIONS, POST, PUT, DELETE, PATCH",
        },
        {
          key: "Access-Control-Allow-Headers",
          value: "*",
        },
      ],
    },
  ],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'sfile.chatglm.cn',
      },
      {
        protocol: 'https',
        hostname: '**.chatglm.cn',
      },
    ],
  },
};

export default nextConfig;
