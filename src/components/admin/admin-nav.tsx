import Link from "next/link";
import { logoutAction } from "@/app/admin/login/actions";
import { T, TPlain } from "@/components/t";
import { Button } from "@/components/ui/button";
import type { TranslationKey } from "@/i18n/types";

const links: { href: string; key: TranslationKey; en: string }[] = [
  { href: "/admin", key: "nav.admin", en: "Overview" },
  { href: "/admin/players", key: "nav.players", en: "Players" },
  { href: "/admin/matches/new", key: "match.title", en: "New match" },
  { href: "/admin/settings", key: "nav.settings", en: "Settings" },
];

export function AdminNav({ email }: { email: string }) {
  return (
    <div className="mb-6 flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-2">
      <nav aria-label="Admin" className="flex flex-1 flex-wrap gap-1">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className="rounded-lg px-3 py-2 text-sm font-semibold hover:bg-muted">
            <T k={l.key} en={l.en} />
          </Link>
        ))}
      </nav>
      <span className="hidden text-xs text-muted-foreground sm:inline">{email}</span>
      <form action={logoutAction}>
        <Button type="submit" variant="outline" size="sm" className="h-auto min-h-11 whitespace-normal py-1.5 text-center">
          <TPlain k="nav.logout" plain="Sign out" />
        </Button>
      </form>
    </div>
  );
}
