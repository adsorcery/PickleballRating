"use client";

import { useId, useMemo, useRef, useState } from "react";
import { ChevronDown, X } from "lucide-react";
import { cn, formatRating } from "@/lib/utils";

export interface PickerPlayer {
  id: string;
  name: string;
  rating: number;
  provisional?: boolean;
}

interface Props {
  label: string;
  players: PickerPlayer[];
  value: string | null;
  onChange: (id: string | null) => void;
  /** Players already chosen elsewhere; they cannot be picked twice. */
  excludeIds: (string | null)[];
  invalid?: boolean;
}

/** Accessible searchable combobox (ARIA 1.2 list autocomplete). */
export function PlayerPicker({ label, players, value, onChange, excludeIds, invalid }: Props) {
  const uid = useId();
  const listId = `${uid}-list`;
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = players.find((p) => p.id === value) ?? null;
  const options = useMemo(() => {
    const q = query.trim().toLowerCase();
    return players.filter((p) => !excludeIds.includes(p.id) && (!q || p.name.toLowerCase().includes(q)));
  }, [players, query, excludeIds]);

  function choose(p: PickerPlayer) {
    onChange(p.id);
    setQuery("");
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, options.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && open && options[active]) {
      e.preventDefault();
      choose(options[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="relative">
      <label htmlFor={`${uid}-input`} className="mb-1 block text-sm font-semibold">
        {label}
      </label>
      <div className="relative">
        <input
          ref={inputRef}
          id={`${uid}-input`}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-invalid={invalid || undefined}
          aria-activedescendant={open && options[active] ? `${uid}-opt-${options[active].id}` : undefined}
          autoComplete="off"
          placeholder="Search players…"
          className={cn(
            "block min-h-12 w-full rounded-lg border bg-card px-3 py-2 pr-16 text-base",
            invalid ? "border-destructive" : "border-border",
          )}
          value={open || !selected ? query : `${selected.name} · ${formatRating(selected.rating)}`}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActive(0);
            if (value) onChange(null);
          }}
          onFocus={() => {
            setOpen(true);
            if (selected) setQuery("");
          }}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKeyDown}
        />
        <div className="absolute inset-y-0 right-1 flex items-center">
          {selected ? (
            <button
              type="button"
              aria-label={`Clear ${label}`}
              className="flex size-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
              onClick={() => {
                onChange(null);
                setQuery("");
                inputRef.current?.focus();
              }}
            >
              <X className="size-4" aria-hidden />
            </button>
          ) : (
            <ChevronDown className="mr-3 size-4 text-muted-foreground" aria-hidden />
          )}
        </div>
      </div>
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label={`${label} options`}
          className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-border bg-card py-1 shadow-lg"
        >
          {options.length === 0 && <li className="px-3 py-3 text-sm text-muted-foreground">No matching players</li>}
          {options.map((p, i) => (
            <li
              key={p.id}
              id={`${uid}-opt-${p.id}`}
              role="option"
              aria-selected={p.id === value}
              className={cn(
                "flex min-h-11 cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm",
                i === active && "bg-muted",
              )}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(p);
              }}
            >
              <span className="font-semibold">{p.name}</span>
              <span className="tabular text-muted-foreground">
                {formatRating(p.rating)}
                {p.provisional ? " · provisional" : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
