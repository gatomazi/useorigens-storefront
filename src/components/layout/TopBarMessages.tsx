"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { liveTopBarMessages, topBarText, type TopBarConfig } from "@/lib/site-config/top-bar";

/** How long each message stays when more than one is live. */
const ROTATE_MS = 5000;
/** How often the page re-checks the windows (a message scheduled for midnight starts within this). */
const CLOCK_MS = 30_000;

/**
 * The messages of "Faixa do topo" on the storefront. The page is cached (ISR), so it carries the whole schedule and the browser decides with its own
 * clock: the first render uses the instant the page was rendered (the same as the server's HTML, no hydration mismatch), then the real one. Nothing live
 * = `children`, the region's default strip. More than one live = they take turns, paused under the pointer or the keyboard focus, and never rotate with
 * `prefers-reduced-motion` (the first one stays).
 */
export function TopBarMessages({ schedule, renderedAt, children }: { schedule: TopBarConfig; renderedAt: number; children: ReactNode }) {
  const [now, setNow] = useState(renderedAt);
  const [turn, setTurn] = useState(0);
  const [paused, setPaused] = useState(false);
  const [still, setStill] = useState(false);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const clock = window.setInterval(tick, CLOCK_MS);
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setStill(motion.matches);
    sync();
    motion.addEventListener("change", sync);
    return () => {
      window.clearInterval(clock);
      motion.removeEventListener("change", sync);
    };
  }, []);

  const live = liveTopBarMessages(schedule, now);
  const rotating = live.length > 1 && !paused && !still;
  useEffect(() => {
    if (!rotating) return;
    const timer = window.setInterval(() => setTurn((t) => t + 1), ROTATE_MS);
    return () => window.clearInterval(timer);
  }, [rotating]);

  if (live.length === 0) return <>{children}</>;
  const message = live[(still ? 0 : turn) % live.length];
  const text = topBarText(message, schedule.productionDays, now);
  return (
    <p
      className="wrap py-2 text-center text-[0.8125rem] font-medium leading-snug sm:text-[0.875rem]"
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
