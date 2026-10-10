import { allAdministrativeRegions, DF_MUNICIPALITY_ID, DF_UF } from "../../geo/administrative-regions";
import { allCities, cityById, type Locality } from "../../geo/cities";
import { localityById } from "../../geo/localities";
import { normalizeText } from "../../geo/text";
import type { DesignFamilyId } from "../families";
import type { UnrankedBinding } from "../types";

/**
 * Identidade de produto entre lojas, derivada do contrato existente (ADR 0001, emenda 2026-09-21): a chave de vínculo é
 * `(cityId, designFamily, designVariant, inkProductId)`. Tirando o `inkProductId` — que muda de loja para loja por definição — o que sobra
 * é a identidade do DESENHO, e com o `product_type.id` (global na INK, ver garments.ts) a identidade da PEÇA. Nenhuma chave nova: só a
 * parte estável da que já existe, mais o tipo de peça que o índice de peças (GarmentBinding) já usa.
 *
 *   chaveProduto = <localidade>|<família>|<variante>[|sub:<rótulo>]      (localidade = RA do DF quando houver, senão município IBGE)
 *   chavePeca    = chaveProduto|t<product_type.id>
 */
export function chaveProduto(b: Pick<UnrankedBinding, "cityId" | "localityId" | "localityLabel" | "designFamily" | "designVariant">): string {
  const lugar = b.localityId ?? b.cityId;
  const sub = b.localityLabel && !b.localityId ? `|sub:${normalizeText(b.localityLabel)}` : "";
  return `${lugar}|${b.designFamily}|${b.designVariant}${sub}`;
}

export function chavePeca(chave: string, tipo: number | null): string {
  return `${chave}|t${tipo ?? "?"}`;
}

/** Modelo do migrador (pasta do acervo) ↔ família do storefront. O migrador só cria a variante "base" de cada família. */
export const MODELO_PARA_FAMILIA: Readonly<Record<string, DesignFamilyId>> = {
  coordenadas: "coordenadas",
  legado: "legado",
  origem: "ponto-de-origem",
  territorio: "territorio",
  tipografia: "tipografia",
  traco: "traco",
  gentilicos: "gentilico",
  feito_em: "feito-em",
};
const FAMILIA_PARA_MODELO = new Map(Object.entries(MODELO_PARA_FAMILIA).map(([m, f]) => [f, m]));

/** Mesma normalização do migrador (`norm` em migracao-config.mjs): sem acento, minúscula, só [a-z0-9]. */
export const normMigrador = (s: string): string =>
  String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

type LugarIndexado = Locality & { rotulo: string };
let indice: Map<string, LugarIndexado[]> | null = null;
/** (UF, nome normalizado à moda do migrador) → municípios e RAs do DF. Lista, para a colisão ficar visível em vez de escolhida. */
function indiceLugares(): Map<string, LugarIndexado[]> {
  if (indice) return indice;
  indice = new Map();
  for (const l of [...allCities(), ...allAdministrativeRegions()]) {
    // RAs também pelos aliases oficiais ("Sudoeste Octogonal" = "Sudoeste/Octogonal"), a mesma regra de administrativeRegionByLabel.
    // O rótulo guardado é o nome pelo qual a chave achou o lugar: "SCIA" e "Estrutural" são itens distintos do migrador para a MESMA RA.
    for (const rotulo of [l.name, ...(l.type === "administrative_region" ? (l.aliases ?? []) : [])]) {
      const k = `${l.uf}/${normMigrador(rotulo)}`;
      if (!(indice.get(k) ?? []).some((x) => x.id === l.id)) indice.set(k, [...(indice.get(k) ?? []), { ...l, rotulo }]);
    }
  }
  return indice;
}

export type LugarDaChave = { ok: true; cityId: string; localityId?: string; localityLabel?: string; nome: string } | { ok: false; motivo: string };

/** Resolve o `<uf>/<cidade>` de uma chave do migrador num lugar IBGE (ou RA do DF). Ambíguo ou ausente é reportado, nunca escolhido. */
export function lugarDaChaveMigracao(uf: string, cidadeNorm: string): LugarDaChave {
  const achados = indiceLugares().get(`${uf}/${cidadeNorm}`) ?? [];
  // No DF, "brasilia" é o município; qualquer outro nome é uma RA (localidade de Brasília).
  const municipios = achados.filter((l) => l.type === "municipality");
  const ras = achados.filter((l) => l.type === "administrative_region");
  if (municipios.length === 1 && (uf !== DF_UF || ras.length === 0)) return { ok: true, cityId: municipios[0].id, nome: municipios[0].name };
  if (uf === DF_UF && ras.length === 1) {
    return { ok: true, cityId: DF_MUNICIPALITY_ID, localityId: ras[0].id, localityLabel: ras[0].rotulo, nome: ras[0].rotulo };
  }
  if (achados.length > 1) return { ok: false, motivo: `nome de lugar ambíguo na UF (${achados.map((l) => l.id).join(", ")})` };
  return { ok: false, motivo: "cidade da chave não existe no índice IBGE/RA" };
}

/** Chave do migrador `<modelo>/<UF>/<cidade>` que corresponde a um vínculo, ou o motivo de não haver (fora do escopo do migrador). */
export function chaveMigracaoDoVinculo(
  b: Pick<UnrankedBinding, "cityId" | "localityId" | "localityLabel" | "designFamily" | "designVariant">,
): { ok: true; chave: string } | { ok: false; motivo: string } {
  const modelo = FAMILIA_PARA_MODELO.get(b.designFamily);
  if (!modelo) return { ok: false, motivo: `família ${b.designFamily} sem modelo no migrador` };
  if (b.designVariant !== "base") return { ok: false, motivo: `variante "${b.designVariant}" fora do escopo do migrador (só cria a base)` };
  if (b.localityLabel && !b.localityId) return { ok: false, motivo: `produto de localidade ("${b.localityLabel}") fora do escopo do migrador` };
  const lugar = b.localityId ? localityById(b.localityId) : cityById(b.cityId);
  if (!lugar) return { ok: false, motivo: "lugar do vínculo não encontrado no índice" };
  // RA do DF: o migrador tem um item por NOME do produto ("SCIA", "Estrutural"), mesmo quando o índice junta os dois numa RA só.
  const nome = b.localityId && b.localityLabel ? b.localityLabel : lugar.name;
  return { ok: true, chave: `${modelo}/${lugar.uf}/${normMigrador(nome)}` };
}
