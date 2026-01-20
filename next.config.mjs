/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable standalone output for Docker containerization
  // This creates a self-contained build in .next/standalone
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
