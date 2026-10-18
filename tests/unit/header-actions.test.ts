import { describe, expect, test } from "vitest";
import { diffDocs } from "@/lib/admin/diff";
import { headerActionsOf, validateNavigation } from "@/lib/site-config/navigation-schema";

describe("the header's buttons (Meus Lugares, Conta, Buscar): icon only or icon and word", () => {
  test("given no setting, then the three are the icon only (the words competed with the menu)", () => {
    expect(headerActionsOf(undefined)).toEqual({ favorites: "icon", account: "icon", search: "icon" });
    expect(headerActionsOf({ headerActions: { search: "label" } })).toEqual({ favorites: "icon", account: "icon", search: "label" });
  });

  test("given a setting, then only the three known buttons and the two styles pass; the navigation belongs to a region", () => {
    expect(validateNavigation({ headerActions: { favorites: "label", account: "icon" } }, "sul").ok).toBe(true);
    expect(validateNavigation({ headerActions: { cart: "label" } }, "sul").ok).toBe(false);
    expect(validateNavigation({ headerActions: { search: "texto" } }, "sul").ok).toBe(false);
    expect(validateNavigation({ headerActions: "icon" }, "sul").ok).toBe(false);
    expect(validateNavigation({ headerActions: {} }, "global").ok).toBe(false);
  });

  test("given a change, then the publish screen names each button and its new look; the same look written or absent is no change", () => {
    const base = { schemaVersion: 1, scope: "sul", tracking: { meta: { mode: "disabled" }, ga4: { mode: "disabled" } } } as const;
    const texts = diffDocs({ ...base } as never, { ...base, navigation: { headerActions: { favorites: "label", search: "icon" } } } as never).map((c) => c.text);
    expect(texts).toEqual(["Topo do site, Meus Lugares: ícone e texto"]);
    expect(diffDocs({ ...base } as never, { ...base, navigation: { headerActions: { account: "icon" } } } as never)).toEqual([]);
  });
});
