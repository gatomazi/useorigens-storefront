"use client";

import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { SOURCES } from "@/lib/analytics/sources";
import { trackAssistant, trackGoToInk, type AssistantEvent, type AssistantParams } from "@/lib/analytics/track";
import { followUp, isSensitive, MAX_ASSISTANT_MESSAGE, typingDelay, type AssistantItem, type AssistantLink, type AssistantReply } from "@/lib/assistant/engine";
import { formatPrice } from "@/lib/format";
import { DEFAULT_ASSISTANT_LABEL } from "@/lib/site-config/assistant-schema";

/**
 * The help chat ("Pergunte aqui", the panel's text): bottom RIGHT, where the INK pages had their "Ajuda?" button and WhatsApp (the coupon button stays
 * bottom left). Phones get a bottom sheet (modal, focus kept inside, page scroll locked); larger screens a card next to the button. Every answer comes
 * from the storefront (`/api/assistente/<region>`): the store's own words, real designs, INK's order pages, the store's WhatsApp. No AI, nothing invented.
 * The store's fixed topics stay above the field the whole conversation; the button glows softly until the visitor opens it once in the visit.
 *
 * Privacy: a CPF, card number or password is refused HERE, before it is sent (the server refuses it again). Analytics never get the text typed. The
 * conversation of this visit is kept in this tab only (sessionStorage), so following a suggested design and coming back does not lose it.
 *
 * `live`: fixed on the page; steps aside for a menu, a dialog of the page, the cookie bar and the virtual keyboard. `preview`: the panel's preview
 * (same markup, laid out in its frame, open, no analytics, no storage); the replies come from `ask`.
 */
export type AssistantWidgetProps = {
  region: string;
  opening: AssistantReply;
  mode?: "live" | "preview";
  /** Preview only: answers with the draft (a server action) instead of the published configuration. */
  ask?: (message: string) => Promise<AssistantReply | null>;
  /** The store's WhatsApp (wa.me link): a shortcut always at hand in the header. Absent = no shortcut. */
  whatsapp?: string;
  /** The button's text and the chat's title. */
  label?: string;
  /** Shortcuts always above the field, each one sent as a message. Empty = no row. */
  topics?: readonly string[];
};

type Entry = { from: "me"; text: string } | { from: "bot"; reply: AssistantReply };

const STORE_KEY = "origens:assistant:v1";
/** sessionStorage: set when the visitor opens the chat; the button stops glowing for the rest of the visit (the coupon button's QUIET_KEY rule). */
const SEEN_KEY = "origens:assistant:seen";
const MAX_KEPT = 30;
const FETCH_TIMEOUT_MS = 6000;
const LOCAL_REFUSE: AssistantReply = { v: 1, kind: "refuse", text: "Por segurança, não mande CPF, dados de cartão nem senha por aqui. Para ver ou mudar um pedido, entre em Meus pedidos com o e-mail da compra." };
const ERROR_TEXT = "Não consegui responder agora. Tente de novo em instantes.";
const SLOW_TEXT = "Muitas mensagens seguidas. Espere um minuto e tente de novo.";

function readKept(region: string): Entry[] {
  try {
    const raw = JSON.parse(window.sessionStorage.getItem(STORE_KEY) ?? "null") as { region?: string; entries?: Entry[] } | null;
    return raw?.region === region && Array.isArray(raw.entries) ? raw.entries.slice(-MAX_KEPT) : [];
  } catch {
    return [];
  }
}
/** "pulse": a few slow breaths, then "rest" (a still halo); "off" once the chat was opened in this visit. Never on the server or in the panel. */
type Glow = "pulse" | "rest" | "off";
function readGlow(): Glow {
  try {
    return window.sessionStorage.getItem(SEEN_KEY) ? "off" : "pulse";
  } catch {
    return "pulse";
  }
}
function markSeen(): void {
  try {
    window.sessionStorage.setItem(SEEN_KEY, "1");
  } catch {
    // Storage blocked: the glow is off for this page view only.
  }
}
function writeKept(region: string, entries: Entry[]): void {
  try {
    window.sessionStorage.setItem(STORE_KEY, JSON.stringify({ region, entries: entries.slice(-MAX_KEPT) }));
  } catch {
    // Storage blocked: the conversation lives as long as this page view.
  }
}

/** Something of the PAGE (not ours) is open: the mobile menu locks the root scroll, the search and other dialogs are modal. */
function pageOverlayOpen(own: Element | null): boolean {
  if (document.documentElement.style.overflow === "hidden" && !document.documentElement.hasAttribute("data-assistant-lock")) return true;
  for (const el of document.querySelectorAll('[aria-modal="true"], dialog[open]')) if (!own?.contains(el) && el.getClientRects().length > 0) return true;
  return false;
}
/** The button's own slot (bottom right) would sit over a purchase control (a version of the style or the CTA). */
function coversPurchase(bottomOffset: number, width: number): boolean {
  const vw = document.documentElement.clientWidth;
  const vh = window.innerHeight;
  const slot = { left: vw - 16 - width, right: vw - 16, top: vh - 16 - bottomOffset - 48, bottom: vh - 16 - bottomOffset };
  for (const el of document.querySelectorAll("[data-purchase-controls] button, [data-purchase-controls] a[href], [data-purchase-controls] .btn")) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.left < slot.right && slot.left < r.right && r.top < slot.bottom && slot.top < r.bottom) return true;
  }
  return false;
}
/** Phones: the page behind the sheet does not scroll while it is open. Returns the undo. */
function lockPageScroll(): () => void {
  const root = document.documentElement;
  const before = root.style.overflow;
  root.style.overflow = "hidden";
  root.setAttribute("data-assistant-lock", "");
  return () => {
    root.style.overflow = before;
    root.removeAttribute("data-assistant-lock");
  };
}
const isTyping = (el: Element | null): boolean => !!el && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || (el as HTMLElement).isContentEditable);
const coarsePointer = (): boolean => window.matchMedia?.("(pointer: coarse)").matches ?? false;
const isSheet = (): boolean => !(window.matchMedia?.("(min-width: 640px)").matches ?? true);
/** A storefront link (the API answers with absolute `SITE_URL` links) as a path of this site, so it works on any host. */
const pathOf = (url: string): string => {
  try {
    const u = new URL(url);
    return `${u.pathname}${u.search}`;
  } catch {
    return url;
  }
};
const linkHref = (link: AssistantLink): string => (link.kind === "page" || link.kind === "search" ? pathOf(link.href) : link.href);
const external = (link: AssistantLink): boolean => link.kind === "whatsapp" || link.kind === "orders" || link.kind === "tracking" || link.kind === "collection";
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const clock = () => Date.now();
/** "digitando…" for a moment before every answer, as a person would: never instant, never slow (engine.ts `typingDelay`), counting the wait already spent. */
const typingPause = (started: number, reply: Pick<AssistantReply, "text">) => wait(Math.max(0, typingDelay(reply) - (clock() - started)));
const lastReply = (entries: readonly Entry[]): AssistantReply | null => {
  for (let i = entries.length - 1; i >= 0; i--) { const e = entries[i]; if (e.from === "bot") return e.reply; }
  return null;
};

function ChatIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.6A8 8 0 1 1 21 12Z" />
      <path d="M9.2 9.6a2.8 2.8 0 0 1 5.4 1c0 1.8-2.6 2.2-2.6 3.6" />
      <path d="M12 17h.01" />
    </svg>
  );
}

export function AssistantWidget({ region, opening, mode = "live", ask, whatsapp, label = DEFAULT_ASSISTANT_LABEL, topics = [] }: AssistantWidgetProps) {
  const live = mode === "live";
  const [open, setOpen] = useState(!live);
  const [glow, setGlow] = useState<Glow>(() => (live && typeof window !== "undefined" ? readGlow() : "off"));
  // The conversation of this visit: the live chat never renders on the server (AssistantFab loads it with ssr: false), so it can read storage here.
  const [entries, setEntries] = useState<Entry[]>(() => (live && typeof window !== "undefined" ? readKept(region) : []));
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [bottom, setBottom] = useState(0);
  const fabRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const topicsRef = useRef<HTMLDivElement>(null);
  const [topicsMore, setTopicsMore] = useState(false);
  const openRef = useRef(open);
  const headingId = useId();
  const panelId = useId();

  const track = useCallback((event: AssistantEvent, params: AssistantParams = {}) => {
    if (live) trackAssistant(event, { ...params, region });
  }, [live, region]);

  useEffect(() => {
    if (live && entries.length > 0) writeKept(region, entries);
  }, [live, region, entries]);
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [entries, pending, open]);

  const close = useCallback((reason: "button" | "escape" | "outside") => {
    if (!openRef.current) return;
    openRef.current = false;
    setOpen(false);
    track("origens_assistant_close");
    if (reason !== "outside") fabRef.current?.focus({ preventScroll: true });
  }, [track]);

  const toggle = () => {
    if (open) return close("button");
    openRef.current = true;
    setOpen(true);
    if (live) {
      markSeen();
      setGlow("off");
    }
    track("origens_assistant_open");
  };

  const send = async (raw: string, source: "typed" | "chip" | "topic") => {
    const message = raw.replace(/\s+/g, " ").trim().slice(0, MAX_ASSISTANT_MESSAGE);
    if (!message || pending) return;
    setDraft("");
    track("origens_assistant_message", { message_source: source });
    const started = clock();
    const typed = (reply: Pick<AssistantReply, "text">) => typingPause(started, reply);
    if (isSensitive(message)) {
      // Never sent, never kept: the bubble shows a mask instead of the text.
      setEntries((list) => [...list, { from: "me", text: "••••" }]);
      setPending(true);
      await typed(LOCAL_REFUSE);
      setPending(false);
      setEntries((list) => [...list, { from: "bot", reply: LOCAL_REFUSE }]);
      track("origens_assistant_reply", { reply_kind: "refuse" });
      return;
    }
    const local = followUp(message, lastReply(entries) ?? opening);
    setEntries((list) => [...list, { from: "me", text: message }]);
    setPending(true);
    if (local) {
      await typed(local);
      setPending(false);
      setEntries((list) => [...list, { from: "bot", reply: local }]);
      track("origens_assistant_reply", { reply_kind: local.kind });
      return;
    }
    let reply: AssistantReply | null = null;
    let failure = ERROR_TEXT;
    try {
      if (ask) reply = await ask(message);
      else {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
        try {
          const response = await fetch(`/api/assistente/${region}`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, credentials: "omit", body: JSON.stringify({ message }), signal: controller.signal });
          if (response.status === 429) failure = SLOW_TEXT;
          const data = response.ok ? ((await response.json()) as AssistantReply) : null;
          reply = data && data.v === 1 && typeof data.text === "string" ? data : null;
        } finally {
          clearTimeout(timer);
        }
      }
    } catch {
      reply = null;
    }
    await typed(reply ?? { text: failure });
    setPending(false);
    if (reply) {
      setEntries((list) => [...list, { from: "bot", reply: reply as AssistantReply }]);
      track("origens_assistant_reply", { reply_kind: reply.kind, result_count: reply.items?.length ?? 0 });
    } else {
      setEntries((list) => [...list, { from: "bot", reply: { v: 1, kind: "fallback", text: failure } }]);
      track("origens_assistant_error");
    }
    if (!coarsePointer()) inputRef.current?.focus({ preventScroll: true });
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void send(draft, "typed");
  };

  const itemClick = (item: AssistantItem, position: number) => {
    track("origens_assistant_item_click", { position, ...(item.productId ? { target_product_id: item.productId } : {}) });
    if (live && item.productId) trackGoToInk({ productId: item.productId, sourceSection: SOURCES.assistant, productName: item.title, value: item.price, destinationUrl: item.href, ...(item.context ? { city: item.context.split(" · ")[0], state: item.context.split(" · ")[1] } : {}) });
  };

  // Opening: focus goes to the field; Escape closes; a click outside closes; on phones the page behind the sheet does not scroll.
  useEffect(() => {
    if (!open || !live) return;
    const panel = panelRef.current;
    if (!coarsePointer()) inputRef.current?.focus({ preventScroll: true });
    else panel?.querySelector<HTMLElement>("[data-assistant-close]")?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); close("escape"); return; }
      if (e.key === "Tab" && panel && isSheet()) {
        const focusable = Array.from(panel.querySelectorAll<HTMLElement>("button, [href], input, [tabindex]:not([tabindex='-1'])")).filter((el) => el.getClientRects().length > 0 && !(el as HTMLButtonElement).disabled);
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (target && !panel?.contains(target) && !fabRef.current?.contains(target)) close("outside");
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer, true);
    const unlock = isSheet() ? lockPageScroll() : null;
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer, true);
      unlock?.();
    };
  }, [open, live, close]);

  // Above the cookie bar while it is shown.
  useEffect(() => {
    if (!live) return;
    let observer: ResizeObserver | null = null;
    const measure = () => {
      const banner = document.querySelector<HTMLElement>("[data-consent-banner]");
      setBottom(banner && banner.getClientRects().length > 0 ? Math.ceil(banner.getBoundingClientRect().height) : 0);
      return banner;
    };
    const frame = requestAnimationFrame(() => {
      const banner = measure();
      if (banner && typeof ResizeObserver !== "undefined") { observer = new ResizeObserver(measure); observer.observe(banner); }
    });
    const onChange = () => measure();
    window.addEventListener("resize", onChange);
    document.addEventListener("click", onChange, true);
    return () => { cancelAnimationFrame(frame); observer?.disconnect(); window.removeEventListener("resize", onChange); document.removeEventListener("click", onChange, true); };
  }, [live]);

  // Out of the way while the page needs the space: a menu, the search or a dialog is open, the visitor types elsewhere (virtual keyboard), or the
  // button would cover a purchase control.
  useEffect(() => {
    if (!live) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const check = () => {
      const typing = isTyping(document.activeElement) && coarsePointer() && !panelRef.current?.contains(document.activeElement);
      const width = fabRef.current?.offsetWidth || 112;
      setHidden(!openRef.current && (pageOverlayOpen(rootRef.current) || typing || coversPurchase(bottom, width)));
    };
    const later = () => { if (timer) clearTimeout(timer); timer = setTimeout(check, 60); };
    const opts = { capture: true } as const;
    document.addEventListener("click", later, opts);
    document.addEventListener("keydown", later, opts);
    document.addEventListener("focusin", later, opts);
    document.addEventListener("focusout", later, opts);
    window.addEventListener("resize", later);
    window.addEventListener("scroll", later, { passive: true });
    window.visualViewport?.addEventListener("resize", later);
    check();
    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener("click", later, opts);
      document.removeEventListener("keydown", later, opts);
      document.removeEventListener("focusin", later, opts);
      document.removeEventListener("focusout", later, opts);
      window.removeEventListener("resize", later);
      window.removeEventListener("scroll", later);
      window.visualViewport?.removeEventListener("resize", later);
    };
  }, [live, bottom]);

  useEffect(() => {
    openRef.current = open;
  }, [open]);

  // Phones: the topics are one row that scrolls sideways; while there is more of it to the right, its end fades out.
  useEffect(() => {
    const row = topicsRef.current;
    if (!open || !row) return;
    const measure = () => setTopicsMore(row.scrollWidth - row.clientWidth - row.scrollLeft > 4);
    measure();
    row.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => { row.removeEventListener("scroll", measure); window.removeEventListener("resize", measure); };
  }, [open, topics]);

  const shown: Entry[] = [{ from: "bot", reply: opening }, ...entries];
  const lastBot = shown.map((e) => e.from).lastIndexOf("bot");
  const bubble = (entry: Entry, i: number) => {
    if (entry.from === "me") {
      return (
        <li key={i} className="flex justify-end">
          <p className="max-w-[85%] whitespace-pre-line rounded-[3px] bg-[var(--region-primary,#111)] px-3.5 py-2 text-[0.9375rem] leading-snug text-white [overflow-wrap:anywhere]">{entry.text}</p>
        </li>
      );
    }
    const { reply } = entry;
    return (
      <li key={i} className="flex flex-col items-start gap-2" data-assistant-reply={reply.kind}>
        <p className="max-w-[92%] whitespace-pre-line rounded-[3px] border border-black/15 bg-white px-3.5 py-2.5 text-[0.9375rem] leading-[1.45] text-ink [overflow-wrap:anywhere]">{reply.text}</p>
        {reply.items && reply.items.length > 0 && (
          <ul className="grid w-full grid-cols-2 gap-2" data-assistant="items">
            {reply.items.map((item, j) => (
              <li key={item.href}>
                <a
                  href={item.productId ? item.href : pathOf(item.href)}
                  onClick={() => itemClick(item, j + 1)}
                  className="group flex h-full flex-col overflow-hidden border border-black/15 bg-white text-left transition-colors duration-200 hover:border-[var(--region-primary,#111)]"
                >
                  <span className="relative block aspect-square bg-[var(--ground,#e5e5e5)]">
                    {/* eslint-disable-next-line @next/next/no-img-element -- INK's own CDN picture, small, inside a chat bubble */}
                    <img src={item.image} alt="" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-contain" />
                  </span>
                  <span className="flex flex-1 flex-col gap-0.5 p-2">
                    <span className="line-clamp-2 text-[0.8125rem] font-semibold leading-tight group-hover:underline group-hover:underline-offset-2">{item.title}</span>
                    {item.context && <span className="text-[0.75rem] text-ink-mute">{item.context}</span>}
                    {item.price !== undefined && <span className="mt-auto pt-1 text-[0.8125rem] font-bold tabular-nums">{formatPrice(item.price)}</span>}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
        {reply.links && reply.links.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {reply.links.map((link) => (
              <a
                key={`${link.kind}:${link.href}`}
                href={linkHref(link)}
                {...(external(link) ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                onClick={() => track("origens_assistant_link_click", { link_kind: link.kind })}
                className={`inline-flex min-h-11 items-center gap-1.5 border-2 px-4 text-[0.9375rem] font-semibold transition-colors duration-200 ${link.kind === "whatsapp" ? "border-[#1f7a43] bg-[#1f7a43] text-white hover:border-[#17633a] hover:bg-[#17633a]" : "border-ink bg-white text-ink hover:border-[var(--region-primary,#111)] hover:bg-paper"}`}
                data-assistant-link={link.kind}
              >
                {link.label}
                {external(link) && <span aria-hidden="true">↗</span>}
              </a>
            ))}
          </div>
        )}
        {/* The opening's chips would repeat the fixed topics ("Frete e prazo" and "Como é calculado o frete?"): with the row, they stay hidden. */}
        {i === lastBot && !(i === 0 && topics.length > 0) && reply.suggestions && reply.suggestions.length > 0 && (
          <div className="flex flex-wrap gap-1.5" data-assistant="suggestions">
            {reply.suggestions.map((s) => (
              <button key={s} type="button" disabled={pending} onClick={() => void send(s, "chip")} className="min-h-10 border border-black/30 bg-white px-3 py-1.5 text-left text-[0.8125rem] font-medium leading-tight text-ink transition-colors duration-200 hover:border-ink hover:bg-paper disabled:opacity-50">
                {s}
              </button>
            ))}
          </div>
        )}
      </li>
    );
  };

  const position = live ? "fixed" : "absolute";
  return (
    <div ref={rootRef} data-assistant-root={mode} className="contents" style={{ ["--assistant-bottom" as string]: `${bottom}px` }}>
      {open && live && <div aria-hidden="true" className="fixed inset-0 z-50 bg-black/45 sm:hidden" onClick={() => close("outside")} />}
      {open && (
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-modal={live ? "true" : undefined}
          aria-labelledby={headingId}
          data-testid="assistant-panel"
          className={[
            "z-50 flex flex-col bg-paper text-ink shadow-[0_18px_40px_rgb(0_0_0/0.28)]",
            live
              ? "fixed inset-x-0 bottom-0 h-[min(85dvh,42rem)] border-t-2 border-ink pb-[env(safe-area-inset-bottom)] sm:inset-x-auto sm:bottom-[calc(max(1rem,env(safe-area-inset-bottom))+var(--assistant-bottom)+4rem)] sm:right-[max(1rem,env(safe-area-inset-right))] sm:h-[min(72vh,38rem,calc(100dvh-var(--assistant-bottom)-6.5rem))] sm:w-[24rem] sm:border-2 sm:pb-0"
              : "absolute bottom-[4.5rem] left-3 right-3 top-3 border-2 border-ink",
          ].join(" ")}
        >
          <div className="flex items-center justify-between gap-2 border-b-2 border-ink py-1 pl-4 pr-1">
            <div className="min-w-0">
              <h2 id={headingId} className="font-display text-[1.375rem] font-extrabold uppercase leading-none tracking-[0.01em]">{label}</h2>
              <p className="mt-0.5 text-[0.75rem] text-ink-mute">Estampas, pedidos e trocas</p>
            </div>
            {whatsapp && (
              <a href={whatsapp} target="_blank" rel="noopener noreferrer" onClick={() => track("origens_assistant_link_click", { link_kind: "whatsapp_shortcut" })} className="ml-auto inline-flex min-h-9 shrink-0 items-center gap-1.5 border-2 border-[#1f7a43] bg-white px-2.5 text-[0.75rem] font-bold uppercase tracking-[0.06em] text-[#1f7a43] transition-colors duration-200 hover:bg-[#1f7a43] hover:text-white" data-testid="assistant-whatsapp-shortcut">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2c-1.5 0-3-.4-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.2.3-.9.9-.9 2.2s.9 2.5 1 2.7c.1.2 1.8 2.8 4.4 3.9 1.6.7 2.3.8 3.1.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3Z" /></svg>
                WhatsApp
              </a>
            )}
            <button type="button" data-assistant-close onClick={() => close("button")} aria-label="Fechar o assistente" className="flex h-11 w-11 shrink-0 items-center justify-center text-ink hover:bg-black/5" data-testid="assistant-close">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
            </button>
          </div>
          <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3" aria-live="polite" aria-busy={pending}>
            <ol className="flex flex-col gap-3" data-testid="assistant-messages">
              {shown.map(bubble)}
              {pending && (
                <li className="flex" data-testid="assistant-typing">
                  <span className="inline-flex items-center gap-1 rounded-[3px] border border-black/15 bg-white px-3.5 py-3" role="status" aria-label="Digitando">
                    {[0, 150, 300].map((d) => <span key={d} className="h-1.5 w-1.5 rounded-full bg-ink-mute motion-safe:animate-pulse" style={{ animationDelay: `${d}ms` }} />)}
                    <span className="ml-1.5 text-[0.8125rem] text-ink-mute">digitando</span>
                  </span>
                </li>
              )}
            </ol>
          </div>
          {topics.length > 0 && (
            <div
              ref={topicsRef}
              role="group"
              aria-label="Temas"
              data-more={topicsMore ? "" : undefined}
              className="assistant-topics flex gap-1.5 overflow-x-auto overscroll-x-contain border-t border-black/15 px-2.5 py-2 [scrollbar-width:none] sm:grid sm:grid-cols-2 sm:overflow-visible [&::-webkit-scrollbar]:hidden"
              data-testid="assistant-topics"
            >
              {topics.map((topic) => (
                <button key={topic} type="button" disabled={pending} onClick={() => void send(topic, "topic")} className="min-h-10 shrink-0 whitespace-nowrap rounded-[3px] border border-black/30 bg-white px-3 text-[0.8125rem] font-semibold leading-tight text-ink transition-colors duration-200 hover:border-ink hover:bg-paper disabled:opacity-50" data-assistant-topic>
                  {topic}
                </button>
              ))}
            </div>
          )}
          <form onSubmit={onSubmit} className="flex items-stretch gap-0 border-t-2 border-ink bg-white p-2.5">
            <label htmlFor={`${panelId}-q`} className="sr-only">Sua pergunta</label>
            <input
              ref={inputRef}
              id={`${panelId}-q`}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={MAX_ASSISTANT_MESSAGE}
              enterKeyHint="send"
              autoComplete="off"
              placeholder="Escreva sua pergunta ou cidade"
              className="min-h-11 min-w-0 flex-1 border-2 border-r-0 border-ink bg-white px-3.5 text-[1rem] text-ink placeholder:text-ink-mute focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-[var(--region-primary,#111)]"
              data-testid="assistant-input"
            />
            <button type="submit" disabled={pending || draft.trim() === ""} className="inline-flex min-h-11 shrink-0 items-center justify-center border-2 border-ink bg-ink px-4 text-[0.8125rem] font-bold uppercase tracking-[0.06em] text-white transition-colors duration-200 hover:bg-white hover:text-ink disabled:border-black/25 disabled:bg-black/25" data-testid="assistant-send">
              Enviar
            </button>
          </form>
          <p className="bg-white px-3 pb-2.5 text-[0.75rem] leading-snug text-ink-mute">Não envie CPF, cartão ou senha. Pedidos e trocas ficam em Meus pedidos, na loja.</p>
        </div>
      )}
      <button
        ref={fabRef}
        type="button"
        onClick={toggle}
        hidden={hidden}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-haspopup="dialog"
        data-testid="assistant-fab"
        data-glow={glow === "off" || open ? undefined : glow}
        onAnimationEnd={() => setGlow((g) => (g === "pulse" ? "rest" : g))}
        className={[
          "assistant-fab",
          position,
          "z-30 inline-flex h-12 items-center gap-2 rounded-xl bg-[var(--region-primary,#111)] pl-3.5 pr-4 text-[0.8125rem] font-extrabold uppercase tracking-[0.08em] text-white shadow-[0_6px_18px_rgb(0_0_0/0.24)] outline-offset-4 transition-transform duration-200 hover:-translate-y-0.5 active:translate-y-0 sm:h-14 sm:pl-4 sm:pr-5",
          live ? "bottom-[calc(max(1rem,env(safe-area-inset-bottom))+var(--assistant-bottom))] right-[max(1rem,env(safe-area-inset-right))]" : "bottom-4 right-4",
        ].join(" ")}
      >
        <ChatIcon />
        {open ? "Fechar" : label}
      </button>
    </div>
  );
}

export default AssistantWidget;
