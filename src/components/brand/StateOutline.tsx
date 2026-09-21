import { STATE_OUTLINES } from "./state-outlines";

/** Real IBGE outline of a state, drawn as one continuous line (like the Traço print). */
export function StateOutline({ uf, className = "", strokeWidth = 1.5 }: { uf: string; className?: string; strokeWidth?: number }) {
  const outline = STATE_OUTLINES[uf];
  if (!outline) return null;
  return (
    <svg viewBox={outline.viewBox} className={className} fill="none" stroke="currentColor" strokeLinejoin="round" strokeLinecap="round" aria-hidden="true" focusable="false">
      <g transform="scale(0.0001,-0.0001)">
        <path d={outline.d} strokeWidth={strokeWidth} vectorEffect="non-scaling-stroke" />
      </g>
    </svg>
  );
}
