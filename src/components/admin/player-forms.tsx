"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import {
  changeInitialRatingAction,
  createPlayerAction,
  importCsvAction,
  previewCsvAction,
  previewInitialRatingAction,
  setPlayerActiveAction,
  updatePlayerAction,
} from "@/app/admin/actions";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionResult } from "@/lib/result";
import type { ImportPreview, InitialRatingImpact } from "@/lib/services/players";
import { useT, useTPlain } from "@/i18n/use-locale";
import { formatCincoRating } from "@/lib/format";

type Notice = { kind: "success" | "destructive" | "warning"; text: string } | null;

function NoticeView({ notice }: { notice: Notice }) {
  if (!notice) return null;
  return <Alert variant={notice.kind}>{notice.text}</Alert>;
}

function fieldMessage<T>(res: ActionResult<T>, field: string): string | undefined {
  return !res.ok ? res.fieldErrors?.[field]?.[0] : undefined;
}

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? (
    <p id={id} className="mt-1 text-sm font-semibold text-destructive">
      {message}
    </p>
  ) : null;
}

export function CreatePlayerForm() {
  const t = useT();
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, start] = useTransition();
  const [notice, setNotice] = useState<Notice>(null);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});

  function submit(fd: FormData) {
    start(async () => {
      const rating = String(fd.get("initialRating") ?? "").trim();
      const res = await createPlayerAction({
        displayName: fd.get("displayName"),
        initialRating: rating === "" ? undefined : Number(rating),
        duprRating: fd.get("duprRating"),
        avatarUrl: fd.get("avatarUrl"),
        notes: fd.get("notes"),
      });
      if (res.ok) {
        setNotice({ kind: "success", text: `Player added. They now appear on the leaderboard and predictor as provisional.` });
        setErrors({});
        formRef.current?.reset();
        router.refresh();
      } else {
        setNotice({ kind: "destructive", text: res.error });
        setErrors({
          displayName: fieldMessage(res, "displayName"),
          initialRating: fieldMessage(res, "initialRating"),
          duprRating: fieldMessage(res, "duprRating"),
          avatarUrl: fieldMessage(res, "avatarUrl"),
        });
      }
    });
  }

  return (
    <Card className="space-y-4">
      <div>
        <CardTitle>{t("player.add")}</CardTitle>
        <CardDescription>The initial Cinco Point is an estimate; suggested range 2.00–6.00. New players start as provisional.</CardDescription>
      </div>
      <NoticeView notice={notice} />
      <form ref={formRef} action={submit} className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="cp-name">{t("leaderboard.player", "Display name")} *</Label>
          <Input id="cp-name" name="displayName" required maxLength={60} aria-describedby="cp-name-err" />
          <FieldError id="cp-name-err" message={errors.displayName} />
        </div>
        <div>
          <Label htmlFor="cp-rating">{t("player.newRating")} *</Label>
          <Input id="cp-rating" name="initialRating" required type="number" step="0.001" min="0" max="10" inputMode="decimal" aria-describedby="cp-rating-err" />
          <FieldError id="cp-rating-err" message={errors.initialRating} />
        </div>
        <div>
          <Label htmlFor="cp-dupr">{t("player.dupr")}</Label>
          <Input id="cp-dupr" name="duprRating" type="number" step="0.001" min="0" max="10" inputMode="decimal" />
          <FieldError id="cp-dupr-err" message={errors.duprRating} />
        </div>
        <div>
          <Label htmlFor="cp-avatar">Avatar URL (optional)</Label>
          <Input id="cp-avatar" name="avatarUrl" type="url" placeholder="https://…" />
          <FieldError id="cp-avatar-err" message={errors.avatarUrl} />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="cp-notes">Notes (admin only)</Label>
          <Textarea id="cp-notes" name="notes" maxLength={500} rows={2} />
        </div>
        <div className="sm:col-span-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Adding…" : t("player.add", "Add player")}
          </Button>
        </div>
      </form>
    </Card>
  );
}

const STATUS_LABEL: Record<string, string> = {
  ok: "Will import",
  invalid: "Invalid",
  duplicate_existing: "Already exists",
  duplicate_in_file: "Duplicate in file",
};

export function CsvImport() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [pending, start] = useTransition();

  function runPreview(value: string) {
    start(async () => {
      const res = await previewCsvAction({ text: value });
      if (res.ok) {
        setPreview(res.data);
        setNotice(res.data.fatal ? { kind: "destructive", text: res.data.fatal } : null);
      } else {
        setPreview(null);
        setNotice({ kind: "destructive", text: res.error });
      }
    });
  }

  function runImport() {
    start(async () => {
      const res = await importCsvAction({ text });
      if (res.ok) {
        setNotice({ kind: "success", text: `Imported ${res.data.imported} player(s); skipped ${res.data.skipped}.` });
        setPreview(null);
        setText("");
        router.refresh();
      } else {
        setNotice({ kind: "destructive", text: res.error });
      }
    });
  }

  const okCount = preview?.counts.ok ?? 0;
  return (
    <Card className="space-y-4">
      <div>
        <CardTitle>Import players from CSV</CardTitle>
        <CardDescription>
          Columns: <code>display_name</code>, <code>initial_cinco_rating</code>, optional <code>dupr_rating</code>, <code>notes</code>. Review the preview before importing.
        </CardDescription>
      </div>
      <NoticeView notice={notice} />
      <div>
        <Label htmlFor="csv-file">CSV file</Label>
        <Input
          id="csv-file"
          type="file"
          accept=".csv,text/csv"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const content = await file.text();
            setText(content);
            runPreview(content);
          }}
        />
      </div>
      <div>
        <Label htmlFor="csv-text">…or paste CSV</Label>
        <Textarea id="csv-text" value={text} onChange={(e) => { setText(e.target.value); setPreview(null); }} rows={4} className="font-mono text-sm" placeholder={"display_name,initial_cinco_rating\nAlex,3.500"} />
      </div>
      <div className="flex gap-2">
        <Button type="button" variant="outline" disabled={pending || !text.trim()} onClick={() => runPreview(text)}>
          Preview
        </Button>
        <Button type="button" disabled={pending || !preview || okCount === 0} onClick={runImport}>
          Import {okCount > 0 ? `${okCount} player${okCount === 1 ? "" : "s"}` : ""}
        </Button>
      </div>
      {preview && !preview.fatal && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="mb-2 text-left text-sm text-muted-foreground">
              {preview.counts.ok} ready · {preview.counts.invalid} invalid · {preview.counts.duplicate_existing + preview.counts.duplicate_in_file} duplicates (these are skipped)
            </caption>
            <thead>
              <tr className="text-xs uppercase text-muted-foreground">
                <th className="px-2 py-1">Line</th>
                <th className="px-2 py-1">Name</th>
                <th className="px-2 py-1">Cinco</th>
                <th className="px-2 py-1">Status</th>
              </tr>
            </thead>
            <tbody>
              {preview.rows.map((r) => (
                <tr key={r.line} className="border-t border-border">
                  <td className="px-2 py-1">{r.line}</td>
                  <td className="px-2 py-1">{r.displayName || "—"}</td>
                  <td className="tabular px-2 py-1">{formatCincoRating(r.initialRating)}</td>
                  <td className="px-2 py-1">
                    <Badge variant={r.status === "ok" ? "success" : "destructive"}>{STATUS_LABEL[r.status]}</Badge>
                    {r.message && <span className="ml-2 text-xs text-muted-foreground">{r.message}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

export interface AdminPlayerRow {
  id: string;
  displayName: string;
  initialRating: number;
  currentRating: number;
  duprRating: number | null;
  avatarUrl: string | null;
  notes: string | null;
  active: boolean;
  updatedAt: number;
  games: number;
}

export function PlayerEditor({ player }: { player: AdminPlayerRow }) {
  const t = useT();
  const tp = useTPlain();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [notice, setNotice] = useState<Notice>(null);
  // The field shows the 2-decimal display value. Only a value the admin actually types that differs
  // from what is displayed counts as a change, so the stored full-precision rating is never rewritten by accident.
  const displayedInitial = formatCincoRating(player.initialRating);
  const [rating, setRating] = useState(displayedInitial);
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [impact, setImpact] = useState<InitialRatingImpact | null>(null);

  const ratingValue = Number(rating);
  const ratingChanged = rating.trim() !== displayedInitial && rating.trim() !== "" && Number.isFinite(ratingValue);

  function saveDetails(fd: FormData) {
    start(async () => {
      const res = await updatePlayerAction({
        playerId: player.id,
        displayName: fd.get("displayName"),
        duprRating: fd.get("duprRating"),
        avatarUrl: fd.get("avatarUrl"),
        notes: fd.get("notes"),
        expectedUpdatedAt: player.updatedAt,
      });
      setNotice(res.ok ? { kind: "success", text: "Saved. Ratings are unchanged." } : { kind: "destructive", text: res.error });
      if (res.ok) router.refresh();
    });
  }

  function checkImpact() {
    start(async () => {
      const res = await previewInitialRatingAction({ playerId: player.id, newRating: ratingValue });
      if (res.ok) {
        setImpact(res.data);
        setNotice(null);
      } else setNotice({ kind: "destructive", text: res.error });
    });
  }

  function applyRating() {
    start(async () => {
      const res = await changeInitialRatingAction({
        playerId: player.id,
        newRating: ratingValue,
        reason,
        confirmReplay: confirm,
        expectedUpdatedAt: player.updatedAt,
      });
      if (res.ok) {
        setNotice({ kind: "success", text: `Initial rating updated. ${res.data.affectedMatches} match(es) were replayed with changed results.` });
        setImpact(null);
        setConfirm(false);
        setReason("");
        router.refresh();
      } else {
        setNotice({ kind: res.code === "confirmation_required" ? "warning" : "destructive", text: res.error });
      }
    });
  }

  function toggleActive() {
    start(async () => {
      const res = await setPlayerActiveAction({ playerId: player.id, active: !player.active });
      setNotice(res.ok ? null : { kind: "destructive", text: res.error });
      if (res.ok) router.refresh();
    });
  }

  const hasHistory = player.games > 0;
  return (
    <details className="group rounded-xl border border-border bg-card">
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 py-2">
        <span className="min-w-0">
          <span className="block truncate font-semibold">{player.displayName}</span>
          <span className="flex gap-1">
            {!player.active && <Badge>{t("player.inactive")}</Badge>}
            <Badge variant="muted">{player.games} games</Badge>
          </span>
        </span>
        <span className="tabular text-right text-sm">
          <span className="block font-extrabold">{formatCincoRating(player.currentRating)}</span>
          <span className="text-xs text-muted-foreground">initial {formatCincoRating(player.initialRating)}</span>
        </span>
      </summary>
      <div className="space-y-5 border-t border-border p-4">
        <NoticeView notice={notice} />
        <form action={saveDetails} className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor={`n-${player.id}`}>Display name</Label>
            <Input id={`n-${player.id}`} name="displayName" defaultValue={player.displayName} required maxLength={60} />
          </div>
          <div>
            <Label htmlFor={`d-${player.id}`}>{t("player.dupr", "DUPR (reference only)")}</Label>
            <Input id={`d-${player.id}`} name="duprRating" type="number" step="0.001" min="0" max="10" defaultValue={player.duprRating ?? ""} />
          </div>
          <div>
            <Label htmlFor={`a-${player.id}`}>Avatar URL</Label>
            <Input id={`a-${player.id}`} name="avatarUrl" type="url" defaultValue={player.avatarUrl ?? ""} />
          </div>
          <div>
            <Label htmlFor={`t-${player.id}`}>Notes</Label>
            <Input id={`t-${player.id}`} name="notes" defaultValue={player.notes ?? ""} maxLength={500} />
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={pending}>
              {t("player.save")}
            </Button>
          </div>
        </form>

        <div className="space-y-3 rounded-xl bg-muted p-3">
          <h3 className="font-bold">Initial Cinco Point</h3>
          <p className="text-sm text-muted-foreground">
            Changing this {hasHistory ? "replays every confirmed match from the beginning and is recorded in the audit log." : "also sets the current rating (no games yet)."}
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <div className="w-40">
              <Label htmlFor={`r-${player.id}`}>New initial rating</Label>
              <Input id={`r-${player.id}`} type="number" step="0.001" min="0" max="10" value={rating} onChange={(e) => { setRating(e.target.value); setImpact(null); }} />
            </div>
            {ratingChanged && hasHistory && (
              <Button type="button" variant="outline" onClick={checkImpact} disabled={pending}>
                Check impact
              </Button>
            )}
          </div>
          {impact && (
            <Alert variant="warning">
              Affects <strong>{impact.affectedMatches}</strong> of this player&apos;s {impact.confirmedGames} confirmed match(es) and later matches involving others. Their
              current rating would change from {formatCincoRating(impact.currentBefore)} to {formatCincoRating(impact.currentAfter)}.
            </Alert>
          )}
          {ratingChanged && hasHistory && (
            <>
              <div>
                <Label htmlFor={`why-${player.id}`}>Reason (required)</Label>
                <Input id={`why-${player.id}`} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
              </div>
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-1 size-5" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />
                <span>I understand this replays all confirmed matches and changes historical ratings.</span>
              </label>
            </>
          )}
          <Button type="button" onClick={applyRating} disabled={pending || !ratingChanged || (hasHistory && (!confirm || reason.trim().length < 3))}>
            Apply initial rating
          </Button>
        </div>

        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {player.active ? "Deactivating hides the player from the leaderboard and new matches. History is kept." : "Inactive players are hidden from the leaderboard and predictor."}
          </p>
          <Button type="button" variant={player.active ? "outline" : "default"} onClick={toggleActive} disabled={pending} className="h-auto min-h-11 whitespace-normal py-1.5 text-center">
            {player.active ? tp("player.deactivate", "Deactivate") : "Reactivate"}
          </Button>
        </div>
      </div>
    </details>
  );
}
