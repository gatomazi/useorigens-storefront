"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { PrintProject } from "@/lib/print-studio/model";
import { loadResources, paintProject } from "@/lib/print-studio/renderer";
import styles from "./ArtworkEditor.module.css";

export type PreviewView = "shirt" | "art";
const SHIRT_FILL: Record<string, string> = { "#242424": "#1c1c1e", "#f5f3ef": "#f6f6f4", "#707070": "#8a8a8a" };

/**
 * A flat front view of a shirt (size M), drawn in centimetres: the 36 × 41 cm print area of INK sits 11 cm below the front of the collar,
 * so the art keeps its real size and place (a chest logo stays on the chest). The art canvas is laid over it by the stylesheet.
 */
function Shirt({ fill }: { fill: string }) {
  const id = useId().replace(/:/g, "");
  const body = "M30.5 4 L14 7.5 L2 24 L9.5 30.5 L15 25.5 L15.5 79 Q40 80.5 64.5 79 L65 25.5 L70.5 30.5 L78 24 L66 7.5 L49.5 4 Q40 14 30.5 4 Z";
  return (
    <svg className={styles.shirt} viewBox="0 0 80 84" aria-hidden="true" focusable="false">
      <defs>
        <clipPath id={`${id}-clip`}><path d={body} /></clipPath>
        <linearGradient id={`${id}-sides`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#000" stopOpacity=".16" /><stop offset=".22" stopColor="#000" stopOpacity="0" />
          <stop offset=".78" stopColor="#000" stopOpacity="0" /><stop offset="1" stopColor="#000" stopOpacity=".16" />
        </linearGradient>
        <radialGradient id={`${id}-light`} cx=".45" cy=".3" r=".6"><stop offset="0" stopColor="#fff" stopOpacity=".1" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></radialGradient>
        <linearGradient id={`${id}-hem`} x1="0" x2="0" y1="0" y2="1"><stop offset=".75" stopColor="#000" stopOpacity="0" /><stop offset="1" stopColor="#000" stopOpacity=".08" /></linearGradient>
      </defs>
      <path d={body} fill={fill} />
      <g clipPath={`url(#${id}-clip)`}>
        <rect width="80" height="84" fill={`url(#${id}-sides)`} />
        <rect width="80" height="84" fill={`url(#${id}-light)`} />
        <rect width="80" height="84" fill={`url(#${id}-hem)`} />
        <path d="M30.5 4 Q40 6.5 49.5 4 Q40 14 30.5 4 Z" fill="#000" fillOpacity=".22" />
        <path d="M14 7.5 Q15.5 16 15 25.5 M66 7.5 Q64.5 16 65 25.5" fill="none" stroke="#000" strokeOpacity=".1" strokeWidth=".35" />
        <path d="M5.5 27.5 L11.5 22 M74.5 27.5 L68.5 22" fill="none" stroke="#000" strokeOpacity=".08" strokeWidth=".35" />
      </g>
      <path d="M30.5 4 Q40 14 49.5 4" fill="none" stroke={fill} strokeWidth="1.6" />
      <path d="M30.5 4 Q40 14 49.5 4" fill="none" stroke="#000" strokeOpacity=".14" strokeWidth="1.6" />
    </svg>
  );
}

/**
 * The art as the customer will get it: on a shirt by default, or alone and larger. `shirt`: the shirt colour the customer picked; it sets the
 * colour and replaces the viewing choice. `view`/`onViewChange` let the page keep the view when the preview is remounted for another art.
 */
export function ArtworkPreview({ project, onReady, shirt, view: controlled, onViewChange, initialView = "shirt" }: {
  project: PrintProject;
  onReady?: (ready: boolean) => void;
  shirt?: string;
  view?: PreviewView;
  onViewChange?: (view: PreviewView) => void;
  initialView?: PreviewView;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState("");
  const [painted, setPainted] = useState<PrintProject | null>(null);
  const [own, setOwn] = useState<PreviewView>(initialView);
  const view = controlled ?? own;
  const setView = (next: PreviewView) => { setOwn(next); onViewChange?.(next); };
  const [viewing, setBackground] = useState(() => {
    const text = project.layers.find((l) => l.kind === "text" && l.visible);
    if (text?.kind !== "text") return "#242424";
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(text.color.slice(i, i + 2), 16));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b < 140 ? "#f5f3ef" : "#242424";
  });

  const background = shirt ?? viewing;

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
      </div>
      <div className={onShirt ? styles.stage : styles.canvasWrap} style={onShirt ? undefined : { backgroundColor: background }} aria-busy={painted !== project && !error}>
        {onShirt && <Shirt fill={SHIRT_FILL[background] ?? background} />}
        <canvas ref={canvas} className={onShirt ? styles.printArea : styles.canvas} role="img" aria-label="Composição com os textos, fontes e cores escolhidos. O resumo da personalização apresenta os mesmos textos." />
      </div>
      {error && <p className={styles.error} role="alert">{error}</p>}
      <figcaption className={styles.caption}>{onShirt ? "Simulação na camiseta, no tamanho e na posição da estampa. " : ""}Nossa equipe confere a composição antes de preparar o produto.</figcaption>
      {!shirt && <>
        <label className={styles.background}>{onShirt ? "Cor da camiseta na prévia" : "Fundo para visualizar"}
          <select value={background} onChange={(e) => setBackground(e.target.value)}>
            <option value="#242424">Escuro</option><option value="#f5f3ef">Claro</option><option value="#707070">Cinza</option>
          </select>
        </label>
        <p className={styles.caption}>A cor serve apenas para visualizar a arte.</p>
      </>}
    </figure>
  );
}
