"use client";

import { useId, useMemo, useRef, useState } from "react";
import { initialValues, lineLabelOf, normalizeValue, orderedFields, validateSubmission, type FieldError, type SummaryLine, type Values } from "@/lib/customization/validate";
import type { Customizer } from "@/lib/site-config/schema";
import type { SubmitResult } from "@/app/[region]/personalizar/actions";

export type PublicMockup = { src: string; width: number; height: number; variants?: { w: number; src: string }[]; alt: string };
type Submit = (input: { region: string; slug: string; idempotencyKey: string; fields?: unknown; lines?: unknown; replaces?: string }) => Promise<SubmitResult>;

const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().replaceAll("-", "") : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`.padEnd(24, "0"));

/** What the customer has typed so far, in the model's own order and labels (the same text the request will store). Empty values are left out. */
function liveSummary(model: Customizer, v: Values): SummaryLine[] {
  const out: SummaryLine[] = [];
  for (const f of orderedFields(model)) if (v.fields[f.key]?.trim()) out.push({ label: f.label, value: normalizeValue(v.fields[f.key]) });
  v.lines.forEach((l, i) => { if (l.trim()) out.push({ label: lineLabelOf(model, i), value: normalizeValue(l) }); });
  return out;
}

const inputClass = "block w-full min-h-11 border-2 border-ink bg-white px-3 py-2 text-[1rem] text-ink placeholder:text-ink-mute focus:outline-none focus:ring-2 focus:ring-region-primary aria-[invalid=true]:border-[#9b1c1c]";

export function CustomizerForm({
  region, regionName, model, mockup, submit, available, inkProductHref, preview = false,
}: {
  region: string;
  regionName: string;
  model: Customizer;
  mockup: PublicMockup;
  submit: Submit;
  /** False when this environment cannot store requests (no database): the form is shown but sending is disabled and says why. */
  available: boolean;
  /** The chosen INK product, only when the handoff mode allows a separate, clearly-labelled link to it. */
  inkProductHref: string | null;
  /** Admin preview: fully interactive, never sends. */
  preview?: boolean;
}) {
  const uid = useId();
  const [values, setValues] = useState<Values>(() => initialValues(model));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [phase, setPhase] = useState<"idle" | "sending" | "done">("idle");
  const [banner, setBanner] = useState<string | null>(null);
  const [done, setDone] = useState<Extract<SubmitResult, { ok: true }> | null>(null);
  const [copied, setCopied] = useState(false);
  const idem = useRef(newKey());
  const previous = useRef<string | undefined>(undefined);
  const g = model.lineGroup;
  const summary = useMemo(() => liveSummary(model, values), [model, values]);
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
    const checked = validateSubmission(model, { fields: values.fields, lines: values.lines });
    if (!checked.ok) {
      showErrors(checked.errors);
      setBanner("Confira os campos destacados.");
      return;
    }
    setErrors({});
    if (preview) {
      setBanner("Pré-visualização: nada foi enviado.");
      return;
    }
    setPhase("sending");
    try {
      const result = await submit({ region, slug: model.slug, idempotencyKey: idem.current, fields: values.fields, lines: values.lines, replaces: previous.current });
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
      await navigator.clipboard.writeText(done.reference);
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
          </div>
        </div>

        <div className="lg:col-span-7">
          <h1 className="t-h1">{model.name}</h1>
          {model.description && <p className="t-body mt-3 max-w-xl text-ink-soft">{model.description}</p>}

          {phase === "done" && done ? (
            <div className="mt-8 space-y-6" role="status" aria-live="polite" data-testid="customization-done">
              <div className="border-2 border-ink p-5">
                <p className="t-h3">{done.duplicate ? "Esta solicitação já estava registrada." : "Solicitação registrada."}</p>
                <p className="t-body mt-2">Guarde esta referência. Ela é a única forma de consultar a sua solicitação.</p>
                <p className="mt-3 break-all bg-ground px-3 py-2 font-mono text-[1rem] font-bold" data-testid="customization-reference">{done.reference}</p>
                <div className="mt-3 flex flex-wrap gap-3">
                  <button type="button" className="btn" onClick={copy}>{copied ? "Referência copiada" : "Copiar referência"}</button>
                  {referenceUrl && <a className="btn btn-ghost" href={referenceUrl}>Ver minha solicitação</a>}
                </div>
              </div>
              <div>
                <h2 className="t-h3">Resumo enviado</h2>
                <dl className="mt-2 divide-y divide-line border-y border-line">
                  {done.summary.map((l) => (
                    <div key={l.label} className="flex justify-between gap-4 py-2"><dt className="text-ink-mute">{l.label}</dt><dd className="font-bold">{l.value}</dd></div>
                  ))}
                </dl>
              </div>
              <p className="t-small border-l-4 border-region-accent pl-3">
                Isto registra o seu pedido de personalização com a nossa equipe. <strong>Ele não acompanha automaticamente uma compra na loja da INK</strong>: nossa equipe entra em contato para combinar como ligar a personalização à sua compra.
              </p>
              <button type="button" className="btn btn-ghost" onClick={editAgain}>Editar e enviar de novo</button>
            </div>
          ) : (
            <form onSubmit={onSubmit} noValidate className="mt-8 space-y-6" aria-describedby={`${uid}-notice`}>
              {orderedFields(model).map((f) => {
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

              <section aria-labelledby={`${uid}-sum`} className="bg-ground p-4" aria-live="polite">
                <h2 id={`${uid}-sum`} className="t-h3">Resumo da sua personalização</h2>
                {summary.length === 0 ? <p className="t-small mt-1 text-ink-mute">Preencha os campos para ver o resumo.</p> : (
                  <dl className="mt-2 divide-y divide-line" data-testid="customization-summary">
                    {summary.map((l) => <div key={l.label} className="flex justify-between gap-4 py-1.5"><dt className="text-ink-mute">{l.label}</dt><dd className="font-bold">{l.value}</dd></div>)}
                  </dl>
                )}
              </section>

              {banner && <p className="border-l-4 border-[#9b1c1c] bg-white p-3 font-bold" role="alert">{banner}</p>}
              {!available && !preview && <p className="border-l-4 border-ink bg-white p-3" role="status">O envio de solicitações não está disponível neste ambiente.</p>}

              <div>
                <button type="submit" className="btn" disabled={phase === "sending" || (!available && !preview)}>{phase === "sending" ? "Enviando…" : preview ? "Testar o envio (prévia)" : "Enviar solicitação de personalização"}</button>
                <p id={`${uid}-notice`} className="t-small mt-3 max-w-xl text-ink-mute">
                  Enviar registra a sua solicitação com a nossa equipe, com o resumo acima. <strong>A personalização não acompanha automaticamente uma compra na loja da INK.</strong> Não pedimos endereço, CPF, telefone nem dados de pagamento aqui.
                </p>
              </div>
            </form>
          )}

          {inkProductHref && (
            <p className="t-small mt-8 border-t border-line pt-4">
              Só quer ver o produto? <a className="link-line font-semibold" href={inkProductHref} rel="noopener">Abrir na loja Use {regionName} (sem personalização)</a>. O que você digitou aqui <strong>não</strong> é levado para lá.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
