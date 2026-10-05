"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * A small native modal `<dialog>`: a bottom sheet on phones, a centred panel from `sm`. The platform gives the focus trap, Escape and the
 * inert page behind it; this adds closing on a backdrop tap and returns focus to the button that opened it (`returnFocus`), as the share
 * menu and the size guide both need. A `dialog[open]` also makes the coupon button step aside (PromoWidget `pageOverlayOpen`).
 */
export function SheetDialog({
  open,
  onClose,
  labelledBy,
  returnFocus,
  wide = false,
  children,
}: {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  returnFocus?: React.RefObject<HTMLElement | null>;
  /** The size guide needs room for its table; the share menu does not. */
  wide?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const latest = useRef({ onClose, returnFocus });
  useEffect(() => {
    latest.current = { onClose, returnFocus };
  });

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // A native listener, not JSX `onClose`: a close done by the platform itself (Escape, a backdrop tap, `dialog.close()`) must always reach
  // the owner's state — otherwise it stays "open", the next tap changes nothing and the sheet never reopens (seen in QA with `onClose`).
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const handle = () => {
      latest.current.onClose();
      latest.current.returnFocus?.current?.focus({ preventScroll: true });
    };
    dialog.addEventListener("close", handle);
    return () => dialog.removeEventListener("close", handle);
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={labelledBy}
      onClick={(event) => event.target === ref.current && ref.current?.close()}
      className={`mb-0 mt-auto max-h-[88dvh] w-full max-w-none overflow-y-auto border-t-2 border-ink bg-ground p-0 text-ink backdrop:bg-black/55 sm:m-auto sm:border-2 ${wide ? "sm:max-w-3xl" : "sm:max-w-sm"}`}
    >
      {open && <div className="px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-4 sm:px-7 sm:pb-7 sm:pt-5">{children}</div>}
    </dialog>
  );
}

/** The sheet's header row: title on the left, "Fechar" (44px) on the right. */
export function SheetHeader({ id, title, onClose }: { id: string; title: string; onClose: () => void }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-4">
      <h2 id={id} className="text-[1.25rem] font-extrabold tracking-tight">
        {title}
      </h2>
      <button type="button" onClick={onClose} className="-mr-2 inline-flex min-h-11 min-w-11 items-center justify-center gap-2 px-2 font-semibold">
        <span className="sr-only sm:not-sr-only">Fechar</span>
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          <path d="M5 5l14 14M19 5L5 19" />
        </svg>
      </button>
    </div>
  );
}
