"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { initialValues, lineLabelOf, normalizeValue, orderedFields, validateSubmission, type FieldError, type SummaryLine, type Values } from "@/lib/customization/validate";
import { CONTACT_CONFIRM_TEXT, CONTACT_KEYS, CONTACT_NOTICE, validateContact } from "@/lib/customization/contact";
import type { Customizer } from "@/lib/site-config/schema";
import type { StartProductsResult, SubmitResult } from "@/app/[region]/personalizar/actions";
import { artworkFields, composeArtwork, fieldEdits, initialArtworkEdits, validateArtworkInput, type ArtworkEdit } from "@/lib/customization/artwork";
import { choiceLabel, choiceOf, MAX_FAMILY_ARTS, offersChoice, type ArtChoice } from "@/lib/customization/studio-arts";
import { SHIRT_COLORS, shirtColor, shirtColorsFor } from "@/lib/customization/shirts";
import type { PrintProject } from "@/lib/print-studio/model";
import { ArtworkEditor, ArtworkFields } from "./ArtworkEditor";
import { ArtworkPreview, type PreviewView } from "./ArtworkPreview";
import { ArtPicker, ShirtSwatches } from "./StudioPickers";
import { InfoTip } from "./InfoTip";
import { ProductWaiting, type RequestOutcome, type Showcase } from "./ProductWaiting";
import styles from "./ArtworkEditor.module.css";

/** Fetches another base of the model when the customer picks it: the page ships only the first one (each carries the full-size art). */
export type LoadBase = (input: { region: string; slug: string; templateId: string }) => Promise<PrintProject | null>;
export type PublicMockup = { src: string; width: number; height: number; variants?: { w: number; src: string }[]; alt: string };
type ContactValues = { name: string; whatsapp: string; email: string; confirm: boolean };
type Submit = (input: { region: string; slug: string; idempotencyKey: string; fields?: unknown; lines?: unknown; artwork?: { templateId: string; layers?: unknown; fields?: unknown; also?: string[] }; contact?: { name: string; whatsapp: string; email: string; confirm: boolean }; replaces?: string }) => Promise<SubmitResult>;

/** Direct purchase: starts (or finds) the products of the order at INK; see `startProductsAction`. */
type StartProducts = (input: { region: string; slug: string; artwork: { templateId: string; fields: Record<string, string>; also?: string[] } }) => Promise<StartProductsResult>;
type Waiting = { items: Extract<StartProductsResult, { ok: true }>["items"]; fallback: string | null; surname: string; showcase: Showcase | null };

const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().replaceAll("-", "") : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`.padEnd(24, "0"));

/** What the customer has typed so far, in the model's own order and labels (the same text the request will store). Empty values are left out. */
function liveSummary(model: Customizer, v: Values): SummaryLine[] {
  const out: SummaryLine[] = [];
  for (const f of orderedFields(model)) if (v.fields[f.key]?.trim()) out.push({ label: f.label, value: normalizeValue(v.fields[f.key]) });
  v.lines.forEach((l, i) => { if (l.trim()) out.push({ label: lineLabelOf(model, i), value: normalizeValue(l) }); });
  return out;
}

const PlusIcon = () => <svg aria-hidden="true" viewBox="0 0 16 16" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M8 3v10M3 8h10" /></svg>;
const ExpandIcon = () => <svg aria-hidden="true" viewBox="0 0 16 16" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 2.5h3.5V6M6 13.5H2.5V10M13.5 2.5 9 7M2.5 13.5 7 9" /></svg>;
type Pick = { art: number; version: number };
const samePick = (a: Pick, b: Pick) => a.art === b.art && a.version === b.version;

const inputClass = "block w-full min-h-11 border-2 border-ink bg-white px-3 py-2 text-[1rem] text-ink placeholder:text-ink-mute focus:outline-none focus:ring-2 focus:ring-region-primary aria-[invalid=true]:border-[#9b1c1c]";

export function CustomizerForm({
  region, model, mockup, firstBase, loadBase, thumbs = "", submit, available, preview = false, direct = false, startProducts,
}: {
  region: string;
  model: Customizer;
  mockup: PublicMockup;
  /** The base of the model's first art (dark shirt): with it, the page is the art editor instead of the text form. */
  firstBase?: PrintProject;
  loadBase?: LoadBase;
  /** Thumbnail URL of a base, with `{id}` for its template id (the public route, or the admin one in the preview). */
  thumbs?: string;
  submit: Submit;
  /** False when this environment cannot store requests (no database): the form is shown but sending is disabled and says why. */
  available: boolean;
  /** Admin preview: fully interactive, never sends. */
  preview?: boolean;
  /** The model sells directly (`directPurchase.enabled`): the page asks only what goes on the art and creates the product at INK. */
  direct?: boolean;
  /** Absent in the admin preview, which never creates anything. */
  startProducts?: StartProducts;
}) {
  const uid = useId();
  const arts = useMemo(() => (firstBase && model.studioArts?.length ? model.studioArts : []), [firstBase, model.studioArts]);
  const studio = arts.length > 0;
  // A family order holds one or more arts or versions with the same surname; the preview shows the active one.
  const [items, setItems] = useState<Pick[]>([{ art: 0, version: 0 }]);
  const [active, setActive] = useState(0);
  const pick = items[Math.min(active, items.length - 1)];
  // The shirt colour is only for viewing; it decides which version of the art is drawn (light shirts get the "camiseta clara" base). The Camiseta
  // Infantil comes in six colours: on a kids version the swatches keep to them and a colour it does not have shows as the first one.
  const colors = useMemo(() => shirtColorsFor(arts[pick.art]?.versions[pick.version]?.garment === "infantil"), [arts, pick]);
  const [chosenShirt, setShirt] = useState(SHIRT_COLORS[0].id);
  const shirt = colors.some((c) => c.id === chosenShirt) ? chosenShirt : colors[0].id;
  const light = shirtColor(shirt).light;
  const choice = useMemo(() => (studio ? choiceOf(arts, { ...pick, light }) : null), [studio, arts, pick, light]);
  const itemChoices = useMemo(() => (studio ? items.map((p) => choiceOf(arts, { ...p, light })).filter((c): c is ArtChoice => c !== null) : []), [studio, arts, items, light]);
  const templateId = choice?.templateId;
  const thumb = (id: string) => thumbs.replace("{id}", id);
  const [bases, setBases] = useState<Record<string, PrintProject>>(() => (firstBase && arts[0] ? { [arts[0].versions[0].templateId]: firstBase } : {}));
  const [baseError, setBaseError] = useState("");
  const artworkBase = templateId ? bases[templateId] : undefined;
  useEffect(() => {
    if (!templateId || bases[templateId] || !loadBase) return;
    let active = true;
    loadBase({ region, slug: model.slug, templateId }).then((project) => {
      if (!active) return;
      if (project) setBases((loaded) => ({ ...loaded, [templateId]: project }));
      else setBaseError("Esta arte não abriu agora. Escolha outra ou tente de novo em instantes.");
    }).catch(() => { if (active) setBaseError("Não foi possível carregar esta arte. Confira a conexão e tente de novo."); });
    return () => { active = false; };
  }, [templateId, bases, loadBase, region, model.slug]);
  const [values, setValues] = useState<Values>(() => studio ? { fields: {}, lines: [] } : initialValues(model));
  // Free-form bases keep their own edits, so going back to an art finds it as it was left; every base asks the same fields.
  const [editsByBase, setEditsByBase] = useState<Record<string, ArtworkEdit[]>>({});
  const artworkEdits = useMemo(() => (artworkBase && templateId ? editsByBase[templateId] ?? initialArtworkEdits(artworkBase) : []), [artworkBase, templateId, editsByBase]);
  const setArtworkEdits = (edits: ArtworkEdit[]) => { if (templateId) setEditsByBase((all) => ({ ...all, [templateId]: edits })); };
  // The surname starts empty (a prefilled example gets typed after, or sent by mistake); the preview shows the example until one is written.
  const slots = useMemo(() => (firstBase && studio ? artworkFields(firstBase) : []), [firstBase, studio]);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>(() => Object.fromEntries(slots.map((f) => [f.id, ""])));
  const showingExample = slots.some((f) => !fieldValues[f.id]?.trim());
  const previewValues = useMemo(() => Object.fromEntries(slots.map((f) => [f.id, fieldValues[f.id]?.trim() ? fieldValues[f.id] : f.example])), [slots, fieldValues]);
  const [artworkReady, setArtworkReady] = useState(false);
  const fieldMode = slots.length > 0;
  const artworkInput = fieldMode ? { fields: fieldValues } : { layers: artworkEdits };
  const artworkProject = useMemo(() => artworkBase ? composeArtwork(artworkBase, fieldMode ? fieldEdits(artworkBase, previewValues) : artworkEdits) : null, [artworkBase, fieldMode, previewValues, artworkEdits]);
  const family = fieldMode && offersChoice(model);
  // Direct purchase: only the typed text goes into the art (bases with fields), and the product is created at INK instead of a request.
  const buying = direct && fieldMode;

  // Picking an art that is already in the order shows it instead of adding it twice.
  const choose = (next: Pick) => {
    setBaseError("");
    const other = items.findIndex((p, i) => i !== active && samePick(p, next));
    if (other >= 0) setActive(other);
    else setItems((list) => list.map((p, i) => (i === active ? next : p)));
  };
  const allPicks = useMemo(() => arts.flatMap((a, art) => a.versions.map((_, version) => ({ art, version }))), [arts]);
  // "Add another art" starts on the same art's other version (adult → kids), then on the next art not in the order yet.
  const nextPick = [...allPicks.filter((c) => c.art === pick.art), ...allPicks].find((c) => !items.some((p) => samePick(p, c)));
  const addItem = () => {
    if (!nextPick || items.length >= MAX_FAMILY_ARTS) return;
    setItems((list) => [...list, nextPick]);
    setActive(items.length);
    setBaseError("");
  };
  const removeItem = (index: number) => {
    if (items.length < 2) return;
    setItems((list) => list.filter((_, i) => i !== index));
    setActive((a) => (index < a || (index === a && a > 0) ? a - 1 : a));
  };
  const chooseShirt = (id: string) => { setShirt(id); setBaseError(""); };
  const [previewView, setPreviewView] = useState<PreviewView>("shirt");

  // "Ver como ficou": on a phone the preview is far above the surname, so a full-screen view lets the customer type and see at once.
  const fullRef = useRef<HTMLDialogElement>(null);
  const [full, setFull] = useState(false);
  const openFull = () => { setFull(true); fullRef.current?.showModal(); };
  // The waiting screen of a direct purchase, over the page like the full-screen view.
  const waitRef = useRef<HTMLDialogElement>(null);
  const [waiting, setWaiting] = useState<Waiting | null>(null);
  const openWaiting = (w: Waiting) => { setWaiting(w); requestAnimationFrame(() => waitRef.current?.showModal()); };
  const loadBaseById = useCallback((templateId: string) => (loadBase ? loadBase({ region, slug: model.slug, templateId }) : Promise.resolve(null)), [loadBase, region, model.slug]);
  useEffect(() => {
    if (!full && !waiting) return;
    const root = document.documentElement;
    const before = root.style.overflow;
    root.style.overflow = "hidden";
    return () => { root.style.overflow = before; };
  }, [full, waiting]);
  const focusSurname = () => { const first = slots[0]; if (first) document.getElementById(`${uid}-artwork-${first.id}`)?.focus(); };

  const artOptions = () => arts.map((a, i) => ({ key: i, label: a.label, thumb: thumb(choiceOf(arts, { art: i, version: i === pick.art ? pick.version : 0, light })!.templateId) }));
  const versionOptions = () => choice!.art.versions.map((v, j) => ({ key: j, label: `${choice!.art.label} · ${v.label ?? `Versão ${j + 1}`}`, caption: v.label ?? `Versão ${j + 1}`, thumb: thumb(choiceOf(arts, { art: pick.art, version: j, light })!.templateId) }));
  // Only on the page: the full-screen view offers just the colours, so a tap there never swaps the art the customer picked.
  const artPickers = choice && (
    <>
      {arts.length > 1 && <ArtPicker legend="1. Escolha a arte" name={`${uid}-arte`} options={artOptions()} value={pick.art} onChange={(art) => choose({ art, version: 0 })} shirt={shirt} />}
      {choice.art.versions.length > 1 && <ArtPicker legend="Versão" name={`${uid}-versao`} options={versionOptions()} value={pick.version} onChange={(version) => choose({ art: pick.art, version })} shirt={shirt} />}
    </>
  );

  const [contact, setContact] = useState<ContactValues>({ name: "", whatsapp: "", email: "", confirm: false });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [phase, setPhase] = useState<"idle" | "sending" | "done">("idle");
  const [banner, setBanner] = useState<string | null>(null);
  const [done, setDone] = useState<Extract<SubmitResult, { ok: true }> | null>(null);
  const [copied, setCopied] = useState(false);
  const idem = useRef(newKey());
  const previous = useRef<string | undefined>(undefined);
  const g = studio ? undefined : model.lineGroup;
  const summary = useMemo(() => {
    if (!studio || !choice) return liveSummary(model, values);
    const picked = offersChoice(model) ? itemChoices.map((c, i) => ({ label: itemChoices.length > 1 ? `Arte ${i + 1}` : "Arte escolhida", value: choiceLabel(c) })) : [];
    if (!artworkBase) return picked;
    if (itemChoices.length > 1) return [...picked, ...slots.filter((f) => fieldValues[f.id]?.trim()).map((f) => ({ label: f.label, value: normalizeValue(fieldValues[f.id]) }))];
    const checked = validateArtworkInput(artworkBase, choice.templateId, fieldMode ? { fields: fieldValues } : { layers: artworkEdits });
    if (checked.ok && checked.artwork.fields) return [...picked, ...checked.artwork.fields.map((f) => ({ label: f.label, value: f.value })), ...checked.artwork.layers.map((l) => ({ label: "Texto na arte", value: l.text }))];
    return checked.ok ? [...picked, ...checked.artwork.layers.flatMap((l, i) => [{ label: `${i + 1}. ${l.name}`, value: l.text }, { label: `${i + 1}. Fonte e cor`, value: `${l.fontName} · ${l.color.toUpperCase()}` }])] : picked;
  }, [model, values, studio, choice, itemChoices, slots, artworkBase, fieldMode, fieldValues, artworkEdits]);
  const referenceUrl = done ? `/${region}/personalizar/solicitacao/${done.reference}` : null;

  const setField = (key: string, v: string) => setValues((cur) => ({ ...cur, fields: { ...cur.fields, [key]: v } }));
  const setLine = (i: number, v: string) => setValues((cur) => ({ ...cur, lines: cur.lines.map((l, k) => (k === i ? v : l)) }));
  const addLine = () => g && setValues((cur) => (cur.lines.length < g.max ? { ...cur, lines: [...cur.lines, g.defaults?.[cur.lines.length] ?? ""] } : cur));
  const removeLine = (i: number) => g && setValues((cur) => (cur.lines.length > g.min ? { ...cur, lines: cur.lines.filter((_, k) => k !== i) } : cur));

  const showErrors = (list: FieldError[]) => {
    const map: Record<string, string> = {};
    for (const e of list) map[e.key] ??= e.message;
    setErrors(map);
    const first = list[0]?.key;
    if (first) requestAnimationFrame(() => document.getElementById(`${uid}-${first.replace(".", "-")}`)?.focus());
  };

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBanner(null);
    if (phase === "sending") return;
    if (studio && (!artworkBase || !templateId)) { setBanner("Aguarde a arte carregar."); return; }
    if (buying && artworkBase && templateId) {
      const art = validateArtworkInput(artworkBase, templateId, { fields: fieldValues });
      if (!art.ok) { showErrors(art.errors); setBanner("Confira o que você escreveu."); return; }
      setErrors({});
      if (preview || !startProducts) { setBanner("Pré-visualização: nada foi criado."); return; }
      setPhase("sending");
      const result = await startProducts({ region, slug: model.slug, artwork: { templateId: itemChoices[0]?.templateId ?? templateId, fields: fieldValues, ...(itemChoices.length > 1 ? { also: itemChoices.slice(1).map((c) => c.templateId) } : {}) } }).catch(() => null);
      setPhase("idle");
      if (!result) { setBanner("A conexão caiu. Tente de novo."); return; }
      if (!result.ok && !result.fallback) { showErrors(result.errors); setBanner(result.message); return; }
      const first = itemChoices[0]?.version;
      openWaiting({
        items: result.ok ? result.items : [], fallback: result.ok ? null : result.message, surname: Object.values(fieldValues).join(" ").trim(),
        showcase: first ? { templateId: first.templateId, ...(first.lightTemplateId ? { lightTemplateId: first.lightTemplateId } : {}), fields: fieldValues, kids: first.garment === "infantil" } : null,
      });
      return;
    }
    const checked = artworkBase && templateId ? validateArtworkInput(artworkBase, templateId, artworkInput) : validateSubmission(model, { fields: values.fields, lines: values.lines });
    const contactChecked = validateContact(contact);
    const problems = [...(checked.ok ? [] : checked.errors), ...(contactChecked.ok ? [] : contactChecked.errors)];
    if (problems.length > 0) {
      showErrors(problems);
      setBanner("Confira os campos destacados.");
      return;
    }
    setErrors({});
    if (studio && !artworkReady) { setBanner("Aguarde a prévia da arte carregar. Se aparecer um erro, confira a fonte e os textos."); return; }
    if (preview) {
      setBanner("Pré-visualização: nada foi enviado.");
      return;
    }
    setPhase("sending");
    try {
      const artwork = studio && templateId ? { ...artworkInput, templateId: itemChoices[0]?.templateId ?? templateId, ...(itemChoices.length > 1 ? { also: itemChoices.slice(1).map((c) => c.templateId) } : {}) } : undefined;
      const result = await submit({ region, slug: model.slug, idempotencyKey: idem.current, fields: values.fields, lines: values.lines, ...(artwork ? { artwork } : {}), contact, replaces: previous.current });
      if (result.ok) {
        setDone(result);
        setPhase("done");
        return;
      }
      showErrors(result.errors);
      setBanner(result.message);
    } catch {
      setBanner("A conexão foi interrompida. Nada foi duplicado: tente enviar de novo.");
    }
    setPhase("idle");
  }

  /** The team's way out of a direct purchase: the usual request, with the contact typed on the waiting screen. */
  const requestTeam = async (c: ContactValues): Promise<RequestOutcome> => {
    const artwork = templateId ? { fields: fieldValues, templateId: itemChoices[0]?.templateId ?? templateId, ...(itemChoices.length > 1 ? { also: itemChoices.slice(1).map((x) => x.templateId) } : {}) } : undefined;
    const result = await submit({ region, slug: model.slug, idempotencyKey: idem.current, fields: values.fields, lines: values.lines, ...(artwork ? { artwork } : {}), contact: c });
    if (result.ok) return { ok: true, channels: result.channels };
    const map: Record<string, string> = {};
    for (const e of result.errors) map[e.key] ??= e.message;
    return { ok: false, message: result.message, errors: map };
  };

  const editAgain = () => {
    previous.current = done?.reference; // the earlier reference is cancelled when the new one is registered
    idem.current = newKey();
    setDone(null);
    setPhase("idle");
    setBanner(null);
  };

  const copy = async () => {
    if (!done) return;
    try {
      await navigator.clipboard.writeText(done.shortReference);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const mid = mockup.variants?.[Math.min(1, (mockup.variants?.length ?? 1) - 1)]?.src ?? mockup.src;
  const previewBlock = (compact: boolean) => artworkProject ? (
    <ArtworkPreview key={`${compact ? "full" : "page"}-${templateId}`} project={artworkProject} onReady={compact ? undefined : setArtworkReady} view={previewView} onViewChange={setPreviewView} shirt={shirt} compact={compact}
      actions={compact ? undefined : <button type="button" className={styles.viewsEnd} onClick={openFull} aria-haspopup="dialog"><span className="inline-flex items-center gap-1.5"><ExpandIcon />Tela cheia</span></button>} />
  ) : (
    <div className={`mt-14 flex w-full items-center justify-center bg-[#242424] p-6 text-center text-white ${previewView === "shirt" ? "aspect-[800/820]" : "aspect-[4270/4900]"}`} role="status" aria-live="polite">{baseError || "Carregando a arte…"}</div>
  );
  const surnameStep = (compact: boolean) => firstBase && (
    <ArtworkFields base={firstBase} values={fieldValues} onChange={setFieldValues} errors={compact ? {} : errors} uid={compact ? `${uid}-full` : uid} legend={arts.length > 1 ? "2. Escreva o sobrenome" : "Escreva o sobrenome"} compact={compact}>
      {!compact && <div className="mt-2 lg:hidden"><button type="button" className={`btn btn-ghost ${styles.seeShirt} inline-flex w-full items-center justify-center gap-2`} onClick={openFull} aria-haspopup="dialog"><ExpandIcon />Ver como ficou na camiseta</button></div>}
    </ArtworkFields>
  );

  return (
    <div className="wrap py-6 lg:py-14">
      <div className="grid gap-6 lg:grid-cols-12 lg:grid-rows-[auto_1fr] lg:gap-x-12 lg:gap-y-8">
        <header className="min-w-0 lg:col-span-7 lg:col-start-6 lg:row-start-1">
          <h1 className="t-h1" style={studio ? { fontSize: "clamp(2.25rem, 8vw, 7.5rem)" } : undefined}>{model.name}</h1>
          {model.description && <p className="t-body mt-3 max-w-xl text-ink-soft">{model.description}</p>}
          {studio ? (
            !model.description && <p className="t-body mt-2 max-w-xl text-ink-soft">{buying ? "Monte a estampa com o sobrenome da sua família e compre na hora, na loja Use Origens." : "Monte a estampa com o sobrenome da sua família. A gente prepara e fala com você pelo WhatsApp ou e-mail."}</p>
          ) : (
            <p className="t-body mt-3 max-w-xl" data-testid="customization-intro">
              Envie sua ideia de personalização. Nossa equipe prepara a estampa e entra em contato pelo canal informado quando ela estiver pronta para você realizar a compra. Esta etapa não é uma compra nem reserva um produto.
            </p>
          )}
        </header>

        <div className="min-w-0 lg:col-span-5 lg:col-start-1 lg:row-span-2 lg:row-start-1">
          <div className="lg:sticky lg:top-24">
            {/* On a wide screen the preview, the hint and the colours stay pinned together, so the shirt is sized to the window height. */}
            {studio ? <div className="lg:max-w-[max(20rem,calc(100vh-28rem))]">{previewBlock(false)}</div> : <>
            {/* eslint-disable-next-line @next/next/no-img-element -- a CMS upload served pre-sized from the media origin */}
            <img
              src={mid}
              srcSet={mockup.variants?.map((v) => `${v.src} ${v.w}w`).join(", ")}
              sizes="(min-width: 1024px) 40vw, 100vw"
              width={mockup.width}
              height={mockup.height}
              alt={mockup.alt}
              className="mx-auto h-auto max-h-[70vh] w-full max-w-md bg-ground object-contain"
            />
            <p className="t-caption mt-2 text-center">Imagem ilustrativa. Confira seus dados de personalização.</p>
            </>}
            {studio && fieldMode && showingExample && phase !== "done" && (
              <button type="button" onClick={focusSurname} className="mt-1 min-h-11 text-left text-[0.875rem] font-semibold underline underline-offset-4">É só um exemplo. Escreva o seu sobrenome</button>
            )}
            {studio && phase !== "done" && <div className="mt-2"><ShirtSwatches name={`${uid}-camiseta`} value={shirt} onChange={chooseShirt} colors={colors} /></div>}
          </div>
        </div>

        <div className="min-w-0 lg:col-span-7 lg:col-start-6 lg:row-start-2">
          {phase === "done" && done ? (
            <div className="space-y-6" role="status" aria-live="polite" data-testid="customization-done">
              <div className="border-2 border-ink p-5">
                <p className="t-h3">{done.duplicate ? "Esta solicitação já estava registrada." : "Solicitação recebida!"}</p>
                <p className="t-body mt-2">
                  Sua referência é <strong data-testid="customization-reference">{done.shortReference}</strong>. Vamos preparar sua estampa e entrar em contato pelo WhatsApp ou e-mail informado quando ela estiver pronta para comprar. Nenhuma compra foi realizada nesta etapa.
                </p>
                {done.channels.length > 0 && <p className="t-small mt-2 text-ink-mute" data-testid="customization-channels">Contato informado: {done.channels.join(" · ")}</p>}
                <div className="mt-3 flex flex-wrap gap-3">
                  <button type="button" className="btn" onClick={copy}>{copied ? "Referência copiada" : "Copiar referência"}</button>
                  {referenceUrl && <a className="btn btn-ghost" href={referenceUrl} data-testid="customization-private-link">Ver minha solicitação</a>}
                </div>
              </div>
              <div>
                <h2 className="t-h3">Resumo enviado</h2>
                <dl className="mt-2 divide-y divide-line border-y border-line">
                  {done.summary.map((l, i) => (
                    <div key={i} className="flex justify-between gap-4 py-2"><dt className="min-w-0 text-ink-mute">{l.label}</dt><dd className="min-w-0 text-right font-bold [overflow-wrap:anywhere]">{l.value}</dd></div>
                  ))}
                </dl>
              </div>
              <p className="t-small">
                Isto registra a sua solicitação de criação com a nossa equipe. <strong>Não é uma compra.</strong> Quando a estampa estiver pronta, nossa equipe fala com você e orienta como comprar.
              </p>
              <button type="button" className="btn btn-ghost" onClick={editAgain}>Editar e enviar de novo</button>
            </div>
          ) : (
            <form onSubmit={onSubmit} noValidate className="space-y-6" aria-describedby={`${uid}-notice`}>
              <fieldset disabled={phase === "sending"} className="min-w-0 space-y-6">
              {studio && <div className="space-y-5">{artPickers}</div>}
              {family && (
                <div className="space-y-3" data-testid="family-order">
                  {items.length > 1 && (
                    <div>
                      <p className="t-label">Artes na solicitação</p>
                      <ul className="mt-2 divide-y divide-line border-y border-line">
                        {itemChoices.map((c, i) => (
                          <li key={i} className="flex items-center gap-3 py-2">
                            {/* eslint-disable-next-line @next/next/no-img-element -- a small cached thumbnail served by our own route */}
                            <img src={thumb(c.templateId)} alt="" className="h-11 w-11 shrink-0 object-contain p-1" style={{ backgroundColor: shirtColor(shirt).swatch }} />
                            <span className="min-w-0 flex-1 text-[0.9375rem] font-bold leading-tight">{choiceLabel(c)}{i === active && <span className="block text-[0.8125rem] font-normal text-ink-mute">Na prévia</span>}</span>
                            {i !== active && <button type="button" className="min-h-11 px-2 text-[0.875rem] font-bold underline underline-offset-4" onClick={() => { setActive(i); setBaseError(""); }}>Ver</button>}
                            <button type="button" className="min-h-11 px-2 text-[0.875rem] font-bold text-[#9b1c1c] underline underline-offset-4" onClick={() => removeItem(i)} aria-label={`Tirar ${choiceLabel(c)} da solicitação`}>Tirar</button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {items.length < MAX_FAMILY_ARTS && nextPick && (
                    <div className="flex items-center gap-3">
                      <button type="button" className="btn btn-ghost inline-flex min-w-0 flex-1 items-center justify-center gap-2" onClick={addItem}><PlusIcon />Incluir outra arte com o mesmo sobrenome</button>
                      <InfoTip label="Sobre incluir outra arte">Por exemplo, adulto e infantil para a família toda. Até {MAX_FAMILY_ARTS} artes por solicitação.</InfoTip>
                    </div>
                  )}
                </div>
              )}
              {studio && (fieldMode
                ? surnameStep(false)
                : artworkBase && <ArtworkEditor base={artworkBase} edits={artworkEdits} onChange={setArtworkEdits} errors={errors} uid={uid} />)}
              {!studio && orderedFields(model).map((f) => {
                const id = `${uid}-${f.key}`;
                const value = values.fields[f.key] ?? "";
                return (
                  <div key={f.key}>
                    <label htmlFor={id} className="t-label block">{f.label}{f.required ? <span className="text-[#9b1c1c]"> *</span> : <span className="text-ink-mute"> (opcional)</span>}</label>
                    <input id={id} name={f.key} value={value} onChange={(e) => setField(f.key, e.target.value)} placeholder={f.placeholder} maxLength={f.maxLength + 20} autoComplete="off" className={`${inputClass} mt-1`} aria-invalid={errors[f.key] ? true : undefined} aria-describedby={`${id}-help ${id}-count`} />
                    <div className="mt-1 flex justify-between gap-3 text-[0.8125rem]">
                      <span id={`${id}-help`} className={errors[f.key] ? "font-bold text-[#9b1c1c]" : "text-ink-mute"} role={errors[f.key] ? "alert" : undefined}>{errors[f.key] ?? f.helperText ?? ""}</span>
                      <span id={`${id}-count`} className={[...value].length > f.maxLength ? "font-bold text-[#9b1c1c]" : "text-ink-mute"}>{[...value].length}/{f.maxLength}</span>
                    </div>
                  </div>
                );
              })}

              {g && (
                <fieldset>
                  <legend className="t-label">{g.label}</legend>
                  {g.helperText && <p className="mt-1 text-[0.875rem] text-ink-mute">{g.helperText}</p>}
                  {errors.lines && <p className="mt-1 text-[0.875rem] font-bold text-[#9b1c1c]" role="alert">{errors.lines}</p>}
                  <ol className="mt-3 space-y-3">
                    {values.lines.map((line, i) => {
                      const id = `${uid}-lines-${i}`;
                      const key = `lines.${i}`;
                      return (
                        <li key={i}>
                          <label htmlFor={id} className="text-[0.875rem] font-semibold">{lineLabelOf(model, i)}</label>
                          <div className="mt-1 flex gap-2">
                            <input id={id} value={line} onChange={(e) => setLine(i, e.target.value)} placeholder={g.placeholder} autoComplete="off" className={inputClass} aria-invalid={errors[key] ? true : undefined} aria-describedby={`${id}-msg`} />
                            <button type="button" className="btn btn-ghost shrink-0" onClick={() => removeLine(i)} disabled={values.lines.length <= g.min} aria-label={`Remover ${lineLabelOf(model, i)}`}>Remover</button>
                          </div>
                          <div className="mt-1 flex justify-between gap-3 text-[0.8125rem]">
                            <span id={`${id}-msg`} className={errors[key] ? "font-bold text-[#9b1c1c]" : ""} role={errors[key] ? "alert" : undefined}>{errors[key] ?? ""}</span>
                            <span className={[...line].length > g.maxLength ? "font-bold text-[#9b1c1c]" : "text-ink-mute"}>{[...line].length}/{g.maxLength}</span>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                  <button type="button" className="btn btn-ghost mt-3" onClick={addLine} disabled={values.lines.length >= g.max}>Adicionar linha ({values.lines.length}/{g.max})</button>
                </fieldset>
              )}

              {!buying && <>
              <div className="border-t border-line pt-5">
                <fieldset className="space-y-3" data-testid="contact-fieldset" data-clarity-mask="True">
                  <legend className="t-h3">{studio && arts.length > 1 ? "3. Como falamos com você?" : "Como podemos entrar em contato com você?"}<InfoTip label="Quais contatos informar">O seu nome e pelo menos um canal: WhatsApp ou e-mail (pode ser os dois).</InfoTip></legend>
                  {([
                    { key: "name", errKey: CONTACT_KEYS.name, label: "Nome", required: true, type: "text", autoComplete: "name", inputMode: undefined, placeholder: "Como devemos chamar você" },
                    { key: "whatsapp", errKey: CONTACT_KEYS.whatsapp, label: "WhatsApp", required: false, type: "tel", autoComplete: "tel", inputMode: "tel" as const, placeholder: "(51) 99999-9999" },
                    { key: "email", errKey: CONTACT_KEYS.email, label: "E-mail", required: false, type: "email", autoComplete: "email", inputMode: "email" as const, placeholder: "voce@exemplo.com" },
                  ] as const).map((f) => {
                    const id = `${uid}-${f.errKey.replace(".", "-")}`;
                    return (
                      <div key={f.key}>
                        <label htmlFor={id} className="t-label block">{f.label}{f.required && <span className="text-[#9b1c1c]"> *</span>}</label>
                        <input id={id} name={f.key} type={f.type} inputMode={f.inputMode} autoComplete={f.autoComplete} value={contact[f.key]} onChange={(e) => setContact((c) => ({ ...c, [f.key]: e.target.value }))} placeholder={f.placeholder} maxLength={f.key === "email" ? 254 : 90} className={`${inputClass} mt-1`} aria-invalid={errors[f.errKey] ? true : undefined} aria-describedby={`${id}-msg`} />
                        {errors[f.errKey] && <p id={`${id}-msg`} className="mt-1 text-[0.8125rem] font-bold text-[#9b1c1c]" role="alert">{errors[f.errKey]}</p>}
                      </div>
                    );
                  })}
                  <div>
                    <div className="flex items-start">
                      <label className="flex items-start gap-3">
                        <input id={`${uid}-contact-confirm`} name="contactConfirm" type="checkbox" checked={contact.confirm} onChange={(e) => setContact((c) => ({ ...c, confirm: e.target.checked }))} className="mt-1 h-5 w-5 shrink-0 accent-[var(--color-ink,#000)]" aria-invalid={errors[CONTACT_KEYS.confirm] ? true : undefined} aria-describedby={`${uid}-contact-confirm-msg`} />
                        <span className="t-body">{CONTACT_CONFIRM_TEXT}</span>
                      </label>
                      <span className="mt-0.5 shrink-0"><InfoTip label="Como usamos o seu contato">{CONTACT_NOTICE}</InfoTip></span>
                    </div>
                    {errors[CONTACT_KEYS.confirm] && <p id={`${uid}-contact-confirm-msg`} className="mt-1 text-[0.8125rem] font-bold text-[#9b1c1c]" role="alert">{errors[CONTACT_KEYS.confirm]}</p>}
                  </div>
                </fieldset>
              </div>

              <section aria-labelledby={`${uid}-sum`} className="bg-ground p-4">
                <h2 id={`${uid}-sum`} className="t-h3">Resumo da sua personalização</h2>
                {summary.length === 0 ? <p className="t-small mt-1 text-ink-mute">Preencha os campos para ver o resumo.</p> : (
                  <dl className="mt-2 divide-y divide-line" data-testid="customization-summary">
                    {summary.map((l, i) => <div key={i} className="flex justify-between gap-4 py-1.5"><dt className="min-w-0 text-ink-mute">{l.label}</dt><dd className="min-w-0 text-right font-bold [overflow-wrap:anywhere]">{l.value}</dd></div>)}
                  </dl>
                )}
              </section>
              </>}

              {banner && <p className="border-2 border-[#9b1c1c] bg-white p-3 font-bold text-[#9b1c1c]" role="alert">{banner}</p>}
              {!available && !preview && <p className="border-2 border-ink bg-white p-3" role="status">O envio de solicitações não está disponível neste ambiente.</p>}

              <div>
                <button type="submit" className="btn w-full sm:w-auto" disabled={phase === "sending" || (!available && !preview) || (studio && (!artworkBase || !artworkReady))}>{phase === "sending" ? (buying ? "Começando…" : "Enviando…") : buying ? (items.length > 1 ? `Criar minhas ${items.length} camisetas` : "Criar minha camiseta") : preview ? "Testar o envio (prévia)" : studio ? (items.length > 1 ? `Enviar solicitação (${items.length} artes)` : "Enviar solicitação") : "Enviar solicitação"}</button>
                {buying ? (
                  <p className="t-small mt-3 flex max-w-xl items-center text-ink-mute">
                    <span id={`${uid}-notice`}><strong>A gente cria a sua camiseta</strong> e leva você até ela na loja.</span>
                    <InfoTip label="O que acontece ao criar">Leva cerca de 1 minuto. Na loja Use Origens você escolhe o modelo, o tamanho e a cor e finaliza a compra. Não pedimos endereço, CPF, senha nem dados de pagamento aqui.</InfoTip>
                  </p>
                ) : <p className="t-small mt-3 flex max-w-xl items-center text-ink-mute">
                  <span id={`${uid}-notice`} {...(studio ? { "data-testid": "customization-intro" } : {})}><strong>Não é uma compra:</strong> a gente prepara a estampa e fala com você.</span>
                  <InfoTip label="O que acontece ao enviar">Enviar registra a sua solicitação de criação com a nossa equipe, com o resumo acima. Esta etapa não é uma compra nem reserva um produto. Não pedimos endereço, CPF, senha nem dados de pagamento.</InfoTip>
                </p>}
              </div>
              </fieldset>
            </form>
          )}
        </div>
      </div>

      {studio && (
        // The dialog itself never scrolls (`overflow-clip`): only the body below the header does, so "Pronto" stays on screen. The body is
        // `relative` so the visually hidden radio inputs of the pickers (absolutely positioned) stay inside it; otherwise they stretch the
        // dialog on shorter phones and it scrolls the header away.
        <dialog ref={fullRef} onClose={() => setFull(false)} aria-labelledby={`${uid}-full-title`} className="m-0 h-[100dvh] max-h-none w-full max-w-none overflow-clip bg-ground p-0 text-ink backdrop:bg-black/60 open:flex open:flex-col lg:m-auto lg:h-[92dvh] lg:max-w-xl">
          {full && <>
            <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2">
              <h2 id={`${uid}-full-title`} className="t-h3">Sua estampa</h2>
              <button type="button" className="btn" onClick={() => fullRef.current?.close()}>Pronto</button>
            </div>
            <div className="relative min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 pb-6 pt-3">
              {/* The input first: with the phone keyboard open, the input and the art above it still fit on screen. */}
              {fieldMode && surnameStep(true)}
              <div className="mx-auto w-full" style={{ maxWidth: "min(100%, 36svh)" }}>{previewBlock(true)}</div>
              <div className="mx-auto w-full max-w-[18.5rem]"><ShirtSwatches name={`${uid}-full-camiseta`} value={shirt} onChange={chooseShirt} colors={colors} /></div>
            </div>
          </>}
        </dialog>
      )}

      {buying && (
        <dialog ref={waitRef} onClose={() => setWaiting(null)} aria-labelledby={`${uid}-wait-title`} className="m-0 h-[100dvh] max-h-none w-full max-w-none overflow-clip bg-ground p-0 text-ink backdrop:bg-black/60 open:flex open:flex-col lg:m-auto lg:h-auto lg:max-h-[92dvh] lg:max-w-xl">
          {waiting && <>
            <div className="border-b border-line px-4 py-3"><h2 id={`${uid}-wait-title`} className="t-h3">{waiting.fallback ? "Quase lá" : "Criando a sua camiseta"}</h2></div>
            <div className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-6 pt-4">
              <ProductWaiting items={waiting.items} surname={waiting.surname} showcase={waiting.showcase} bases={bases} loadBase={loadBase ? loadBaseById : undefined} fallback={waiting.fallback} onRequest={requestTeam} onBack={() => waitRef.current?.close()} />
            </div>
          </>}
        </dialog>
      )}
    </div>
  );
}
