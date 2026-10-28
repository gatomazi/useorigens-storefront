"use client";

import type { ProductStatus } from "@/lib/customization/product-status";

const DONE_STEPS: Record<ProductStatus, number> = { queued: 0, creating: 1, photos: 2, ready: 3, failed: 0, check: 0 };

export const Star = ({ on }: { on: boolean }) => (
  <svg aria-hidden="true" viewBox="0 0 20 20" className={`h-5 w-5 shrink-0 text-[#d8a800] ${on ? "motion-safe:animate-pulse" : ""}`} fill="currentColor"><path d="M10 1.5l2.6 5.6 6.1.7-4.5 4.2 1.2 6-5.4-3.1-5.4 3.1 1.2-6L1.3 7.8l6.1-.7z" /></svg>
);
export const Check = () => <svg aria-hidden="true" viewBox="0 0 20 20" className="h-5 w-5 shrink-0 text-region-primary" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 10.5l4 4 8-9" /></svg>;
const Dot = () => <span aria-hidden="true" className="flex h-5 w-5 shrink-0 items-center justify-center"><span className="h-2 w-2 rounded-full bg-line" /></span>;

/** The real steps of one job (drawn, created at the store, photos, opening), shared by the waiting screen and the floating tracker. */
export function ProductSteps({ status, surname }: { status: ProductStatus; surname: string }) {
  const step = DONE_STEPS[status];
  const steps = [`Arte com “${surname}”`, "Camiseta criada na loja", "Tirando as fotos", "Abrindo a sua camiseta"];
  return (
    <ol className="space-y-2" aria-live="polite">
      {steps.map((label, i) => (
        <li key={label} className={`flex items-center gap-3 text-[1rem] ${i <= step ? "font-bold text-ink" : "text-ink-mute"}`}>
          {i < step ? <Check /> : i === step ? <Star on /> : <Dot />}
          <span>{label}{i === step && i < 3 ? "…" : ""}</span>
        </li>
      ))}
    </ol>
  );
}

