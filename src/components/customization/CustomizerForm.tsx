"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { initialValues, lineLabelOf, normalizeValue, orderedFields, validateSubmission, type FieldError, type SummaryLine, type Values } from "@/lib/customization/validate";
import { CONTACT_CONFIRM_TEXT, CONTACT_KEYS, CONTACT_NOTICE, validateContact } from "@/lib/customization/contact";
import type { Customizer } from "@/lib/site-config/schema";
import type { SubmitResult } from "@/app/[region]/personalizar/actions";
import { artworkFields, composeArtwork, fieldEdits, initialArtworkEdits, initialFieldValues, validateArtworkInput, type ArtworkEdit } from "@/lib/customization/artwork";
import { choiceLabel, choiceOf, studioTemplateIds, type ArtPick } from "@/lib/customization/studio-arts";
import type { PrintProject } from "@/lib/print-studio/model";
import { ArtworkEditor, ArtworkFields } from "./ArtworkEditor";
import { ArtworkPreview, type PreviewView } from "./ArtworkPreview";

/** Fetches another base of the model when the customer picks it: the page ships only the first one (each carries the full-size art). */
export type LoadBase = (input: { region: string; slug: string; templateId: string }) => Promise<PrintProject | null>;
export type PublicMockup = { src: string; width: number; height: number; variants?: { w: number; src: string }[]; alt: string };
type ContactValues = { name: string; whatsapp: string; email: string; confirm: boolean };
type Submit = (input: { region: string; slug: string; idempotencyKey: string; fields?: unknown; lines?: unknown; artwork?: { templateId: string; layers?: unknown; fields?: unknown }; contact?: { name: string; whatsapp: string; email: string; confirm: boolean }; replaces?: string }) => Promise<SubmitResult>;

const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().replaceAll("-", "") : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`.padEnd(24, "0"));

/** What the customer has typed so far, in the model's own order and labels (the same text the request will store). Empty values are left out. */
function liveSummary(model: Customizer, v: Values): SummaryLine[] {
  const out: SummaryLine[] = [];
  for (const f of orderedFields(model)) if (v.fields[f.key]?.trim()) out.push({ label: f.label, value: normalizeValue(v.fields[f.key]) });
  v.lines.forEach((l, i) => { if (l.trim()) out.push({ label: lineLabelOf(model, i), value: normalizeValue(l) }); });
  return out;
}

const SHIRT = { dark: "#242424", light: "#f5f3ef" };
type ChoiceOption = { key: number; label: string; swatch?: string };
/** Radio cards: the picked one is filled. Used for the art, its version and the shirt colour. */
function ChoiceGroup({ legend, name, options, value, onChange, columns = "grid-cols-2 sm:grid-cols-3", help }: { legend: string; name: string; options: ChoiceOption[]; value: number; onChange: (key: number) => void; columns?: string; help?: string }) {
  return (
    <fieldset className="min-w-0">
      <legend className="t-label">{legend}</legend>
      <div className={`mt-2 grid gap-2 ${columns}`}>
        {options.map((o) => (
          <label key={o.key} className={`flex min-h-11 cursor-pointer items-center gap-2 border-2 px-3 py-2 text-[0.9375rem] leading-tight focus-within:ring-2 focus-within:ring-region-primary ${o.key === value ? "border-ink bg-ink text-white" : "border-line bg-white text-ink hover:border-ink"}`}>
            <input type="radio" name={name} checked={o.key === value} onChange={() => onChange(o.key)} className="sr-only" />
            {o.swatch && <span aria-hidden="true" className="h-5 w-5 shrink-0 rounded-full border border-ink-mute" style={{ backgroundColor: o.swatch }} />}
            <span className="font-bold">{o.label}</span>
          </label>
        ))}
      </div>
      {help && <p className="t-small mt-1 text-ink-mute">{help}</p>}
    </fieldset>
  );
}

const inputClass = "block w-full min-h-11 border-2 border-ink bg-white px-3 py-2 text-[1rem] text-ink placeholder:text-ink-mute focus:outline-none focus:ring-2 focus:ring-region-primary aria-[invalid=true]:border-[#9b1c1c]";

export function CustomizerForm({
  region, model, mockup, firstBase, loadBase, submit, available, preview = false,
}: {
  region: string;
  model: Customizer;
  mockup: PublicMockup;
  /** The base of the model's first art (dark shirt): with it, the page is the art editor instead of the text form. */
  firstBase?: PrintProject;
  loadBase?: LoadBase;
  submit: Submit;
  /** False when this environment cannot store requests (no database): the form is shown but sending is disabled and says why. */
  available: boolean;
  /** Admin preview: fully interactive, never sends. */
  preview?: boolean;
}) {
  const uid = useId();
  const arts = useMemo(() => (firstBase && model.studioArts?.length ? model.studioArts : []), [firstBase, model.studioArts]);
  const studio = arts.length > 0;
  const [pick, setPick] = useState<ArtPick>({ art: 0, version: 0, light: false });
  const choice = useMemo(() => (studio ? choiceOf(arts, pick) : null), [studio, arts, pick]);
  const templateId = choice?.templateId;
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
  const [fieldValues, setFieldValues] = useState(() => firstBase && studio ? initialFieldValues(firstBase) : {});
  const [artworkReady, setArtworkReady] = useState(false);
  const fieldMode = Boolean(firstBase && studio && artworkFields(firstBase).length);
  const artworkInput = fieldMode ? { fields: fieldValues } : { layers: artworkEdits };
  const artworkProject = useMemo(() => artworkBase ? composeArtwork(artworkBase, fieldMode ? fieldEdits(artworkBase, fieldValues) : artworkEdits) : null, [artworkBase, fieldMode, fieldValues, artworkEdits]);
  const choose = (next: ArtPick) => { setPick(next); setBaseError(""); };
  const [previewView, setPreviewView] = useState<PreviewView>("shirt");
  // Art, version and shirt colour. On a phone they sit right under the preview, so each tap shows its effect; on a wide screen, in the form.
  const pickers = (where: string) => choice && (
    <>
      {arts.length > 1 && <ChoiceGroup legend="Escolha a arte" name={`${uid}-${where}-arte`} options={arts.map((a, i) => ({ key: i, label: a.label }))} value={pick.art} onChange={(art) => choose({ ...pick, art, version: 0 })} />}
      {choice.art.versions.length > 1 && <ChoiceGroup legend="Versão" name={`${uid}-${where}-versao`} options={choice.art.versions.map((v, i) => ({ key: i, label: v.label ?? `Versão ${i + 1}` }))} value={pick.version} onChange={(version) => choose({ ...pick, version })} columns="grid-cols-1 sm:grid-cols-2" />}
      {choice.version.lightTemplateId && <ChoiceGroup legend="Cor da camiseta" name={`${uid}-${where}-camiseta`} options={[{ key: 0, label: "Camiseta escura", swatch: SHIRT.dark }, { key: 1, label: "Camiseta clara", swatch: SHIRT.light }]} value={pick.light ? 1 : 0} onChange={(key) => choose({ ...pick, light: key === 1 })} columns="grid-cols-2" help="A arte muda de cor para combinar com a camiseta." />}
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
    const picked = studioTemplateIds(model).length > 1 ? [{ label: "Arte escolhida", value: choiceLabel(choice) }] : [];
    if (!artworkBase) return picked;
    const checked = validateArtworkInput(artworkBase, choice.templateId, fieldMode ? { fields: fieldValues } : { layers: artworkEdits });
    if (checked.ok && checked.artwork.fields) return [...picked, ...checked.artwork.fields.map((f) => ({ label: f.label, value: f.value })), ...checked.artwork.layers.map((l) => ({ label: "Texto na arte", value: l.text }))];
    return checked.ok ? [...picked, ...checked.artwork.layers.flatMap((l, i) => [{ label: `${i + 1}. ${l.name}`, value: l.text }, { label: `${i + 1}. Fonte e cor`, value: `${l.fontName} · ${l.color.toUpperCase()}` }])] : picked;
  }, [model, values, studio, choice, artworkBase, fieldMode, fieldValues, artworkEdits]);
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
      const result = await submit({ region, slug: model.slug, idempotencyKey: idem.current, fields: values.fields, lines: values.lines, ...(studio && templateId ? { artwork: { templateId, ...artworkInput } } : {}), contact, replaces: previous.current });
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
  return (
    <div className="wrap py-8 lg:py-14">
      <div className="grid gap-8 lg:grid-cols-12 lg:gap-12">
        <div className="lg:col-span-5">
          <div className="lg:sticky lg:top-24">
            {studio ? (artworkProject ? <ArtworkPreview key={templateId} project={artworkProject} onReady={setArtworkReady} view={previewView} onViewChange={setPreviewView} shirt={choice?.version.lightTemplateId ? (choice.light ? SHIRT.light : SHIRT.dark) : undefined} /> : (
              <div className={`mt-[52px] flex w-full items-center justify-center bg-[#242424] p-6 text-center text-white ${previewView === "shirt" ? "aspect-[80/84]" : "aspect-[4270/4900]"}`} role="status" aria-live="polite">{baseError || "Carregando a arte…"}</div>
            )) : <>
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
            {studio && phase !== "done" && <div className="mt-6 space-y-5 lg:hidden">{pickers("topo")}</div>}
          </div>
        </div>

        <div className="lg:col-span-7">
          <h1 className="t-h1">{model.name}</h1>
          {model.description && <p className="t-body mt-3 max-w-xl text-ink-soft">{model.description}</p>}
          <p className="t-body mt-3 max-w-xl" data-testid="customization-intro">
            Envie sua ideia de personalização. Nossa equipe prepara a estampa e entra em contato pelo canal informado quando ela estiver pronta para você realizar a compra. Esta etapa não é uma compra nem reserva um produto.
          </p>

          {phase === "done" && done ? (
            <div className="mt-8 space-y-6" role="status" aria-live="polite" data-testid="customization-done">
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
                  {done.summary.map((l) => (
                    <div key={l.label} className="flex justify-between gap-4 py-2"><dt className="min-w-0 text-ink-mute">{l.label}</dt><dd className="min-w-0 text-right font-bold [overflow-wrap:anywhere]">{l.value}</dd></div>
                  ))}
                </dl>
              </div>
              <p className="t-small border-l-4 border-region-accent pl-3">
                Isto registra a sua solicitação de criação com a nossa equipe. <strong>Não é uma compra.</strong> Quando a estampa estiver pronta, nossa equipe fala com você e orienta como comprar.
              </p>
              <button type="button" className="btn btn-ghost" onClick={editAgain}>Editar e enviar de novo</button>
            </div>
          ) : (
            <form onSubmit={onSubmit} noValidate className="mt-8 space-y-6" aria-describedby={`${uid}-notice`}>
              <fieldset disabled={phase === "sending"} className="min-w-0 space-y-6">
              <div className="hidden space-y-6 lg:block">{pickers("form")}</div>
              {studio && (fieldMode
                ? <ArtworkFields base={firstBase!} values={fieldValues} onChange={setFieldValues} errors={errors} uid={uid} />
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

              <fieldset className="space-y-4 border-t border-line pt-6" data-testid="contact-fieldset" data-clarity-mask="True">
                <legend className="t-h3">Como podemos entrar em contato com você?</legend>
                <p className="t-small text-ink-mute">Informe o seu nome e pelo menos um canal: WhatsApp ou e-mail (pode ser os dois).</p>
                {([
                  { key: "name", errKey: CONTACT_KEYS.name, label: "Nome", required: true, type: "text", autoComplete: "name", inputMode: undefined, placeholder: "Como devemos chamar você" },
                  { key: "whatsapp", errKey: CONTACT_KEYS.whatsapp, label: "WhatsApp", required: false, type: "tel", autoComplete: "tel", inputMode: "tel" as const, placeholder: "(51) 99999-9999" },
                  { key: "email", errKey: CONTACT_KEYS.email, label: "E-mail", required: false, type: "email", autoComplete: "email", inputMode: "email" as const, placeholder: "voce@exemplo.com" },
                ] as const).map((f) => {
                  const id = `${uid}-${f.errKey.replace(".", "-")}`;
                  return (
                    <div key={f.key}>
                      <label htmlFor={id} className="t-label block">{f.label}{f.required ? <span className="text-[#9b1c1c]"> *</span> : <span className="text-ink-mute"> (opcional se informar o outro)</span>}</label>
                      <input id={id} name={f.key} type={f.type} inputMode={f.inputMode} autoComplete={f.autoComplete} value={contact[f.key]} onChange={(e) => setContact((c) => ({ ...c, [f.key]: e.target.value }))} placeholder={f.placeholder} maxLength={f.key === "email" ? 254 : 90} className={`${inputClass} mt-1`} aria-invalid={errors[f.errKey] ? true : undefined} aria-describedby={`${id}-msg`} />
                      <p id={`${id}-msg`} className={`mt-1 min-h-[1.25rem] text-[0.8125rem] ${errors[f.errKey] ? "font-bold text-[#9b1c1c]" : ""}`} role={errors[f.errKey] ? "alert" : undefined}>{errors[f.errKey] ?? ""}</p>
                    </div>
                  );
                })}
                <div>
                  <label className="flex items-start gap-3">
                    <input id={`${uid}-contact-confirm`} name="contactConfirm" type="checkbox" checked={contact.confirm} onChange={(e) => setContact((c) => ({ ...c, confirm: e.target.checked }))} className="mt-1 h-5 w-5 shrink-0 accent-[var(--color-ink,#000)]" aria-invalid={errors[CONTACT_KEYS.confirm] ? true : undefined} aria-describedby={`${uid}-contact-confirm-msg`} />
                    <span className="t-body">{CONTACT_CONFIRM_TEXT}</span>
                  </label>
                  <p className="t-small mt-1 text-ink-mute">{CONTACT_NOTICE}</p>
                  <p id={`${uid}-contact-confirm-msg`} className={`mt-1 min-h-[1.25rem] text-[0.8125rem] ${errors[CONTACT_KEYS.confirm] ? "font-bold text-[#9b1c1c]" : ""}`} role={errors[CONTACT_KEYS.confirm] ? "alert" : undefined}>{errors[CONTACT_KEYS.confirm] ?? ""}</p>
                </div>
              </fieldset>

              <section aria-labelledby={`${uid}-sum`} className="bg-ground p-4" aria-live="polite">
                <h2 id={`${uid}-sum`} className="t-h3">Resumo da sua personalização</h2>
                {summary.length === 0 ? <p className="t-small mt-1 text-ink-mute">Preencha os campos para ver o resumo.</p> : (
                  <dl className="mt-2 divide-y divide-line" data-testid="customization-summary">
                    {summary.map((l) => <div key={l.label} className="flex justify-between gap-4 py-1.5"><dt className="min-w-0 text-ink-mute">{l.label}</dt><dd className="min-w-0 text-right font-bold [overflow-wrap:anywhere]">{l.value}</dd></div>)}
                  </dl>
                )}
              </section>

              {banner && <p className="border-l-4 border-[#9b1c1c] bg-white p-3 font-bold" role="alert">{banner}</p>}
              {!available && !preview && <p className="border-l-4 border-ink bg-white p-3" role="status">O envio de solicitações não está disponível neste ambiente.</p>}

              <div>
                <button type="submit" className="btn" disabled={phase === "sending" || (!available && !preview) || (studio && (!artworkBase || !artworkReady))}>{phase === "sending" ? "Enviando…" : preview ? "Testar o envio (prévia)" : studio ? "Salvar e enviar solicitação" : "Enviar solicitação"}</button>
                <p id={`${uid}-notice`} className="t-small mt-3 max-w-xl text-ink-mute">
                  Enviar registra a sua solicitação de criação com a nossa equipe, com o resumo acima. <strong>Esta etapa não é uma compra e não reserva um produto.</strong> Não pedimos endereço, CPF, senha nem dados de pagamento.
                </p>
              </div>
              </fieldset>
            </form>
          )}

        </div>
      </div>
    </div>
  );
}
