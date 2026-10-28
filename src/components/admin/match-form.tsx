"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  confirmDraftAction,
  confirmMatchAction,
  correctMatchAction,
  previewMatchAction,
  saveDraftAction,
} from "@/app/admin/actions";
import { MatchPreviewPanel } from "@/components/admin/match-preview";
import { ScoreInput } from "@/components/admin/score-input";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PlayerPicker, type PickerPlayer } from "@/components/ui/player-picker";
import type { MatchInput, MatchPreview } from "@/lib/services/matches";
import { cn } from "@/lib/utils";

export interface MatchFormInitial {
  teamA: [string | null, string | null];
  teamB: [string | null, string | null];
  playedAtLocal: string;
  formatTarget: 11 | 15 | 21;
  scoreA: string;
  scoreB: string;
  rated: boolean;
  notes: string;
}

interface Props {
  mode: "new" | "draft" | "correct";
  players: PickerPlayer[];
  initial: MatchFormInitial;
  matchId?: string;
  expectedUpdatedAt?: number;
}

type Msg = { kind: "success" | "destructive" | "warning"; text: string; href?: string } | null;

const newKey = () => crypto.randomUUID();

export function MatchForm({ mode, players, initial, matchId, expectedUpdatedAt }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [sel, setSel] = useState<(string | null)[]>([...initial.teamA, ...initial.teamB]);
  const [playedAt, setPlayedAt] = useState(initial.playedAtLocal);
  const [format, setFormat] = useState<11 | 15 | 21>(initial.formatTarget);
  const [scoreA, setScoreA] = useState(initial.scoreA);
  const [scoreB, setScoreB] = useState(initial.scoreB);
  const [rated, setRated] = useState(initial.rated);
  const [notes, setNotes] = useState(initial.notes);
  const [reason, setReason] = useState("");
  const [key, setKey] = useState(newKey);
  const [preview, setPreview] = useState<{ key: string; data: MatchPreview } | null>(null);
  const [ackDup, setAckDup] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const input = useMemo((): MatchInput | null => {
    if (sel.some((s) => !s)) return null;
    const a = scoreA.trim() === "" ? NaN : Number(scoreA);
    const b = scoreB.trim() === "" ? NaN : Number(scoreB);
    if (!Number.isInteger(a) || !Number.isInteger(b)) return null;
    return {
      teamA: [sel[0]!, sel[1]!],
      teamB: [sel[2]!, sel[3]!],
      playedAtLocal: playedAt,
      formatTarget: format,
      scoreA: a,
      scoreB: b,
      rated,
      notes: notes.trim() || null,
      idempotencyKey: key,
    };
  }, [sel, scoreA, scoreB, playedAt, format, rated, notes, key]);

  // The idempotency key is excluded so regenerating it never invalidates a preview.
  const contentKey = input ? JSON.stringify({ ...input, idempotencyKey: undefined }) : null;
  const current = preview && contentKey && preview.key === contentKey ? preview.data : null;
  const needsAck = (current?.duplicates.length ?? 0) > 0;
  const canConfirm = !!current && !pending && (!needsAck || ackDup) && (mode !== "correct" || reason.trim().length >= 3);

  function fail(res: { error: string; code?: string; fieldErrors?: Record<string, string[]> }) {
    setFieldErrors(res.fieldErrors ?? {});
    setMsg({ kind: res.code === "conflict" ? "warning" : "destructive", text: res.error });
  }

  function runPreview() {
    if (!input || !contentKey) return;
    setMsg(null);
    setFieldErrors({});
    start(async () => {
      const res = await previewMatchAction({ match: input, matchId });
      if (res.ok) {
        setPreview({ key: contentKey, data: res.data });
        setAckDup(false);
      } else {
        setPreview(null);
        fail(res);
      }
    });
  }

  function confirm() {
    if (!input || !current) return;
    setMsg(null);
    start(async () => {
      if (mode === "new") {
        const res = await confirmMatchAction({ match: input, acknowledgeDuplicate: ackDup });
        if (!res.ok) return fail(res);
        setMsg({
          kind: "success",
          text: res.data.alreadySaved ? "This match was already saved — nothing changed." : "Match confirmed. Ratings and history are updated.",
          href: `/admin/matches/${res.data.matchId}`,
        });
        setSel([null, null, null, null]);
        setScoreA("0");
        setScoreB("0");
        setNotes("");
        setPreview(null);
        setKey(newKey());
      } else if (mode === "draft" && matchId && expectedUpdatedAt !== undefined) {
        const res = await confirmDraftAction({ matchId, match: input, expectedUpdatedAt, acknowledgeDuplicate: ackDup });
        if (!res.ok) return fail(res);
        router.push(`/admin/matches/${matchId}`);
        router.refresh();
        return;
      } else if (mode === "correct" && matchId && expectedUpdatedAt !== undefined) {
        const res = await correctMatchAction({ matchId, match: input, reason, expectedUpdatedAt, acknowledgeDuplicate: ackDup });
        if (!res.ok) return fail(res);
        setMsg({ kind: "success", text: `Correction saved. ${res.data.affectedMatches} match result(s) were recalculated.` });
        setReason("");
        setPreview(null);
        router.refresh();
      }
    });
  }

  function saveDraft() {
    if (!input) return;
    setMsg(null);
    start(async () => {
      const res = await saveDraftAction({ match: input, matchId: mode === "draft" ? matchId : undefined, expectedUpdatedAt: mode === "draft" ? expectedUpdatedAt : undefined });
      if (!res.ok) return fail(res);
      if (mode === "new") {
        router.push(`/admin/matches/${res.data.matchId}`);
      } else {
        setMsg({ kind: "success", text: "Draft saved. It does not affect ratings." });
        router.refresh();
      }
    });
  }

  const err = (f: string) => fieldErrors[f]?.[0];

  return (
    <div className="space-y-5">
      {msg && (
        <Alert variant={msg.kind}>
          {msg.text}{" "}
          {msg.href && (
            <Link href={msg.href} className="font-bold underline">
              View match
            </Link>
          )}
        </Alert>
      )}
      <Card className="space-y-5">
        <div className="grid gap-5 md:grid-cols-2">
          <fieldset className="space-y-3">
            <legend className="mb-1 text-sm font-extrabold uppercase tracking-wide text-primary">Team A</legend>
            <PlayerPicker label="Player 1" players={players} value={sel[0]} onChange={(id) => setSel((s) => s.map((v, i) => (i === 0 ? id : v)))} excludeIds={sel} invalid={!!err("players")} />
            <PlayerPicker label="Player 2" players={players} value={sel[1]} onChange={(id) => setSel((s) => s.map((v, i) => (i === 1 ? id : v)))} excludeIds={sel} invalid={!!err("players")} />
          </fieldset>
          <fieldset className="space-y-3">
            <legend className="mb-1 text-sm font-extrabold uppercase tracking-wide text-primary">Team B</legend>
            <PlayerPicker label="Player 3" players={players} value={sel[2]} onChange={(id) => setSel((s) => s.map((v, i) => (i === 2 ? id : v)))} excludeIds={sel} invalid={!!err("players")} />
            <PlayerPicker label="Player 4" players={players} value={sel[3]} onChange={(id) => setSel((s) => s.map((v, i) => (i === 3 ? id : v)))} excludeIds={sel} invalid={!!err("players")} />
          </fieldset>
        </div>
        {err("players") && <p className="text-sm font-semibold text-destructive">{err("players")}</p>}

        <div className="grid gap-5 sm:grid-cols-2">
          <ScoreInput label="Team A score" value={scoreA} onChange={setScoreA} />
          <ScoreInput label="Team B score" value={scoreB} onChange={setScoreB} />
        </div>
        {err("scoreA") && <p className="text-sm font-semibold text-destructive">{err("scoreA")}</p>}

        <div className="grid gap-4 sm:grid-cols-2">
          <fieldset>
            <legend className="mb-1 text-sm font-semibold">Game format (play to)</legend>
            <div className="grid grid-cols-3 gap-2" role="radiogroup">
              {([11, 15, 21] as const).map((t) => (
                <label
                  key={t}
                  className={cn(
                    "flex min-h-12 cursor-pointer items-center justify-center rounded-lg border text-base font-bold has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring",
                    format === t ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card",
                  )}
                >
                  <input type="radio" name="format" className="sr-only" checked={format === t} onChange={() => setFormat(t)} />
                  {t}
                </label>
              ))}
            </div>
          </fieldset>
          <div>
            <Label htmlFor="played-at">Played at (local time)</Label>
            <Input id="played-at" type="datetime-local" value={playedAt} onChange={(e) => setPlayedAt(e.target.value)} required />
            {err("playedAtLocal") && <p className="mt-1 text-sm font-semibold text-destructive">{err("playedAtLocal")}</p>}
          </div>
        </div>

        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" className="mt-0.5 size-5" checked={!rated} onChange={(e) => setRated(!e.target.checked)} />
          <span>
            <strong>Unrated</strong> — retirement, forfeit, or otherwise not counted. It is recorded but never feeds the rating algorithm.
          </span>
        </label>

        <div>
          <Label htmlFor="notes">Notes (optional)</Label>
          <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} rows={2} />
        </div>

        {mode === "correct" && (
          <div>
            <Label htmlFor="reason">Reason for correction (required, audited)</Label>
            <Input id="reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={runPreview} disabled={!input || pending}>
            {pending && !current ? "Working…" : "Preview changes"}
          </Button>
          {mode !== "correct" && (
            <Button type="button" variant="secondary" onClick={saveDraft} disabled={!input || pending}>
              Save as draft
            </Button>
          )}
        </div>
        {!input && <p className="text-sm text-muted-foreground">Choose four players and enter both scores to preview.</p>}
      </Card>

      {current && input && (
        <>
          <MatchPreviewPanel preview={current} scoreA={input.scoreA} scoreB={input.scoreB} />
          {needsAck && (
            <label className="flex items-start gap-3 text-sm font-semibold">
              <input type="checkbox" className="mt-0.5 size-5" checked={ackDup} onChange={(e) => setAckDup(e.target.checked)} />
              This is not a duplicate — save it anyway.
            </label>
          )}
          <div className="sticky bottom-20 z-20 md:bottom-4">
            <Button type="button" size="lg" className="w-full shadow-lg" onClick={confirm} disabled={!canConfirm}>
              {pending ? "Saving…" : mode === "correct" ? "Save correction & recalculate" : "Confirm & save match"}
            </Button>
          </div>
        </>
      )}
      {preview && !current && (
        <Alert variant="warning">You changed the match after previewing. Preview again before confirming.</Alert>
      )}
    </div>
  );
}
