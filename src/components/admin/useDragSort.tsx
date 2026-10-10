"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { dropIndex, moveItem } from "@/lib/admin/drag-sort";

/**
 * Drag-to-reorder for a vertical list (the products of a collection section, the sections of the home and of a page). The row is dragged by
 * its handle (mouse or finger: the handle has `touch-action: none`, so the rest of the list still scrolls), follows the pointer, and the
 * other rows make room as it passes them; near the edge of the list (or of the window) it scrolls. Nothing is saved while moving: the new
 * order goes to `onDrop` once, when the row is let go; Esc puts everything back.
 *
 * Keyboard: Space or Enter on the handle picks the row up, ↑ ↓ (Home/End) move it, Space or Enter drops it and Esc cancels; every step is
 * announced. Rows outside `min`..`max` (a hero, a footer) stay where they are.
 */
type Options = {
  /** The order as saved by the caller. */
  ids: string[];
  /** The new order, once, when a move ends somewhere else. */
  onDrop: (ids: string[]) => void;
  /** Names the row in what screen readers hear. */
  label: (id: string) => string;
  min?: number;
  max?: number;
  disabled?: boolean;
};

type Drag = {
  id: string;
  from: string[];
  order: string[];
  pointer: number | null;
  /** Pointer position (viewport), where it started and where the row was grabbed, from its top edge. */
  y: number;
  start: number;
  grab: number;
  frame: number;
  scroller: HTMLElement | null;
  /** Where each row was drawn just before a reorder: they glide from there once React has moved them. */
  tops?: Map<string, number>;
  listeners?: () => void;
};

const EDGE = 56;
const still = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const shift = (el: HTMLElement) => {
  const t = getComputedStyle(el).transform;
  return t && t !== "none" ? new DOMMatrixReadOnly(t).m42 : 0;
};
const same = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

function scrollParent(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY;
    if ((o === "auto" || o === "scroll") && p.scrollHeight > p.clientHeight) return p;
  }
  return null;
}

export function useDragSort({ ids, onDrop, label, min = 0, max, disabled = false }: Options) {
  const rows = useRef(new Map<string, HTMLElement>());
  const handles = useRef(new Map<string, HTMLElement>());
  const drag = useRef<Drag | null>(null);
  const opts = useRef({ ids, onDrop, label, min, max: max ?? ids.length - 1 });
  useLayoutEffect(() => {
    opts.current = { ids, onDrop, label, min, max: max ?? ids.length - 1 };
  });
  const [preview, setPreview] = useState<string[] | null>(null);
  const [active, setActive] = useState<{ id: string; keyboard: boolean } | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const hintId = useId();

  const order = preview ?? ids;
  const position = (list: string[], id: string) => `posição ${list.indexOf(id) + 1} de ${list.length}`;

  /** Keeps the dragged row under the pointer, wherever the layout has put its slot. */
  const follow = (d: Drag) => {
    const el = rows.current.get(d.id);
    if (!el) return;
    const natural = el.getBoundingClientRect().top - shift(el);
    el.style.transform = `translateY(${d.y - d.grab - natural}px)`;
  };

  const reorder = (d: Drag, next: string[]) => {
    d.tops = new Map([...rows.current].map(([id, el]) => [id, el.getBoundingClientRect().top]));
    d.order = next;
    setPreview(next);
  };

  // After React has moved the rows: the ones that changed place glide from where they were drawn; the dragged one stays under the pointer
  // (or, from the keyboard, keeps the focus and stays in view).
  useLayoutEffect(() => {
    const d = drag.current;
    if (!d?.tops) return;
    const tops = d.tops;
    d.tops = undefined;
    for (const [id, el] of rows.current) {
      if (id === d.id && d.pointer !== null) continue;
      const before = tops.get(id);
      if (before === undefined) continue;
      for (const a of el.getAnimations()) a.cancel();
      const delta = before - el.getBoundingClientRect().top;
      if (!still() && Math.abs(delta) > 0.5) el.animate([{ transform: `translateY(${delta}px)` }, { transform: "translateY(0)" }], { duration: 160, easing: "cubic-bezier(0.2, 0, 0, 1)" });
    }
    if (d.pointer !== null) follow(d);
    else {
      const h = handles.current.get(d.id);
      if (h && document.activeElement !== h) h.focus({ preventScroll: true });
      rows.current.get(d.id)?.scrollIntoView({ block: "nearest" });
    }
  });

  // Scrolls only toward where the row is being taken, and only once it has left its place: a row grabbed near the edge does not set the
  // list running by itself.
  const autoscroll = (d: Drag) => {
    const up = d.y < d.start - 8;
    const down = d.y > d.start + 8;
    if (!up && !down) return;
    const speed = (dist: number) => Math.ceil(((EDGE - Math.min(EDGE, Math.max(0, dist))) / EDGE) * 18);
    const s = d.scroller;
    if (s) {
      const r = s.getBoundingClientRect();
      if (up && d.y < r.top + EDGE && s.scrollTop > 0) return void (s.scrollTop -= speed(d.y - r.top));
      if (down && d.y > r.bottom - EDGE && s.scrollTop + s.clientHeight < s.scrollHeight - 1) return void (s.scrollTop += speed(r.bottom - d.y));
    }
    if (up && d.y < EDGE) window.scrollBy(0, -speed(d.y));
    else if (down && d.y > window.innerHeight - EDGE) window.scrollBy(0, speed(window.innerHeight - d.y));
  };

  const step = () => {
    const d = drag.current;
    if (!d || d.pointer === null) return;
    autoscroll(d);
    follow(d);
    const el = rows.current.get(d.id);
    // While React has a reorder to draw, the rows on screen are not yet in `d.order`: measure again next frame.
    if (el && !d.tops) {
      const current = d.order.indexOf(d.id);
      const mids = d.order.map((id) => {
        const row = rows.current.get(id);
        if (!row) return Number.NaN;
        const r = row.getBoundingClientRect();
        return r.top - shift(row) + r.height / 2;
      });
      const r = el.getBoundingClientRect();
      const to = dropIndex(mids, current, r.top, r.bottom, opts.current.min, opts.current.max);
      if (to !== current) reorder(d, moveItem(d.order, current, to));
    }
    d.frame = requestAnimationFrame(step);
  };

  const finish = (commit: boolean) => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    cancelAnimationFrame(d.frame);
    d.listeners?.();
    document.documentElement.classList.remove("a-dragging");
    const el = rows.current.get(d.id);
    if (el && d.pointer !== null) {
      // Lands in its slot instead of jumping there.
      const offset = shift(el);
      el.style.transform = "";
      if (commit && !still() && Math.abs(offset) > 0.5) el.animate([{ transform: `translateY(${offset}px)` }, { transform: "translateY(0)" }], { duration: 140, easing: "cubic-bezier(0.2, 0, 0, 1)" });
    }
    setPreview(null);
    setActive(null);
    const name = opts.current.label(d.id);
    if (commit && !same(d.order, d.from)) {
      setAnnouncement(`${name} solto na ${position(d.order, d.id)}.`);
      opts.current.onDrop(d.order);
    } else setAnnouncement(commit ? `${name} ficou na ${position(d.from, d.id)}.` : `Movimento cancelado: ${name} voltou à ${position(d.from, d.id)}.`);
  };

  useEffect(
    () => () => {
      const d = drag.current;
      if (!d) return;
      cancelAnimationFrame(d.frame);
      d.listeners?.();
      document.documentElement.classList.remove("a-dragging");
    },
    [],
  );

  const onPointerDown = (id: string) => (e: PointerEvent<HTMLElement>) => {
    if (disabled || e.button !== 0 || drag.current) return;
    const el = rows.current.get(id);
    if (!el) return;
    e.preventDefault();
    const pointerId = e.pointerId;
    const list = opts.current.ids;
    const d: Drag = { id, from: list, order: list, pointer: pointerId, y: e.clientY, start: e.clientY, grab: e.clientY - el.getBoundingClientRect().top, frame: 0, scroller: scrollParent(el) };
    // On the window, not the handle: React moves the dragged row in the DOM as it passes others, which would drop a capture on the handle.
    const move = (ev: globalThis.PointerEvent) => {
      if (ev.pointerId === pointerId) d.y = ev.clientY;
    };
    const up = (ev: globalThis.PointerEvent) => {
      if (ev.pointerId === pointerId) finish(ev.type === "pointerup");
    };
    const key = (ev: globalThis.KeyboardEvent) => {
      if (ev.key !== "Escape") return;
      ev.preventDefault();
      finish(false);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    window.addEventListener("keydown", key);
    d.listeners = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      window.removeEventListener("keydown", key);
    };
    drag.current = d;
    document.documentElement.classList.add("a-dragging");
    setActive({ id, keyboard: false });
    d.frame = requestAnimationFrame(step);
  };

  const onKeyDown = (id: string) => (e: KeyboardEvent<HTMLElement>) => {
    if (disabled) return;
    const d = drag.current;
    const name = opts.current.label(id);
    if (!d) {
      if (e.key !== " " && e.key !== "Enter") return;
      e.preventDefault();
      const list = opts.current.ids;
      drag.current = { id, from: list, order: list, pointer: null, y: 0, start: 0, grab: 0, frame: 0, scroller: null };
      setActive({ id, keyboard: true });
      setAnnouncement(`${name} pego, na ${position(list, id)}. Use as setas para mover, Espaço para soltar e Esc para cancelar.`);
      return;
    }
    if (d.pointer !== null || d.id !== id) return;
    const { min: lo, max: hi } = opts.current;
    const current = d.order.indexOf(id);
    let to = current;
    if (e.key === "ArrowUp") to = Math.max(lo, current - 1);
    else if (e.key === "ArrowDown") to = Math.min(hi, current + 1);
    else if (e.key === "Home") to = lo;
    else if (e.key === "End") to = hi;
    else if (e.key === " " || e.key === "Enter" || e.key === "Escape") {
      e.preventDefault();
      finish(e.key !== "Escape");
      return;
    } else return;
    e.preventDefault();
    if (to === current) return;
    const next = moveItem(d.order, current, to);
    reorder(d, next);
    setAnnouncement(`${name}: ${position(next, id)}.`);
  };

  // Leaving the handle (Tab, a click elsewhere) drops the row where it is. React may blur the handle for a moment while it moves the row,
  // and gives the focus back right after (the layout effect above), so look again on the next frame.
  const onBlur = () =>
    requestAnimationFrame(() => {
      const d = drag.current;
      if (d && d.pointer === null && document.activeElement !== handles.current.get(d.id)) finish(true);
    });

  return {
    /** The order to draw: the saved one, or the one being tried while a row is moving. */
    order,
    /** The row being moved, if any. */
    active: active?.id ?? null,
    /** For screen readers: the instructions (`id={hintId}`, visually hidden) and the polite live region. */
    hintId,
    announcement,
    row: (id: string) => ({
      ref: (el: HTMLElement | null) => {
        if (el) rows.current.set(id, el);
        else rows.current.delete(id);
      },
      "data-dragging": active?.id === id ? "" : undefined,
    }),
    handle: (id: string) => ({
      ref: (el: HTMLElement | null) => {
        if (el) handles.current.set(id, el);
        else handles.current.delete(id);
      },
      type: "button" as const,
      onPointerDown: onPointerDown(id),
      onKeyDown: onKeyDown(id),
      onBlur,
      "aria-describedby": hintId,
      "aria-pressed": active?.id === id && active.keyboard ? true : undefined,
      "aria-disabled": disabled || undefined,
      "data-drag-handle": "",
    }),
  };
}

/** The six-dot grip of a drag handle. */
export function GripIcon() {
  return (
    <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor" aria-hidden="true">
      <circle cx="2" cy="2" r="1.5" />
      <circle cx="8" cy="2" r="1.5" />
      <circle cx="2" cy="8" r="1.5" />
      <circle cx="8" cy="8" r="1.5" />
      <circle cx="2" cy="14" r="1.5" />
      <circle cx="8" cy="14" r="1.5" />
    </svg>
  );
}

/** What screen readers need: how to move a row with the keyboard, and what just happened. */
export function DragSortStatus({ hintId, announcement }: { hintId: string; announcement: string }) {
  return (
    <>
      <span id={hintId} hidden>
        Para mover pelo teclado: Espaço pega a linha, as setas mudam a posição, Espaço solta e Esc cancela.
      </span>
      <span className="sr-only" aria-live="polite" role="status">
        {announcement}
      </span>
    </>
  );
}
