"use client";

import { useEffect, useMemo, useState } from "react";
import { carryCampaign } from "@/lib/analytics/campaign";
import { CONTACT_CONFIRM_TEXT, CONTACT_KEYS, CONTACT_NOTICE } from "@/lib/customization/contact";
import { composeArtwork, fieldEdits } from "@/lib/customization/artwork";
import { isTerminal, type PublicProductJob } from "@/lib/customization/product-status";
import { track, untrack, updateTracked } from "@/lib/customization/product-tracker";
import { shirtColorsFor } from "@/lib/customization/shirts";
import type { PrintProject } from "@/lib/print-studio/model";
import { ArtworkPreview } from "./ArtworkPreview";
import { Check, ProductSteps, Star } from "./ProductSteps";
import { InfoTip } from "./InfoTip";

export type ContactValues = { name: string; whatsapp: string; email: string; confirm: boolean };
export type RequestOutcome = { ok: true; channels: string[] } | { ok: false; message: string; errors: Record<string, string> };
/** The art drawn on the showcase: the version's two bases (the "light shirts" one is optional) and what was typed. */
export type Showcase = { templateId: string; lightTemplateId?: string; fields: Record<string, string>; kids: boolean };

const POLL_MS = 2_500;
const SPIN_MS = 2_000;
const REDIRECT_MS = 2_000;
/** Past this, the page offers the team's link while it keeps following the job. */
const SLOW_MS = 180_000;
const inputClass = "block w-full min-h-11 border-2 border-ink bg-white px-3 py-2 text-[1rem] text-ink placeholder:text-ink-mute focus:outline-none focus:ring-2 focus:ring-region-primary aria-[invalid=true]:border-[#9b1c1c]";

/**
 * The waiting screen of a direct purchase: the customer's own art turning through the shirt colours (only the garment's), the real steps of the job
 * (drawn, created at the store, photos, opening), then INK's page — with the campaign of the visit carried — after a short "Pronto!". A failed job,
 * a very slow one or the customer's own choice opens the team's way: a short contact form that registers the usual request, while the job goes on
 * ("Continuar aguardando"). The jobs are also kept in this browser (product-tracker.ts): "Continuar navegando" closes the screen and the floating
 * tracker follows them on every page of the site.
 */
export function ProductWaiting({ items: initial, surname, showcase, bases, loadBase, fallback, onRequest, onClose, onCancel }: {
  items: PublicProductJob[];
  surname: string;
  showcase: Showcase | null;
  bases: Record<string, PrintProject>;
  loadBase?: (templateId: string) => Promise<PrintProject | null>;
  /** Set when the start already said "the team does this one" (a name to review, the day's limit, an error). */
  fallback: string | null;
  onRequest: (contact: ContactValues) => Promise<RequestOutcome>;
  /** "Continuar navegando": closes the screen while the jobs go on (the floating tracker takes over). */
  onClose: () => void;
  /**
   * "Cancelar e editar": the customer gives up on this order (a typo): it leaves the tracker and the page goes back to the name. The job itself is not
   * stopped: another customer with the same name may be waiting for it, and a product nobody opens stays hidden at INK.
   */
  onCancel: () => void;
}) {
  const [jobs, setJobs] = useState(initial);
  const [started] = useState(() => Date.now());
  const [now, setNow] = useState(started);
  const [askTeam, setAskTeam] = useState<string | null>(fallback);
  const pending = jobs.some((j) => !isTerminal(j.status));
  useEffect(() => { if (initial.length) track(initial, surname); }, [initial, surname]);

  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(async () => {
      setNow(Date.now());
      const next = await Promise.all(jobs.map(async (j) => {
        if (isTerminal(j.status)) return j;
        try {
          const res = await fetch(`/api/personalizar/produto/${j.id}`, { cache: "no-store" });
          return res.ok ? ((await res.json()) as PublicProductJob) : j;
        } catch {
          return j;
        }
      }));
      setJobs(next);
      next.forEach(updateTracked);
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [jobs, pending]);

  const broken = jobs.some((j) => j.status === "failed" || j.status === "check");
  const slow = pending && now - started > SLOW_MS;
  const ready = jobs.length > 0 && jobs.every((j) => j.status === "ready" && j.url);
  const single = jobs.length === 1 ? jobs[0] : null;

  // One product: off to INK a moment after "Pronto!" (the button stays, in case a browser in an app blocks it).
  useEffect(() => {
    if (!ready || !single?.url || askTeam) return;
    const timer = setTimeout(() => { untrack(single.id); window.location.assign(carryCampaign(single.url!)); }, REDIRECT_MS);
    return () => clearTimeout(timer);
  }, [ready, single, askTeam]);

  // The showcase: both bases of the version, so each colour gets its own art (dark ink on white, grey and yellow).
  const [loaded, setLoaded] = useState(bases);
  useEffect(() => {
    if (!showcase || !loadBase) return;
    for (const id of [showcase.templateId, showcase.lightTemplateId].filter((x): x is string => Boolean(x))) {
      if (!loaded[id]) loadBase(id).then((p) => p && setLoaded((all) => ({ ...all, [id]: p }))).catch(() => undefined);
    }
  }, [showcase, loadBase, loaded]);
  const colors = useMemo(() => shirtColorsFor(showcase?.kids ?? false), [showcase]);
  const [spin, setSpin] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setSpin((s) => s + 1), SPIN_MS);
    return () => clearInterval(timer);
  }, []);
  const color = colors[spin % colors.length];
  const project = useMemo(() => {
    if (!showcase) return null;
    const base = (color.light && showcase.lightTemplateId && loaded[showcase.lightTemplateId]) || loaded[showcase.templateId];
    return base ? composeArtwork(base, fieldEdits(base, showcase.fields)) : null;
  }, [showcase, color, loaded]);

  const running = jobs.length > 0 && !broken;
  const cancel = () => { jobs.forEach((j) => untrack(j.id)); onCancel(); };

  return (
    <div className="space-y-5">
      {project && !askTeam && (
        <div className="mx-auto w-full" style={{ maxWidth: "min(100%, 34svh)" }}>
          <ArtworkPreview project={project} shirt={color.id} compact controls={false} />
          <p className="t-small mt-1 text-center text-ink-mute" aria-hidden="true">Camiseta {color.label.toLowerCase()}</p>
        </div>
      )}

      {askTeam ? (
        <TeamRequest message={askTeam} onRequest={onRequest} {...(running ? { onKeepWaiting: () => setAskTeam(null) } : {})} />
      ) : ready && single ? (
        <div className="space-y-3 text-center" role="status">
          <p className="t-h3">Pronto! Abrindo a sua camiseta na loja…</p>
          <a className="btn w-full" href={carryCampaign(single.url!)} onClick={() => untrack(single.id)}>Ver minha camiseta</a>
          <p className="t-small text-ink-mute">Na loja você escolhe o modelo, o tamanho e a cor.</p>
        </div>
      ) : single ? (
        <div className="space-y-3">
          <ProductSteps status={single.status} surname={surname} />
          <p className="t-small text-ink-mute">Leva cerca de 1 minuto. Pode continuar navegando: a gente avisa quando ficar pronta.</p>
        </div>
      ) : (
        <ul className="divide-y divide-line border-y border-line" aria-live="polite">
          {jobs.map((j) => (
            <li key={j.id} className="flex items-center gap-3 py-2">
              {j.status === "ready" ? <Check /> : <Star on={!isTerminal(j.status)} />}
              <span className="min-w-0 flex-1 font-bold leading-tight">{j.label}<span className="block text-[0.8125rem] font-normal text-ink-mute">{j.status === "ready" ? "Pronta" : isTerminal(j.status) ? "A equipe vai cuidar desta" : "Criando…"}</span></span>
              {j.status === "ready" && j.url && <a className="btn btn-ghost shrink-0" href={carryCampaign(j.url)} onClick={() => untrack(j.id)}>Ver</a>}
            </li>
          ))}
        </ul>
      )}

      {!askTeam && !ready && (broken || slow) && (
        <p className="border-2 border-ink bg-white p-3 text-[0.9375rem]" role="status">
          {broken ? "Não deu para criar a camiseta agora." : "Está demorando mais que o normal."}{" "}
          <button type="button" className="font-bold underline underline-offset-4" onClick={() => setAskTeam(broken ? "Não deu para criar a camiseta agora. Deixe o seu contato e a gente manda o link." : "Deixe o seu contato e a gente manda o link assim que ficar pronta.")}>Receber o link da equipe</button>
        </p>
      )}

      {running && !ready ? (
        <div className="space-y-2 border-t border-line pt-4">
          <button type="button" className="btn btn-ghost w-full" onClick={onClose}>Continuar navegando</button>
          <div className="flex flex-wrap items-center justify-between gap-x-4">
            <button type="button" className="min-h-11 text-[0.9375rem] underline underline-offset-4" onClick={cancel}>Cancelar e editar</button>
            {!askTeam && <button type="button" className="min-h-11 text-[0.9375rem] underline underline-offset-4" onClick={() => setAskTeam("Deixe o seu contato e a gente manda o link pelo WhatsApp ou e-mail. A sua camiseta continua sendo criada.")}>Prefere receber o link?</button>}
          </div>
        </div>
      ) : (
        <div className="border-t border-line pt-4">
          <button type="button" className="min-h-11 font-bold underline underline-offset-4" onClick={cancel}>Voltar e editar</button>
        </div>
      )}
    </div>
  );
}

/** The team's way: name and one channel, the confirmation, and the usual request is registered. */
function TeamRequest({ message, onRequest, onKeepWaiting }: { message: string; onRequest: (contact: ContactValues) => Promise<RequestOutcome>; onKeepWaiting?: () => void }) {
  const [contact, setContact] = useState<ContactValues>({ name: "", whatsapp: "", email: "", confirm: false });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [phase, setPhase] = useState<"idle" | "sending" | "done">("idle");
  const [banner, setBanner] = useState("");
  const [channels, setChannels] = useState<string[]>([]);
  if (phase === "done") {
    return (
      <div className="border-2 border-ink p-4" role="status">
        <p className="t-h3">Recebido!</p>
        <p className="t-body mt-1">A nossa equipe vai mandar o link da sua camiseta{channels.length ? ` (${channels.join(" · ")})` : ""}.</p>
        {onKeepWaiting && <button type="button" className="btn btn-ghost mt-3 w-full" onClick={onKeepWaiting}>Continuar aguardando</button>}
      </div>
    );
  }
  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setPhase("sending");
    setBanner("");
    const out = await onRequest(contact).catch((): RequestOutcome => ({ ok: false, message: "A conexão caiu. Tente de novo.", errors: {} }));
    if (out.ok) { setChannels(out.channels); setPhase("done"); return; }
    setErrors(out.errors);
    setBanner(out.message);
    setPhase("idle");
  };
  const field = (key: "name" | "whatsapp" | "email", label: string, errKey: string, props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <div>
      <label htmlFor={`team-${key}`} className="t-label block">{label}</label>
      <input id={`team-${key}`} className={`${inputClass} mt-1`} value={contact[key]} onChange={(e) => setContact((c) => ({ ...c, [key]: e.target.value }))} aria-invalid={errors[errKey] ? true : undefined} {...props} />
      {errors[errKey] && <p className="mt-1 text-[0.8125rem] font-bold text-[#9b1c1c]" role="alert">{errors[errKey]}</p>}
    </div>
  );
  return (
    <form onSubmit={send} noValidate className="space-y-3" data-clarity-mask="True">
      <p className="t-body font-bold">{message}</p>
      {field("name", "Nome", CONTACT_KEYS.name, { autoComplete: "name", maxLength: 90, placeholder: "Como devemos chamar você" })}
      {field("whatsapp", "WhatsApp", CONTACT_KEYS.whatsapp, { type: "tel", inputMode: "tel", autoComplete: "tel", maxLength: 90, placeholder: "(51) 99999-9999" })}
      {field("email", "E-mail", CONTACT_KEYS.email, { type: "email", inputMode: "email", autoComplete: "email", maxLength: 254, placeholder: "voce@exemplo.com" })}
      <div className="flex items-start">
        <label className="flex items-start gap-3">
          <input type="checkbox" checked={contact.confirm} onChange={(e) => setContact((c) => ({ ...c, confirm: e.target.checked }))} className="mt-1 h-5 w-5 shrink-0 accent-[var(--color-ink,#000)]" aria-invalid={errors[CONTACT_KEYS.confirm] ? true : undefined} />
          <span className="t-body">{CONTACT_CONFIRM_TEXT}</span>
        </label>
        <span className="mt-0.5 shrink-0"><InfoTip label="Como usamos o seu contato">{CONTACT_NOTICE}</InfoTip></span>
      </div>
      {errors[CONTACT_KEYS.confirm] && <p className="text-[0.8125rem] font-bold text-[#9b1c1c]" role="alert">{errors[CONTACT_KEYS.confirm]}</p>}
      {banner && <p className="border-2 border-[#9b1c1c] bg-white p-3 font-bold text-[#9b1c1c]" role="alert">{banner}</p>}
      <button type="submit" className="btn w-full" disabled={phase === "sending"}>{phase === "sending" ? "Enviando…" : "Receber o link"}</button>
      {onKeepWaiting && <button type="button" className="btn btn-ghost w-full" onClick={onKeepWaiting}>Continuar aguardando</button>}
    </form>
  );
}
