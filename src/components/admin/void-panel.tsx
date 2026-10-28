"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { voidMatchAction } from "@/app/admin/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function VoidPanel({ matchId, expectedUpdatedAt, isDraft }: { matchId: string; expectedUpdatedAt: number; isDraft: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [reason, setReason] = useState("");
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function run() {
    start(async () => {
      const res = await voidMatchAction({ matchId, reason, expectedUpdatedAt });
      if (res.ok) {
        router.push("/admin");
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  const word = isDraft ? "Discard draft" : "Void match";
  return (
    <Card className="space-y-3 border-red-200">
      <div>
        <CardTitle>{word}</CardTitle>
        <CardDescription>
          {isDraft
            ? "Discarding removes this draft from the queue. It never affected ratings."
            : "Voiding removes this result and replays all later matches so ratings are recalculated without it. This is recorded in the audit log."}
        </CardDescription>
      </div>
      {error && <Alert variant="destructive">{error}</Alert>}
      <div>
        <Label htmlFor="void-reason">Reason (required)</Label>
        <Input id="void-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-1 size-5" checked={armed} onChange={(e) => setArmed(e.target.checked)} />
        <span>I understand this cannot be undone from the interface.</span>
      </label>
      <Button type="button" variant="destructive" disabled={pending || !armed || reason.trim().length < 3} onClick={run}>
        {pending ? "Working…" : word}
      </Button>
    </Card>
  );
}
