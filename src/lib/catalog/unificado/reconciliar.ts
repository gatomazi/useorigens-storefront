import { UF_TO_REGION, REGIONS, type CommerceStoreKey, type RegionSlug } from "../../geo/regions";
import { cityById } from "../../geo/cities";
import { localityById } from "../../geo/localities";
import { buildStoreIndex } from "../indexer";
import { parseProductName } from "../parse";
import type { InkProductNormalized, UnrankedBinding } from "../types";
import { chaveMigracaoDoVinculo, chavePeca, chaveProduto, lugarDaChaveMigracao, MODELO_PARA_FAMILIA } from "./chave";
import { idNoEstado, type EstadoMigracao } from "./estado-migracao";
import type { ProdutoBruto } from "./produto-bruto";

/**
 * Reconciliação Centro/Norte → loja Sul unificada. Puro: recebe o que foi lido (lojas, coleções, estado do migrador) e devolve o mapa e a
 * classificação. Não fala com a INK, não grava nada. Docs: docs/migracao-ink/origens-ink-reconciliacao.md.
 *
 * Três unidades, nunca misturadas:
 *   - DESENHO  = chaveProduto (lugar + família + variante) — o que a vitrine mostra como um card;
 *   - PEÇA     = um produto INK (um id) = desenho × product_type (Camiseta, Oversized…) — o que o mapa liga, linha a linha;
 *   - VARIANTE = SKU INK (cor × modelo × tamanho) dentro de uma peça — só contada, nunca ligada.
 */

export const MAPA_VERSAO = 1;

export type ColecoesRegionais = { sul: ReadonlySet<string>; co: ReadonlySet<string>; no: ReadonlySet<string> };
export const COLECAO_SUL = 152030;
export const COLECAO_ZZ_CO = 152332;
export const COLECAO_ZZ_NO = 152395;

/** Bruto → forma que o indexador de produção entende, SEM o filtro de visibilidade (ocultos também são classificados). */
export function paraProdutoIndexavel(p: ProdutoBruto, storeKey: CommerceStoreKey, tagsOverride?: string[]): InkProductNormalized {
  return {
    id: p.id,
    storeKey,
    name: p.name,
    slug: p.slug,
    storeProductUrl: p.url ?? "",
    imageUrl: p.image ?? "",
    price: p.price === null ? null : Number(p.price),
    tags: tagsOverride ?? p.tags,
    clusterId: p.clusterId,
    totalSalesCount: p.sales,
    createdAt: p.createdAt,
  };
}

// ─── Classificação de um catálogo (por loja ou por região dentro da loja unificada) ───────────────────────────────────────────────

export type Classificado = {
  produto: ProdutoBruto;
  tipo: "desenho" | "merch" | "excluido";
  vinculo?: UnrankedBinding;
  /** Herdou cidade/família de outra peça do mesmo `product_cluster_id` (a única ligação entre peças que o ADR autoriza). */
  viaCluster?: string;
  motivoExclusao?: string;
};

function indexarUm(storeKey: CommerceStoreKey, produtos: InkProductNormalized[], scope?: { ufs: readonly string[]; region: RegionSlug }) {
  return buildStoreIndex(storeKey, produtos, "", scope);
}

/**
 * Classifica produtos com o indexador de produção. Peças que não resolvem sozinhas (ex.: cópia de Gentílico sem tag de cidade) herdam o
 * vínculo de outra peça do MESMO cluster que resolve — só quando todas as que resolvem concordam no desenho; discordância vira exclusão
 * explícita, nunca escolha.
 */
export function classificarPorIndexador(
  storeKey: CommerceStoreKey,
  produtos: readonly ProdutoBruto[],
  scope?: { ufs: readonly string[]; region: RegionSlug },
  tagsDe?: (p: ProdutoBruto) => string[] | undefined,
): Map<string, Classificado> {
  const idx = indexarUm(storeKey, produtos.map((p) => paraProdutoIndexavel(p, storeKey, tagsDe?.(p))), scope);
  const porId = new Map(produtos.map((p) => [p.id, p]));
  const out = new Map<string, Classificado>();
  for (const b of idx.bindings) out.set(b.inkProductId, { produto: porId.get(b.inkProductId)!, tipo: "desenho", vinculo: b });
  for (const m of idx.merch) out.set(m.inkProductId, { produto: porId.get(m.inkProductId)!, tipo: "merch" });
  for (const e of idx.excluded) out.set(e.inkProductId, { produto: porId.get(e.inkProductId)!, tipo: "excluido", motivoExclusao: `${e.reason}${e.detail ? ` (${e.detail})` : ""}` });

  // Herança por cluster.
  const porCluster = new Map<string, Classificado[]>();
  for (const c of out.values()) {
    if (!c.produto.clusterId) continue;
    porCluster.set(c.produto.clusterId, [...(porCluster.get(c.produto.clusterId) ?? []), c]);
  }
  for (const [cluster, membros] of porCluster) {
    const resolvidos = membros.filter((m) => m.tipo === "desenho" && !m.viaCluster);
    const chaves = new Set(resolvidos.map((m) => chaveProduto(m.vinculo!)));
    for (const m of membros) {
      if (m.tipo !== "excluido") continue;
      // Só herda quem parece desenho de cidade: merch nunca vira desenho por estar no cluster.
      if (parseProductName(m.produto.name).kind === "other") continue;
      if (chaves.size === 1) {
        const modelo = resolvidos[0].vinculo!;
        out.set(m.produto.id, {
          produto: m.produto,
          tipo: "desenho",
          viaCluster: cluster,
          vinculo: { ...modelo, inkProductId: m.produto.id, slug: m.produto.slug, storeProductUrl: m.produto.url ?? "", imageUrl: m.produto.image ?? "", price: m.produto.price === null ? null : Number(m.produto.price), productClusterId: cluster },
        });
      } else if (chaves.size > 1) {
        m.motivoExclusao = `${m.motivoExclusao}; cluster ${cluster} com desenhos divergentes (${[...chaves].join(" ≠ ")})`;
      }
    }
  }
  return out;
}

// ─── Região de cada produto da loja Sul ────────────────────────────────────────────────────────────────────────────────────────────

export type RegiaoSombra = RegionSlug | "desconhecida" | "conflito";

export type ProdutoSul = {
  produto: ProdutoBruto;
  regiao: RegiaoSombra;
  /** Evidências usadas, em ordem de confiança: estado do migrador, coleção regional (SUL / ZZ - CO / ZZ - NO), UF do nome (só diagnóstico). */
  evidencias: string[];
  diagnostico?: string;
  /** Item do migrador dono deste id (vínculo vigente). */
  chaveMigracao?: string;
  tipoNoEstado?: number;
  classificado?: Classificado;
};

const REGIAO_DA_COLECAO: Record<"sul" | "co" | "no", RegionSlug> = { sul: "sul", co: "centro-oeste", no: "norte" };

/**
 * Corte da migração: o primeiro produto que o migrador criou na Sul (menor id do estado) e o instante do primeiro registro. Antes dele a loja
 * Sul só tinha produtos do Sul (ADR 0001: as três lojas com UFs disjuntas; plano do migrador §10: execução a partir de 12/09). Uma peça com
 * id E data anteriores ao corte é Sul por esse fato histórico — evidência própria, mais fraca que estado/coleção e ainda sujeita ao
 * confronto com a UF do nome.
 */
export type CorteMigracao = { menorId: number; inicio: string };

export function corteDaMigracao(estado: EstadoMigracao, primeiroRegistro: string): CorteMigracao {
  let menorId = Infinity;
  for (const id of estado.donoDoId.keys()) menorId = Math.min(menorId, Number(id));
  for (const it of estado.itens.values()) for (const id of it.idsDescartados) menorId = Math.min(menorId, Number(id));
  return { menorId, inicio: primeiroRegistro };
}

export function classificarRegioesSul(produtos: readonly ProdutoBruto[], colecoes: ColecoesRegionais, estado: EstadoMigracao, corte?: CorteMigracao): Map<string, ProdutoSul> {
  const out = new Map<string, ProdutoSul>();
  for (const p of produtos) {
    const evid: string[] = [];
    const candidatas = new Set<RegionSlug>();
    const dono = estado.donoDoId.get(p.id);
    if (dono) {
      const uf = dono.chave.split("/")[1];
      const r = UF_TO_REGION[uf];
      if (r) {
        candidatas.add(r);
        evid.push(`estado:${dono.chave}`);
      }
    }
    for (const k of ["sul", "co", "no"] as const) {
      if (colecoes[k].has(p.id)) {
        candidatas.add(REGIAO_DA_COLECAO[k]);
        evid.push(`colecao:${k === "sul" ? COLECAO_SUL : k === "co" ? COLECAO_ZZ_CO : COLECAO_ZZ_NO}`);
      }
    }
    if (candidatas.size === 0 && corte && Number(p.id) < corte.menorId && p.createdAt && Date.parse(p.createdAt) < Date.parse(corte.inicio)) {
      candidatas.add("sul");
      evid.push("anterior-migracao");
    }
    const parsed = parseProductName(p.name);
    const ufNome = parsed.kind !== "other" ? parsed.uf : null;
    const regiaoNome = ufNome ? UF_TO_REGION[ufNome] : undefined;
    if (regiaoNome) evid.push(`nome:${ufNome}`);

    let regiao: RegiaoSombra;
    let diagnostico: string | undefined;
    if (candidatas.size > 1) {
      regiao = "conflito";
      diagnostico = `evidências apontam regiões diferentes: ${[...candidatas].join(" × ")}`;
    } else if (candidatas.size === 1) {
      regiao = [...candidatas][0];
      if (regiaoNome && regiaoNome !== regiao) {
        regiao = "conflito";
        diagnostico = `UF do nome (${ufNome}) é de ${regiaoNome}, mas estado/coleção dizem ${[...candidatas][0]}`;
      }
    } else {
      regiao = "desconhecida";
      diagnostico = regiaoNome
        ? `sem estado do migrador nem coleção regional; o nome sugere ${regiaoNome} (${ufNome}) — não basta para classificar`
        : parsed.kind === "other"
          ? "produto não geográfico sem coleção regional"
          : "sem estado do migrador, sem coleção regional e sem UF no nome";
    }
    out.set(p.id, { produto: p, regiao, evidencias: evid, ...(diagnostico ? { diagnostico } : {}), ...(dono ? { chaveMigracao: dono.chave, tipoNoEstado: dono.tipo } : {}) });
  }
  return out;
}

/**
 * Desenho de cada produto da Sul já com região: quem tem dono no estado do migrador recebe a cidade DA CHAVE (vínculo persistido, a fonte
 * mais forte — necessário no Gentílico, cujo nome não tem cidade e cujas peças migradas não têm tag); o resto passa pelo indexador de
 * produção restrito às UFs da região. Divergência entre o nome e a chave é diagnosticada, não resolvida.
 */
export function classificarDesenhosSul(sul: Map<string, ProdutoSul>, estado: EstadoMigracao): void {
  for (const regiao of Object.keys(REGIONS) as RegionSlug[]) {
    const daRegiao = [...sul.values()].filter((s) => s.regiao === regiao);
    const tagsDe = (p: ProdutoBruto): string[] | undefined => {
      const s = sul.get(p.id)!;
      if (!s.chaveMigracao || p.tags.length) return undefined;
      const it = estado.itens.get(s.chaveMigracao)!;
      const lugar = lugarDaChaveMigracao(it.uf, it.cidadeNorm);
      return lugar.ok ? [lugar.nome] : undefined;
    };
    const cls = classificarPorIndexador("use-sul", daRegiao.map((s) => s.produto), { ufs: REGIONS[regiao].ufs, region: regiao }, tagsDe);
    for (const s of daRegiao) {
      const c = cls.get(s.produto.id)!;
      s.classificado = c;
      if (!s.chaveMigracao) continue;
      // Vínculo do estado manda: monta o desenho a partir da chave e confronta com o que o nome deu.
      const it = estado.itens.get(s.chaveMigracao)!;
      const lugar = lugarDaChaveMigracao(it.uf, it.cidadeNorm);
      const familia = MODELO_PARA_FAMILIA[it.modelo];
      if (!lugar.ok || !familia) {
        s.diagnostico = [s.diagnostico, `chave do estado não resolve: ${lugar.ok ? `modelo ${it.modelo}` : lugar.motivo}`].filter(Boolean).join("; ");
        continue;
      }
      const doEstado: UnrankedBinding = {
        cityId: lugar.cityId,
        designFamily: familia,
        designVariant: "base",
        variantLabel: "Principal",
        ...(lugar.localityId ? { localityId: lugar.localityId, localityLabel: lugar.localityLabel, parentCityId: lugar.cityId } : {}),
        ...(s.produto.clusterId ? { productClusterId: s.produto.clusterId } : {}),
        commerceStoreKey: "use-sul",
        inkProductId: s.produto.id,
        slug: s.produto.slug,
        storeProductUrl: s.produto.url ?? "",
        imageUrl: s.produto.image ?? "",
        price: s.produto.price === null ? null : Number(s.produto.price),
        syncedAt: "",
        totalSalesCount: s.produto.sales,
      };
      if (c.tipo === "desenho" && chaveProduto(c.vinculo!) !== chaveProduto(doEstado)) {
        s.diagnostico = [s.diagnostico, `nome (${chaveProduto(c.vinculo!)}) diverge da chave do estado (${chaveProduto(doEstado)}); vale o estado`].filter(Boolean).join("; ");
      }
      s.classificado = { produto: s.produto, tipo: "desenho", vinculo: doEstado };
    }
  }
}

// ─── Mapa antigo → novo ────────────────────────────────────────────────────────────────────────────────────────────────────────────

export type StatusMapa = "confirmado" | "ausente" | "ambiguo" | "sem-chave";
export type LinhaMapa = {
  mapaVersao: number;
  lojaAntiga: CommerceStoreKey;
  idAntigo: string;
  nomeAntigo: string;
  urlAntiga: string | null;
  visivelAntigo: boolean;
  statusInkAntigo: string | null;
  tipoPecaId: number | null;
  tipoPeca: string | null;
  regiao: RegionSlug;
  uf: string | null;
  cidadeId: string | null;
  cidade: string | null;
  localidade: string | null;
  familia: string | null;
  variante: string | null;
  chaveProduto: string | null;
  chavePeca: string | null;
  chaveMigracao: string | null;
  idNovo: string | null;
  urlNova: string | null;
  nomeNovo: string | null;
  visivelNovo: boolean | null;
  statusInkNovo: string | null;
  aprovacaoNova: string | null;
  imagemNova: "ok" | "pendente" | null;
  variantesAntigo: string;
  variantesNovo: string | null;
  problemaVariantes: string | null;
  precoAntigo: string | null;
  precoNovo: string | null;
  divergenciaPreco: boolean | null;
  metodo: string | null;
  evidencia: string;
  status: StatusMapa;
  motivo: string | null;
  candidatos: string | null;
};

const fmtVar = (p: ProdutoBruto) => `${p.variants.available}/${p.variants.total}`;

/** Problemas objetivos de variante na peça nova — nada comparado entre paletas de lojas diferentes (as cores mudam de loja para loja). */
export function problemaDeVariantes(novo: ProdutoBruto, antigo?: ProdutoBruto): string | null {
  const p: string[] = [];
  if (novo.variants.total === 0) p.push("sem variantes");
  else if (novo.variants.available === 0) p.push("nenhuma variante disponível");
  if (antigo) {
    const faltaModelo = antigo.variants.models.filter((m) => !novo.variants.models.includes(m));
    if (faltaModelo.length && novo.variants.total > 0) p.push(`modelo(s) ausente(s) no destino: ${faltaModelo.join(", ")}`);
  }
  if (novo.approval === "resizing") p.push("approval_status=resizing");
  if (novo.approval === "rejected") p.push("approval_status=rejected");
  return p.length ? p.join("; ") : null;
}

export function reconciliar(input: {
  antigas: { storeKey: CommerceStoreKey; produtos: readonly ProdutoBruto[] }[];
  sul: Map<string, ProdutoSul>;
  estado: EstadoMigracao;
}): LinhaMapa[] {
  const { sul, estado } = input;
  // Índice do destino: chavePeca → ids (só produtos com região CO/NO confirmada; desconhecidos/conflito NÃO servem de prova).
  const destinoPorPeca = new Map<string, string[]>();
  for (const s of sul.values()) {
    if (s.regiao !== "centro-oeste" && s.regiao !== "norte") continue;
    if (s.classificado?.tipo !== "desenho") continue;
    const k = chavePeca(chaveProduto(s.classificado.vinculo!), s.produto.typeId);
    destinoPorPeca.set(k, [...(destinoPorPeca.get(k) ?? []), s.produto.id]);
  }

  // Pista (nunca prova) para quem não tem chave: mesmo nome exato e mesma peça no destino.
  const destinoPorNome = new Map<string, string[]>();
  for (const s of sul.values()) {
    const k = `${s.produto.name.trim()}|${s.produto.typeId}`;
    destinoPorNome.set(k, [...(destinoPorNome.get(k) ?? []), s.produto.id]);
  }

  const linhas: LinhaMapa[] = [];
  for (const { storeKey, produtos } of input.antigas) {
    const regiao = (Object.values(REGIONS).find((r) => r.storeKey === storeKey)?.slug ?? "sul") as RegionSlug;
    const cls = classificarPorIndexador(storeKey, produtos);
    for (const p of produtos) {
      const c = cls.get(p.id)!;
      const base: Omit<LinhaMapa, "status" | "motivo" | "metodo" | "evidencia" | "idNovo" | "urlNova" | "nomeNovo" | "visivelNovo" | "statusInkNovo" | "aprovacaoNova" | "imagemNova" | "variantesNovo" | "problemaVariantes" | "precoNovo" | "divergenciaPreco" | "candidatos"> = {
        mapaVersao: MAPA_VERSAO,
        lojaAntiga: storeKey,
        idAntigo: p.id,
        nomeAntigo: p.name,
        urlAntiga: p.url,
        visivelAntigo: p.visible,
        statusInkAntigo: p.status,
        tipoPecaId: p.typeId,
        tipoPeca: p.typeName,
        regiao,
        uf: null,
        cidadeId: null,
        cidade: null,
        localidade: null,
        familia: null,
        variante: null,
        chaveProduto: null,
        chavePeca: null,
        chaveMigracao: null,
        variantesAntigo: fmtVar(p),
        precoAntigo: p.price,
      };
      const vazio = { idNovo: null, urlNova: null, nomeNovo: null, visivelNovo: null, statusInkNovo: null, aprovacaoNova: null, imagemNova: null, variantesNovo: null, problemaVariantes: null, precoNovo: null, divergenciaPreco: null, candidatos: null } as const;

      if (c.tipo !== "desenho") {
        // Sem chave de identidade: merch, ou desenho que o próprio indexador de produção não resolve. Nome igual no destino é só pista.
        const mesmoNome = destinoPorNome.get(`${p.name.trim()}|${p.typeId}`) ?? [];
        linhas.push({
          ...base,
          ...vazio,
          metodo: null,
          evidencia: c.tipo === "merch" ? "produto não geográfico (merch)" : `indexador: ${c.motivoExclusao}`,
          status: "sem-chave",
          motivo: c.tipo === "merch" ? "merch/linha não geográfica: o migrador não copia; sem chave de identidade documentada" : `desenho sem cidade resolvida na origem: ${c.motivoExclusao}`,
          candidatos: mesmoNome.length ? `mesmo nome e peça no destino (NÃO confirmado): ${mesmoNome.slice(0, 5).join(", ")}${mesmoNome.length > 5 ? ` +${mesmoNome.length - 5}` : ""}` : null,
        });
        continue;
      }

      const v = c.vinculo!;
      const lugar = v.localityId ? localityById(v.localityId) : cityById(v.cityId);
      const kProd = chaveProduto(v);
      const kPeca = chavePeca(kProd, p.typeId);
      const mig = chaveMigracaoDoVinculo(v);
      const ident = {
        uf: lugar?.uf ?? null,
        cidadeId: v.cityId,
        cidade: cityById(v.cityId)?.name ?? null,
        localidade: v.localityLabel ?? null,
        familia: v.designFamily,
        variante: v.designVariant,
        chaveProduto: kProd,
        chavePeca: kPeca,
        chaveMigracao: mig.ok ? mig.chave : null,
      };
      const viaCluster = c.viaCluster ? `; cidade herdada do cluster ${c.viaCluster}` : "";
      // Mesma peça no destino; quando há mais de uma, desempata pela chave do migrador do PRÓPRIO produto (RA com dois nomes).
      let candidatosCatalogo = destinoPorPeca.get(kPeca) ?? [];
      if (candidatosCatalogo.length > 1 && mig.ok) {
        const mesmos = candidatosCatalogo.filter((id) => {
          const m2 = chaveMigracaoDoVinculo(sul.get(id)!.classificado!.vinculo!);
          return m2.ok && m2.chave === mig.chave;
        });
        if (mesmos.length) candidatosCatalogo = mesmos;
      }

      const preencherNovo = (id: string) => {
        const n = sul.get(id)!.produto;
        return {
          idNovo: n.id,
          urlNova: n.url,
          nomeNovo: n.name,
          visivelNovo: n.visible,
          statusInkNovo: n.status,
          aprovacaoNova: n.approval,
          imagemNova: n.image ? ("ok" as const) : ("pendente" as const),
          variantesNovo: fmtVar(n),
          problemaVariantes: problemaDeVariantes(n, p),
          precoNovo: n.price,
          divergenciaPreco: p.price !== null && n.price !== null ? Number(p.price) !== Number(n.price) : null,
        };
      };

      const item = mig.ok ? estado.itens.get(mig.chave) : undefined;
      const esperado = item && p.typeId !== null ? idNoEstado(item, p.typeId) : undefined;

      if (esperado) {
        if (sul.has(esperado)) {
          const outros = candidatosCatalogo.filter((id) => id !== esperado);
          const s = sul.get(esperado)!;
          const conflitoRegiao = s.regiao !== regiao ? `; ATENÇÃO região do destino = ${s.regiao}` : "";
          linhas.push({
            ...base,
            ...ident,
            ...vazio,
            ...preencherNovo(esperado),
            metodo: "estado-migrador",
            evidencia: `estado ${mig.ok ? mig.chave : ""} tipo ${p.typeId} → ${esperado}${item!.adotado ? " (adotado por nome no lote)" : ""}${viaCluster}${conflitoRegiao}`,
            status: s.regiao === regiao ? "confirmado" : "ambiguo",
            motivo: s.regiao === regiao ? null : `id do estado existe, mas a classificação regional do destino é ${s.regiao}: ${s.diagnostico ?? ""}`,
            candidatos: outros.length ? `COLISÃO no destino — outras peças com a mesma chave: ${outros.join(", ")}` : null,
          });
        } else {
          linhas.push({
            ...base,
            ...ident,
            ...vazio,
            metodo: "estado-migrador",
            evidencia: `estado aponta ${esperado}${viaCluster}`,
            status: "ausente",
            motivo: `o estado registra ${esperado} para esta peça, mas ele não existe na leitura da loja Sul (apagado?)`,
            candidatos: candidatosCatalogo.length ? `peças com a mesma chave no destino: ${candidatosCatalogo.join(", ")}` : null,
          });
        }
        continue;
      }

      if (candidatosCatalogo.length === 1) {
        const s = sul.get(candidatosCatalogo[0])!;
        linhas.push({
          ...base,
          ...ident,
          ...vazio,
          ...preencherNovo(candidatosCatalogo[0]),
          metodo: "catalogo-chave",
          evidencia: `única peça ${kPeca} no destino com região ${s.regiao} por ${s.evidencias.filter((e) => !e.startsWith("nome:")).join("+")}${viaCluster}`,
          status: "confirmado",
          motivo: item ? `item ${item.chave} no estado sem id para o tipo ${p.typeId}; vínculo pelo catálogo` : null,
          candidatos: null,
        });
        continue;
      }
      if (candidatosCatalogo.length > 1) {
        linhas.push({
          ...base,
          ...ident,
          ...vazio,
          metodo: "catalogo-chave",
          evidencia: `${candidatosCatalogo.length} peças ${kPeca} no destino${viaCluster}`,
          status: "ambiguo",
          motivo: "mais de uma peça no destino com a mesma chave e nenhuma registrada no estado — duplicata a resolver",
          candidatos: candidatosCatalogo.join(", "),
        });
        continue;
      }

      let motivo: string;
      if (!mig.ok) motivo = mig.motivo;
      else if (p.typeId !== null && ![1, 165, 72, 2, 178, 23, 28, 119, 8, 120].includes(p.typeId)) motivo = `tipo de peça ${p.typeName ?? p.typeId} não está entre as 10 que o migrador cria`;
      else if (!item) motivo = `item ${mig.chave} não aparece no estado do migrador (não rodado, bloqueado ou fora do acervo)`;
      else if (!item.baseId) motivo = `item ${mig.chave} no estado sem Camiseta base${item.ultimoErro ? ` (último erro: ${item.ultimoErro})` : ""}`;
      else motivo = `item ${mig.chave} tem base ${item.baseId}, mas a cópia para ${p.typeName ?? p.typeId} não foi feita`;
      linhas.push({ ...base, ...ident, ...vazio, metodo: null, evidencia: `sem vínculo${viaCluster}`, status: "ausente", motivo, candidatos: null });
    }
  }

  // Colisão inversa: duas peças antigas apontando para a mesma peça nova.
  const porNovo = new Map<string, LinhaMapa[]>();
  for (const l of linhas) if (l.idNovo) porNovo.set(l.idNovo, [...(porNovo.get(l.idNovo) ?? []), l]);
  for (const [idNovo, ls] of porNovo) {
    if (ls.length < 2) continue;
    // Mesmo nome e mesma peça repetidos NA ORIGEM (a loja antiga tem duas cópias iguais): muitos-para-um legítimo — as duas URLs antigas
    // levam à mesma peça nova. Nomes diferentes ("Maraã" × "Sou de Maraã") podem ser artes diferentes: aí é ambíguo.
    const nomes = new Set(ls.map((l) => l.nomeAntigo.normalize("NFC").trim()));
    if (nomes.size === 1) {
      for (const l of ls) {
        l.motivo = [l.motivo, `duplicata na origem: ${ls.length} peças antigas iguais (${ls.map((x) => x.idAntigo).join(", ")}) → ${idNovo}`].filter(Boolean).join("; ");
      }
      continue;
    }
    for (const l of ls) {
      l.status = "ambiguo";
      l.motivo = [l.motivo, `COLISÃO: ${ls.length} peças antigas (${ls.map((x) => `${x.lojaAntiga}:${x.idAntigo}`).join(", ")}) apontam para ${idNovo}`].filter(Boolean).join("; ");
    }
  }
  return linhas;
}

// ─── Índice sombra ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// A montagem do que a vitrine serve a partir da loja única (catálogo, peças, coleções) está em ./loja-unica.ts (`montarLojaUnica`), usada
// pela reconciliação, pela geração da prévia e pelo sync — uma implementação só.
