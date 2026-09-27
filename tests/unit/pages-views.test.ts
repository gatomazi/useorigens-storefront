import { describe, expect, test } from "vitest";
import { applyOp, type DraftOp } from "@/lib/admin/draft-ops";
import { modelState, pageOptions, pageRows, pageState } from "@/lib/admin/pages-view";
import { seedForEnv } from "@/lib/admin/publishing";
import { headerLinks } from "@/lib/site-config/nav";
import type { ScopeDoc } from "@/lib/site-config/schema";

let n = 0;
const run = (doc: ScopeDoc, op: DraftOp) => {
  const r = applyOp(doc, op, { newId: () => `v${++n}` });
  if (!r.ok) throw new Error(r.errors.join("; "));
  return r.doc;
};
const base = () => structuredClone(seedForEnv().docs.sul);

describe("page states", () => {
  test("given a draft, a published copy, an edit and an archive, when compared, then each state is told apart and versions do not count as edits", () => {
    const draft = run(base(), { type: "create-page", kind: "hotpage", title: "Dia dos Pais" });
    const page = draft.pages![0];
    expect(pageState(page, undefined)).toBe("draft");
    expect(pageState({ ...page, archived: true }, undefined)).toBe("archived");
    const live = { ...page, version: 5 };
    expect(pageState(page, live)).toBe("published");
    expect(pageState({ ...page, title: "Outro" }, live)).toBe("changed");
    expect(pageState(page, { ...live, archived: true })).toBe("archived");
  });

  test("given a model, when compared with what is live, then draft / published / changed / inactive", () => {
    const m = { active: true, name: "Pai", version: 1 };
    expect(modelState(m, undefined)).toBe("draft");
    expect(modelState(m, { ...m, version: 3 })).toBe("published");
    expect(modelState({ ...m, name: "Pai 2" }, m)).toBe("changed");
    expect(modelState(m, { ...m, active: false })).toBe("inactive");
  });

  test("given pages and releases, when listed, then rows carry the state, the address and the last publish from the history markers", () => {
    const draft = run(base(), { type: "create-page", kind: "categoryLanding", title: "Pais" });
    const published = { ...draft, pages: draft.pages };
    const history = [{ id: "7", status: "live", scopesChanged: ["sul", "page:categoryLanding/pais"], promotedAt: "2026-09-26T10:00:00Z" }] as never;
    const [row] = pageRows(draft, published, history);
    expect(row).toMatchObject({ state: "published", href: "/sul/colecoes/pais", lastPublishedAt: "2026-09-26T10:00:00Z", kindLabel: "Categoria-pai" });
    const options = pageOptions(draft, { ...draft, pages: [] });
    expect(options).toEqual([{ value: "categoryLanding/pais", label: "Categoria-pai: Pais", live: false }]);
  });
});

describe("menu links to pages", () => {
  test("given a section whose menu item goes to a page, when the page is live, then the link leads there; while it is not, there is no link at all", () => {
    let draft = run(base(), { type: "create-page", kind: "hotpage", title: "Dia dos Pais" });
    const target = draft.home!.sections.find((s) => s.template === "product-carousel")!;
    draft = run(draft, { type: "update", id: target.id, patch: { nav: { label: "Pais", dest: { kind: "page", pageKind: "hotpage", slug: "dia-dos-pais" } } } });
    expect(headerLinks({ ...draft, pages: [] })).toEqual([]);
    const links = headerLinks(draft);
    expect(links).toHaveLength(1);
    expect(links[0].label).toBe("Pais");
    expect(links[0].href!("sul")).toBe("/sul/h/dia-dos-pais");
    const archived = { ...draft, pages: draft.pages!.map((p) => ({ ...p, archived: true })) };
    expect(headerLinks(archived)).toEqual([]);
  });
});
