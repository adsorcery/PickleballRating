import Link from "next/link";
import { logoutAction } from "@/app/admin/login/actions";
import { Button } from "@/components/ui/button";

const links = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/players", label: "Players" },
  { href: "/admin/matches/new", label: "New match" },
  { href: "/admin/settings", label: "Settings" },
];

export function AdminNav({ email }: { email: string }) {
  return (
    <div className="mb-6 flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-2">
      <nav aria-label="Admin" className="flex flex-1 flex-wrap gap-1">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className="rounded-lg px-3 py-2 text-sm font-semibold hover:bg-muted">
            {l.label}
          </Link>
        ))}
      </nav>
      <span className="hidden text-xs text-muted-foreground sm:inline">{email}</span>
      <form action={logoutAction}>
        <Button type="submit" variant="outline" size="sm">
          Sign out
        </Button>
      </form>
    </div>
  );
}
