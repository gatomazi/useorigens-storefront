"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ageLabel } from "@/lib/cart-mirror/age";
import { INK_CART_URL, MAX_SNAPSHOT_AGE_SECONDS } from "@/lib/cart-mirror/constants";
import { fetchMirror, type MirrorResult } from "@/lib/cart-mirror/client";
import { clearToken, getToken, subscribeToken } from "@/lib/cart-mirror/token-store";
import type { CartMirrorItem, CartMirrorSnapshot } from "@/lib/cart-mirror/types";

type State =
  /** Nothing resolved yet (or no token): the component renders nothing. */
  | { status: "idle" }
  | { status: "ok"; snapshot: CartMirrorSnapshot; fetchedAt: number }
  | { status: "error" };

const REFRESH_AFTER_MS = 30_000;

function BagIcon({ className }: { className: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 8h12l1 12H5L6 8Z" />
      <path d="M9 8V6.5a3 3 0 0 1 6 0V8" />
    </svg>
  );
}

const produtos = (n: number) => `${n} ${n === 1 ? "produto" : "produtos"} na INK`;

function Line({ item }: { item: CartMirrorItem }) {
  const detail = [item.color, item.size, `${item.quantity} un.`].filter(Boolean).join(" · ");
  return (
    <li className="flex gap-4 border-b border-line py-4 last:border-b-0" data-testid="cart-mirror-item">
      <span className="relative block h-[5.25rem] w-[5.125rem] shrink-0 bg-ground">
        {item.image ? <Image src={item.image} alt="" fill sizes="84px" quality={70} className="object-cover" /> : null}
      </span>
      <div className="flex min-w-0 flex-1 flex-col justify-between">
        <div>
          <p className="t-label break-words">{item.name}</p>
          <p className="t-caption mt-1">{detail}</p>
        </div>
        <p className="t-small font-semibold">
          {item.listPriceText ? (
            <>
              <s className="mr-2 font-normal text-ink-mute" data-testid="cart-mirror-list-price">
                <span className="sr-only">Preço original </span>
                {item.listPriceText}
              </s>
              <span className="sr-only">Preço na INK </span>
            </>
          ) : null}
          <span data-testid="cart-mirror-line-price">{item.linePriceText}</span>
        </p>
      </div>
    </li>
  );
}

/**
 * "Meu carrinho": a read-only summary of the last cart state INK reported, shown only when this tab holds a cart token. No token
 * → nothing is rendered and nothing is fetched. It never edits, never computes a price and never checkouts: the official cart is
 * INK's, reached through "Ir para meu carrinho". The snapshot lives in memory only (never in browser storage).
 */
export function CartMirrorMenu() {
  const token = useSyncExternalStore(subscribeToken, getToken, () => null);
  const [state, setState] = useState<State>({ status: "idle" });
  const [now, setNow] = useState(() => Date.now());
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const apply = useCallback((result: MirrorResult, keepOnFailure: boolean) => {
    if (result.kind === "expired") {
      clearToken(); // expired or unknown: neutral state, and no more requests for a dead token
      return;
    }
    if (result.kind === "ok") {
      const fetchedAt = Date.now();
      setNow(fetchedAt);
      setState({ status: "ok", snapshot: result.snapshot, fetchedAt });
      return;
    }
    // A failed refresh never wipes what the panel already shows.
    setState((previous) => (keepOnFailure && previous.status !== "idle" ? previous : { status: "error" }));
  }, []);

  useEffect(() => {
    if (!token) return; // nothing is rendered without a token, so stale state below is never shown
    const controller = new AbortController();
    abortRef.current = controller;
    void fetchMirror(token, controller.signal).then((result) => {
      if (!controller.signal.aborted) apply(result, false);
    });
    return () => controller.abort();
  }, [token, apply]);

  // While the panel is open the age label keeps counting; a snapshot that outlives its TTL turns neutral.
  useEffect(() => {
    if (!open || !token) return;
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, [open, token]);

  const ageSeconds = state.status === "ok" ? state.snapshot.ageSeconds + Math.max(0, Math.round((now - state.fetchedAt) / 1000)) : 0;
  useEffect(() => {
    if (state.status === "ok" && ageSeconds > MAX_SNAPSHOT_AGE_SECONDS) clearToken();
  }, [state.status, ageSeconds]);

  if (!token || state.status === "idle") return null;

  const openPanel = () => {
    setNow(Date.now());
    setOpen(true);
    dialogRef.current?.showModal();
    // Reopening after a while (or after a failure) asks again; the old summary stays on screen meanwhile.
    if (state.status === "error" || (state.status === "ok" && Date.now() - state.fetchedAt > REFRESH_AFTER_MS)) {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      void fetchMirror(token, controller.signal).then((result) => {
        if (!controller.signal.aborted) apply(result, true); // the panel never blinks out while retrying
      });
    }
  };
  const closePanel = () => dialogRef.current?.close();

  const snapshot = state.status === "ok" ? state.snapshot : null;
  const count = snapshot?.count ?? 0;

  return (
    <>
      <button
        type="button"
        onClick={openPanel}
        aria-haspopup="dialog"
        data-testid="cart-mirror-trigger"
        className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 px-2 font-semibold sm:px-3"
      >
        <span className="relative inline-flex">
          <BagIcon className="h-5 w-5" />
          {count > 0 ? (
            <span aria-hidden="true" className="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center bg-white px-[3px] text-[0.6875rem] font-bold leading-none text-ink">
              {count}
            </span>
          ) : null}
        </span>
        <span className="hidden sm:inline">Meu carrinho</span>
        <span className="sr-only sm:hidden">Meu carrinho{snapshot ? `, ${produtos(count)}` : ""}</span>
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby="cart-mirror-title"
        onClose={() => setOpen(false)}
        onClick={(event) => event.target === dialogRef.current && closePanel()}
        className="m-0 ml-auto h-dvh max-h-none w-full max-w-none flex-col bg-ground p-0 text-ink backdrop:bg-black/60 open:flex sm:max-w-md"
        data-testid="cart-mirror-dialog"
      >
        <div className="flex items-center justify-between px-5 pb-3 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6">
          <h2 id="cart-mirror-title" className="font-display text-[1.75rem] font-extrabold uppercase leading-none">
            Meu carrinho
          </h2>
          <button type="button" onClick={closePanel} className="inline-flex min-h-11 items-center gap-2 font-semibold" aria-label="Fechar meu carrinho">
            Fechar
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M5 5l14 14M19 5L5 19" />
            </svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 sm:px-6">
          {snapshot && snapshot.items.length > 0 ? (
            <>
              <p className="t-small font-semibold" data-testid="cart-mirror-count">{produtos(snapshot.count)}</p>
              <ul className="mt-2">
                {snapshot.items.map((item, index) => (
                  <Line key={`${item.productId}-${index}`} item={item} />
                ))}
              </ul>
              {snapshot.totalText ? (
                <p className="t-small mt-2 flex items-baseline justify-between border-t border-line pt-4 font-semibold">
                  <span>Total na INK</span>
                  <span data-testid="cart-mirror-total">{snapshot.totalText}</span>
                </p>
              ) : null}
            </>
          ) : snapshot ? (
            <p className="t-small" data-testid="cart-mirror-empty">Seu carrinho na INK estava vazio na última visita.</p>
          ) : (
            <p className="t-small" data-testid="cart-mirror-error">Não foi possível carregar o resumo agora.</p>
          )}

          <div className="mt-5 pb-4">
            {snapshot ? (
              <p className="t-caption font-semibold" data-testid="cart-mirror-age">
                {ageLabel(ageSeconds)}
              </p>
            ) : null}
            <p className="t-caption mt-1">
              {snapshot ? "Este resumo pode estar desatualizado. " : ""}O carrinho oficial é o da INK.
            </p>
          </div>
        </div>

        <div className="grid gap-3 border-t border-line bg-ground px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 sm:px-6">
          <a href={INK_CART_URL} className="btn" data-testid="cart-mirror-go">
            Ir para meu carrinho
          </a>
          <button type="button" onClick={closePanel} className="btn btn-ghost" data-testid="cart-mirror-continue">
            Continuar escolhendo
          </button>
        </div>
      </dialog>
    </>
  );
}
