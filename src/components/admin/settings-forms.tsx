"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { publishConfigAction, runBackupAction } from "@/app/admin/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { RatingConfig } from "@/lib/rating/config";

type Msg = { kind: "success" | "destructive"; text: string } | null;

export function ConfigForm({ config, version }: { config: RatingConfig; version: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<Msg>(null);
  const [errors, setErrors] = useState<Record<string, string[]>>({});

  function submit(fd: FormData) {
    const num = (k: string) => Number(fd.get(k));
    const next: RatingConfig = {
      algorithmVersion: config.algorithmVersion,
      beta: num("beta"),
      k: num("k"),
      maximumTeamDelta: num("maximumTeamDelta"),
      weightTiers: config.weightTiers.map((t, i) => ({ minGames: num(`tier-min-${i}`), weight: num(`tier-weight-${i}`) })),
      trailingWindowDays: num("trailingWindowDays"),
      provisionalGames: num("provisionalGames"),
      matchupDiscount: { freeGames: num("freeGames"), multiplier: num("multiplier") },
      timezone: String(fd.get("timezone") ?? "").trim(),
    };
    start(async () => {
      const res = await publishConfigAction({ config: next, reason: fd.get("reason") });
      if (res.ok) {
        setMsg({ kind: "success", text: `Published version ${res.data.version}. It applies to newly confirmed matches only; existing matches keep their stored settings.` });
        setErrors({});
        router.refresh();
      } else {
        setMsg({ kind: "destructive", text: res.error });
        setErrors(res.fieldErrors ?? {});
      }
    });
  }

  const field = (id: string, label: string, value: number | string, step = "any") => (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} name={id} type={typeof value === "number" ? "number" : "text"} step={step} defaultValue={value} required />
    </div>
  );

  return (
    <Card className="space-y-4">
      <div>
        <CardTitle>Rating configuration (version {version})</CardTitle>
        <CardDescription>
          Publishing creates a new version for <strong>future</strong> matches. Past matches are never silently recalculated with new constants.
        </CardDescription>
      </div>
      {msg && <Alert variant={msg.kind}>{msg.text}</Alert>}
      {Object.keys(errors).length > 0 && (
        <Alert variant="destructive">
          <ul className="list-disc pl-4">
            {Object.entries(errors).map(([k, v]) => (
              <li key={k}>
                {k}: {v.join(", ")}
              </li>
            ))}
          </ul>
        </Alert>
      )}
      <form action={submit} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          {field("beta", "Beta (point-share steepness)", config.beta)}
          {field("k", "K (base step)", config.k)}
          {field("maximumTeamDelta", "Max team-average shift", config.maximumTeamDelta)}
          {field("trailingWindowDays", "Trailing window (days)", config.trailingWindowDays, "1")}
          {field("provisionalGames", "Provisional until (games)", config.provisionalGames, "1")}
          {field("timezone", "Timezone (IANA)", config.timezone)}
          {field("freeGames", "Same-four games at full K per day", config.matchupDiscount.freeGames, "1")}
          {field("multiplier", "K multiplier afterwards", config.matchupDiscount.multiplier)}
        </div>
        <fieldset className="space-y-2">
          <legend className="text-sm font-bold">Reliability weights (games in trailing window → weight)</legend>
          <div className="grid gap-3 sm:grid-cols-4">
            {config.weightTiers.map((t, i) => (
              <div key={i} className="grid grid-cols-2 gap-2">
                <div>
                  <Label htmlFor={`tier-min-${i}`}>From games</Label>
                  <Input id={`tier-min-${i}`} name={`tier-min-${i}`} type="number" step="1" min="0" defaultValue={t.minGames} required />
                </div>
                <div>
                  <Label htmlFor={`tier-weight-${i}`}>Weight</Label>
                  <Input id={`tier-weight-${i}`} name={`tier-weight-${i}`} type="number" step="any" defaultValue={t.weight} required />
                </div>
              </div>
            ))}
          </div>
        </fieldset>
        <div>
          <Label htmlFor="reason">Reason for change (required)</Label>
          <Input id="reason" name="reason" required minLength={3} maxLength={500} />
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "Publishing…" : "Publish new version"}
        </Button>
      </form>
    </Card>
  );
}

export function BackupButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<Msg>(null);
  return (
    <div className="space-y-2">
      {msg && <Alert variant={msg.kind}>{msg.text}</Alert>}
      <Button
        type="button"
        variant="outline"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await runBackupAction();
            setMsg(
              res.ok
                ? { kind: "success", text: `Backup complete (off-host: ${res.data.offsite}).` }
                : { kind: "destructive", text: res.error },
            );
            router.refresh();
          })
        }
      >
        {pending ? "Backing up…" : "Run backup now"}
      </Button>
    </div>
  );
}
