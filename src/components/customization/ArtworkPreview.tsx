"use client";

import { useEffect, useRef, useState } from "react";
import type { PrintProject } from "@/lib/print-studio/model";
import { loadResources, paintProject } from "@/lib/print-studio/renderer";
import styles from "./ArtworkEditor.module.css";

export function ArtworkPreview({ project, onReady }: { project: PrintProject; onReady?: (ready: boolean) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState("");
  const [painted, setPainted] = useState<PrintProject | null>(null);
  const [background, setBackground] = useState(() => {
    const text = project.layers.find((l) => l.kind === "text" && l.visible);
    return text?.kind === "text" && parseInt(text.color.slice(1), 16) < 0x888888 ? "#f5f3ef" : "#242424";
  });

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

  return (
    <figure className={styles.preview} aria-label="Prévia da sua estampa">
      <div className={styles.canvasWrap} style={{ backgroundColor: background }} aria-busy={painted !== project && !error}>
        <canvas ref={canvas} className={styles.canvas} role="img" aria-label="Composição com os textos, fontes e cores escolhidos. O resumo da personalização apresenta os mesmos textos." />
      </div>
      {error && <p className={styles.error} role="alert">{error}</p>}
      <figcaption className={styles.caption}>Prévia da arte. Nossa equipe confere a composição antes de preparar o produto.</figcaption>
      <label className={styles.background}>Fundo para visualizar
        <select value={background} onChange={(e) => setBackground(e.target.value)}>
          <option value="#242424">Escuro</option><option value="#f5f3ef">Claro</option><option value="#707070">Cinza</option>
        </select>
      </label>
      <p className={styles.caption}>O fundo serve apenas para visualizar a arte.</p>
    </figure>
  );
}
