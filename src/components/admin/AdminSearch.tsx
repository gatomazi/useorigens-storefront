"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { searchAdmin, type AdminSearchResult } from "@/lib/admin/search-index";

/** How long the panel keeps looking for the block after a navigation (the page streams in) and how long the block stays highlighted. */
const WAIT_MS = 4000;
const GLOW_MS = 2000;
/** The shortcut hint follows the keyboard's platform, known only in the browser (the server draws the Mac one). */
const isMac = () => /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent);
const noSubscribe = () => () => {};

/**
 * Brings the block `id` into view and highlights it for a moment (`.a-found`, admin.css). A heading id stands for the card it heads. The block takes
 * the focus without scrolling again, so a screen reader starts reading where the person was taken. False when the block is not on the page (yet).
 */
function reveal(id: string): boolean {
  const el = document.getElementById(id);
  if (!el) return false;
  const block = /^H[1-6]$/.test(el.tagName) ? (el.closest<HTMLElement>("section, fieldset, .a-card") ?? el) : el;
  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  block.scrollIntoView({ block: "start", behavior: still ? "auto" : "smooth" });
  if (!block.hasAttribute("tabindex")) {
    block.setAttribute("tabindex", "-1");
    block.dataset.searchTarget = ""; // admin.css: no lasting focus ring once the highlight is gone
  }
  block.focus({ preventScroll: true });
  block.classList.remove("a-found");
  void block.offsetWidth; // restart the highlight when the same block is chosen twice
  block.classList.add("a-found");
  window.setTimeout(() => block.classList.remove("a-found"), GLOW_MS);
  return true;
}

/**
 * "Buscar no painel": one field at the top of the sidebar (also ⌘K / Ctrl+K from anywhere in the panel) that finds the panel's pages AND the blocks
 * inside them by the words people use (search-index.ts), then opens the page already scrolled to the block, highlighted.
 *
 * A combobox (WAI-ARIA): the field owns a listbox of results; arrows move through them, Enter opens one (the first by default), Esc closes the list
 * and then clears the field. On phones the field sits above the folded menu and the results open over the page.
 */
export function AdminSearch({ region, owner = false }: { region: string; owner?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const mac = useSyncExternalStore(noSubscribe, isMac, () => true);
  const input = useRef<HTMLInputElement>(null);
  const pending = useRef<string | null>(null);
  const id = useId();
  const listId = `${id}-lista`;
  const results = useMemo(() => searchAdmin(query, { region, owner }), [query, region, owner]);
  const shown = open && query.trim().length > 0;

  // ⌘K / Ctrl+K from anywhere in the panel.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        input.current?.focus();
        input.current?.select();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // A link that arrives with a block in the address (`/admin/tema-ink#ink-incentivo`, shared or reloaded) shows that block too.
  useEffect(() => {
    const hash = decodeURIComponent(window.location.hash.slice(1));
    if (hash) reveal(hash);
  }, []);

  // After the navigation a result started: wait for the block to be drawn, then show it.
  useEffect(() => {
    const target = pending.current;
    if (!target) return;
    pending.current = null;
    const until = Date.now() + WAIT_MS;
    let frame = 0;
    const look = () => {
      if (!reveal(target) && Date.now() < until) frame = requestAnimationFrame(look);
    };
    frame = requestAnimationFrame(look);
    return () => cancelAnimationFrame(frame);
  }, [pathname]);

  function go(result: AdminSearchResult | undefined) {
    if (!result) return;
    const [path, anchor] = result.href.split("#");
    setQuery("");
    setOpen(false);
    input.current?.blur();
    if (path === pathname) {
      if (anchor) reveal(anchor);
      else window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    pending.current = anchor ?? null;
    router.push(result.href, { scroll: !anchor });
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (results.length === 0) return;
      event.preventDefault();
      setOpen(true);
      setActive((i) => (event.key === "ArrowDown" ? (i + 1) % results.length : (i - 1 + results.length) % results.length));
    } else if (event.key === "Enter") {
      event.preventDefault();
      go(results[active] ?? results[0]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      if (shown) setOpen(false);
      else setQuery("");
    }
  }

  const optionId = (i: number) => `${id}-op-${i}`;
  return (
    <div className="relative">
      <label htmlFor={`${id}-campo`} className="sr-only">Buscar no painel</label>
      <svg aria-hidden="true" viewBox="0 0 24 24" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/80" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input
        ref={input}
        id={`${id}-campo`}
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={shown}
        aria-controls={listId}
        aria-activedescendant={shown && results.length > 0 ? optionId(active) : undefined}
        autoComplete="off"
        spellCheck={false}
        placeholder="Buscar no painel"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
        data-testid="admin-search"
        // 16px on phones (iOS zooms into a smaller field); room for the ⌘K hint from 1024px, where the sidebar is narrow.
        className="min-h-11 w-full border border-white/45 bg-white/10 py-2 pl-9 pr-3 text-base font-semibold lg:pr-11 lg:text-[0.875rem] text-white placeholder:text-white/75 focus-visible:outline-[3px] focus-visible:outline-offset-1 focus-visible:outline-white"
      />
      {query === "" && (
        <kbd aria-hidden="true" className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 border border-white/40 px-1 py-0.5 font-sans text-[0.6875rem] font-bold leading-none text-white/80 lg:inline-block">
          {mac ? "⌘K" : "Ctrl K"}
        </kbd>
      )}
      <p className="sr-only" aria-live="polite">{query.trim() ? (results.length ? `${results.length} ${results.length === 1 ? "resultado" : "resultados"}` : "Nenhum resultado") : ""}</p>
      {shown && (
        <div className="absolute inset-x-0 top-full z-50 mt-1 border border-black/20 bg-white text-ink shadow-[0_10px_28px_rgb(0_0_0/0.22)]">
          {results.length > 0 ? (
            <ul id={listId} role="listbox" aria-label="Resultados da busca no painel" className="max-h-[70dvh] overflow-y-auto py-1">
              {results.map((r, i) => (
                <li
                  key={r.href}
                  id={optionId(i)}
                  role="option"
                  aria-selected={i === active}
                  // Keeps the focus in the field (no blur closing the list before the click lands).
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseMove={() => setActive(i)}
                  onClick={() => go(r)}
                  data-testid="admin-search-option"
                  className={`flex min-h-11 cursor-pointer flex-col justify-center px-3 py-2 ${i === active ? "bg-ink text-white" : ""}`}
                >
                  <span className="text-[0.9375rem] font-bold leading-snug">{r.entry.title}</span>
                  <span className={`text-[0.8125rem] leading-snug ${i === active ? "text-white/80" : "text-ink-mute"}`}>{r.entry.where}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p id={listId} className="px-3 py-3 text-[0.875rem]">
              Nada encontrado para “{query.trim()}”. Tente <strong>cores</strong>, <strong>frete</strong>, <strong>faixa</strong> ou <strong>cupom</strong>.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
