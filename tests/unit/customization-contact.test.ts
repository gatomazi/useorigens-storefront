import { describe, expect, test } from "vitest";
import { emailSubject, mailtoUrl, maskedChannels, maskEmail, maskWhatsapp, normalizeEmail, normalizeWhatsapp, suggestedMessage, validateContact, whatsappUrl } from "@/lib/customization/contact";
import { nextStatuses, normalizeStatus, OPEN_STATUSES, productLinkFor, PUBLIC_STATUS_LABEL, REQUEST_STATUSES, STATUS_LABEL } from "@/lib/customization/requests";

const good = { name: "Ana Souza", whatsapp: "(51) 99999-8888", email: "", confirm: true };
const keys = (r: ReturnType<typeof validateContact>) => (r.ok ? [] : r.errors.map((e) => e.key));

describe("contact: the customer's channels", () => {
  test("given a name and only a WhatsApp, when validated, then it is accepted and the number is normalised to +55", () => {
    expect(validateContact(good)).toEqual({ ok: true, contact: { name: "Ana Souza", whatsapp: "+5551999998888" } });
  });

  test("given a name and only an e-mail, when validated, then it is accepted and the domain is lower-cased", () => {
    expect(validateContact({ name: "Zé", email: " Ze.Silva@Exemplo.COM ", confirm: true })).toEqual({ ok: true, contact: { name: "Zé", email: "Ze.Silva@exemplo.com" } });
  });

  test("given both channels, when validated, then both are kept", () => {
    const r = validateContact({ ...good, email: "ana@exemplo.com" });
    expect(r).toEqual({ ok: true, contact: { name: "Ana Souza", whatsapp: "+5551999998888", email: "ana@exemplo.com" } });
  });

  test("given no channel, when validated, then it says a WhatsApp or an e-mail is needed", () => {
    const r = validateContact({ name: "Ana", whatsapp: "  ", email: "", confirm: true });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.errors[0].message).toMatch(/WhatsApp ou um e-mail/);
  });

  test("given the confirmation is missing or not exactly true, when validated, then it is refused (unticked by default, never assumed)", () => {
    expect(keys(validateContact({ ...good, confirm: false }))).toEqual(["contact.confirm"]);
    expect(keys(validateContact({ name: good.name, whatsapp: good.whatsapp }))).toEqual(["contact.confirm"]);
    expect(keys(validateContact({ ...good, confirm: "true" }))).toEqual(["contact.confirm"]);
  });

  test("given odd names, when validated, then a single name is fine but markup, digits-only, one letter and control characters are not", () => {
    expect(validateContact({ ...good, name: "Maria" }).ok).toBe(true);
    expect(validateContact({ ...good, name: "João d'Ávila-Neto Jr." }).ok).toBe(true);
    for (const name of ["", "A", "<b>Ana</b>", "12345", "Ana\u0000", "x".repeat(81)]) expect(keys(validateContact({ ...good, name }))).toContain("contact.name");
    expect(validateContact({ ...good, name: 42 as unknown as string }).ok).toBe(false);
  });

  test("given a lot of junk, when validated, then every problem is reported by field and nothing throws", () => {
    const r = validateContact({ name: "", whatsapp: "abc", email: "no-at-sign", confirm: false });
    expect(keys(r).sort()).toEqual(["contact.confirm", "contact.email", "contact.name", "contact.whatsapp"]);
    expect(validateContact({}).ok).toBe(false);
  });
});

describe("WhatsApp numbers", () => {
  test.each([
    ["(51) 99999-8888", "+5551999998888"],
    ["51999998888", "+5551999998888"],
    ["+55 51 99999-8888", "+5551999998888"],
    ["5551999998888", "+5551999998888"],
    ["(11) 3222-1111", "+551132221111"],
    ["+1 415 555 2671", "+14155552671"],
  ])("given %s, when normalised, then %s", (raw, expected) => {
    expect(normalizeWhatsapp(raw)).toEqual({ ok: true, value: expected });
  });

  test.each([
    ["99999-8888", "no DDD"],
    ["051 99999-8888", "a zero before the DDD"],
    ["(51) 9999-8888", "a mobile without the leading 9"],
    ["(51) 89999-8888", "eleven digits not starting with 9"],
    ["+55 51 9999", "too short"],
    ["+551", "only the country code"],
    ["5199999-8888 ramal 2", "letters"],
    ["+55(51)99999+8888", "a plus in the middle"],
    ["123456789012345678", "too long"],
    ["+0 123 456 789", "a country code starting with zero"],
  ])("given %s (%s), when normalised, then it is refused instead of guessed", (raw) => {
    expect(normalizeWhatsapp(raw).ok).toBe(false);
  });
});

describe("e-mails", () => {
  test("given valid and invalid addresses, when normalised, then only well-formed ones pass", () => {
    for (const ok of ["a@b.co", "primeiro.ultimo+tag@sub.exemplo.com.br"]) expect(normalizeEmail(ok).ok).toBe(true);
    for (const bad of ["", "a@b", "a b@c.com", "<x>@c.com", "a@c..com", "a@-c.com", "a@c.com,b@d.com", `${"x".repeat(65)}@c.com`, "a\n@c.com"]) expect(normalizeEmail(bad).ok).toBe(false);
  });
});

describe("what the customer sees back and what the operator sends", () => {
  test("given the stored channels, when masked for the public confirmation, then the full number and address are never shown", () => {
    expect(maskWhatsapp("+5551999998888")).toBe("WhatsApp final 8888");
    expect(maskEmail("ana.souza@exemplo.com")).toBe("a***@exemplo.com");
    const masked = maskedChannels({ whatsapp: "+5551999998888", email: "ana.souza@exemplo.com" }).join(" ");
    expect(masked).not.toContain("99999");
    expect(masked).not.toContain("souza");
    expect(maskedChannels({})).toEqual([]);
  });

  test("given a request, when the suggested message is built, then it names the model and the reference, includes the product link only when one was saved, and promises nothing else", () => {
    const withLink = suggestedMessage({ name: "Ana Souza", modelName: "Pai Paranaense", reference: "AB12CD34", productLink: "https://www.usesul.com.br/usesul/product/x" });
    expect(withLink).toContain("Olá, Ana!");
    expect(withLink).toContain("“Pai Paranaense”");
    expect(withLink).toContain("AB12CD34");
    expect(withLink).toContain("https://www.usesul.com.br/usesul/product/x");
    const without = suggestedMessage({ name: "Ana", modelName: "Pai Paranaense", reference: "AB12CD34", productLink: null });
    expect(without).not.toContain("https://");
    expect(without).toMatch(/envio o link/);
    expect(`${withLink} ${without}`).not.toMatch(/prazo|entrega em|pagamento|pedido/i);
  });

  test("given a number and a text, when the links are built, then wa.me gets digits only and both texts are encoded (they only open the apps: nothing is sent)", () => {
    expect(whatsappUrl("+5551999998888", "Olá & tudo bem?")).toBe("https://wa.me/5551999998888?text=Ol%C3%A1%20%26%20tudo%20bem%3F");
    expect(mailtoUrl("ana@exemplo.com", emailSubject("AB12CD34"), "Olá\nOi")).toBe(`mailto:ana@exemplo.com?subject=${encodeURIComponent("Sua personalização na Use Origens (ref. AB12CD34)")}&body=Ol%C3%A1%0AOi`);
  });
});

describe("request statuses", () => {
  test("given the flow, then the operator path is received → in creation → art ready → customer contacted, and no status talks about orders or payment", () => {
    expect(nextStatuses("received")).toContain("inCreation");
    expect(nextStatuses("inCreation")).toContain("artReady");
    expect(nextStatuses("artReady")).toContain("customerContacted");
    expect(nextStatuses("customerContacted")).toContain("closed");
    expect(nextStatuses("received")).not.toContain("artReady"); // no skipping the creation step
    expect(nextStatuses("received")).not.toContain("customerContacted");
    expect(REQUEST_STATUSES.join(" ")).not.toMatch(/order|paid|payment|checkout|linked|fulfilled/i);
    const labels = [...Object.values(STATUS_LABEL), ...Object.values(PUBLIC_STATUS_LABEL)].join(" ");
    expect(labels).not.toMatch(/pedido|pagamento|pago|vincul|compra realizada/i);
  });

  test("given every status, then each has a label, every move stays inside the set, and closing or cancelling can be undone", () => {
    for (const s of REQUEST_STATUSES) {
      expect(STATUS_LABEL[s]).toBeTruthy();
      expect(PUBLIC_STATUS_LABEL[s]).toBeTruthy();
      for (const to of nextStatuses(s)) expect(REQUEST_STATUSES).toContain(to);
    }
    expect(nextStatuses("closed")).toEqual(["inCreation"]);
    expect(nextStatuses("cancelled")).toEqual(["received"]);
    expect(OPEN_STATUSES).toEqual(["received", "inCreation", "artReady"]);
  });

  test("given a status written by the old order-based flow, when normalised, then it maps without loss of meaning; garbage becomes received", () => {
    expect(normalizeStatus("submitted")).toBe("received");
    expect(normalizeStatus("awaitingOrderLink")).toBe("received");
    expect(normalizeStatus("inReview")).toBe("inCreation");
    expect(normalizeStatus("linkedToInkOrder")).toBe("closed");
    expect(normalizeStatus("fulfilled")).toBe("closed");
    expect(normalizeStatus("cancelled")).toBe("cancelled");
    expect(normalizeStatus("customerContacted")).toBe("customerContacted");
    expect(normalizeStatus("whatever")).toBe("received");
    expect(normalizeStatus(undefined)).toBe("received");
  });
});

describe("product link typed by the team", () => {
  const ok = (region: "sul" | "norte" | "centro-oeste", url: string) => productLinkFor(region, url);
  test("given each region's own INK store over https, when checked, then it is accepted and the fragment is dropped", () => {
    expect(ok("sul", "https://www.usesul.com.br/usesul/product/pai-paranaense-x#comprar")).toEqual({ ok: true, url: "https://www.usesul.com.br/usesul/product/pai-paranaense-x" });
    expect(ok("norte", "https://www.usenorte.com.br/x").ok).toBe(true);
    expect(ok("centro-oeste", "https://www.usecentro.com.br/x?a=1").ok).toBe(true);
  });

  test.each([
    ["another region's store", "norte", "https://www.usesul.com.br/x"],
    ["plain http", "sul", "http://www.usesul.com.br/x"],
    ["a look-alike host", "sul", "https://www.usesul.com.br.evil.example/x"],
    ["a subdomain trick", "sul", "https://evil.example/www.usesul.com.br"],
    ["credentials in the URL (open-redirect trick)", "sul", "https://www.usesul.com.br@evil.example/x"],
    ["a port", "sul", "https://www.usesul.com.br:8443/x"],
    ["a javascript: URL", "sul", "javascript:alert(1)"],
    ["whitespace", "sul", "https://www.usesul.com.br/a b"],
    ["markup", "sul", "https://www.usesul.com.br/<x>"],
    ["not a URL", "sul", "www.usesul.com.br/x"],
    ["too long", "sul", `https://www.usesul.com.br/${"a".repeat(600)}`],
  ] as const)("given %s, when checked, then it is refused", (_why, region, url) => {
    expect(ok(region, url).ok).toBe(false);
  });
});
