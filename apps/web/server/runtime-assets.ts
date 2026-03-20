import { mkdir, rm } from "node:fs/promises";
import { file } from "bun";

const STATIC_DIRS = [
  "./apps/web/frontend/public",
  "./apps/web/frontend/.bundle/apps/web/frontend",
];
const WEB_BUNDLE_DIR = "./apps/web/frontend/.bundle/apps/web/frontend";
const KASM_PATH_PREFIX_PATTERN = /^\/kasm/;
const KASM_VIEWER_BASE_URL =
  process.env.PERMIT_WORKER_KASM_VIEWER_URL?.trim() ||
  "http://permit-worker-kasm:8444";
const MARICOPA_KASM_ORIGIN = `https://${process.env.MARICOPA_KASM_HOST?.trim() || "maricopa-kasm.desertservices.app"}`;
const MARICOPA_KASM_SHELL_HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "Cross-Origin-Embedder-Policy": "require-corp",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-site",
  "Permissions-Policy": `cross-origin-isolated=(self "${MARICOPA_KASM_ORIGIN}")`,
} as const;
const MARICOPA_KASM_HTML_STRIP_PATTERNS = [
  /\s*<!-- Google Fonts - DM Sans and Sora -->\s*/g,
  /\s*<link rel="preconnect" href="https:\/\/fonts\.googleapis\.com">\s*/g,
  /\s*<link rel="preconnect" href="https:\/\/fonts\.gstatic\.com" crossorigin>\s*/g,
  /\s*<link[\s\S]*?href="https:\/\/fonts\.googleapis\.com\/css2[^"]*"[\s\S]*?>\s*/g,
  /\s*<!-- PDF\.js viewer CSS \(lazy-loaded, non-render-blocking\) -->\s*/g,
  /\s*<link[\s\S]*?href="https:\/\/unpkg\.com\/pdfjs-dist@[^"]*"[\s\S]*?>\s*/g,
  /\s*<!-- MapLibre GL CSS \(lazy-loaded, non-render-blocking\) -->\s*/g,
  /\s*<link[\s\S]*?href="https:\/\/unpkg\.com\/maplibre-gl@[^"]*"[\s\S]*?>\s*/g,
] as const;

export interface KasmProxySocketData {
  pendingMessages: Array<string | ArrayBuffer | Uint8Array>;
  upstream: WebSocket | null;
  upstreamUrl: string;
}

interface KasmUpstreamWebSocketConstructor {
  new (
    url: string,
    options?: {
      headers?: Record<string, string>;
    }
  ): WebSocket;
}

const KasmUpstreamWebSocket =
  WebSocket as unknown as KasmUpstreamWebSocketConstructor;

export function createKasmUpstreamSocket(url: string): WebSocket {
  return new KasmUpstreamWebSocket(url);
}

export async function buildWebFrontendBundle() {
  await rm(WEB_BUNDLE_DIR, { force: true, recursive: true });
  await mkdir(WEB_BUNDLE_DIR, { recursive: true });

  const result = await Bun.build({
    entrypoints: ["./apps/web/frontend/main.tsx"],
    minify: process.env.NODE_ENV === "production",
    outdir: WEB_BUNDLE_DIR,
    sourcemap: "none",
    target: "browser",
  });

  if (!result.success) {
    const messages = result.logs.map((log) => log.message).join("\n");
    throw new Error(`Failed to build apps/web frontend bundle\n${messages}`);
  }
}

export async function findWebStaticFile(pathname: string) {
  for (const dir of STATIC_DIRS) {
    const staticFile = file(`${dir}${pathname}`);
    if (await staticFile.exists()) {
      return staticFile;
    }
  }

  return null;
}

function stripMaricopaKasmShellLinks(html: string): string {
  let nextHtml = html;

  for (const pattern of MARICOPA_KASM_HTML_STRIP_PATTERNS) {
    nextHtml = nextHtml.replace(pattern, "");
  }

  return nextHtml.replace(
    "<title>Desert Services Hub</title>",
    "<title>Desert Services Hub - Maricopa Kasm</title>"
  );
}

export async function getMaricopaKasmShell(port: number): Promise<Response> {
  const upstream = await fetch(`http://127.0.0.1:${port}/automation`, {
    headers: {
      accept: "text/html",
    },
  });
  const html = stripMaricopaKasmShellLinks(await upstream.text());

  return new Response(html, {
    headers: MARICOPA_KASM_SHELL_HEADERS,
    status: upstream.status,
    statusText: upstream.statusText,
  });
}

export async function proxyKasmViewer(req: Request): Promise<Response> {
  const requestUrl = new URL(req.url);
  const upstreamBase = new URL(KASM_VIEWER_BASE_URL);
  const upstreamPath =
    requestUrl.pathname === "/kasm" ||
    requestUrl.pathname === "/kasm/" ||
    requestUrl.pathname === "/kasm/index.html"
      ? "/"
      : requestUrl.pathname.replace(KASM_PATH_PREFIX_PATTERN, "") ||
        "/index.html";
  const upstreamUrl = new URL(
    `${upstreamPath}${requestUrl.search}`,
    upstreamBase
  );
  const upstreamHeaders = new Headers(req.headers);

  upstreamHeaders.set("host", upstreamBase.host);
  upstreamHeaders.delete("content-length");

  const upstream = await fetch(upstreamUrl, {
    headers: upstreamHeaders,
    method: req.method,
    redirect: "manual",
  });
  const responseHeaders = new Headers(upstream.headers);

  responseHeaders.delete("content-length");

  return new Response(upstream.body, {
    headers: responseHeaders,
    status: upstream.status,
    statusText: upstream.statusText,
  });
}

export function getKasmViewerWebSocketUrl(req: Request): string {
  const requestUrl = new URL(req.url);
  const upstreamBase = new URL(KASM_VIEWER_BASE_URL);
  const upstreamUrl = new URL(
    `${requestUrl.pathname.replace(KASM_PATH_PREFIX_PATTERN, "")}${requestUrl.search}`,
    upstreamBase
  );

  upstreamUrl.protocol = upstreamUrl.protocol === "https:" ? "wss:" : "ws:";
  return upstreamUrl.toString();
}
