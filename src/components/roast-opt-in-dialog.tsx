"use client";

import { useEffect, useRef, useState } from "react";
import { loadRoastCatalog } from "@/i18n/catalog";
import { en } from "@/i18n/en";
import { Button } from "@/components/ui/button";

interface Props {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * One-time, small adult-content acknowledgement. It is shown while the app is still in English, so it
 * contains no jokes, and it is not even in the page until the visitor asks for the funny mode. It is
 * an opt-in for content, not age verification. Uses the native <dialog> for focus handling, Escape to
 * close, and return of focus to the trigger.
 */
export function RoastOptInDialog(props: Props) {
  return props.open ? <OptInBody {...props} /> : null;
}

function OptInBody({ onCancel, onConfirm }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [checked, setChecked] = useState(false);
  const [ackText, setAckText] = useState<string>(en["common.optIn"]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  useEffect(() => {
    // The provided acknowledgement sentence lives in the lazily loaded library.
    let cancelled = false;
    loadRoastCatalog()
      .then((c) => !cancelled && setAckText(c.ui["common.optIn"] ?? en["common.optIn"]))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby="roast-opt-in-title"
      aria-describedby="roast-opt-in-desc"
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
      className="m-auto w-[min(92vw,26rem)] rounded-2xl border border-border bg-card p-5 text-foreground shadow-xl backdrop:bg-black/50"
    >
      <h2 id="roast-opt-in-title" className="text-lg font-extrabold">
        🔥 Mất Nết 18+ mode
      </h2>
      <p id="roast-opt-in-desc" className="mt-2 text-sm text-muted-foreground">
        This optional mode shows Vietnamese adult humor (sarcasm and mild profanity) about pickleball scores, mistakes and egos.
        It never changes any data or ratings. This is a content opt-in, not an age check.
      </p>
      <label className="mt-4 flex items-start gap-3 text-sm font-semibold">
        <input type="checkbox" className="mt-0.5 size-5 shrink-0" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
        <span lang={ackText === en["common.optIn"] ? "en" : "vi"}>{ackText}</span>
      </label>
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Stay in English
        </Button>
        <Button type="button" disabled={!checked} onClick={onConfirm}>
          Turn it on
        </Button>
      </div>
    </dialog>
  );
}
