import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  ...(process.env.NODE_ENV === "production"
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
      ]
    : []),
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  trailingSlash: true,
  reactStrictMode: true,
  poweredByHeader: false,
  turbopack: {
    root: __dirname,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
  async redirects() {
    return [
      { source: "/index.html", destination: "/", permanent: true },
      {
        source: "/",
        has: [{ type: "query", key: "p", value: "29" }],
        destination: "/contact/",
        permanent: true,
      },
      {
        source: "/",
        has: [{ type: "query", key: "p", value: "29.html" }],
        destination: "/contact/",
        permanent: true,
      },
      {
        source: "/",
        has: [{ type: "query", key: "p", value: "18226" }],
        destination: "/about/",
        permanent: true,
      },
      {
        source: "/",
        has: [{ type: "query", key: "p", value: "23997" }],
        destination: "/careers/",
        permanent: true,
      },
      {
        source: "/",
        has: [{ type: "query", key: "p", value: "11461" }],
        destination: "/services/",
        permanent: true,
      },
      {
        source: "/",
        has: [{ type: "query", key: "p", value: "24148" }],
        destination: "/servicerequests/",
        permanent: true,
      },
      {
        source: "/",
        has: [{ type: "query", key: "p", value: "24185" }],
        destination: "/servicerequests/thank-you/",
        permanent: true,
      },
      {
        source: "/",
        has: [{ type: "query", key: "p", value: "3" }],
        destination: "/privacy-policy/",
        permanent: true,
      },
      {
        source: "/",
        has: [{ type: "query", key: "p", value: "75" }],
        destination: "/sitemap/",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
