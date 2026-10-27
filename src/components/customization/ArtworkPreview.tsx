"use client";

import { useEffect, useRef, useState } from "react";
import type { PrintProject } from "@/lib/print-studio/model";
import { loadResources, paintProject } from "@/lib/print-studio/renderer";
import { SHIRT_COLORS, shirtColor, shirtPhoto } from "@/lib/customization/shirts";
import styles from "./ArtworkEditor.module.css";

export type PreviewView = "shirt" | "art";

/**
 * The art as the customer will get it: on a shirt photo by default, or alone and larger. `shirt`: the shirt colour (`SHIRT_COLORS` id) the page
 * picked; without it, the preview offers its own colour choice, starting from one that contrasts with the art. `view`/`onViewChange` let the page keep the view when the preview is remounted for another art.
 */
export function ArtworkPreview({ project, onReady, shirt, view: controlled, onViewChange, initialView = "shirt", compact = false, actions }: {
  project: PrintProject;
  onReady?: (ready: boolean) => void;
  shirt?: string;
  view?: PreviewView;
  onViewChange?: (view: PreviewView) => void;
  initialView?: PreviewView;
  /** The full-screen preview: no caption or colour menu. */
  compact?: boolean;
  /** Extra buttons on the view row (e.g. "Tela cheia"). */
  actions?: React.ReactNode;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState("");
  const [painted, setPainted] = useState<PrintProject | null>(null);
  const [own, setOwn] = useState<PreviewView>(initialView);
  const view = controlled ?? own;
  const setView = (next: PreviewView) => { setOwn(next); onViewChange?.(next); };
  const [viewing, setBackground] = useState(() => {
    const text = project.layers.find((l) => l.kind === "text" && l.visible);
    if (text?.kind !== "text") return "preta";
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(text.color.slice(i, i + 2), 16));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b < 140 ? "branca" : "preta";
  });

  const color = shirtColor(shirt ?? viewing);

  useEffect(() => {
    let active = true;
    onReady?.(false);
    loadResources(project).then((resources) => {
      if (!active || !canvas.current) return;
      paintProject(canvas.current, project, resources, 900);
      setError("");
      setPainted(project);
      onReady?.(true);
    }).catch((error: unknown) => {
      if (!active) return;
      setError(error instanceof Error ? error.message : "Não foi possível mostrar a arte. Confira os textos e a fonte escolhida ou recarregue a página.");
      onReady?.(false);
    });
    return () => { active = false; };
  }, [project, onReady]);

  const onShirt = view === "shirt";
  return (
    <figure className={styles.preview} aria-label="Prévia da sua estampa">
      <div className={styles.views} role="group" aria-label="Como ver a prévia">
        <button type="button" aria-pressed={onShirt} onClick={() => setView("shirt")}>Na camiseta</button>
        <button type="button" aria-pressed={!onShirt} onClick={() => setView("art")}>Só a arte</button>
        {actions}
      </div>
      <div className={onShirt ? styles.stage : styles.canvasWrap} style={onShirt ? undefined : { backgroundColor: color.swatch }} aria-busy={painted !== project && !error}>
        {/* eslint-disable-next-line @next/next/no-img-element -- a small static photo laid under the canvas, not a content image */}
        {onShirt && <img className={styles.shirt} src={shirtPhoto(color.id)} alt="" width={800} height={820} />}
        <canvas ref={canvas} className={onShirt ? styles.printArea : styles.canvas} role="img" aria-label="Composição com os textos, fontes e cores escolhidos. O resumo da personalização apresenta os mesmos textos." />
      </div>
      {error && <p className={styles.error} role="alert">{error}</p>}
      {!compact && <figcaption className={styles.caption}>{onShirt ? "Simulação na camiseta. " : ""}Nossa equipe confere a composição antes de preparar o produto.</figcaption>}
      {!shirt && !compact && <>
        <label className={styles.background}>Cor da camiseta na prévia
          <select value={color.id} onChange={(e) => setBackground(e.target.value)}>
            {SHIRT_COLORS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </label>
        <p className={styles.caption}>A cor serve apenas para visualizar a arte.</p>
      </>}
    </figure>
  );
}
