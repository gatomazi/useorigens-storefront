"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { PartnerSubmitResult } from "@/app/[region]/seja-parceiro/actions";
import { submitPartnerAction } from "@/app/[region]/seja-parceiro/actions";
import {
  MAX_MESSAGE,
  PARTNER_CONFIRM_TEXT,
  PARTNER_KEYS,
  PARTNER_NOTICE,
  PARTNER_PROFILES,
  PROFILE_LABEL,
  PROFILE_SLUG,
  validatePartnerApplication,
  type PartnerProfile,
} from "@/lib/partners/application";
import type { RegionSlug } from "@/lib/geo/regions";

const inputClass = "block w-full min-h-11 border-2 border-ink bg-white px-3 py-2 text-[1rem] text-ink placeholder:text-ink-mute focus:outline-none focus:ring-2 focus:ring-region-primary aria-[invalid=true]:border-[#9b1c1c]";
const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().replaceAll("-", "") : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`.padEnd(24, "0"));

/** `#quero-artista` (the profile sections' buttons) as the profile it preselects. */
const profileOfHash = (hash: string): PartnerProfile | null => PARTNER_PROFILES.find((p) => hash === `#quero-${PROFILE_SLUG[p]}`) ?? null;

type Fields = { name: string; whatsapp: string; email: string; city: string; instagram: string; followers: string; message: string };
const EMPTY: Fields = { name: "", whatsapp: "", email: "", city: "", instagram: "", followers: "", message: "" };

/**
 * The application form of the "Seja parceiro" page. It checks with the same rules as the server (src/lib/partners/application.ts) and shows each
 * message under its field; the server checks again and keeps the application (submitPartnerAction). `available` false: the environment has no
 * store, the form says so instead of pretending to send.
 */
export function PartnerForm({ region, available, blurbs }: { region: RegionSlug; available: boolean; blurbs: Record<PartnerProfile, string> }) {
  const uid = useId();
  const [profile, setProfile] = useState<PartnerProfile | null>(null);
  const [fields, setFields] = useState<Fields>(EMPTY);
  const [confirm, setConfirm] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "sending" | "done">("idle");
  const [firstName, setFirstName] = useState("");
  const key = useRef<string | null>(null);
  const honeypot = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const doneRef = useRef<HTMLDivElement>(null);

  // The profile buttons above link to #quero-<perfil>: the form opens with that profile chosen.
  useEffect(() => {
    const pick = () => {
      const p = profileOfHash(window.location.hash);
      if (p) setProfile(p);
    };
    pick();
    window.addEventListener("hashchange", pick);
    return () => window.removeEventListener("hashchange", pick);
  }, []);
  useEffect(() => {
    if (phase === "done") doneRef.current?.focus();
  }, [phase]);

  const set = (k: keyof Fields) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setFields((f) => ({ ...f, [k]: e.target.value }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (phase === "sending") return;
    const input = { ...fields, profile: profile ?? undefined, confirm };
    const checked = validatePartnerApplication(input);
    if (!checked.ok) {
      setErrors(Object.fromEntries(checked.errors.map((x) => [x.key, x.message])));
      setBanner("Confira os campos destacados.");
      formRef.current?.querySelector<HTMLElement>("[aria-invalid=true], [data-invalid=true]")?.focus();
      return;
    }
    setErrors({});
    setBanner(null);
    setPhase("sending");
    key.current ??= newKey();
    let result: PartnerSubmitResult;
    try {
      result = await submitPartnerAction({ ...input, region, idempotencyKey: key.current, website: honeypot.current?.value ?? "" });
    } catch {
      result = { ok: false, errors: [], message: "Não foi possível enviar agora. Confira a sua conexão e tente de novo." };
    }
    if (result.ok) {
      setFirstName(result.firstName);
      setPhase("done");
      return;
    }
    setErrors(Object.fromEntries(result.errors.map((x) => [x.key, x.message])));
    setBanner(result.message);
    setPhase("idle");
  }

  if (phase === "done") {
    return (
      <div ref={doneRef} tabIndex={-1} className="border-2 border-ink bg-white p-6 focus:outline-none lg:p-8" role="status" data-testid="partner-done">
        <p className="t-h2">Inscrição recebida{firstName ? `, ${firstName}` : ""}!</p>
        <p className="t-body mt-3 text-ink-soft">
          A equipe vai olhar com calma o seu perfil. Se fizer sentido para os dois lados, a gente chama você no WhatsApp para conversar sobre a parceria.
        </p>
      </div>
    );
  }

  const msg = (k: string) => (
    <p id={`${uid}-${k}-msg`} className={`mt-1 min-h-[1.25rem] text-[0.8125rem] ${errors[k] ? "font-bold text-[#9b1c1c]" : ""}`} role={errors[k] ? "alert" : undefined}>
      {errors[k] ?? ""}
    </p>
  );
  const field = (k: keyof Fields, label: string, opts: { required?: boolean; type?: string; inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"]; autoComplete?: string; placeholder?: string; maxLength?: number; hint?: string }) => {
    const id = `${uid}-${k}`;
    return (
      <div>
        <label htmlFor={id} className="t-label block">
          {label}
          {opts.required ? <span className="text-[#9b1c1c]"> *</span> : <span className="font-normal text-ink-mute"> (opcional)</span>}
        </label>
        {opts.hint && <p className="t-caption mt-0.5">{opts.hint}</p>}
        <input
          id={id}
          name={k}
          type={opts.type ?? "text"}
          inputMode={opts.inputMode}
          autoComplete={opts.autoComplete ?? "off"}
          value={fields[k]}
          onChange={set(k)}
          placeholder={opts.placeholder}
          maxLength={opts.maxLength ?? 90}
          required={opts.required}
          className={`${inputClass} mt-1`}
          aria-invalid={errors[PARTNER_KEYS[k]] ? true : undefined}
          aria-describedby={`${uid}-${PARTNER_KEYS[k]}-msg`}
        />
        {msg(PARTNER_KEYS[k])}
      </div>
    );
  };

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate className="space-y-6" data-testid="partner-form" data-clarity-mask="True">
      {PARTNER_PROFILES.map((p) => <span key={p} id={`quero-${PROFILE_SLUG[p]}`} className="block scroll-mt-[calc(var(--header-h)+2rem)]" aria-hidden="true" />)}
      <fieldset aria-describedby={`${uid}-${PARTNER_KEYS.profile}-msg`}>
        <legend className="t-label">
          Qual é o seu perfil?<span className="text-[#9b1c1c]"> *</span>
        </legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {PARTNER_PROFILES.map((p) => (
            <label key={p} className="flex cursor-pointer items-start gap-3 border-2 border-ink bg-white p-3 transition-colors has-[:checked]:bg-ink has-[:checked]:text-white has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-region-primary has-[:focus-visible]:ring-offset-2">
              <input type="radio" name="profile" value={p} checked={profile === p} onChange={() => setProfile(p)} className="mt-1 h-4 w-4 shrink-0 accent-white" data-invalid={errors[PARTNER_KEYS.profile] ? true : undefined} />
              <span>
                <span className="block font-bold">{PROFILE_LABEL[p]}</span>
                <span className="block text-[0.875rem] leading-snug opacity-80">{blurbs[p]}</span>
              </span>
            </label>
          ))}
        </div>
        {msg(PARTNER_KEYS.profile)}
      </fieldset>

      <div className="grid gap-x-4 sm:grid-cols-2">
        {field("name", "Seu nome", { required: true, autoComplete: "name", placeholder: "Como devemos chamar você" })}
        {field("city", "Sua cidade", { required: true, autoComplete: "address-level2", placeholder: "Ex.: Joinville - SC", maxLength: 100 })}
        {field("whatsapp", "WhatsApp", { required: true, type: "tel", inputMode: "tel", autoComplete: "tel", placeholder: "(48) 99999-9999" })}
        {field("email", "E-mail", { type: "email", inputMode: "email", autoComplete: "email", placeholder: "voce@exemplo.com", maxLength: 254 })}
        {field("instagram", "@ do Instagram", { placeholder: "@seuperfil", maxLength: 120 })}
        {field("followers", "Seguidores", { inputMode: "numeric", placeholder: "Ex.: 12 mil", maxLength: 20 })}
      </div>

      <div>
        <label htmlFor={`${uid}-message`} className="t-label block">
          Fala com a gente<span className="font-normal text-ink-mute"> (opcional)</span>
        </label>
        <p className="t-caption mt-0.5">O que você faz, por que a sua cidade, a ideia que você tem. Artista: mande o link do portfólio.</p>
        <textarea
          id={`${uid}-message`}
          name="message"
          rows={4}
          value={fields.message}
          onChange={set("message")}
          maxLength={MAX_MESSAGE + 50}
          className={`${inputClass} mt-1 resize-y`}
          aria-invalid={errors[PARTNER_KEYS.message] ? true : undefined}
          aria-describedby={`${uid}-${PARTNER_KEYS.message}-msg`}
        />
        <div className="flex justify-between gap-3">
          {msg(PARTNER_KEYS.message)}
          <p className="t-caption mt-1 shrink-0 tabular-nums" aria-hidden="true">{[...fields.message].length}/{MAX_MESSAGE}</p>
        </div>
      </div>

      {/* Never seen by people (off screen, out of the tab order): a robot that fills it is answered with a success and nothing is kept. */}
      <div className="absolute -left-[9999px] h-px w-px overflow-hidden" aria-hidden="true">
        <label htmlFor={`${uid}-website`}>Não preencha este campo</label>
        <input ref={honeypot} id={`${uid}-website`} name="website" type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
      </div>

      <div>
        <label className="flex items-start gap-3">
          <input type="checkbox" name="confirm" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} className="mt-1 h-5 w-5 shrink-0 accent-[var(--color-ink,#000)]" aria-invalid={errors[PARTNER_KEYS.confirm] ? true : undefined} aria-describedby={`${uid}-${PARTNER_KEYS.confirm}-msg`} />
          <span className="t-body">{PARTNER_CONFIRM_TEXT}</span>
        </label>
        <p className="t-small mt-1 text-ink-mute">{PARTNER_NOTICE}</p>
        {msg(PARTNER_KEYS.confirm)}
      </div>

      {banner && <p className="border-2 border-[#9b1c1c] bg-white p-3 font-bold text-[#9b1c1c]" role="alert">{banner}</p>}
      {!available && <p className="border-2 border-ink bg-white p-3" role="status">As inscrições não estão disponíveis neste ambiente.</p>}

      <div>
        <button type="submit" className="btn w-full sm:w-auto" disabled={phase === "sending" || !available}>
          {phase === "sending" ? "Enviando…" : "Quero me inscrever"}
        </button>
        <p className="t-small mt-3 max-w-xl text-ink-mute">Não pedimos CPF, endereço nem dados bancários. Os valores da parceria são combinados na conversa.</p>
      </div>
    </form>
  );
}
