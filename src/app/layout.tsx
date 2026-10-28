import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { DesktopNav, MobileNav } from "@/components/public/site-nav";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Viet Cinco — Pickleball Leaderboard", template: "%s · Viet Cinco" },
  description: "Doubles pickleball leaderboard and matchup predictor for the Viet Cinco group.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0b5d3b" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen pb-20 md:pb-0">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-accent focus:px-3 focus:py-2"
        >
          Skip to content
        </a>
        <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4">
            <Link href="/" className="flex items-center gap-2 text-lg font-extrabold tracking-tight">
              <span aria-hidden className="inline-block size-6 rounded-full bg-accent ring-2 ring-primary" />
              Viet Cinco
            </Link>
            <DesktopNav />
            <Link href="/admin" className="text-sm font-semibold text-muted-foreground hover:text-foreground">
              Admin
            </Link>
          </div>
        </header>
        <main id="main" className="mx-auto max-w-5xl px-4 py-6 sm:py-8">
          {children}
        </main>
        <footer className="mx-auto max-w-5xl px-4 pb-8 text-xs text-muted-foreground">
          Cinco Points are an independent group rating (not DUPR) and are still being calibrated.
        </footer>
        <MobileNav />
      </body>
    </html>
  );
}
