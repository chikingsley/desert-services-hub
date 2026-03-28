import path from "node:path";
import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite-plus";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, rootDir, "");
  const publicTunnelHost = env.VITE_DEV_TUNNEL_HOST?.trim();
  const apiProxyTarget =
    env.VITE_API_PROXY_TARGET?.trim() || "http://127.0.0.1:8787";
  const hmrProtocol =
    env.VITE_DEV_TUNNEL_PROTOCOL?.trim() === "ws" ? "ws" : "wss";
  const hmrClientPort = Number.parseInt(
    env.VITE_DEV_TUNNEL_CLIENT_PORT ?? "443",
    10
  );

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@": path.resolve(rootDir, "./src"),
      },
    },
    server: {
      allowedHosts: publicTunnelHost ? [publicTunnelHost] : undefined,
      hmr: publicTunnelHost
        ? {
            clientPort: Number.isFinite(hmrClientPort) ? hmrClientPort : 443,
            host: publicTunnelHost,
            protocol: hmrProtocol,
          }
        : undefined,
      host: "0.0.0.0",
      origin: publicTunnelHost ? `https://${publicTunnelHost}` : undefined,
      port: 4173,
      proxy: {
        "/api": {
          changeOrigin: true,
          secure: false,
          target: apiProxyTarget,
        },
      },
      strictPort: true,
    },
    test: {
      include: ["src/**/*.test.ts"],
    },
  };
});
