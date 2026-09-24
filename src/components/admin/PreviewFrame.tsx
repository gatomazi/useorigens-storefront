"use client";

import { useEffect, useRef, useState } from "react";

type Mode = "mobile" | "desktop" | "both";
const DESKTOP_WIDTH = 1280;
const MOBILE_WIDTH = 375;

/**
 * Real previews: iframes of /admin/preview (the storefront's own components), at 375 px and at a 1280 px desktop scaled to fit. `version`
 * changes after every save, so the frames reload with the new draft; `anchor` scrolls them to the section being edited.
 */
export function PreviewFrame({ version, anchor, source = "draft", height = 760 }: { version: string | number; anchor?: string; source?: "draft" | "published"; height?: number }) {
  const [mode, setMode] = useState<Mode>("both");
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(900);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const src = `/admin/preview?source=${source}&v=${version}${anchor ? `#${anchor}` : ""}`;
  const desktopShare = mode === "both" ? Math.max(0, width - MOBILE_WIDTH - 24) : width;
  const scale = Math.min(1, desktopShare / DESKTOP_WIDTH);

  return (
    <div ref={wrap}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="a-h2">Pré-visualização real</p>
        <div role="group" aria-label="Tamanho da pré-visualização" className="flex">
          {(["mobile", "desktop", "both"] as const).map((m) => (
            <button key={m} type="button" onClick={() => setMode(m)} aria-pressed={mode === m} className={`a-btn sm ${mode === m ? "" : "ghost"}`} style={{ marginLeft: m === "mobile" ? 0 : -2 }}>
              {m === "mobile" ? "Mobile 375" : m === "desktop" ? "Desktop" : "Lado a lado"}
            </button>
          ))}
        </div>
      </div>
      <div className={`flex items-start gap-4 ${mode === "both" ? "flex-wrap 2xl:flex-nowrap" : ""}`}>
        {mode !== "desktop" && (
          <div className="a-frame-shell" style={{ width: MOBILE_WIDTH + 2, maxWidth: "100%" }}>
            <iframe title="Pré-visualização mobile (375 px)" src={src} width={MOBILE_WIDTH} height={height} className="block max-w-full bg-white" data-preview="mobile" />
          </div>
        )}
        {mode !== "mobile" && (
          <div className="a-frame-shell min-w-0" style={{ width: DESKTOP_WIDTH * scale + 2, height: height * scale + 2, maxWidth: "100%" }}>
            <iframe
              title="Pré-visualização desktop (1280 px)"
              src={src}
              width={DESKTOP_WIDTH}
              height={height}
              className="block origin-top-left bg-white"
              style={{ transform: `scale(${scale})`, width: DESKTOP_WIDTH, height }}
              data-preview="desktop"
            />
          </div>
        )}
      </div>
    </div>
  );
}
