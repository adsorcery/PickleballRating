"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Swords, Trophy, Users } from "lucide-react";
import { useT } from "@/i18n/use-locale";
import type { TranslationKey } from "@/i18n/types";
import { cn } from "@/lib/utils";

const links: { href: string; key: TranslationKey; icon: typeof Trophy }[] = [
  { href: "/", key: "nav.leaderboard", icon: Trophy },
  { href: "/predict", key: "nav.predictor", icon: Swords },
  { href: "/players", key: "nav.players", icon: Users },
  { href: "/matches", key: "nav.matches", icon: BarChart3 },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function DesktopNav() {
  const pathname = usePathname();
  const t = useT();
  return (
    <nav aria-label="Main" className="hidden min-w-0 items-center gap-1 md:flex">
      {links.map(({ href, key }) => (
        <Link
          key={href}
          href={href}
          aria-current={isActive(pathname, href) ? "page" : undefined}
          className={cn(
            "rounded-lg px-3 py-2 text-sm font-semibold leading-tight hover:bg-muted",
            isActive(pathname, href) && "bg-primary text-primary-foreground hover:bg-primary",
          )}
        >
          {t(key)}
        </Link>
      ))}
    </nav>
  );
}

export function MobileNav() {
  const pathname = usePathname();
  const t = useT();
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-border bg-card pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {links.map(({ href, key, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          aria-current={isActive(pathname, href) ? "page" : undefined}
          className={cn(
            "flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 py-1 text-center text-[11px] font-semibold leading-tight sm:text-xs",
            isActive(pathname, href) ? "text-primary" : "text-muted-foreground",
          )}
        >
          <Icon className="size-5 shrink-0" aria-hidden />
          <span className="max-w-full break-words">{t(key)}</span>
        </Link>
      ))}
    </nav>
  );
}
