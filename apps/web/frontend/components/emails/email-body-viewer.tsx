"use client";

import { useMemo, useState } from "react";

const EMAIL_VIEWER_CSS = `
  :root { color-scheme: light; }
  html, body { margin: 0; padding: 0; }
  body {
    padding: 14px 16px;
    font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji";
    font-size: 14px;
    line-height: 1.45;
    color: #0f172a;
    background: #ffffff;
  }
  * { box-sizing: border-box; }
  img { max-width: 100%; height: auto; }
  table { max-width: 100%; }
  pre { white-space: pre-wrap; word-break: break-word; }
  blockquote {
    margin: 0 0 0 12px;
    padding-left: 12px;
    border-left: 3px solid #e2e8f0;
  }
  hr { border: 0; border-top: 1px solid #e2e8f0; margin: 12px 0; }
  a { color: #0b5fff; }
`;

const HTML_HEAD_TAG_RE = /<head\b[^>]*>/i;
const HTML_HTML_TAG_RE = /<html\b[^>]*>/i;

function looksLikeHtml(raw: string): boolean {
  const sample = raw.trim().slice(0, 2000).toLowerCase();
  if (!sample) {
    return false;
  }

  return (
    sample.includes("<html") ||
    sample.includes("<body") ||
    sample.includes("<div") ||
    sample.includes("<p") ||
    sample.includes("<table") ||
    sample.includes("<br") ||
    sample.includes("<span") ||
    sample.includes("</")
  );
}

function buildEmailSrcDoc(rawHtml: string): string {
  const injected = `<base target="_blank" /><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><style>${EMAIL_VIEWER_CSS}</style>`;

  if (HTML_HEAD_TAG_RE.test(rawHtml)) {
    return rawHtml.replace(HTML_HEAD_TAG_RE, (match) => `${match}${injected}`);
  }

  if (HTML_HTML_TAG_RE.test(rawHtml)) {
    return rawHtml.replace(
      HTML_HTML_TAG_RE,
      (match) => `${match}<head>${injected}</head>`
    );
  }

  return `<!doctype html><html><head>${injected}</head><body>${rawHtml}</body></html>`;
}

function buildSrcDocIfHtml(bodyHtml: string | null | undefined): string | null {
  if (!(bodyHtml && looksLikeHtml(bodyHtml))) {
    return null;
  }

  return buildEmailSrcDoc(bodyHtml);
}

function handleIframeLoad(
  iframe: HTMLIFrameElement,
  setHeight: (height: number) => void
): void {
  const doc = iframe.contentDocument;
  if (!doc?.body) {
    return;
  }

  for (const anchor of Array.from(doc.querySelectorAll("a[href]"))) {
    anchor.setAttribute("target", "_blank");
    anchor.setAttribute("rel", "noopener noreferrer");
  }

  doc.addEventListener(
    "click",
    (event) => {
      const target = event.target as Element | null;
      const anchor = target?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor) {
        return;
      }

      const href = anchor.getAttribute("href") ?? "";
      if (
        !href ||
        href.startsWith("#") ||
        href.toLowerCase().startsWith("javascript:")
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const resolvedHref = (() => {
        try {
          return new URL(href, doc.baseURI).toString();
        } catch {
          return href;
        }
      })();

      window.open(resolvedHref, "_blank", "noopener,noreferrer");
    },
    { capture: true }
  );

  setHeight(Math.max(300, doc.body.scrollHeight + 32));
}

interface EmailBodyViewerProps {
  bodyHtml?: string | null;
  bodyText?: string | null;
  title?: string;
}

export function EmailBodyViewer({
  bodyHtml,
  bodyText,
  title = "Email content",
}: EmailBodyViewerProps) {
  const [iframeHeight, setIframeHeight] = useState(400);

  const iframeSrcDoc = useMemo(() => buildSrcDocIfHtml(bodyHtml), [bodyHtml]);

  if (iframeSrcDoc) {
    return (
      // biome-ignore lint/a11y/noNoninteractiveElementInteractions: iframe onLoad is used to size sandboxed email HTML.
      <iframe
        className="w-full rounded-lg border border-border bg-white"
        key={iframeSrcDoc}
        onLoad={(event) =>
          handleIframeLoad(event.currentTarget, setIframeHeight)
        }
        sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        srcDoc={iframeSrcDoc}
        style={{ height: iframeHeight }}
        title={title}
      />
    );
  }

  return (
    <pre className="whitespace-pre-wrap rounded-lg border border-border bg-muted/30 p-4 text-sm">
      {bodyText ?? "(no content)"}
    </pre>
  );
}
