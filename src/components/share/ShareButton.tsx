"use client";

import { useId, useRef, useState } from "react";
import { SheetDialog, SheetHeader } from "@/components/layout/SheetDialog";
import { copyText } from "@/components/promotions/copy";
import { trackShare } from "@/lib/analytics/track";
import { whatsappShareHref, type SharePayload } from "@/lib/share/url";

export function ShareIcon({ className }: { className: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 15V3.5M7.5 8 12 3.5 16.5 8" />
      <path d="M8 11H6.5A1.5 1.5 0 0 0 5 12.5v7A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5v-7a1.5 1.5 0 0 0-1.5-1.5H16" />
    </svg>
  );
}

/**
 * "Compartilhar": the payload (clean URL, title, text) is built on the server (src/lib/share) and arrives ready, so the native share sheet
 * opens straight from the tap — nothing is fetched between the click and `navigator.share`, which would lose the user activation.
 *
 * Native sheet when the browser has one and accepts the data (feature detection only, never the user agent). Cancelling it (`AbortError`)
 * ends everything silently. Any other failure, or no native sheet, opens a small menu: "Copiar link" (confirms only after a real copy;
 * otherwise shows the link selected for a manual copy) and "WhatsApp" (official `wa.me` link, no recipient — the person picks who).
 *
 * `variant="icon"` is the discreet round button on a product card: a SIBLING of the card's link (see FamilyCard), never inside it, and
 * `preventDefault`/`stopPropagation` keep a tap from also opening the product.
 */
export function ShareButton({ share, variant, className = "" }: { share: SharePayload; variant: "icon" | "inline"; className?: string }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);

  async function onClick(event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    const data: ShareData = { title: share.title, text: share.text, url: share.url };
    if (typeof navigator.share === "function" && (typeof navigator.canShare !== "function" || navigator.canShare(data))) {
      try {
        await navigator.share(data);
        trackShare({ method: "native", contentType: share.kind, itemId: share.itemId });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        // NotAllowedError, DataError, a sheet already open…: offer the menu instead.
      }
    }
    setMenuOpen(true);
  }

  return (
    <>
      {variant === "icon" ? (
        <button
          ref={trigger}
          type="button"
          onClick={onClick}
          aria-haspopup="dialog"
          aria-label={`${share.label}: ${share.name}`}
          data-testid="share-button"
          className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-full bg-white/90 text-ink shadow-sm transition-colors hover:text-region-primary ${className}`}
        >
          <ShareIcon className="h-5 w-5" />
        </button>
      ) : (
        <button
          ref={trigger}
          type="button"
          onClick={onClick}
          aria-haspopup="dialog"
          data-testid="share-button"
          className={`inline-flex min-h-11 items-center gap-2 font-semibold transition-colors hover:text-region-primary ${className}`}
        >
          <ShareIcon className="h-5 w-5" />
          {share.label}
        </button>
      )}
      <ShareMenu share={share} open={menuOpen} onClose={() => setMenuOpen(false)} returnFocus={trigger} />
    </>
  );
}

function ShareMenu({
  share,
  open,
  onClose,
  returnFocus,
}: {
  share: SharePayload;
  open: boolean;
  onClose: () => void;
  returnFocus: React.RefObject<HTMLButtonElement | null>;
}) {
  const titleId = useId();
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");
  const field = useRef<HTMLInputElement>(null);

  async function copy() {
    const ok = await copyText(share.url);
    setStatus(ok ? "copied" : "failed");
    if (ok) trackShare({ method: "copy", contentType: share.kind, itemId: share.itemId });
    else requestAnimationFrame(() => field.current?.select());
  }

  return (
    <SheetDialog
      open={open}
      onClose={() => {
        setStatus("idle");
        onClose();
      }}
      labelledBy={titleId}
      returnFocus={returnFocus}
    >
      <SheetHeader id={titleId} title={share.label} onClose={onClose} />
      <p className="t-small mb-5 text-ink-soft">{share.name}</p>
      <div className="grid gap-3">
        <button type="button" onClick={copy} className="btn w-full">
          Copiar link
        </button>
        <a
          href={whatsappShareHref(share.text, share.url)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => trackShare({ method: "whatsapp", contentType: share.kind, itemId: share.itemId })}
          className="btn btn-ghost w-full"
        >
          WhatsApp
        </a>
      </div>
      <p role="status" aria-live="polite" className="t-small mt-4 min-h-6 font-semibold">
        {status === "copied" ? "Link copiado!" : status === "failed" ? "Selecione e copie o link" : ""}
      </p>
      {status === "failed" && (
        <input
          ref={field}
          readOnly
          value={share.url}
          aria-label="Link para compartilhar"
          onFocus={(event) => event.currentTarget.select()}
          className="mt-2 w-full border-2 border-ink bg-white px-3 py-2 text-[16px]"
        />
      )}
    </SheetDialog>
  );
}
