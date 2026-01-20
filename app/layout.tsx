import type { Metadata, Viewport } from "next";
import { DM_Sans, Sora } from "next/font/google";
import type React from "react";
import { Toaster } from "sonner";
import "../styles/globals.css";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const sora = Sora({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Desert Services Hub",
  description:
    "Estimation workflow platform for takeoffs, quoting, contracts, and projects",
  generator: "v0.app",
  icons: {
    icon: [
      { url: "/icon-light-32x32.png", media: "(prefers-color-scheme: light)" },
      { url: "/icon-dark-32x32.png", media: "(prefers-color-scheme: dark)" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    apple: "/apple-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8f5f2" },
    { media: "(prefers-color-scheme: dark)", color: "#1a1625" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html className={`${dmSans.variable} ${sora.variable}`} lang="en">
      <head>
        {/* PDF.js viewer CSS - loaded from CDN to avoid SVG reference bundling issues */}
        <link
          href="https://unpkg.com/pdfjs-dist@5.4.530/web/pdf_viewer.css"
          rel="stylesheet"
        />
      </head>
      <body className="font-sans antialiased">
        <SidebarProvider>
          <AppSidebar />
          <SidebarInset className="texture-noise bg-desert-gradient">
            {children}
          </SidebarInset>
        </SidebarProvider>
        <Toaster richColors />
      </body>
    </html>
  );
}
