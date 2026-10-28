import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { normalizeInstagram, parseFollowers, partnerGreeting, validatePartnerApplication, type PartnerInput } from "@/lib/partners/application";
import { filePartnerStore } from "@/lib/partners/store";

const valid: PartnerInput = { profile: "artist", name: "  Ana   Souza ", whatsapp: "(48) 99999-0000", city: "Florianópolis - SC", confirm: true };

describe("validatePartnerApplication", () => {
  it("accepts the required fields and normalises them", () => {
    const r = validatePartnerApplication(valid);
    expect(r).toEqual({ ok: true, values: { profile: "artist", name: "Ana Souza", whatsapp: "+5548999990000", email: null, city: "Florianópolis - SC", instagram: null, followers: null, message: null } });
  });

  it("keeps the optional fields when they are valid", () => {
    const r = validatePartnerApplication({ ...valid, email: "Ana@Exemplo.COM", instagram: "https://www.instagram.com/ana.desenha/?hl=pt", followers: "12,5 mil", message: "Oi!\r\n\r\n\r\nMeu portfólio: behance.net/ana 👩‍🎨" });
    expect(r.ok && r.values).toMatchObject({ email: "Ana@exemplo.com", instagram: "ana.desenha", followers: 12500, message: "Oi!\n\nMeu portfólio: behance.net/ana 👩‍🎨" });
  });

  it("refuses a missing profile, WhatsApp, city and authorisation, each under its own field", () => {
    const r = validatePartnerApplication({ name: "Ana", whatsapp: "", city: "", confirm: false });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.map((e) => e.key).sort()).toEqual(["city", "confirm", "profile", "whatsapp"]);
  });

  it("refuses an unknown profile, a bad e-mail and a message too long", () => {
    const r = validatePartnerApplication({ ...valid, profile: "reseller", email: "ana@", message: "x".repeat(1001) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.map((e) => e.key).sort()).toEqual(["email", "message", "profile"]);
  });

  it("refuses values that are not text and hidden control characters", () => {
    const r = validatePartnerApplication({ ...valid, name: ["Ana"], message: "oi\u0007" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.map((e) => e.key).sort()).toEqual(["message", "name"]);
  });

  it("only takes an explicit true as the authorisation", () => {
    expect(validatePartnerApplication({ ...valid, confirm: "on" }).ok).toBe(false);
  });
});

describe("normalizeInstagram / parseFollowers", () => {
  it.each([["@usesul.oficial", "usesul.oficial"], ["usesul.oficial", "usesul.oficial"], ["instagram.com/usesul.oficial", "usesul.oficial"]])("reads %s as the handle", (raw, handle) => {
    expect(normalizeInstagram(raw)).toEqual({ ok: true, value: handle });
  });
  it("refuses something that is not a handle", () => {
    expect(normalizeInstagram("@ana souza").ok).toBe(false);
    expect(normalizeInstagram("https://tiktok.com/@ana").ok).toBe(false);
  });
  it.each([["12500", 12500], ["12.500", 12500], ["1 200 000", 1200000], ["12 mil", 12000], ["3k", 3000], ["1,2k", 1200]])("reads %s as %d", (raw, n) => {
    expect(parseFollowers(raw)).toEqual({ ok: true, value: n });
  });
  it("refuses what cannot be read as a number", () => {
    expect(parseFollowers("muitos").ok).toBe(false);
    expect(parseFollowers("12.5").ok).toBe(false);
    expect(parseFollowers("-3").ok).toBe(false);
  });
});

describe("partnerGreeting", () => {
  it("greets by the first name and names the profile", () => {
    expect(partnerGreeting({ name: "Ana Souza", profile: "collab" })).toMatch(/^Olá, Ana! .*\(collab\)/);
  });
});

describe("filePartnerStore", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "partners-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });
  const input = (key: string) => ({ profile: "ambassador" as const, name: "Ana Souza", whatsapp: "+5548999990000", email: null, city: "Tijucas", instagram: null, followers: null, message: null, region: "sul" as const, idempotencyKey: key, noticeVersion: "2026-10-v1" });

  it("keeps one application per idempotency key, lists the newest first and moves the status", async () => {
    const store = filePartnerStore(path.join(dir, "partners.json"));
    const first = await store.create(input("key-aaaaaaaaaaaaaaaa"));
    const again = await store.create(input("key-aaaaaaaaaaaaaaaa"));
    expect(again).toEqual({ application: first.application, duplicate: true });
    await store.create({ ...input("key-bbbbbbbbbbbbbbbb"), region: "norte", profile: "artist" });
    expect((await store.list({ regions: ["sul"] }, 50)).total).toBe(1);
    expect((await store.list({ regions: ["sul", "norte"], profile: "artist" }, 50)).rows.map((a) => a.region)).toEqual(["norte"]);
    expect(await store.countNew(["sul", "norte"])).toBe(2);
    expect((await store.setStatus(first.application.id, "partner"))?.status).toBe("partner");
    expect(await store.countNew(["sul", "norte"])).toBe(1);
  });

  it("purges old applications but keeps agreed partnerships", async () => {
    const store = filePartnerStore(path.join(dir, "partners.json"));
    const kept = await store.create(input("key-cccccccccccccccc"));
    await store.setStatus(kept.application.id, "partner");
    await store.create(input("key-dddddddddddddddd"));
    expect(await store.purgeBefore(new Date(Date.now() + 1000))).toBe(1);
    expect((await store.list({ regions: ["sul"] }, 50)).rows.map((a) => a.id)).toEqual([kept.application.id]);
  });
});
