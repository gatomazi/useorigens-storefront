"use client";

/* eslint-disable @next/next/no-img-element -- private authenticated previews and embedded local references bypass the image optimizer */
import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { BUILTIN_FONTS, createPreset, MAX_LAYERS, MAX_PROJECT_BYTES, newId, newTextLayer, parseProjectFile, type PrintFont, type PrintLayer, type PrintProject, type TextLayer } from "@/lib/print-studio/model";
import { exportPng, loadResources, paintProject, type LayerBounds } from "@/lib/print-studio/renderer";
import { loadDraft, readDataUrl, readImageAsset, saveDraft } from "@/lib/print-studio/storage";
import type { SavedPrint } from "@/lib/print-studio/types";
import { alignSelection, expandSelection, groupSelection, moveSelection, snapMovement, ungroupSelection, unionBoxes, type Alignment, type Box } from "@/lib/print-studio/geometry";
import { BRAND_LOGOS, LOGO_REGIONS, type LogoRegion, type LogoVariant } from "@/lib/print-studio/logos";
import styles from "./PrintStudio.module.css";

const formatDate = (value: string) => new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
const messageOf = (error: unknown) => error instanceof Error ? error.message : "Não foi possível concluir. Tente novamente.";
async function fetchGallery(basePath: string): Promise<SavedPrint[]> {
  const response = await fetch(`${basePath}/dados`, { cache: "no-store" });
  if (!response.ok) throw new Error("Não foi possível carregar as estampas salvas. Tente novamente.");
  return (await response.json()).items;
}

function Icon({ name }: { name: "plus" | "save" | "undo" | "redo" | "image" | "copy" | "trash" | "arrow" | "download" | "check" }) {
  const paths: Record<typeof name, ReactNode> = {
    plus: <path d="M12 5v14M5 12h14" />,
    save: <><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12l4 4v12a2 2 0 0 1-2 2Z" /><path d="M7 3v6h10V3M7 21v-8h10v8" /></>,
    undo: <><path d="m9 4-5 5 5 5" /><path d="M4 9h10a6 6 0 0 1 0 12" /></>,
    redo: <><path d="m15 4 5 5-5 5" /><path d="M20 9H10a6 6 0 0 0 0 12" /></>,
    image: <><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" /></>,
    copy: <><rect x="8" y="8" width="13" height="13" rx="2" /><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" /></>,
    trash: <><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" /></>,
    arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
    download: <><path d="M12 3v12m-5-5 5 5 5-5M5 16v5h14v-5" /></>,
    check: <path d="m5 12 4 4L19 6" />,
  };
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function NumericField({ label, value, onChange, min = -10000, max = 10000, step = 1 }: { label: string; value: number; onChange: (value: number) => void; min?: number; max?: number; step?: number }) {
  return <label className={styles.field}>{label}<input type="number" min={min} max={max} step={step} value={Math.round(value * 100) / 100} onChange={(e) => { const n = e.target.valueAsNumber; if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n))); }} /></label>;
}

export function PrintStudio({ owner, basePath = "/admin/estampas", draftKey = "draft", availableFonts = [] }: { owner: boolean; basePath?: string; draftKey?: string; availableFonts?: PrintFont[] }) {
  const fileUrl = (id: string, file: string) => `${basePath}/arquivos/${id}/${file}`;
  const [project, setProject] = useState<PrintProject>(() => createPreset("peleia"));
  const [selection, setSelectedIds] = useState<string[]>(["peleia-enfase"]);
  const selectedIds = expandSelection(project, selection);
  const selectedId = selectedIds[0] ?? "";
  const [showGuides, setShowGuides] = useState(true);
  const [snapGuides, setSnapGuides] = useState<{ x: number | null; y: number | null }>({ x: null, y: null });
  const [tab, setTab] = useState<"editor" | "gallery">("editor");
  const [items, setItems] = useState<SavedPrint[]>([]);
  const [galleryLoading, setGalleryLoading] = useState(true);
  const [galleryError, setGalleryError] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [ready, setReady] = useState(false);
  const [paintedProject, setPaintedProject] = useState<PrintProject | null>(null);
  const [renderError, setRenderError] = useState("");
  const [busy, setBusy] = useState("");
  const [dirty, setDirty] = useState(false);
  const [serverSaved, setServerSaved] = useState(false);
  const [localStatus, setLocalStatus] = useState("");
  const [previewBackground, setPreviewBackground] = useState("#111111");
  const [showReference, setShowReference] = useState(true);
  const [logoRegion, setLogoRegion] = useState<LogoRegion>("sul");
  const [logoVariant, setLogoVariant] = useState<LogoVariant>("clara");
  const [bounds, setBounds] = useState<LayerBounds[]>([]);
  const [historySize, setHistorySize] = useState({ past: 0, future: 0 });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fontInput = useRef<HTMLInputElement>(null);
  const logoInput = useRef<HTMLInputElement>(null);
  const logoLibrary = useRef<HTMLDetailsElement>(null);
  const referenceInput = useRef<HTMLInputElement>(null);
  const projectInput = useRef<HTMLInputElement>(null);
  const history = useRef<{ past: PrintProject[]; future: PrintProject[] }>({ past: [], future: [] });
  const current = useRef(project);
  const drag = useRef<{ pointerId: number; ids: string[]; startX: number; startY: number; box: Box; other: Box[]; rect: DOMRect; before: PrintProject; moved: boolean } | null>(null);
  const selected = project.layers.find((l) => l.id === selectedId);
  const rendering = paintedProject !== project;
  const libraryLogo = BRAND_LOGOS.find((logo) => logo.region === logoRegion && logo.variant === logoVariant)!;

  const refreshGallery = async () => {
    setGalleryLoading(true);
    setGalleryError("");
    try {
      setItems(await fetchGallery(basePath));
    } catch (e) { setGalleryError(messageOf(e)); }
    finally { setGalleryLoading(false); }
  };

  useEffect(() => {
    let active = true;
    loadDraft(draftKey).then((draft) => {
      if (!active || !draft) return;
      setProject(draft); current.current = draft; setSelectedIds(expandSelection(draft, [draft.layers[0]?.id ?? ""])); setDirty(true);
    }).catch(() => { if (active) setLocalStatus("Rascunho local indisponível. Use Salvar estampa para guardar no servidor."); }).finally(() => { if (active) setReady(true); });
    fetchGallery(basePath).then((result) => { if (active) setItems(result); }).catch((e) => { if (active) setGalleryError(messageOf(e)); }).finally(() => { if (active) setGalleryLoading(false); });
    return () => { active = false; };
  }, [basePath, draftKey]);

  useEffect(() => {
    if (!ready) return;
    const timeout = setTimeout(() => {
      saveDraft(project, draftKey).then(() => setLocalStatus("Rascunho protegido neste navegador")).catch(() => setLocalStatus("Sem espaço para o rascunho local. Salve no servidor."));
    }, 600);
    return () => clearTimeout(timeout);
  }, [project, ready, draftKey]);

  useEffect(() => {
    if (!dirty) return;
    const onUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [dirty]);

  useEffect(() => {
    if (tab !== "editor") return;
    let active = true;
    loadResources(project).then((resources) => {
      if (!active || !canvasRef.current) return;
      setBounds(paintProject(canvasRef.current, project, resources, 1400));
      setRenderError("");
    }).catch((e) => { if (active) setRenderError(messageOf(e)); }).finally(() => { if (active) setPaintedProject(project); });
    return () => { active = false; };
  }, [project, tab]);

  const commit = (next: PrintProject) => {
    history.current.past.push(current.current);
    history.current.past = history.current.past.slice(-30);
    history.current.future = [];
    current.current = next;
    setProject(next); setDirty(true); setNotice(""); setHistorySize({ past: history.current.past.length, future: 0 });
  };
  const selectLayer = (id: string, additive = false) => {
    const members = expandSelection(current.current, [id]);
    setSelectedIds((value) => {
      const previous = expandSelection(current.current, value);
      return additive ? (previous.includes(id) ? previous.filter((key) => !members.includes(key)) : [...new Set([...previous, ...members])]) : members;
    });
  };
  const changeLayer = (id: string, change: Partial<PrintLayer>) => {
    const layer = current.current.layers.find((l) => l.id === id);
    if (layer && (change.x !== undefined || change.y !== undefined)) {
      const ids = selectedIds.includes(id) ? selectedIds : [id];
      commit(moveSelection(current.current, ids, (change.x ?? layer.x) - layer.x, (change.y ?? layer.y) - layer.y));
    } else commit({ ...current.current, layers: current.current.layers.map((l) => l.id === id ? { ...l, ...change } as PrintLayer : l) });
  };
  const textChange = (change: Partial<TextLayer>) => { if (selected?.kind === "text") changeLayer(selected.id, change); };
  const undo = (direction: "past" | "future") => {
    const next = history.current[direction].pop();
    if (!next) return;
    history.current[direction === "past" ? "future" : "past"].push(current.current);
    current.current = next; setProject(next); setDirty(true); setNotice(""); setHistorySize({ past: history.current.past.length, future: history.current.future.length });
  };

  const loadComposition = (next: PrintProject) => {
    commit(next); setSelectedIds(expandSelection(next, [next.layers[0]?.id ?? ""])); setTab("editor"); setError("");
  };

  const openSaved = async (item: SavedPrint) => {
    setBusy("Abrindo composição…"); setError("");
    try {
      const response = await fetch(fileUrl(item.id, "project.json"), { cache: "no-store" });
      if (!response.ok) throw new Error("Não foi possível abrir essa composição. Tente novamente.");
      loadComposition(parseProjectFile(await response.text()));
      setNotice(item.kind === "template" ? "Modelo aberto. Edite os textos e salve sua estampa." : "Estampa aberta. Ao salvar, será criada uma nova versão.");
    } catch (e) { setError(messageOf(e)); }
    finally { setBusy(""); }
  };

  const saveOnServer = async (kind: "art" | "template") => {
    setError(""); setNotice("");
    if (!project.name.trim()) { setError("Dê um nome à estampa antes de salvar."); return; }
    if (!project.layers.some((l) => l.visible && (l.kind === "image" || l.text.trim()))) { setError("Adicione um texto ou uma logo antes de salvar."); return; }
    setBusy(kind === "template" ? "Salvando modelo…" : "Salvando estampa…");
    try {
      const json = JSON.stringify(project);
      if (new Blob([json]).size > MAX_PROJECT_BYTES) throw new Error("A composição ficou muito grande. Remova a referência ou fontes que não usa.");
      const png = await exportPng(project);
      const form = new FormData();
      form.set("project", json); form.set("png", png, "estampa.png"); form.set("kind", kind);
      const response = await fetch(`${basePath}/dados`, { method: "POST", body: form });
      const result = await response.json().catch(() => ({ error: "A conexão com o servidor falhou. Tente salvar novamente." }));
      if (!response.ok || !result.item) throw new Error(result.error || "Não foi possível salvar. Confira se você ainda está conectado ao painel e tente novamente.");
      setItems((previous) => [result.item, ...previous]);
      setDirty(false);
      setServerSaved(true);
      setNotice(kind === "template" ? "Modelo salvo no servidor. Já está disponível para criar novas estampas." : "Estampa salva no servidor. Você já pode encontrá-la em Estampas salvas.");
    } catch (e) { setError(messageOf(e)); }
    finally { setBusy(""); }
  };

  const upload = async (event: ChangeEvent<HTMLInputElement>, kind: "font" | "logo" | "reference" | "project") => {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file) return;
    setBusy("Abrindo arquivo…"); setError("");
    try {
      if (kind === "project") {
        if (file.size > MAX_PROJECT_BYTES) throw new Error("O modelo deve ter no máximo 32 MB.");
        const next = parseProjectFile(await file.text());
        if (next.width !== 4270 || next.height !== 4900) throw new Error("O modelo deve ter 4270 × 4900 pixels.");
        if (next.background !== null) throw new Error("O modelo deve ter fundo transparente. Use background: null no arquivo editável.");
        await loadResources(next);
        loadComposition(next);
        setNotice("Modelo importado. Confira a prévia e use Salvar como modelo para disponibilizá-lo.");
      } else if (kind === "font") {
        if (project.fonts.length >= 20) throw new Error("Cada modelo pode ter até 20 fontes.");
        const font = { id: `font-${newId()}`, name: file.name.replace(/\.[^.]+$/, "").slice(0, 200), dataUrl: await readDataUrl(file, "font") };
        const next = { ...project, fonts: [...project.fonts, font], layers: project.layers.map((l) => l.id === selectedId && l.kind === "text" ? { ...l, fontId: font.id } : l) };
        await loadResources(next);
        commit(next);
        setNotice("Fonte carregada. Ela será guardada junto da estampa e do modelo.");
      } else {
        const asset = await readImageAsset(file);
        if (kind === "reference") { commit({ ...project, reference: asset }); setShowReference(true); }
        else {
          if (project.layers.length >= MAX_LAYERS) throw new Error("O limite é de 40 camadas por estampa.");
          const layer: PrintLayer = { id: newId(), kind: "image", name: "Logo", asset, width: 250, x: 600, y: 1610, visible: true };
          commit({ ...project, layers: [...project.layers, layer] }); selectLayer(layer.id);
        }
      }
    } catch (e) { setError(messageOf(e)); }
    finally { setBusy(""); }
  };

  const insertBrandLogo = async (replace = false) => {
    if (!replace && project.layers.length >= MAX_LAYERS) { setError("O limite é de 40 camadas por estampa."); return; }
    if (replace && selected?.kind !== "image") return;
    setBusy("Carregando logo…"); setError(""); setNotice("");
    try {
      const response = await fetch(`${basePath}/logos/${libraryLogo.id}`, { cache: "no-store" });
      if (!response.ok) throw new Error(response.status === 401 ? "Sua sessão expirou. Entre novamente no editor." : "Não foi possível abrir a logo. Tente novamente.");
      const file = new File([await response.blob()], `${libraryLogo.id}.png`, { type: "image/png" });
      const asset = await readImageAsset(file);
      if (replace && selected?.kind === "image") {
        changeLayer(selected.id, { asset, name: libraryLogo.name });
      } else {
        const textIds = project.layers.filter((layer) => layer.kind === "text").map((layer) => layer.id);
        const textBlock = unionBoxes(bounds.filter((box) => textIds.includes(box.id)));
        const width = 320;
        const height = width * asset.height / asset.width;
        const layer: PrintLayer = { id: newId(), kind: "image", name: libraryLogo.name, asset, width, x: Math.max(0, Math.min(project.width - width, textBlock?.x ?? 600)), y: Math.max(0, Math.min(project.height - height - 80, textBlock ? textBlock.y + textBlock.height + 100 : 600)), visible: true };
        commit({ ...project, layers: [...project.layers, layer] }); selectLayer(layer.id);
      }
      setNotice(replace ? "Logo substituída. A posição, a largura e o grupo foram preservados." : "Logo adicionada. Você pode arrastar, redimensionar e agrupar com a frase.");
    } catch (e) { setError(messageOf(e)); }
    finally { setBusy(""); }
  };

  const chooseFont = async (fontId: string) => {
    const supplied = availableFonts.find((font) => font.id === fontId);
    if (!supplied) { textChange({ fontId }); return; }
    if (selected?.kind !== "text") return;
    if (!project.fonts.some((font) => font.id === fontId) && project.fonts.length >= 20) { setError("Cada modelo pode ter até 20 fontes. Remova uma fonte que não usa para adicionar a Mont."); return; }
    setBusy("Carregando fonte…"); setError("");
    try {
      const next = { ...project, fonts: [...project.fonts.filter((font) => font.id !== fontId), supplied], layers: project.layers.map((layer) => layer.id === selected.id && layer.kind === "text" ? { ...layer, fontId, weight: supplied.weight ?? layer.weight } : layer) };
      await loadResources(next);
      commit(next);
    } catch (e) { setError(messageOf(e)); }
    finally { setBusy(""); }
  };

  const onPointerDown = (event: PointerEvent<HTMLButtonElement>, layer: PrintLayer) => {
    if (busy || event.button !== 0) return;
    if (event.shiftKey || event.ctrlKey || event.metaKey) { selectLayer(layer.id, true); return; }
    const ids = selectedIds.includes(layer.id) ? expandSelection(current.current, selectedIds) : expandSelection(current.current, [layer.id]);
    const box = unionBoxes(bounds.filter((b) => ids.includes(b.id)));
    if (!box) return;
    const rect = event.currentTarget.parentElement!.getBoundingClientRect();
    setSelectedIds(ids); event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { pointerId: event.pointerId, ids, startX: event.clientX, startY: event.clientY, box, other: bounds.filter((b) => !ids.includes(b.id)), rect, before: current.current, moved: false };
  };
  const onPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== event.pointerId) return;
    const px = event.clientX - d.startX; const py = event.clientY - d.startY;
    if (Math.abs(px) + Math.abs(py) < 2 && !d.moved) return;
    d.moved = true;
    let dx = px / d.rect.width * project.width; let dy = py / d.rect.height * project.height;
    if (showGuides && !event.altKey) {
      const snap = snapMovement(d.box, dx, dy, project.width, project.height, d.other, 7 / d.rect.width * project.width, 7 / d.rect.height * project.height);
      dx = snap.dx; dy = snap.dy;
      setSnapGuides({ x: snap.guideX, y: snap.guideY });
    } else setSnapGuides({ x: null, y: null });
    const next = moveSelection(d.before, d.ids, dx, dy);
    current.current = next; setProject(next); setDirty(true); setNotice("");
  };
  const endDrag = () => {
    const d = drag.current;
    if (d?.moved) { history.current.past.push(d.before); history.current.past = history.current.past.slice(-30); history.current.future = []; setHistorySize({ past: history.current.past.length, future: 0 }); }
    drag.current = null;
    setSnapGuides({ x: null, y: null });
  };
  const onLayerKey = (event: KeyboardEvent<HTMLButtonElement>, layer: PrintLayer) => {
    if (busy || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    const amount = event.shiftKey ? 10 : 1;
    commit(moveSelection(current.current, selectedIds.includes(layer.id) ? selectedIds : [layer.id], event.key === "ArrowLeft" ? -amount : event.key === "ArrowRight" ? amount : 0, event.key === "ArrowUp" ? -amount : event.key === "ArrowDown" ? amount : 0));
  };
  const align = (axis: Alignment) => commit(alignSelection(current.current, selectedIds, bounds, axis));
  const duplicateSelection = () => {
    const ids = expandSelection(project, selectedIds);
    const groupIds = new Map<string, string>();
    const copies = project.layers.filter((l) => ids.includes(l.id)).map((layer) => {
      if (layer.groupId && !groupIds.has(layer.groupId)) groupIds.set(layer.groupId, `group-${newId()}`);
      return { ...layer, id: newId(), name: `${layer.name} · cópia`.slice(0, 100), x: layer.x + 60, y: layer.y + 100, ...(layer.groupId ? { groupId: groupIds.get(layer.groupId) } : {}) };
    });
    commit({ ...project, layers: [...project.layers, ...copies] }); setSelectedIds(copies.map((l) => l.id));
  };
  const removeSelection = () => {
    const ids = expandSelection(project, selectedIds);
    const layers = project.layers.filter((l) => !ids.includes(l.id));
    commit({ ...project, layers }); setSelectedIds(expandSelection({ ...project, layers }, [layers[0]?.id ?? ""]));
  };

  const addText = () => {
    const layer = newTextLayer();
    if (selected?.kind === "text") Object.assign(layer, { fontId: selected.fontId, fontSize: selected.fontSize, weight: selected.weight, color: selected.color, x: selected.x, y: selected.y + selected.fontSize * selected.lineHeight });
    commit({ ...project, layers: [...project.layers, layer] }); selectLayer(layer.id);
  };
  const selectionBounds = unionBoxes(bounds.filter((b) => selectedIds.includes(b.id)));
  const grouped = project.layers.some((l) => selectedIds.includes(l.id) && l.groupId);
  const overflow = bounds.some((b) => b.x < -1 || b.y < -1 || b.x + b.width > project.width + 1 || b.y + b.height > project.height + 1);
  const savedArts = items.filter((i) => i.kind === "art");
  const templates = items.filter((i) => i.kind === "template");

  return (
    <div className={styles.studio} id="conteudo">
      <header className={styles.header}>
        <div><h1 className={styles.title}>Estúdio de estampas</h1><p>Uma frase sua. Uma estampa com a sua cara.</p></div>
        {tab === "editor" ? <div className={styles.headerActions}>
          {owner && <button type="button" className={styles.secondary} disabled={!!busy || !ready || rendering || !!renderError} onClick={() => void saveOnServer("template")}>Salvar como modelo</button>}
          <button type="button" className={styles.primary} disabled={!!busy || !ready || rendering || !!renderError} onClick={() => void saveOnServer("art")}><Icon name="save" />{busy || "Salvar estampa"}</button>
        </div> : <button type="button" className={styles.primary} onClick={() => setTab("editor")}><Icon name="plus" />Criar estampa</button>}
      </header>

      <nav className={styles.tabs} aria-label="Estúdio de estampas">
        <button type="button" aria-current={tab === "editor" ? "page" : undefined} onClick={() => setTab("editor")}>Criar estampa</button>
        <button type="button" aria-current={tab === "gallery" ? "page" : undefined} onClick={() => setTab("gallery")}>Estampas salvas <span>{savedArts.length}</span></button>
        <div className={styles.saveStatus}><span className={dirty ? styles.dirtyDot : styles.statusDot} />{dirty ? "Alterações por salvar" : serverSaved ? "Salvo no servidor" : "Pronto para criar"}</div>
      </nav>

      <div aria-live="polite" className={styles.messages}>
        {notice && <p className={styles.success}><Icon name="check" />{notice}</p>}
        {error && <p role="alert" className={styles.error}>{error}</p>}
      </div>

      {tab === "gallery" ? (
        <section className={styles.gallery} aria-label="Estampas salvas no servidor">
          <div className={styles.galleryHeading}><div><h2>Feitas por aqui</h2><p>As artes ficam guardadas no servidor, no tamanho original.</p></div><button type="button" className={styles.secondary} onClick={() => void refreshGallery()} disabled={galleryLoading}>Atualizar galeria</button></div>
          {galleryError && <p role="alert" className={styles.error}>{galleryError}</p>}
          {galleryLoading ? <p className={styles.loading}>Carregando estampas…</p> : savedArts.length === 0 ? <div className={styles.empty}><Icon name="image" /><h3>Sua primeira estampa começa com uma frase.</h3><p>Escolha um modelo, edite os textos e salve. A arte aparecerá aqui.</p><button type="button" className={styles.primary} onClick={() => setTab("editor")}>Criar uma estampa <Icon name="arrow" /></button></div> : (
            <div className={styles.galleryGrid}>{savedArts.map((item) => <article className={styles.savedArt} key={item.id}>
              <div className={styles.artThumbnail}><img src={fileUrl(item.id, "preview.webp")} alt={`Estampa ${item.name}`} loading="lazy" /></div>
              <div className={styles.artInfo}><h3>{item.name}</h3><p>{formatDate(item.createdAt)} · {item.createdBy}</p><p>4270 × 4900 px · PNG</p><div className={styles.artActions}><button type="button" disabled={!!busy} onClick={() => void openSaved(item)}>Abrir para editar <Icon name="arrow" /></button>{owner && <a href={`${fileUrl(item.id, "art.png")}?download=1`} download><Icon name="download" />Baixar PNG</a>}</div></div>
            </article>)}</div>
          )}
        </section>
      ) : (
        <div className={styles.workspace}>
          <fieldset className={styles.controls} disabled={!!busy || !ready}>
            <section className={styles.controlSection}>
              <div className={styles.sectionHeading}><h2>Comece por um modelo</h2>{owner && <button type="button" className={styles.textButton} onClick={() => projectInput.current?.click()}>Importar modelo</button>}</div>
              <div className={styles.presets}>
                <button type="button" onClick={() => loadComposition(createPreset("celebrar"))}><span className={styles.presetCelebrate}>feliz natal&<br />feliz ano novo&<br />cuca&<br />amigo secreto.</span><strong>Feliz tudo</strong><span>Quatro linhas, um estilo</span></button>
                <button type="button" onClick={() => loadComposition(createPreset("peleia"))}><span className={styles.presetPeleia}>Não tá morto<br /><b>quem peleia</b><i>+ sua logo</i></span><strong>Quem peleia</strong><span>Frase com destaque</span></button>
              </div>
              {templates.length > 0 && <label className={styles.field}>Seus modelos<select value="" onChange={(e) => { const item = templates.find((i) => i.id === e.target.value); if (item) void openSaved(item); }}><option value="">Escolher um modelo salvo…</option>{templates.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>}
              <p className={styles.hint}>Os modelos iniciais usam Hanken Grotesk. Você pode trocar para Mont ExtraLight ou Mont Heavy no seletor de fontes.</p>
            </section>

            <section className={styles.controlSection}>
              <label className={styles.field}>Nome da estampa<input maxLength={150} value={project.name} placeholder="Ex.: Peleia · coleção Sul" onChange={(e) => commit({ ...project, name: e.target.value })} /></label>
              <div className={styles.sectionHeading}><h2>Textos e logo</h2><span>{project.layers.length}/{MAX_LAYERS}</span></div>
              <div className={styles.layerList} aria-label="Camadas da estampa">{project.layers.map((layer, index) => <div key={layer.id} className={`${styles.layer} ${selectedIds.includes(layer.id) ? styles.selectedLayer : ""}`}>
                <input type="checkbox" aria-label={`Incluir ${layer.name} na seleção`} checked={selectedIds.includes(layer.id)} onChange={() => selectLayer(layer.id, true)} />
                <button type="button" className={styles.layerSelect} aria-pressed={selectedIds.includes(layer.id)} onClick={(event) => selectLayer(layer.id, event.shiftKey || event.metaKey || event.ctrlKey)}><span className={styles.layerType}>{layer.kind === "text" ? "T" : <Icon name="image" />}</span><span><strong>{layer.name}{layer.groupId && <em>Grupo</em>}</strong><small>{layer.kind === "text" ? layer.text || "Texto vazio" : layer.asset.name}</small></span><span className={styles.layerIndex}>{index + 1}</span></button>
              </div>)}</div>
              <div className={styles.selectionActions}><span>{selectedIds.length} selecionado{selectedIds.length === 1 ? "" : "s"}</span><button type="button" className={styles.textButton} onClick={() => setSelectedIds(project.layers.map((l) => l.id))}>Selecionar todos</button></div>
              <div className={styles.addActions}><button type="button" className={styles.secondary} disabled={selectedIds.length < 2} onClick={() => commit(groupSelection(project, selectedIds, `group-${newId()}`))}>Agrupar</button><button type="button" className={styles.secondary} disabled={!grouped} onClick={() => { commit(ungroupSelection(project, selectedIds)); setSelectedIds(selectedId ? [selectedId] : []); }}>Desagrupar</button></div>
              <p className={styles.hint}>Marque vários itens para agrupar. Você também pode usar Shift + clique na prévia.</p>
              <div className={styles.addActions}><button type="button" className={styles.secondary} disabled={project.layers.length >= MAX_LAYERS} onClick={addText}><Icon name="plus" />Texto</button><button type="button" className={styles.secondary} disabled={project.layers.length >= MAX_LAYERS} onClick={() => { if (logoLibrary.current) { logoLibrary.current.open = true; logoLibrary.current.scrollIntoView({ block: "nearest" }); logoLibrary.current.querySelector("summary")?.focus(); } }}><Icon name="image" />Escolher logo</button></div>
            </section>

            <section className={styles.controlSection} aria-label="Biblioteca de logos">
              <details className={styles.details} ref={logoLibrary}>
              <summary>Logos da Origens</summary>
              <div className={styles.logoRegions} role="group" aria-label="Região da logo">
                {LOGO_REGIONS.map((region) => <button type="button" key={region.id} aria-pressed={logoRegion === region.id} onClick={() => setLogoRegion(region.id)}>{region.name}</button>)}
              </div>
              <div className={styles.logoVariants} role="group" aria-label="Cor da logo">
                <button type="button" aria-pressed={logoVariant === "clara"} onClick={() => setLogoVariant("clara")}>Logo clara</button>
                <button type="button" aria-pressed={logoVariant === "escura"} onClick={() => setLogoVariant("escura")}>Logo escura</button>
              </div>
              <div className={styles.logoPreview} style={{ background: logoVariant === "clara" ? "#111111" : "#f4f1e9" }}>
                <img src={`${basePath}/logos/${libraryLogo.id}`} alt={libraryLogo.name} width={libraryLogo.width} height={libraryLogo.height} />
              </div>
              <p className={styles.hint}>{logoVariant === "clara" ? "Versão clara para camisetas escuras." : "Versão escura para camisetas claras."} A transparência e as cores do arquivo original são preservadas.</p>
              {selected?.kind === "image" ? <div className={styles.addActions}>
                <button type="button" className={styles.secondary} onClick={() => void insertBrandLogo(true)}>Trocar selecionada</button>
                <button type="button" className={styles.secondary} disabled={project.layers.length >= MAX_LAYERS} onClick={() => void insertBrandLogo()}><Icon name="plus" />Adicionar outra</button>
              </div> : <button type="button" className={styles.secondary} disabled={project.layers.length >= MAX_LAYERS} onClick={() => void insertBrandLogo()}><Icon name="plus" />Adicionar logo</button>}
              <button type="button" className={styles.textButton} disabled={project.layers.length >= MAX_LAYERS} onClick={() => logoInput.current?.click()}>Enviar outra logo do computador</button>
              </details>
            </section>

            {selected ? <section className={styles.controlSection}>
              <div className={styles.sectionHeading}><h2>Editar {selected.kind === "text" ? "texto" : "logo"}</h2><div className={styles.iconActions}><button type="button" title="Duplicar camada" aria-label="Duplicar camada" disabled={project.layers.length + selectedIds.length > MAX_LAYERS} onClick={duplicateSelection}><Icon name="copy" /></button><button type="button" title="Remover camada" aria-label="Remover camada" onClick={removeSelection}><Icon name="trash" /></button></div></div>
              {selected.kind === "text" ? <>
                <label className={styles.field}>Sua frase<textarea rows={3} maxLength={3000} value={selected.text} onChange={(e) => textChange({ text: e.target.value })} /></label>
                <label className={styles.field}>Fonte<select value={selected.fontId} onChange={(e) => void chooseFont(e.target.value)}>{[...BUILTIN_FONTS, ...availableFonts, ...project.fonts.filter((font) => !availableFonts.some((supplied) => supplied.id === font.id))].map((f) => <option value={f.id} key={f.id}>{f.name}</option>)}</select></label>
                <div className={styles.fieldRow}><NumericField label="Tamanho (px)" value={selected.fontSize} min={8} max={2000} onChange={(fontSize) => textChange({ fontSize })} /><label className={styles.field}>Peso<select value={selected.weight} onChange={(e) => textChange({ weight: Number(e.target.value) })}>{[[100, "Fino"], [200, "Extraleve"], [300, "Leve"], [400, "Normal"], [500, "Médio"], [600, "Seminegrito"], [700, "Negrito"], [800, "Extranegrito"], [900, "Pesado"]].map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label></div>
                <div className={styles.colorRow}><label className={styles.colorInput}><input type="color" aria-label="Cor do texto" value={selected.color} onChange={(e) => textChange({ color: e.target.value })} /><span>Cor do texto<strong>{selected.color.toUpperCase()}</strong></span></label><div className={styles.colorSwatches}>{["#ffffff", "#790b1b", "#111111", "#e8cfa3"].map((color) => <button key={color} type="button" style={{ background: color }} aria-label={`Usar cor ${color}`} aria-pressed={selected.color === color} onClick={() => textChange({ color })} />)}</div></div>
              </> : <><p className={styles.hint}>{selected.asset.name}</p><NumericField label="Largura da logo (px)" value={selected.width} min={1} max={10000} onChange={(width) => changeLayer(selected.id, { width })} /><p className={styles.hint}>A proporção da imagem é preservada. Use PNG transparente para uma logo sem fundo.</p></>}
              <details className={styles.details}>
                <summary>Posição e ajustes finos</summary>
                <label className={styles.field}>Nome da camada<input value={selected.name} maxLength={100} onChange={(e) => changeLayer(selected.id, { name: e.target.value })} /></label>
                <div className={styles.fieldRow}><NumericField label="Posição X (px)" value={selected.x} onChange={(x) => changeLayer(selected.id, { x })} /><NumericField label="Posição Y (px)" value={selected.y} onChange={(y) => changeLayer(selected.id, { y })} /></div>
                <button type="button" className={styles.secondary} disabled={!selectionBounds || rendering} onClick={() => align("both")}>Centralizar na arte</button>
                {selected.kind === "text" && <><div className={styles.fieldRow}><NumericField label="Entre letras (px)" value={selected.letterSpacing} min={-100} max={300} onChange={(letterSpacing) => textChange({ letterSpacing })} /><NumericField label="Entrelinhas" value={selected.lineHeight} min={0.7} max={3} step={0.05} onChange={(lineHeight) => textChange({ lineHeight })} /></div><label className={styles.field}>Alinhar linhas<select value={selected.align} onChange={(e) => textChange({ align: e.target.value as TextLayer["align"] })}><option value="left">À esquerda</option><option value="center">Ao centro</option><option value="right">À direita</option></select></label></>}
                <div className={styles.fieldRow}><button type="button" className={styles.secondary} onClick={() => { const index = project.layers.findIndex((l) => l.id === selected.id); const layers = [...project.layers]; if (index < layers.length - 1) { [layers[index], layers[index + 1]] = [layers[index + 1], layers[index]]; commit({ ...project, layers }); } }} disabled={project.layers.at(-1)?.id === selected.id}>Trazer à frente</button><label className={styles.checkbox}><input type="checkbox" checked={selected.visible} onChange={(e) => changeLayer(selected.id, { visible: e.target.checked })} />Visível</label></div>
              </details>
            </section> : <p className={styles.controlSection}>Selecione um item na prévia ou na lista para editar.</p>}

            <section className={styles.controlSection}>
              <details className={styles.details}><summary>Fontes e imagem de referência</summary>
                <button type="button" className={styles.secondary} disabled={project.fonts.length >= 20} onClick={() => fontInput.current?.click()}>Enviar arquivo de fonte</button><p className={styles.hint}>TTF, OTF, WOFF ou WOFF2 · até 8 MB. Para usar uma variante exata, envie também o arquivo em negrito.</p>
                {project.fonts.map((font) => <div className={styles.fontRow} key={font.id}><span>{font.name}</span><button type="button" className={styles.textButton} disabled={project.layers.some((l) => l.kind === "text" && l.fontId === font.id)} onClick={() => commit({ ...project, fonts: project.fonts.filter((f) => f.id !== font.id) })}>Remover</button></div>)}
                <button type="button" className={styles.secondary} onClick={() => referenceInput.current?.click()}>Enviar referência do layout</button><p className={styles.hint}>O PNG é um guia visual. Os textos são editados nas camadas; a referência não aparece na arte salva.</p>
                {project.reference && <><label className={styles.checkbox}><input type="checkbox" checked={showReference} onChange={(e) => setShowReference(e.target.checked)} />Mostrar referência na prévia</label><button type="button" className={styles.textButton} onClick={() => commit({ ...project, reference: null })}>Remover referência</button></>}
              </details>
            </section>
            <input hidden ref={fontInput} type="file" accept=".ttf,.otf,.woff,.woff2" aria-label="Arquivo de fonte" onChange={(e) => void upload(e, "font")} />
            <input hidden ref={logoInput} type="file" accept="image/png,image/jpeg,image/webp" aria-label="Arquivo da logo" onChange={(e) => void upload(e, "logo")} />
            <input hidden ref={referenceInput} type="file" accept="image/png,image/jpeg,image/webp" aria-label="Imagem de referência" onChange={(e) => void upload(e, "reference")} />
            {owner && <input hidden ref={projectInput} type="file" accept=".json" aria-label="Modelo editável" onChange={(e) => void upload(e, "project")} />}
          </fieldset>

          <section className={styles.previewSection} aria-label="Prévia da estampa">
            <div className={styles.previewToolbar}><div className={styles.iconActions}><button type="button" aria-label="Desfazer" title="Desfazer" disabled={!!busy || !historySize.past} onClick={() => undo("past")}><Icon name="undo" /></button><button type="button" aria-label="Refazer" title="Refazer" disabled={!!busy || !historySize.future} onClick={() => undo("future")}><Icon name="redo" /></button></div><span>4270 × 4900 px</span><label className={styles.backgroundPicker}>Camiseta<select value={previewBackground} onChange={(e) => setPreviewBackground(e.target.value)}><option value="#111111">Preta</option><option value="#f4f1e9">Clara</option><option value="transparent">Transparência</option></select></label></div>
            <div className={styles.alignmentToolbar} role="group" aria-label="Alinhar seleção">
              <button type="button" disabled={!selectionBounds || !!busy || rendering} onClick={() => align("horizontal")} title="Centralizar a seleção na horizontal">Centro horizontal</button>
              <button type="button" disabled={!selectionBounds || !!busy || rendering} onClick={() => align("vertical")} title="Centralizar a seleção na vertical">Centro vertical</button>
              <button type="button" disabled={!selectionBounds || !!busy || rendering} onClick={() => align("both")}>Centro da arte</button>
              <label><input type="checkbox" checked={showGuides} onChange={(e) => setShowGuides(e.target.checked)} />Guias e encaixe</label>
            </div>
            <div className={`${styles.previewGround} ${previewBackground === "transparent" ? styles.checker : ""}`}>
              <div className={styles.artboard} style={{ background: previewBackground, aspectRatio: `${project.width} / ${project.height}` }}>
                {project.reference && showReference && <><img className={styles.reference} src={project.reference.dataUrl} alt="Referência do layout" /></>}
                <canvas ref={canvasRef} role="img" aria-label={`Prévia de ${project.name}: ${project.layers.filter((l) => l.kind === "text" && l.visible).map((l) => l.kind === "text" ? l.text : "").join(". ")}`} />
                {!renderError && bounds.map((box) => {
                  const layer = project.layers.find((l) => l.id === box.id);
                  if (!layer || !layer.visible) return null;
                  return <button type="button" key={box.id} className={`${styles.layerHandle} ${selectedIds.includes(box.id) ? styles.activeHandle : ""}`} disabled={!!busy} style={{ left: `${box.x / project.width * 100}%`, top: `${box.y / project.height * 100}%`, width: `${box.width / project.width * 100}%`, height: `${box.height / project.height * 100}%` }} aria-label={`Selecionar e mover ${layer.name}`} onClick={(event) => { if (event.detail === 0) selectLayer(box.id, event.shiftKey || event.metaKey || event.ctrlKey); }} onPointerDown={(e) => onPointerDown(e, layer)} onPointerMove={onPointerMove} onPointerUp={endDrag} onPointerCancel={endDrag} onKeyDown={(e) => onLayerKey(e, layer)} />;
                })}
                {showGuides && <><span className={styles.centerGuideX} /><span className={styles.centerGuideY} /></>}
                {snapGuides.x !== null && <span className={styles.snapGuideX} style={{ left: `${snapGuides.x / project.width * 100}%` }} />}
                {snapGuides.y !== null && <span className={styles.snapGuideY} style={{ top: `${snapGuides.y / project.height * 100}%` }} />}
                {selectedIds.length > 1 && selectionBounds && <span className={styles.groupBounds} style={{ left: `${selectionBounds.x / project.width * 100}%`, top: `${selectionBounds.y / project.height * 100}%`, width: `${selectionBounds.width / project.width * 100}%`, height: `${selectionBounds.height / project.height * 100}%` }} />}
                {!ready && <span className={styles.previewLoading}>Abrindo seu estúdio…</span>}
              </div>
            </div>
            <div className={styles.previewFooter}><span>Arraste para posicionar. Alt desativa o encaixe.</span><span>Fundo transparente na arte salva</span></div>
            {renderError && <p role="alert" className={styles.error}>{renderError}</p>}
            {overflow && !rendering && <p className={styles.warning}>Uma camada ultrapassa a arte e será cortada. Reduza o tamanho ou ajuste a posição.</p>}
            <div className={styles.printNote}><div><Icon name="check" /><strong>No tamanho certo para camiseta</strong></div><p>4270 × 4900 pixels · {project.dpi} dpi · PNG transparente.<br />O fundo da camiseta é apenas uma simulação.</p><small>{localStatus}</small></div>
          </section>
        </div>
      )}
    </div>
  );
}
