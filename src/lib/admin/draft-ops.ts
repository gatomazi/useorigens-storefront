/**
 * Pure editing operations on a scope document (the Sul home). The editor never mutates JSON by hand: every action is one of these ops,
 * applied to the current draft and re-validated with the SAME validators the publisher and the storefront use. Nothing here does I/O.
 *
 * Structural rules enforced here (not just in the UI):
 *  - the hero is always first and the footer always last; neither moves, is removed or is deactivated;
 *  - only sections created in the CMS (id `custom-…`) can be removed; the seeded home sections can be edited, reordered and hidden;
 *  - a section can only be moved among the movable ones (never past the hero or the footer);
 *  - a duplicate gets a new id and a unique anchor and starts INACTIVE, so a copy never appears on the home by accident.
 */
import { validateSection, type Appearance, type Section, type ScopeDoc, type Source } from "../site-config/schema";

export type Editable = Pick<Section, "title" | "subtitle" | "cta" | "layout" | "source" | "fallback" | "appearance">;

export type DraftOp =
  | { type: "add-carousel"; title: string; source: Source }
  | { type: "duplicate"; id: string }
  | { type: "move"; id: string; direction: "up" | "down" }
  | { type: "set-active"; id: string; active: boolean }
  | { type: "remove"; id: string }
  | { type: "update"; id: string; patch: Partial<Editable> };

export type OpResult = { ok: true; doc: ScopeDoc; focusId?: string } | { ok: false; errors: string[] };

export type OpContext = { newId: () => string };

export const CUSTOM_PREFIX = "custom-";

export const defaultAppearance = (): Appearance => ({
  fill: { kind: "none" },
  focal: { mobile: { x: 50, y: 50 }, desktop: { x: 50, y: 50 } },
  overlay: { preset: "none" },
});

const slug = (text: string): string =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24) || "secao";

function uniqueAnchor(base: string, taken: Set<string>): string {
  let anchor = base.slice(0, 34);
  for (let n = 2; taken.has(anchor); n++) anchor = `${base.slice(0, 34 - String(n).length - 1)}-${n}`;
  return anchor;
}

const isLocked = (s: Section) => s.template === "hero" || s.template === "footer" || s.locked === true;
const fail = (...errors: string[]): OpResult => ({ ok: false, errors });

/** Applies one operation. The input document is never mutated; on any problem nothing changes and the reasons come back. */
export function applyOp(doc: ScopeDoc, op: DraftOp, ctx: OpContext): OpResult {
  const sections = doc.home?.sections;
  if (!sections) return fail("this scope has no home");
  const index = "id" in op ? sections.findIndex((s) => s.id === op.id) : -1;
  if ("id" in op && index < 0) return fail(`section "${op.id}" does not exist`);
  const next = sections.map((s) => structuredClone(s));
  const withSections = (list: Section[], focusId?: string): OpResult => ({ ok: true, doc: { ...doc, home: { sections: list } }, focusId });

  switch (op.type) {
    case "add-carousel": {
      const title = op.title.trim();
      if (title.length === 0 || title.length > 120) return fail("the title must have 1 to 120 characters");
      const id = `${CUSTOM_PREFIX}${ctx.newId()}`;
      const anchor = uniqueAnchor(`colecao-${slug(title)}`, new Set(sections.map((s) => s.anchor)));
      const created: Section = {
        id, anchor, headingId: `${anchor}-title`, template: "product-carousel", active: true, title,
        layout: { variant: "standard", tone: "light", surface: "plain" },
        source: op.source, analyticsSource: "homeCollection", appearance: defaultAppearance(),
      };
      const check = validateSection(created);
      if (!check.ok) return { ok: false, errors: check.errors };
      // New sections go right before the closing campaign (the block before the footer), never after the footer.
      const at = Math.max(1, next.length - 2);
      next.splice(at, 0, created);
      return withSections(next, id);
    }
    case "duplicate": {
      const source = next[index];
      if (source.template !== "product-carousel") return fail("only carousels can be duplicated");
      const id = `${CUSTOM_PREFIX}${ctx.newId()}`;
      const anchor = uniqueAnchor(`${source.anchor}-copia`, new Set(sections.map((s) => s.anchor)));
      const copy: Section = { ...structuredClone(source), id, anchor, headingId: `${anchor}-title`, active: false, locked: undefined, title: `${source.title ?? ""} (cópia)`.slice(0, 120) };
      delete copy.locked;
      const check = validateSection(copy);
      if (!check.ok) return { ok: false, errors: check.errors };
      next.splice(index + 1, 0, copy);
      return withSections(next, id);
    }
    case "move": {
      if (isLocked(next[index])) return fail("the hero and the footer cannot be moved");
      const target = index + (op.direction === "up" ? -1 : 1);
      if (target < 1 || target > next.length - 2) return fail("it cannot go past the hero or the footer");
      [next[index], next[target]] = [next[target], next[index]];
      return withSections(next, op.id);
    }
    case "set-active": {
      if (isLocked(next[index]) && !op.active) return fail("the hero and the footer cannot be hidden");
      next[index].active = op.active;
      return withSections(next, op.id);
    }
    case "remove": {
      if (!op.id.startsWith(CUSTOM_PREFIX)) return fail("only sections created in the CMS can be removed; hide the others instead");
      next.splice(index, 1);
      return withSections(next);
    }
    case "update": {
      const merged: Section = { ...next[index], ...op.patch, id: next[index].id, anchor: next[index].anchor, headingId: next[index].headingId, template: next[index].template };
      // An optional key set to undefined means "clear it".
      for (const key of Object.keys(op.patch) as (keyof Editable)[]) if (op.patch[key] === undefined) delete (merged as Partial<Section>)[key];
      const check = validateSection(merged);
      if (!check.ok) return { ok: false, errors: check.errors };
      next[index] = merged;
      return withSections(next, op.id);
    }
  }
}
