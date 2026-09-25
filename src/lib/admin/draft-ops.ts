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
import { sectionsUsing } from "../site-config/collections-enabled";
import { SINGLETON_TEMPLATES, structuredDefaults, uniqueAnchor, type StructuredTemplate } from "../site-config/structured";
import { validateScopeDoc, validateSection, type Appearance, type CollectionRef, type Section, type ScopeDoc, type Source, type TrackingConfig } from "../site-config/schema";

export type Editable = Pick<Section, "title" | "subtitle" | "cta" | "layout" | "source" | "fallback" | "appearance" | "count" | "featured">;

export type DraftOp =
  | { type: "add-carousel"; title: string; source: Source }
  /** Adds one of the structured home components (city styles, state chooser, regional campaign) with the defaults of THIS region. */
  | { type: "add-structured"; template: StructuredTemplate }
  | { type: "duplicate"; id: string }
  | { type: "move"; id: string; direction: "up" | "down" }
  | { type: "set-active"; id: string; active: boolean }
  | { type: "remove"; id: string }
  | { type: "update"; id: string; patch: Partial<Editable> }
  | ({ type: "set-collection-enabled"; enabled: boolean } & CollectionRef)
  /** Shows / hides a PUBLIC INK collection in the navbar the Worker draws on the INK product pages (independent of `set-collection-enabled`). */
  | ({ type: "set-collection-navbar"; shown: boolean } & CollectionRef)
  /** Creates the home of a region that has none yet, from sections the caller built out of REAL sources (see admin/region-seed.ts). */
  | { type: "init-home"; sections: Section[] }
  /** Replaces the tracking configuration of the document (validated: formats, legacy only for Sul, an inactive ID only in global). */
  | { type: "set-tracking"; tracking: TrackingConfig }
  /** Launches / recalls a region publicly (takes effect only when published). */
  | { type: "set-launched"; launched: boolean };

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


const isLocked = (s: Section) => s.template === "hero" || s.template === "footer" || s.locked === true;
const fail = (...errors: string[]): OpResult => ({ ok: false, errors });

/** Applies one operation. The input document is never mutated; on any problem nothing changes and the reasons come back. */
export function applyOp(doc: ScopeDoc, op: DraftOp, ctx: OpContext): OpResult {
  if (op.type === "set-collection-enabled") return setCollectionEnabled(doc, op);
  if (op.type === "set-collection-navbar") return setCollectionNavbar(doc, op);
  if (op.type === "init-home") {
    if (doc.scope === "global") return fail("global has no home");
    if (doc.home) return fail("this region already has a home");
    const created: ScopeDoc = { ...doc, home: { sections: op.sections } };
    const check = validateScopeDoc(created);
    return check.ok ? { ok: true, doc: created } : { ok: false, errors: check.errors };
  }
  if (op.type === "set-tracking") {
    const next: ScopeDoc = { ...doc, tracking: op.tracking };
    const check = validateScopeDoc(next);
    return check.ok ? { ok: true, doc: next } : { ok: false, errors: check.errors };
  }
  if (op.type === "set-launched") {
    if (doc.scope === "global" || doc.scope === "sul") return fail("only Norte and Centro-Oeste are launched separately (Sul is always public)");
    return { ok: true, doc: { ...doc, launched: op.launched } };
  }
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
    case "add-structured": {
      if (doc.scope === "global") return fail("global has no home");
      const existing = SINGLETON_TEMPLATES.includes(op.template) ? sections.find((s) => s.template === op.template) : undefined;
      if (existing) return fail(`this region already has this section ("${existing.title ?? existing.id}"): edit it instead of adding another`);
      const id = `${CUSTOM_PREFIX}${ctx.newId()}`;
      const created = structuredDefaults(op.template, doc.scope, id, new Set(sections.map((s) => s.anchor)));
      const check = validateSection(created);
      if (!check.ok) return { ok: false, errors: check.errors };
      // City styles go right after the hero (as on the Sul home); the state chooser and campaigns go before the footer, campaigns last.
      const at = op.template === "city-styles" ? 1 : next.length - 1;
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
      // Region-level rules (a Norte button cannot lead to /sul, a section cannot use another region's store) live on the whole document:
      // only the problems of THIS section are reported, so an edit is never blocked by something unrelated.
      const whole = validateScopeDoc({ ...doc, home: { sections: next } });
      if (!whole.ok) {
        const own = whole.errors.filter((e) => e.startsWith(`doc.home.sections[${index}]`));
        if (own.length > 0) return { ok: false, errors: own };
      }
      return withSections(next, op.id);
    }
  }
}

/**
 * Enables or disables an INTERNAL collection for this document (its explicit, reversible editorial permission; nothing in INK changes).
 * Disabling is refused while any section still uses the collection, and the reply names those sections: nothing is broken silently.
 */
function setCollectionEnabled(doc: ScopeDoc, op: { store: CollectionRef["store"]; collectionId: number; enabled: boolean }): OpResult {
  const current = doc.collections?.enabled ?? [];
  const has = current.some((r) => r.store === op.store && r.collectionId === op.collectionId);
  if (op.enabled) {
    if (has) return { ok: true, doc };
    const next: ScopeDoc = { ...doc, collections: { ...doc.collections, enabled: [...current, { store: op.store, collectionId: op.collectionId }] } };
    const check = validateScopeDoc(next);
    return check.ok ? { ok: true, doc: next } : { ok: false, errors: check.errors };
  }
  if (!has) return { ok: true, doc };
  const using = sectionsUsing(doc, op.store, op.collectionId);
  if (using.length > 0) {
    return { ok: false, errors: [`Esta coleção é usada por: ${using.map((s) => `"${s.title ?? s.id}"`).join(", ")}. Remova ou troque a fonte dessas seções antes de desabilitá-la.`] };
  }
  const remaining = current.filter((r) => !(r.store === op.store && r.collectionId === op.collectionId));
  const next: ScopeDoc = { ...doc };
  // The navbar list is a separate decision: emptying the enablements must not drop it.
  if (remaining.length > 0 || (doc.collections?.navbar?.length ?? 0) > 0) next.collections = { ...doc.collections, enabled: remaining };
  else delete next.collections;
  return { ok: true, doc: next };
}

/**
 * Shows or hides one collection in the INK navbar. Independent of the home: it never touches `enabled` nor the sections. Only the reference is
 * stored; whether the collection is public, has products and a valid slug is checked when the storefront publishes the list (`site-config/navbar.ts`),
 * so a collection that later disappears from INK simply stops rendering instead of breaking the menu.
 */
function setCollectionNavbar(doc: ScopeDoc, op: { store: CollectionRef["store"]; collectionId: number; shown: boolean }): OpResult {
  const current = doc.collections?.navbar ?? [];
  const has = current.some((r) => r.store === op.store && r.collectionId === op.collectionId);
  if (op.shown === has) return { ok: true, doc };
  const navbar = op.shown ? [...current, { store: op.store, collectionId: op.collectionId }] : current.filter((r) => !(r.store === op.store && r.collectionId === op.collectionId));
  const enabled = doc.collections?.enabled ?? [];
  const next: ScopeDoc = { ...doc };
  if (navbar.length > 0) next.collections = { enabled, navbar };
  else if (enabled.length > 0) next.collections = { enabled };
  else delete next.collections;
  const check = validateScopeDoc(next);
  return check.ok ? { ok: true, doc: next } : { ok: false, errors: check.errors };
}
