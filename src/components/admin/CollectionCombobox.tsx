"use client";

import Link from "next/link";
import { useId, useMemo, useRef, useState } from "react";
import { searchCollections } from "@/lib/admin/collection-search";

/** What the client needs about a collection to offer it: no product ids, only what a person uses to choose. */
export type ComboEntry = {
  value: string; // "use-sul:152188" — the saved link is store + id, never the name
  id: number;
  name: string;
  slug: string;
  position: number;
  visibility: "public" | "internal";
  enabled: boolean;
  eligible: boolean;
  selectable: boolean;
  reason: "needs-resync" | "too-few-products" | "not-enabled" | null;
  matchedCount: number;
};

const INITIAL = 8;
const MAX_RESULTS = 12;

const reasonText = (e: ComboEntry): string =>
  e.reason === "not-enabled" ? "Interna · não habilitada" : e.reason === "too-few-products" ? `só ${e.matchedCount} produto(s): mínimo 3` : e.reason === "needs-resync" ? "requer ressincronização" : "";

/**
 * Autocomplete for choosing an INK collection (ARIA 1.2 combobox with a listbox popup). Nothing is listed until the field is focused, and
 * then only enabled, selectable collections (the few most relevant); typing searches ALL of them, accent- and case-insensitively, by
 * name, slug or id. Non-selectable matches are shown with the reason (disabled); an internal collection that only needs enabling comes
 * with a direct link to the Library. Keyboard: ↑/↓ move, Enter chooses, Esc closes. The submitted value is `store:id`.
 */
export function CollectionCombobox({
  name, label, entries, defaultValue, libraryFrom, onSelect, hint,
}: {
  name: string;
  label: string;
  entries: ComboEntry[];
  defaultValue?: string;
  /** Where the Library's "back" link should return to (an /admin/... path). */
  libraryFrom: string;
  onSelect?: (entry: ComboEntry | null) => void;
  hint?: string;
}) {
  const uid = useId();
  const listId = `${uid}-list`;
  const inputRef = useRef<HTMLInputElement>(null);
  const initial = entries.find((e) => e.value === defaultValue) ?? null;
  const [selected, setSelected] = useState<ComboEntry | null>(initial);
  const [query, setQuery] = useState(initial?.name ?? "");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const typed = selected === null || query !== selected.name; // the box shows the chosen name until the person edits it
  const results = useMemo<ComboEntry[]>(() => {
    if (!typed) return [];
    if (query.trim() === "") return entries.filter((e) => e.selectable).sort((a, b) => Number(b.visibility === "public") - Number(a.visibility === "public") || a.position - b.position).slice(0, INITIAL);
    return searchCollections(entries, query, MAX_RESULTS);
  }, [entries, query, typed]);
  const selectableIdx = results.map((r, i) => (r.selectable ? i : -1)).filter((i) => i >= 0);
  const enableHits = results.filter((r) => r.reason === "not-enabled" && r.eligible).slice(0, 3);

  function choose(entry: ComboEntry) {
    setSelected(entry);
    setQuery(entry.name);
    setOpen(false);
    onSelect?.(entry);
  }
  function clear() {
    setSelected(null);
    setQuery("");
    setOpen(true);
    onSelect?.(null);
    inputRef.current?.focus();
  }
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      if (selectableIdx.length === 0) return;
      const pos = selectableIdx.indexOf(active);
      const next = e.key === "ArrowDown" ? (pos + 1) % selectableIdx.length : (pos - 1 + selectableIdx.length) % selectableIdx.length;
      setActive(selectableIdx[pos === -1 ? 0 : next]);
    } else if (e.key === "Enter") {
      if (open && results[active]?.selectable) {
        e.preventDefault(); // choosing must not submit the surrounding form
        choose(results[active]);
      }
    } else if (e.key === "Escape") {
      if (open) {
        e.preventDefault();
        setOpen(false);
      }
    }
  }

  const activeId = open && results[active] ? `${uid}-opt-${results[active].id}` : undefined;
  const showList = open && typed;
  return (
    <div className="relative">
      <label className="a-label" htmlFor={`${uid}-input`}>{label}</label>
      <div className="flex gap-2">
        <input
          ref={inputRef}
          id={`${uid}-input`}
          type="text"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeId}
          autoComplete="off"
          placeholder="Digite parte do nome, o slug ou o número…"
          value={query}
          className="a-input"
          onFocus={() => {
            setOpen(true);
            setActive(selectableIdx[0] ?? 0);
          }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected((s) => (s && e.target.value === s.name ? s : null));
            if (selected) onSelect?.(null);
            setOpen(true);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
        />
        {selected && <button type="button" className="a-btn ghost sm" onClick={clear} aria-label="Limpar a coleção escolhida">Limpar</button>}
      </div>
      <input type="hidden" name={name} value={selected?.value ?? ""} />
      {hint && <p className="a-muted mt-1 text-[0.8125rem]">{hint}</p>}

      {showList && (
        <ul id={listId} role="listbox" aria-label="Coleções" className="absolute left-0 right-0 z-30 mt-1 max-h-[min(22rem,60vh)] overflow-y-auto border border-black/50 bg-white shadow-lg">
          {results.length === 0 && <li role="presentation" className="a-muted p-3 text-[0.9375rem]">Nenhuma coleção encontrada para “{query}”. Confira a grafia ou procure na Biblioteca.</li>}
          {results.map((r, i) => (
            <li
              key={r.id}
              id={`${uid}-opt-${r.id}`}
              role="option"
              aria-selected={i === active && r.selectable}
              aria-disabled={!r.selectable}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => r.selectable && choose(r)}
              onMouseEnter={() => r.selectable && setActive(i)}
              className={`flex min-h-11 items-center justify-between gap-3 px-3 py-2 text-[0.9375rem] ${r.selectable ? "cursor-pointer" : "opacity-60"} ${i === active && r.selectable ? "bg-[#e3ecd9]" : ""}`}
            >
              <span className="min-w-0">
                <span className="block break-words font-bold">{r.name}</span>
                <span className="a-muted block text-[0.75rem]">{r.slug} · #{r.id}</span>
              </span>
              <span className="flex flex-none flex-col items-end gap-1 text-[0.75rem]">
                <span className="flex gap-1">
                  <span className={`a-badge ${r.visibility === "public" ? "ok" : ""}`}>{r.visibility === "public" ? "Pública" : r.enabled ? "Interna · habilitada" : "Interna"}</span>
                  <span className="a-badge">{r.matchedCount} produto(s)</span>
                </span>
                {!r.selectable && <span className="a-muted">{reasonText(r)}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="sr-only" role="status" aria-live="polite">{showList ? `${results.length} coleções encontradas` : ""}</p>

      {showList && enableHits.length > 0 && (
        <div className="a-flash ok mt-2 text-[0.875rem]" role="note">
          {enableHits.map((h) => (
            <p key={h.id}>
              “{h.name}” é uma coleção interna com {h.matchedCount} produtos, ainda não habilitada.{" "}
              <Link className="a-link" href={`/admin/colecoes?q=${encodeURIComponent(String(h.id))}&from=${encodeURIComponent(libraryFrom)}`}>Habilitar na Biblioteca →</Link>
            </p>
          ))}
        </div>
      )}
      {selected && !typed && (
        <p className="mt-2 flex flex-wrap items-center gap-2 text-[0.875rem]">
          <span className={`a-badge ${selected.visibility === "public" ? "ok" : ""}`}>{selected.visibility === "public" ? "Pública na INK" : "Interna (habilitada no CMS)"}</span>
          <span className="a-muted">{selected.matchedCount} produtos no catálogo · vínculo: loja + número {selected.id}</span>
        </p>
      )}
    </div>
  );
}
