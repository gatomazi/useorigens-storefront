/**
 * Leitura do estado do migrador Centro/Norte → Sul (`orgulhoregional/scripts/.migracao-estado.jsonl`, append-only). O redutor é o MESMO
 * do migrador (`migracao-lote.mjs` aplicarNoEstado / `migracao-verificar.mjs`): `criado` registra a Camiseta base, `copia` uma peça,
 * `reaberto` zera o item (produto apagado à mão e recriado depois), `corrigido` não muda vínculo. Só lê: o arquivo original nunca é
 * regravado — a reconciliação trabalha sobre uma cópia preservada (data/unificado/estado/).
 */
export type ItemMigracao = {
  chave: string;
  modelo: string;
  uf: string;
  cidadeNorm: string;
  nome?: string;
  /** Camiseta base (product_type 1). */
  baseId?: string;
  /** product_type → id da cópia. Uma recópia do mesmo tipo substitui a anterior (é o que o /copy da INK faz no agrupamento). */
  copias: Map<number, string>;
  /** Ids que o item já teve e perdeu num `reaberto` (apagados à mão): nunca devem aparecer como vínculo. */
  idsDescartados: Set<string>;
  concluido: boolean;
  adotado: boolean;
  ultimoErro?: string;
  reaberturas: number;
};

export type EstadoMigracao = {
  itens: Map<string, ItemMigracao>;
  /** id de produto na Sul → item e tipo, só para vínculos VIGENTES (depois de aplicar `reaberto`). */
  donoDoId: Map<string, { chave: string; tipo: number }>;
  linhas: number;
  linhasInvalidas: number;
  /** `em` do registro mais antigo: início da execução do migrador. */
  primeiroRegistro: string;
};

export const TIPO_BASE_MIGRACAO = 1;

export function lerEstadoMigracao(conteudo: string): EstadoMigracao {
  const itens = new Map<string, ItemMigracao>();
  let linhas = 0;
  let linhasInvalidas = 0;
  let primeiroRegistro = "";
  for (const linha of conteudo.split("\n")) {
    if (!linha.trim()) continue;
    linhas++;
    let r: Record<string, unknown>;
    try {
      r = JSON.parse(linha) as Record<string, unknown>;
    } catch {
      linhasInvalidas++;
      continue;
    }
    const chave = typeof r.chave === "string" ? r.chave : null;
    const partes = chave?.split("/") ?? [];
    if (!chave || partes.length !== 3) {
      linhasInvalidas++;
      continue;
    }
    const it: ItemMigracao = itens.get(chave) ?? {
      chave,
      modelo: partes[0],
      uf: partes[1],
      cidadeNorm: partes[2],
      copias: new Map(),
      idsDescartados: new Set(),
      concluido: false,
      adotado: false,
      reaberturas: 0,
    };
    if (typeof r.em === "string" && (!primeiroRegistro || r.em < primeiroRegistro)) primeiroRegistro = r.em;
    if (typeof r.nome === "string") it.nome = r.nome;
    switch (r.fase) {
      case "criado":
        it.baseId = String(r.produtoId);
        if (r.adotado === true) it.adotado = true;
        break;
      case "copia":
        it.copias.set(Number(r.tipo), String(r.id));
        break;
      case "concluido":
        it.concluido = true;
        break;
      case "erro":
        it.ultimoErro = typeof r.erro === "string" ? r.erro : String(r.erro);
        break;
      case "reaberto":
        if (it.baseId) it.idsDescartados.add(it.baseId);
        for (const id of it.copias.values()) it.idsDescartados.add(id);
        it.baseId = undefined;
        it.copias = new Map();
        it.concluido = false;
        it.reaberturas++;
        break;
    }
    itens.set(chave, it);
  }
  const donoDoId = new Map<string, { chave: string; tipo: number }>();
  for (const it of itens.values()) {
    if (it.baseId) donoDoId.set(it.baseId, { chave: it.chave, tipo: TIPO_BASE_MIGRACAO });
    for (const [tipo, id] of it.copias) donoDoId.set(id, { chave: it.chave, tipo });
  }
  return { itens, donoDoId, linhas, linhasInvalidas, primeiroRegistro };
}

/** id esperado no destino para um tipo de peça, segundo o estado. */
export function idNoEstado(item: ItemMigracao, tipo: number): string | undefined {
  return tipo === TIPO_BASE_MIGRACAO ? item.baseId : item.copias.get(tipo);
}
