import { describe, expect, test } from "vitest";
import { applyOp } from "@/lib/admin/draft-ops";
import { diffDocs } from "@/lib/admin/diff";
import { readableTopBarError, topBarFromForm, type TopBarRow } from "@/lib/admin/top-bar-form";
import { sanitizeBundle } from "@/lib/site-config/sanitize";
import { validateScopeDoc, type ScopeDoc } from "@/lib/site-config/schema";
import { contrastRatio } from "@/lib/site-config/color";
import { buildSeedBundle } from "@/lib/site-config/seed";
import {
  daysLeftText,
  liveTopBarMessages,
  productionText,
  topBarHrefOk,
  topBarPayload,
  topBarSchedule,
  topBarText,
  TOP_BAR_COLOR_PRESETS,
  validateTopBar,
  type TopBarConfig,
  type TopBarMessage,
} from "@/lib/site-config/top-bar";

const seed = () => buildSeedBundle({ metaPixelId: null, ga4MeasurementId: null });
const ctx = { newId: () => "t1" };
const at = (iso: string) => Date.parse(iso);

const natal: TopBarMessage = { id: "prazo-natal", enabled: true, text: "Peça até 06/12 e receba a tempo do Natal · produção em {producao}", order: 1, endsAt: "2026-12-07T00:00:00-03:00" };
const bf: TopBarMessage = { id: "black-friday", enabled: true, text: "Black Friday: {faltam}", href: "/sul/h/black-friday", order: 2, startsAt: "2026-11-27T00:00:00-03:00", endsAt: "2026-12-01T00:00:00-03:00" };
const parcele: TopBarMessage = { id: "parcele", enabled: true, text: "Parcele em até 5x sem juros", order: 3 };
const config: TopBarConfig = { productionDays: 7, messages: [natal, bf, parcele] };

const row = (patch: Partial<TopBarRow>): TopBarRow => ({ id: "", enabled: true, text: "", href: "", startsAt: "", endsAt: "", ...patch });

describe("Faixa do topo: what is live and how it reads", () => {
  test("given the schedule, then each instant shows only the messages inside their window, in the owner's order", () => {
    expect(liveTopBarMessages(config, at("2026-11-20T12:00:00-03:00")).map((m) => m.id)).toEqual(["prazo-natal", "parcele"]);
    // Black Friday starts at midnight in Brasília, not an hour later because of a cache.
    expect(liveTopBarMessages(config, at("2026-11-26T23:59:59-03:00")).map((m) => m.id)).toEqual(["prazo-natal", "parcele"]);
    expect(liveTopBarMessages(config, at("2026-11-27T00:00:00-03:00")).map((m) => m.id)).toEqual(["prazo-natal", "black-friday", "parcele"]);
    // The Christmas deadline is on through the 6th and gone on the 7th.
    expect(liveTopBarMessages(config, at("2026-12-06T23:59:00-03:00")).map((m) => m.id)).toEqual(["prazo-natal", "parcele"]);
    expect(liveTopBarMessages(config, at("2026-12-07T00:00:00-03:00")).map((m) => m.id)).toEqual(["parcele"]);
    expect(liveTopBarMessages({ messages: [{ ...parcele, enabled: false }] }, at("2026-11-20T12:00:00-03:00"))).toEqual([]);
  });

  test("{producao} is the production time in business days; {faltam} counts Brasília calendar days to the last day", () => {
    expect(productionText(1)).toBe("1 dia útil");
    expect(productionText(7)).toBe("7 dias úteis");
    // The last day of an end at 01/12 00:00 is 30/11 (Cyber Monday).
    expect(daysLeftText(bf.endsAt!, at("2026-11-27T09:00:00-03:00"))).toBe("faltam 3 dias");
    expect(daysLeftText(bf.endsAt!, at("2026-11-29T23:30:00-03:00"))).toBe("falta 1 dia");
    expect(daysLeftText(bf.endsAt!, at("2026-11-30T00:10:00-03:00"))).toBe("último dia");
    // 02:00 UTC on the 30th is still the 29th in Brasília.
    expect(daysLeftText(bf.endsAt!, at("2026-11-30T02:00:00Z"))).toBe("falta 1 dia");
    expect(topBarText(natal, 7, at("2026-11-20T12:00:00-03:00"))).toBe("Peça até 06/12 e receba a tempo do Natal · produção em 7 dias úteis");
    expect(topBarText(bf, 7, at("2026-11-28T12:00:00-03:00"))).toBe("Black Friday: faltam 2 dias");
    expect(topBarText({ text: "{faltam} para o fim da Black Friday", endsAt: bf.endsAt }, undefined, at("2026-11-28T12:00:00-03:00"))).toBe("Faltam 2 dias para o fim da Black Friday");
  });

  test("the public payload carries only live messages, already filled in, and only display fields", () => {
    const payload = topBarPayload("sul", config, at("2026-11-28T12:00:00-03:00"));
    expect(payload).toEqual({
      v: 1,
      region: "sul",
      style: "marquee",
      messages: [
        { id: "prazo-natal", text: "Peça até 06/12 e receba a tempo do Natal · produção em 7 dias úteis", endsAt: natal.endsAt },
        { id: "black-friday", text: "Black Friday: faltam 2 dias", href: "/sul/h/black-friday", endsAt: bf.endsAt },
        { id: "parcele", text: "Parcele em até 5x sem juros" },
      ],
    });
    expect(JSON.stringify(payload)).not.toMatch(/enabled|startsAt|order/);
    expect(topBarPayload("sul", undefined, Date.now())).toEqual({ v: 1, region: "sul", style: "marquee", messages: [] });
    expect(topBarPayload("sul", { ...config, style: "rotate" }, Date.now()).style).toBe("rotate");
  });

  test("the page carries what is live AND what is scheduled, never what is over (the browser decides with its own clock)", () => {
    const schedule = topBarSchedule(config, at("2026-11-20T12:00:00-03:00"));
    expect(schedule?.messages.map((m) => m.id)).toEqual(["prazo-natal", "black-friday", "parcele"]);
    expect(schedule?.productionDays).toBe(7);
    expect(topBarSchedule(config, at("2026-12-08T12:00:00-03:00"))?.messages.map((m) => m.id)).toEqual(["parcele"]);
    expect(topBarSchedule({ messages: [{ ...parcele, enabled: false }] }, Date.now())).toBeUndefined();
    expect(topBarSchedule(undefined, Date.now())).toBeUndefined();
  });
});

describe("Faixa do topo: contract", () => {
  test("a valid configuration passes; an empty list too", () => {
    expect(validateTopBar(config, "sul").ok).toBe(true);
    expect(validateTopBar({ messages: [] }, "sul").ok).toBe(true);
  });

  test("style: marquee (the default, not stored) or rotate; anything else is refused", () => {
    expect(validateTopBar({ ...config, style: "rotate" }, "sul").ok).toBe(true);
    expect(validateTopBar({ ...config, style: "marquee" }, "sul").ok).toBe(true);
    expect(validateTopBar({ ...config, style: "blink" }, "sul").ok).toBe(false);
    const rotate = topBarFromForm([row({ text: "Parcele em até 5x" })], "", "sul", "rotate");
    expect(rotate.ok && rotate.value.style).toBe("rotate");
    const marquee = topBarFromForm([row({ text: "Parcele em até 5x" })], "", "sul", "marquee");
    expect(marquee.ok && "style" in marquee.value).toBe(false);
    expect(topBarSchedule({ ...config, style: "rotate" }, at("2026-11-20T12:00:00-03:00"))?.style).toBe("rotate");
  });

  test("colours: both #rrggbb, readable together (3:1 or more), only while a message is on; the presets read at AA", () => {
    const red = { ...config, colors: { background: "#b3121f", text: "#ffffff" } };
    expect(validateTopBar(red, "sul").ok).toBe(true);
    const low = validateTopBar({ ...config, colors: { background: "#777777", text: "#888888" } }, "sul");
    expect(low.ok).toBe(false);
    if (!low.ok) expect(low.errors[0]).toMatch(/contrast 1\.\d:1 is below 3:1/);
    expect(validateTopBar({ ...config, colors: { background: "red", text: "#ffffff" } }, "sul").ok).toBe(false);
    expect(validateTopBar({ ...config, colors: { background: "#000000" } }, "sul").ok).toBe(false);
    for (const p of TOP_BAR_COLOR_PRESETS) if (p.colors) expect(contrastRatio(p.colors.background, p.colors.text)).toBeGreaterThanOrEqual(4.5);
    expect(topBarPayload("sul", { ...red, colors: { background: "#B3121F", text: "#FFFFFF" } }, at("2026-11-20T12:00:00-03:00")).colors).toEqual({ background: "#b3121f", text: "#ffffff" });
    expect("colors" in topBarPayload("sul", config, Date.now())).toBe(false);
    expect(topBarSchedule(red, at("2026-11-20T12:00:00-03:00"))?.colors).toEqual(red.colors);
    const form = topBarFromForm([row({ text: "Natal" })], "", "sul", "", { background: "#B3121F", text: "#FFFFFF" });
    expect(form.ok && form.value.colors).toEqual({ background: "#b3121f", text: "#ffffff" });
    const unreadable = topBarFromForm([row({ text: "Natal" })], "", "sul", "", { background: "#777777", text: "#888888" });
    if (!unreadable.ok) expect(unreadable.errors[0]).toMatch(/^As cores da faixa quase não se leem juntas \(contraste 1,\d:1/);
    const plain = topBarFromForm([row({ text: "Natal" })], "", "sul", "", { background: "", text: "" });
    expect(plain.ok && "colors" in plain.value).toBe(false);
  });

  test("placeholders: {producao} needs the production time, {faltam} needs an end, anything else is refused", () => {
    const errors = (c: unknown) => { const r = validateTopBar(c, "sul"); return r.ok ? [] : r.errors; };
    expect(errors({ messages: [natal] })[0]).toMatch(/\{producao\} needs/);
    expect(errors({ productionDays: 7, messages: [{ ...bf, endsAt: undefined }] }).some((e) => /\{faltam\} needs/.test(e))).toBe(true);
    expect(errors({ messages: [{ ...parcele, text: "Frete {gratis}" }] })[0]).toMatch(/unknown placeholder \{gratis\}/);
  });

  test("links stay inside the region's storefront; texts are one line without markup; the strip belongs to a region", () => {
    expect(topBarHrefOk("/sul/h/natal", "sul")).toBe(true);
    expect(topBarHrefOk("/sul", "sul")).toBe(true);
    expect(topBarHrefOk("/norte/h/natal", "sul")).toBe(false);
    expect(topBarHrefOk("https://www.usesul.com.br/usesul", "sul")).toBe(false);
    expect(topBarHrefOk("/sul/../admin", "sul")).toBe(false);
    expect(topBarHrefOk("/sul/h/natal?x=1", "sul")).toBe(false);
    expect(validateTopBar({ messages: [{ ...parcele, text: "<b>oi</b>" }] }, "sul").ok).toBe(false);
    expect(validateTopBar({ messages: [{ ...parcele, text: "a".repeat(91) }] }, "sul").ok).toBe(false);
    expect(validateTopBar({ productionDays: 0, messages: [] }, "sul").ok).toBe(false);
    expect(validateTopBar({ productionDays: 7.5, messages: [] }, "sul").ok).toBe(false);
    expect(validateTopBar({ messages: [] }, "global").ok).toBe(false);
    expect(validateTopBar({ messages: [parcele, parcele] }, "sul").ok).toBe(false);
  });
});

describe("Faixa do topo: editor, draft and publish", () => {
  test("given the editor's rows, then dates typed in Brasília become instants, ids come from the text and the order is the list's", () => {
    const r = topBarFromForm([
      row({ text: "Black Friday: {faltam}", startsAt: "2026-11-27T00:00", endsAt: "2026-12-01T00:00" }),
      row({ text: "Peça até 06/12 e receba a tempo do Natal", endsAt: "2026-12-07T00:00", href: "/sul/h/natal" }),
    ], "7", "sul");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.productionDays).toBe(7);
    expect(r.value.messages.map((m) => [m.id, m.order, m.startsAt, m.endsAt])).toEqual([
      ["black-friday", 1, "2026-11-27T00:00:00-03:00", "2026-12-01T00:00:00-03:00"],
      ["peca-ate-06-12-e-receba-a-tempo", 2, undefined, "2026-12-07T00:00:00-03:00"],
    ]);
  });

  test("errors read as something the owner can act on", () => {
    const r = topBarFromForm([row({ text: "Produção em {producao}" })], "", "sul");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors).toEqual(["Mensagem 1: {producao} precisa do prazo de produção preenchido acima."]);
    const link = topBarFromForm([row({ text: "Natal", href: "https://exemplo.com" })], "", "sul");
    if (!link.ok) expect(link.errors[0]).toMatch(/^Mensagem 1: o link precisa ser uma página desta região, como \/sul\/h\/natal/);
    expect(topBarFromForm([], "abc", "sul").ok).toBe(false);
    expect(readableTopBarError("doc.topBar.messages[2].endsAt: must be after startsAt", "sul")).toBe("Mensagem 3: o fim precisa ser depois do início.");
  });

  test("given the draft, when the strip is saved, then only `topBar` changes, the publish screen lists it, and an empty strip removes the key", () => {
    const sul = structuredClone(seed().docs.sul);
    const r = applyOp(sul, { type: "set-top-bar", topBar: config }, ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.doc.topBar).toEqual(config);
    expect(validateScopeDoc(r.doc).ok).toBe(true);
    const texts = diffDocs(sul, r.doc).filter((c) => c.kind === "top-bar").map((c) => c.text);
    expect(texts).toContain("Faixa do topo, prazo de produção da INK: sem prazo → 7 dias úteis");
    expect(texts).toContain('Faixa do topo: mensagem "Black Friday: {faltam}" adicionada');
    const red = applyOp(r.doc, { type: "set-top-bar", topBar: { ...config, colors: { background: "#b3121f", text: "#ffffff" } } }, ctx);
    expect(red.ok && diffDocs(r.doc, red.doc).map((c) => c.text)).toContain("Faixa do topo, cores: preta (padrão) → fundo #b3121f, fonte #ffffff");
    const rotating = applyOp(r.doc, { type: "set-top-bar", topBar: { ...config, style: "rotate" } }, ctx);
    expect(rotating.ok && diffDocs(r.doc, rotating.doc).map((c) => c.text)).toContain("Faixa do topo, como as mensagens aparecem: passando (letreiro) → uma de cada vez");
    const off = applyOp(r.doc, { type: "set-top-bar", topBar: { messages: [] } }, ctx);
    expect(off.ok && "topBar" in off.doc).toBe(false);
    expect(applyOp(structuredClone(seed().docs.global), { type: "set-top-bar", topBar: config }, ctx).ok).toBe(false);
  });

  test("an invalid published strip is ignored (default strip), never the region", () => {
    const bundle = seed();
    const raw = structuredClone(bundle) as unknown as { docs: Record<string, ScopeDoc & { topBar?: unknown }> };
    raw.docs.sul.topBar = { messages: [{ ...parcele, text: "Frete {gratis}" }] };
    const read = sanitizeBundle(raw, bundle);
    expect(read.bundle?.docs.sul.topBar).toBeUndefined();
    expect(read.bundle?.docs.sul.home).toBeDefined();
    expect(read.diagnostics.some((d) => /topBar is invalid/.test(d))).toBe(true);
    raw.docs.sul.topBar = config;
    expect(sanitizeBundle(raw, bundle).bundle?.docs.sul.topBar).toEqual(config);
  });
});
