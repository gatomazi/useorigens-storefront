"use client";

import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { artworkFields, composeArtwork, fieldEdits, initialFieldValues } from "@/lib/customization/artwork";
import { liveExamples, savePrefill } from "@/lib/customization/live-banner";
import type { PrintProject } from "@/lib/print-studio/model";
import { ArtworkFields } from "./ArtworkEditor";
import { ArtworkPreview } from "./ArtworkPreview";
import styles from "./ArtworkEditor.module.css";

type Poster = { src: string; width: number; height: number; alt: string };

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
const subscribeMotion = (onChange: () => void) => {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};
const TYPE_MS = 110;
const HOLD_MS = 2600;
const CITY_MS = 700;

/**
 * The live banner of a personalization model ("personalization-live"): the title, the text and the model's own fields on one half, its art on a shirt
 * on the other, the art following what is typed (as on the model's page). Until the visitor touches it, it plays the examples one after another, as if
 * someone typed them: a plate or a name letter by letter, a city at once. It stops for good at the first touch or key, pauses off screen, and never
 * plays under "reduce motion" (the first example stays). The art (a ~1 MB base) loads only once the banner is near the screen; the model's picture
 * stands in until then. The button carries what the VISITOR wrote (never the examples) to the model's page, in the tab's session.
 */
export function PersonalizationLive({ slug, href, baseUrl, title, subtitle, button, examples, poster, panel, panelTone, anchor, headingId }: {
  slug: string; href: string; baseUrl: string; title: string; subtitle?: string; button: string; examples: string[]; poster: Poster | null;
  panel: ReactNode; panelTone: "light" | "dark"; anchor: string; headingId: string;
}) {
  const uid = useId();
  const root = useRef<HTMLElement>(null);
  const [near, setNear] = useState(false);
  const [visible, setVisible] = useState(false);
  const [base, setBase] = useState<PrintProject | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState(false);
  const reduced = useSyncExternalStore(subscribeMotion, () => window.matchMedia(REDUCED_MOTION).matches, () => false);
  const light = panelTone === "light";

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const nearBy = new IntersectionObserver(([e]) => { if (e.isIntersecting) setNear(true); }, { rootMargin: "300px" });
    const onScreen = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.25 });
    nearBy.observe(el);
    onScreen.observe(el);
    return () => { nearBy.disconnect(); onScreen.disconnect(); };
  }, []);

  useEffect(() => {
    if (!near || base) return;
    let live = true;
    fetch(baseUrl).then((r) => (r.ok ? r.json() : null)).then((project: PrintProject | null) => { if (live && project) setBase(project); }, () => undefined);
    return () => { live = false; };
  }, [near, base, baseUrl]);

  const plays = useMemo(() => {
    if (!base) return [];
    const own = liveExamples(base, examples);
    return own.length ? own : [initialFieldValues(base)];
  }, [base, examples]);

  // The demo: one example after another, typed into the fields, while the banner is on screen and nobody has touched it.
  const step = useRef({ example: 0 });
  const [cycle, setCycle] = useState(0);
  useEffect(() => {
    if (!base || touched || reduced || !visible) return;
    const fields = artworkFields(base);
    const timers: ReturnType<typeof setTimeout>[] = [];
    let at = 0;
    const later = (ms: number, fn: () => void) => { at += ms; timers.push(setTimeout(fn, at)); };
    const example = plays[step.current.example % plays.length] ?? {};
    later(0, () => setValues({}));
    for (const field of fields) {
      const answer = example[field.id] ?? "";
      if (field.input === "city") { later(CITY_MS, () => setValues((v) => ({ ...v, [field.id]: answer }))); continue; }
      for (let i = 1; i <= answer.length; i++) later(TYPE_MS, () => setValues((v) => ({ ...v, [field.id]: answer.slice(0, i) })));
    }
    later(HOLD_MS, () => { step.current.example++; setCycle((n) => n + 1); });
    return () => timers.forEach(clearTimeout);
  }, [base, plays, visible, touched, reduced, cycle]);

  // Under "reduce motion" the first example stands still until the visitor writes.
  const current = useMemo(() => (reduced && !touched ? plays[0] ?? {} : values), [reduced, touched, plays, values]);
  const preview = useMemo(() => {
    if (!base) return null;
    const shown = Object.fromEntries(artworkFields(base).map((f) => [f.id, current[f.id]?.trim() ? current[f.id] : touched ? f.example : ""]));
    return composeArtwork(base, fieldEdits(base, shown));
  }, [base, current, touched]);

  const stop = () => { if (!touched) setTouched(true); };
  const go = () => { if (touched) savePrefill(slug, values); };

  return (
    <section ref={root} id={anchor} aria-labelledby={headingId} className="grid lg:grid-cols-2" onPointerDownCapture={stop} onKeyDownCapture={stop}>
      <div className="relative flex items-center justify-center overflow-hidden bg-[#e4e4e4] px-[var(--gutter)] py-8 lg:order-2 lg:min-h-[36rem] lg:py-12">
        <div className="w-full max-w-[30rem]">
          {preview ? (
            <ArtworkPreview project={preview} shirt="preta" controls={false} compact zoom />
          ) : poster ? (
            // eslint-disable-next-line @next/next/no-img-element -- a CMS upload served pre-sized from the media origin
            <img src={poster.src} width={poster.width} height={poster.height} alt={poster.alt} className="mx-auto h-auto w-full object-contain" />
          ) : null}
        </div>
      </div>
      <div className={`relative isolate flex items-center ${light ? "text-white" : "text-ink"}`}>
        {panel ?? <div aria-hidden="true" className="absolute inset-0 -z-10 bg-region-primary" />}
        <div className="w-full px-[var(--gutter)] py-10 sm:py-12 lg:max-w-[40rem] lg:px-14 lg:py-16 xl:px-20">
          <span aria-hidden="true" className="mb-5 block h-[3px] w-12 bg-region-accent" />
          <h2 id={headingId} className="font-display text-[clamp(2.25rem,4.6vw,4.25rem)] font-extrabold uppercase leading-[0.95] tracking-[0.004em] [text-wrap:balance]">{title}</h2>
          {subtitle && <p className={`t-body mt-4 max-w-md ${light ? "text-white/85" : "text-ink-soft"}`}>{subtitle}</p>}
          {base && (
            <div className={`mt-6 ${light ? `${styles.onDark} [&_.t-label]:text-white [&_legend]:text-white` : ""}`}>
              <ArtworkFields base={base} values={current} onChange={(next) => { stop(); setValues(next); }} errors={{}} uid={uid} legend="Experimente aqui" />
            </div>
          )}
          <div className="mt-7">
            <a href={href} onClick={go} className={`btn ${light ? "btn-light" : ""}`}>
              {button}
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
