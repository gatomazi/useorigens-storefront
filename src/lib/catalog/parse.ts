import { citiesByName, type City } from "../geo/cities";
import { REGIONS, STATE_NAMES, type CommerceStoreKey, type RegionSlug } from "../geo/regions";
import { normalizeText } from "../geo/text";
import { familyByInkLabel, type DesignFamilyId } from "./families";
import type { ExclusionReason, InkProductNormalized } from "./types";

/** `<title> | <Label words> [UF]` — the label starts with a family word. */
const PIPE_NAME = /^(?<title>.+?)\s*\|\s*(?<label>[^|]+?)(?:\s+(?<uf>[A-Z]{2}))?\s*$/;
/** Norte/Centro: `Feito Em <City> - <UF>`. Sul: `Feito em <City>` (no UF at all). */
const FEITO_EM_NAME = /^feito em\s+(?<city>.+?)(?:\s+-\s+(?<uf>[A-Z]{2}))?\s*$/i;

/** Variant words that follow the family word in the label. Feminine forms collapse to one key. */
const VARIANT_ALIASES: Readonly<Record<string, string>> = { personalizada: "personalizado" };

export type ParsedName =
  | {
      kind: "city-design";
      family: DesignFamilyId;
      variant: string;
      /** Text before the pipe (city, gentilic or locality title). */
      title: string;
      uf: string | null;
    }
  | { kind: "unclassified"; label: string; uf: string | null; title: string }
  | { kind: "other" };

export function parseProductName(name: string): ParsedName {
  const feito = FEITO_EM_NAME.exec(name.trim());
  if (feito?.groups) {
    return {
      kind: "city-design",
      family: "feito-em",
      variant: "base",
      title: feito.groups.city.trim(),
      uf: feito.groups.uf ?? null,
    };
  }

  const pipe = PIPE_NAME.exec(name.trim());
  if (!pipe?.groups) return { kind: "other" };

  // A UF may also sit inside the label ("Origem RS Personalizado"): lift it out of the variant.
  const labelTokens = pipe.groups.label.trim().split(/\s+/);
  const embeddedUf = labelTokens.find((t) => t in STATE_NAMES) ?? null;
  const labelWords = normalizeText(labelTokens.filter((t) => !(t in STATE_NAMES)).join(" ")).split(" ");
  const words = labelWords;
  const family = familyByInkLabel(words[0]);
  const title = pipe.groups.title.trim();
  const uf = pipe.groups.uf ?? embeddedUf;

  if (!family) {
    // Labels like "Essencia" look like a family but are not one of the eight: keep, never guess.
    const isLabelLike = words.length >= 1 && /^[a-z]+$/.test(words[0]) && uf !== null;
    return isLabelLike ? { kind: "unclassified", label: words.join(" "), uf, title } : { kind: "other" };
  }

  const rest = words.slice(1).join(" ");
  const variant = rest ? (VARIANT_ALIASES[rest] ?? rest) : "base";
  return { kind: "city-design", family: family.id, variant, title, uf };
}

export type CityResolution =
  | { ok: true; city: City; localityLabel?: string }
  | { ok: false; reason: ExclusionReason; detail?: string };

/** UFs a product may belong to: its own UF when the name states one, else the store's UFs. */
function candidateUfs(storeKey: CommerceStoreKey, statedUf: string | null): readonly string[] {
  const region = Object.values(REGIONS).find((r) => r.storeKey === storeKey);
  const storeUfs = region?.ufs ?? [];
  if (statedUf === null) return storeUfs;
  return storeUfs.includes(statedUf) ? [statedUf] : [];
}

function uniqueCity(name: string, ufs: readonly string[]): CityResolution {
  const matches = citiesByName(name, ufs);
  if (matches.length === 1) return { ok: true, city: matches[0] };
  if (matches.length > 1) {
    return { ok: false, reason: "ambiguous-city", detail: matches.map((c) => c.uf).join("/") };
  }
  return { ok: false, reason: "city-not-found" };
}

/**
 * Resolves the municipality for a parsed product. Never guesses: an unknown or ambiguous
 * city (e.g. a UF-less "Feito em Bom Jesus" that exists in two states) is reported, not resolved.
 */
export function resolveCity(
  parsed: Extract<ParsedName, { kind: "city-design" }>,
  product: Pick<InkProductNormalized, "tags" | "storeKey">,
): CityResolution {
  const ufs = candidateUfs(product.storeKey, parsed.uf);
  if (ufs.length === 0) return { ok: false, reason: "uf-mismatch", detail: parsed.uf ?? undefined };

  if (parsed.family === "gentilico") {
    // Title is the demonym ("Tijuquense"); the municipality lives in the first tag.
    const tag = product.tags[0];
    return tag ? uniqueCity(tag, ufs) : { ok: false, reason: "city-not-found" };
  }

  const direct = uniqueCity(parsed.title, ufs);
  if (direct.ok || direct.reason === "ambiguous-city") return direct;

  // The Federal District has a single municipality (Brasília): every named place inside it
  // (Taguatinga, Ceilândia...) is an administrative region, i.e. a locality, never a city.
  if (ufs.length === 1 && ufs[0] === "DF") {
    const [brasilia] = citiesByName("Brasília", ["DF"]);
    return brasilia ? { ok: true, city: brasilia, localityLabel: parsed.title } : direct;
  }

  if (parsed.family === "ponto-de-origem") {
    // "Praia Paraíso | Origem Localidade RS" with tag "Torres": a locality inside Torres.
    const stripped = parsed.title.replace(/^sou d[aeo]s?\s+/i, "");
    if (stripped !== parsed.title) {
      const viaPrefix = uniqueCity(stripped, ufs);
      if (viaPrefix.ok) return viaPrefix;
    }
    const tag = product.tags[0];
    if (tag) {
      const parent = uniqueCity(tag, ufs);
      if (parent.ok) return { ok: true, city: parent.city, localityLabel: parsed.title };
    }
  }
  return direct;
}

export function regionOfStore(storeKey: CommerceStoreKey): RegionSlug | null {
  return Object.values(REGIONS).find((r) => r.storeKey === storeKey)?.slug ?? null;
}
