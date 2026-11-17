import type { Metadata, Viewport } from "next";
import { Anton, IBM_Plex_Mono, Inter } from "next/font/google";
import { SiteFooter, SiteHeader } from "@/components/ui";
import { siteUrl } from "@/lib/notify";
import "./globals.css";

// Anton for display capitals (one weight), Inter for UI (variable), Plex Mono for scores, times and UTRs.
// Display is "optional": headlines are the largest paint and a late swap would re-time it.
const display = Anton({ variable: "--font-anton", subsets: ["latin"], weight: "400", display: "optional", preload: true });
const sans = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap", preload: true });
const mono = IBM_Plex_Mono({ variable: "--font-plex-mono", subsets: ["latin"], weight: ["400", "600"], display: "swap", preload: false });

const DESCRIPTION = "Find and enter local tournaments in Bangalore, or run your own with automatic fixtures and live scores.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: "Sportshunt — tournaments in Bangalore", template: "%s · Sportshunt" },
  description: DESCRIPTION,
  openGraph: { type: "website", siteName: "Sportshunt", locale: "en_IN", description: DESCRIPTION },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = { themeColor: "#0B0B0C" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-IN" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body className="flex min-h-dvh flex-col">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:border-2 focus:border-ink focus:bg-flood focus:px-3 focus:py-2 focus:font-semibold focus:text-on-flood">
          Skip to content
        </a>
        <SiteHeader />
        <main id="main" className="flex-1">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
