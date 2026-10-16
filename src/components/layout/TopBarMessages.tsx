"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { liveTopBarMessages, topBarText, type TopBarConfig, type TopBarMessage } from "@/lib/site-config/top-bar";

/** How long each message stays when they take turns (`rotate`). */
const ROTATE_MS = 5000;
/** How often the page re-checks the windows (a message scheduled for midnight starts within this). */
const CLOCK_MS = 30_000;
/** Marquee speed, in px per second: slow enough to read on a phone. */
const SPEED = 45;

const LINE = "wrap py-2 text-center text-[0.8125rem] font-medium leading-snug sm:text-[0.875rem]";

/**
 * The messages of "Faixa do topo" on the storefront. The page is cached (ISR), so it carries the whole schedule and the browser decides with its own
 * clock: the first render uses the instant the page was rendered (the same as the server's HTML, no hydration mismatch), then the real one. Nothing live
 * = `children`, the region's default strip.
 *
 * `marquee` (the default): every live message in one line that keeps scrolling, separated by dots; paused under the pointer or the keyboard focus.
 * `rotate`: one at a time, every 5 s, paused the same way. With `prefers-reduced-motion` nothing moves: the first message stays.
 * `fixedNow` (CMS preview): a fixed instant instead of the clock.
 */
export function TopBarMessages({ schedule, renderedAt, fixedNow, children }: { schedule: TopBarConfig; renderedAt: number; fixedNow?: number; children: ReactNode }) {
  const [clock, setClock] = useState(renderedAt);
  const [turn, setTurn] = useState(0);
  const [paused, setPaused] = useState(false);
  const [still, setStill] = useState(false);
  const now = fixedNow ?? clock;

  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setStill(motion.matches);
    sync();
    motion.addEventListener("change", sync);
    if (fixedNow !== undefined) return () => motion.removeEventListener("change", sync);
    const tick = () => setClock(Date.now());
    tick();
    const timer = window.setInterval(tick, CLOCK_MS);
    return () => {
      window.clearInterval(timer);
      motion.removeEventListener("change", sync);
    };
  }, [fixedNow]);

  const live = liveTopBarMessages(schedule, now);
  const marquee = (schedule.style ?? "marquee") === "marquee" && !still;
  const rotating = !marquee && live.length > 1 && !paused && !still;
  useEffect(() => {
    if (!rotating) return;
    const timer = window.setInterval(() => setTurn((t) => t + 1), ROTATE_MS);
    return () => window.clearInterval(timer);
  }, [rotating]);

  if (live.length === 0) return <>{children}</>;
  if (marquee) return <Marquee messages={live} productionDays={schedule.productionDays} now={now} />;
  const message = live[(still ? 0 : turn) % live.length];
  const text = topBarText(message, schedule.productionDays, now);
  return (
    <p
      className={LINE}
      data-testid="top-bar-message"
      data-message-id={message.id}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <span key={message.id} className="top-bar-in">
        {message.href ? <Link href={message.href} className="underline underline-offset-2">{text}</Link> : text}
      </span>
    </p>
  );
}

/**
 * The scrolling line: two identical groups side by side, the track moving by half its width and starting over (a seamless loop). Each group repeats the
 * messages until it is at least as wide as the strip, and the duration follows the width, so the speed is the same with one message or ten. Only the
 * first pass is read by a screen reader and reached with Tab; the copies are hidden from both.
 */
function Marquee({ messages, productionDays, now }: { messages: TopBarMessage[]; productionDays?: number; now: number }) {
  const box = useRef<HTMLDivElement>(null);
  const group = useRef<HTMLDivElement>(null);
  const texts = messages.map((m) => topBarText(m, productionDays, now));
  // Before measuring (server HTML and first paint): a deterministic guess from the length of the texts, the same on both sides.
  const guess = texts.reduce((n, t) => n + t.length * 7 + 40, 0);
  const [fit, setFit] = useState({ repeats: 2, seconds: Math.max(12, Math.round((guess * 2) / SPEED)) });
  const signature = texts.join("\u0000");

  useLayoutEffect(() => {
    const measure = () => {
      const width = box.current?.clientWidth ?? 0;
      if (!width || !group.current) return;
      // The width of ONE pass of the messages (the group holds `repeats` of them).
      const items = [...group.current.children].slice(0, messages.length) as HTMLElement[];
      const unit = items.reduce((n, el) => n + el.offsetWidth, 0);
      if (!unit) return;
      const repeats = Math.max(1, Math.ceil(width / unit));
      const seconds = Math.max(8, Math.round((unit * repeats) / SPEED));
      setFit((f) => (f.repeats === repeats && f.seconds === seconds ? f : { repeats, seconds }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (box.current) observer.observe(box.current);
    return () => observer.disconnect();
  }, [signature, messages.length]);

  const pass = (copy: number, r: number) =>
    messages.map((m, i) => {
      const hidden = copy > 0 || r > 0;
      return (
        <span key={`${r}-${m.id}`} className="top-bar-item" aria-hidden={hidden || undefined}>
          {m.href ? <Link href={m.href} className="underline underline-offset-2" tabIndex={hidden ? -1 : undefined}>{texts[i]}</Link> : texts[i]}
        </span>
      );
    });

  return (
    <div ref={box} className="top-bar-marquee text-[0.8125rem] font-medium leading-snug sm:text-[0.875rem]" data-testid="top-bar-marquee" style={{ "--top-bar-seconds": `${fit.seconds}s` } as CSSProperties}>
      <div className="top-bar-track">
        {[0, 1].map((copy) => (
          <div key={copy} ref={copy === 0 ? group : undefined} className="top-bar-group" aria-hidden={copy > 0 || undefined}>
            {Array.from({ length: fit.repeats }, (_, r) => pass(copy, r))}
          </div>
        ))}
      </div>
    </div>
  );
}
