import { AdminNav } from "@/components/admin/admin-nav";
import { BackupButton, ConfigForm } from "@/components/admin/settings-forms";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { requireAdminPage } from "@/lib/auth/guard";
import { latestBackupRuns } from "@/lib/backup";
import { getDb } from "@/lib/db/client";
import { getEnv } from "@/lib/env";
import { getActiveConfig, listConfigVersions } from "@/lib/services/config";
import { formatDateTime } from "@/lib/time";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const admin = await requireAdminPage();
  const db = getDb();
  const active = getActiveConfig(db);
  const versions = listConfigVersions(db);
  const runs = latestBackupRuns(5);
  const env = getEnv();
  const tz = active.config.timezone;
  const offsiteConfigured = !!(env.BACKUP_S3_BUCKET && env.BACKUP_S3_ACCESS_KEY_ID && env.BACKUP_S3_SECRET_ACCESS_KEY);

  return (
    <div className="space-y-6">
      <AdminNav email={admin.email} />
      <h1 className="text-2xl font-extrabold">Settings</h1>
      <ConfigForm key={active.version} config={active.config} version={active.version} />

      <Card className="space-y-3">
        <CardTitle>Algorithm versions</CardTitle>
        <ul className="divide-y divide-border text-sm">
          {versions.map((v) => (
            <li key={v.version} className="flex flex-wrap items-center gap-2 py-2">
              <Badge variant={v.version === active.version ? "success" : "muted"}>v{v.version}</Badge>
              <span className="font-semibold">{v.config.algorithmVersion}</span>
              <span className="tabular text-muted-foreground">
                β {v.config.beta} · K {v.config.k} · cap {v.config.maximumTeamDelta}
              </span>
              <time className="ml-auto text-xs text-muted-foreground">{formatDateTime(v.effectiveAt.getTime(), tz)}</time>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="space-y-3">
        <div>
          <CardTitle>Export and backups</CardTitle>
          <CardDescription>
            Backups use SQLite&apos;s online backup API (safe with WAL), are integrity-checked, compressed, and{" "}
            {offsiteConfigured ? "uploaded off-host." : "kept on the disk only — configure BACKUP_S3_* to enable off-host copies."}
          </CardDescription>
        </div>
        <div className="flex flex-wrap gap-2 text-sm font-semibold">
          <a className="rounded-lg border border-border px-3 py-2 hover:bg-muted" href="/admin/export?format=json" download>
            Download full export (JSON)
          </a>
          <a className="rounded-lg border border-border px-3 py-2 hover:bg-muted" href="/admin/export?format=players.csv" download>
            Download players (CSV)
          </a>
        </div>
        <BackupButton />
        <ul className="space-y-1 text-sm">
          {runs.length === 0 && <li className="text-muted-foreground">No backups recorded yet. Schedule: every {env.BACKUP_INTERVAL_HOURS || "—"} h.</li>}
          {runs.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2">
              <Badge variant={r.error ? "destructive" : "success"}>{r.error ? "failed" : "ok"}</Badge>
              <span>{formatDateTime(r.startedAt.getTime(), tz)}</span>
              <span className="text-muted-foreground">
                {r.kind} · {r.sizeBytes ? `${(r.sizeBytes / 1024).toFixed(0)} KB` : "—"} · off-host: {r.offsiteStatus ?? "—"}
              </span>
              {r.error && <span className="text-destructive">{r.error}</span>}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
