import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { LocaleSwitcher, RoastBanner } from "@/components/locale-switcher";
import { DesktopNav, MobileNav } from "@/components/public/site-nav";
import { RoastOnly, T } from "@/components/t";
import { LocaleProvider } from "@/i18n/use-locale";
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
        <LocaleProvider>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-accent focus:px-3 focus:py-2"
        >
          Skip to content
        </a>
        <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur">
          <div className="mx-auto flex min-h-14 max-w-5xl items-center justify-between gap-x-3 gap-y-1 px-4 py-1">
            <Link href="/" className="flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap text-lg font-extrabold tracking-tight">
              <span aria-hidden className="inline-block size-6 rounded-full bg-accent ring-2 ring-primary" />
              Viet Cinco
            </Link>
            <DesktopNav />
            <div className="flex items-center gap-2 sm:shrink-0 sm:gap-3">
              <LocaleSwitcher />
              <Link
                href="/admin"
                className="inline-flex min-h-11 max-w-[6.5rem] items-center justify-end text-right text-xs font-semibold leading-tight text-muted-foreground hover:text-foreground sm:max-w-none sm:whitespace-nowrap sm:text-sm"
              >
                <T k="nav.admin" />
              </Link>
            </div>
          </div>
        </header>
        <RoastBanner />
        <main id="main" className="mx-auto max-w-5xl px-4 py-6 sm:py-8">
          {children}
        </main>
        <footer className="mx-auto max-w-5xl px-4 pb-8 text-xs text-muted-foreground">
          Cinco Points are an independent group rating (not DUPR) and are still being calibrated.
          <RoastOnly>
            <span className="mt-1 block font-semibold" lang="vi">
              <T k="app.title" />
            </span>
          </RoastOnly>
        </footer>
        <MobileNav />
        </LocaleProvider>
      </body>
    </html>
  );
}
