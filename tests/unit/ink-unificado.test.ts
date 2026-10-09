import path from "node:path";
import { describe, expect, test } from "vitest";
import { parseProductName } from "@/lib/catalog/parse";
import { chaveMigracaoDoVinculo, lugarDaChaveMigracao } from "@/lib/catalog/unificado/chave";
import { assertForaDaProducao } from "@/lib/catalog/unificado/destino";
import { lerEstadoMigracao } from "@/lib/catalog/unificado/estado-migracao";
import type { ProdutoBruto } from "@/lib/catalog/unificado/produto-bruto";
import {
  classificarDesenhosSul,
  classificarRegioesSul,
  corteDaMigracao,
  reconciliar,
  type ColecoesRegionais,
} from "@/lib/catalog/unificado/reconciliar";
import { montarLojaUnica } from "@/lib/catalog/unificado/loja-unica";

let seq = 1000;
function produto(name: string, extra: Partial<ProdutoBruto> = {}): ProdutoBruto {
  const id = String(seq++);
  return {
    id,
    name,
    slug: `p-${id}`,
    url: `https://www.usesul.com.br/usesul/product/p-${id}`,
    image: `https://gcp-images.majestic.ink.rsvcloud.com/images/product_v2/${id}.jpg`,
    price: "109.9",
    promotionalPrice: null,
    clusterId: null,
    typeId: 1,
    typeName: "Camiseta",
    status: "not_published",
    visible: false,
    approval: "waiting",
    tags: [],
    createdAt: null,
    updatedAt: null,
    sales: 0,
    variants: { total: 18, available: 18, colors: ["Preta"], models: ["Baby Look Feminino", "Clássica Masculina"] },
    ...extra,
  };
}
const linhaEstado = (o: Record<string, unknown>) => JSON.stringify(o);
const colecoes = (sul: string[] = [], co: string[] = [], no: string[] = []): ColecoesRegionais => ({ sul: new Set(sul), co: new Set(co), no: new Set(no) });

describe("parseProductName — nome criado pelo migrador", () => {
  test("given 'Feito em <Cidade> <UF>' sem hífen, then a UF sai da cidade", () => {
    expect(parseProductName("Feito em Bodoquena MS")).toMatchObject({ kind: "city-design", family: "feito-em", title: "Bodoquena", uf: "MS" });
  });
  test("given as formas de produção, then nada muda", () => {
    expect(parseProductName("Feito Em Bodoquena - MS")).toMatchObject({ title: "Bodoquena", uf: "MS" });
    expect(parseProductName("Feito em Turvo")).toMatchObject({ title: "Turvo", uf: null });
    // Duas letras que não são UF continuam parte do nome.
    expect(parseProductName("Feito em Cidade XY")).toMatchObject({ title: "Cidade XY", uf: null });
  });
});

describe("estado do migrador", () => {
  test("given um item reaberto, then os ids anteriores deixam de ser vínculo e o recriado vale", () => {
    const e = lerEstadoMigracao(
      [
        linhaEstado({ chave: "origem/MS/anastacio", fase: "criado", produtoId: 1, nome: "Anastácio | Origem MS" }),
        linhaEstado({ chave: "origem/MS/anastacio", fase: "copia", tipo: 178, id: 2 }),
        linhaEstado({ chave: "origem/MS/anastacio", fase: "reaberto", motivo: "produto ausente do catálogo" }),
        linhaEstado({ chave: "origem/MS/anastacio", fase: "criado", produtoId: 3 }),
        "{linha cortada",
      ].join("\n"),
    );
    expect(e.linhasInvalidas).toBe(1);
    expect([...e.donoDoId.keys()]).toEqual(["3"]);
    expect(e.itens.get("origem/MS/anastacio")?.idsDescartados).toEqual(new Set(["1", "2"]));
  });
});

describe("chave de identidade", () => {
  test("given a chave do migrador, then resolve município IBGE e RA do DF", () => {
    expect(lugarDaChaveMigracao("MS", "anastacio")).toMatchObject({ ok: true, nome: "Anastácio" });
    expect(lugarDaChaveMigracao("DF", "taguatinga")).toMatchObject({ ok: true, cityId: "5300108", localityLabel: "Taguatinga" });
    expect(lugarDaChaveMigracao("MT", "naoexiste")).toMatchObject({ ok: false });
  });
  test("given variante ou localidade fora do escopo do migrador, then não há chave de migração", () => {
    const base = { cityId: "5000708", designFamily: "ponto-de-origem" as const, designVariant: "base" };
    expect(chaveMigracaoDoVinculo(base)).toEqual({ ok: true, chave: "origem/MS/anastacio" });
    expect(chaveMigracaoDoVinculo({ ...base, designVariant: "localidade" })).toMatchObject({ ok: false });
    expect(chaveMigracaoDoVinculo({ ...base, localityLabel: "Distrito X" })).toMatchObject({ ok: false });
  });
});

describe("modo sombra", () => {
  test("given o diretório de snapshots de produção, then a gravação é recusada", () => {
    const prod = path.resolve("/srv/data/generated");
    expect(() => assertForaDaProducao(prod, prod)).toThrow();
    expect(() => assertForaDaProducao(path.join(prod, "sombra"), prod)).toThrow();
    expect(() => assertForaDaProducao("/srv/data", prod)).toThrow();
    expect(() => assertForaDaProducao("/srv/data/unificado", prod)).not.toThrow();
  });
});

describe("reconciliação", () => {
  // Sul: base no estado (Gentílico sem tag), cópia Oversized feita fora do estado (mesmo cluster), um produto Sul e um merch sem coleção.
  const base = produto("Anastaciano | Gentílico MS", { clusterId: "c1" });
  const copia = produto("Anastaciano | Gentílico MS", { clusterId: "c1", typeId: 178, typeName: "Camiseta Oversized", price: "129.0" });
  const sulProprio = produto("Torres | Origem RS", { visible: true, status: "published" });
  const merch = produto("Paranaense | Pé Vermelho");
  const intruso = produto("Cuiabá | Legado MT");
  const estado = lerEstadoMigracao(linhaEstado({ chave: "gentilicos/MS/anastacio", fase: "criado", produtoId: Number(base.id) }));
  const sul = classificarRegioesSul([base, copia, sulProprio, merch, intruso], colecoes([sulProprio.id, intruso.id], [base.id, copia.id]), estado);
  classificarDesenhosSul(sul, estado);

  test("then a região vem do estado/coleção, nunca da loja, e conflito/desconhecida ficam separados", () => {
    expect(sul.get(base.id)?.regiao).toBe("centro-oeste");
    expect(sul.get(sulProprio.id)?.regiao).toBe("sul");
    expect(sul.get(merch.id)?.regiao).toBe("desconhecida");
    expect(sul.get(intruso.id)?.regiao).toBe("conflito");
  });

  test("then a cidade do Gentílico vem do estado e a cópia herda pelo cluster", () => {
    expect(sul.get(base.id)?.classificado?.vinculo?.cityId).toBe("5000708");
    expect(sul.get(copia.id)?.classificado?.vinculo?.cityId).toBe("5000708");
  });

  const antigaBase = produto("Anastaciano | Gentilico MS", { tags: ["Anastácio"], visible: true, status: "published", price: "99.9", clusterId: "x1" });
  const antigaCopia = produto("Anastaciano | Gentilico MS", { typeId: 178, typeName: "Camiseta Oversized", clusterId: "x1", price: "129.0" });
  const antigaRegata = produto("Anastaciano | Gentilico MS", { typeId: 8, typeName: "Regata", clusterId: "x1" });
  const antigaLocalidade = produto("Distrito | Origem Localidade MS", { tags: ["Anastácio"] });
  const antigaMerch = produto("Made in Mato Grosso do Sul");
  const mapa = reconciliar({ antigas: [{ storeKey: "use-centro", produtos: [antigaBase, antigaCopia, antigaRegata, antigaLocalidade, antigaMerch] }], sul, estado });
  const de = (p: ProdutoBruto) => mapa.find((l) => l.idAntigo === p.id)!;

  test("then o vínculo persistido no estado confirma, com preço divergente só sinalizado", () => {
    expect(de(antigaBase)).toMatchObject({ status: "confirmado", metodo: "estado-migrador", idNovo: base.id, divergenciaPreco: true, precoAntigo: "99.9", precoNovo: "109.9" });
  });
  test("then a cópia fora do estado confirma pela chave da peça no catálogo", () => {
    expect(de(antigaCopia)).toMatchObject({ status: "confirmado", metodo: "catalogo-chave", idNovo: copia.id, divergenciaPreco: false });
  });
  test("then peça não copiada, variante fora do escopo e merch ficam pendentes com motivo", () => {
    expect(de(antigaRegata)).toMatchObject({ status: "ausente", idNovo: null });
    expect(de(antigaRegata).motivo).toMatch(/cópia para Regata não foi feita/);
    expect(de(antigaLocalidade)).toMatchObject({ status: "ausente" });
    expect(de(antigaLocalidade).motivo).toMatch(/fora do escopo do migrador/);
    expect(de(antigaMerch)).toMatchObject({ status: "sem-chave" });
  });
  test("given duas peças antigas iguais (duplicata na origem), then as duas confirmam para a mesma peça nova", () => {
    const dup = produto("Anastaciano | Gentilico MS", { tags: ["Anastácio"], price: "99.9" });
    const m = reconciliar({ antigas: [{ storeKey: "use-centro", produtos: [antigaBase, dup] }], sul, estado });
    expect(m.every((l) => l.status === "confirmado" && l.idNovo === base.id && /duplicata na origem/.test(l.motivo ?? ""))).toBe(true);
  });
  test("given duas peças antigas com nomes diferentes no mesmo desenho, then a colisão aparece nas duas", () => {
    const outra = produto("Anastacianos | Gentilico MS", { tags: ["Anastácio"], price: "99.9" });
    const m = reconciliar({ antigas: [{ storeKey: "use-centro", produtos: [antigaBase, outra] }], sul, estado });
    expect(m.every((l) => l.status === "ambiguo" && /COLISÃO/.test(l.motivo ?? ""))).toBe(true);
  });

  test("then o índice sombra só tem a base simulada e o que já é público; desconhecido e conflito ficam fora", () => {
    const s = montarLojaUnica(sul, { modo: "simulacao", syncedAt: "t", fonte: { runId: "r", generatedAt: "t", mapVersion: 1, identitySha256: "x" } });
    const loja = s.catalogo.stores["use-sul"]!;
    expect(s.situacoes.filter((l) => l.situacao === "simulado").map((l) => l.id)).toEqual([base.id]);
    const ids = [...loja.bindings.map((b) => b.inkProductId), ...loja.merch.map((m) => m.inkProductId)];
    expect(ids.sort()).toEqual([base.id, sulProprio.id].sort());
  });
});

describe("RA do DF com dois nomes", () => {
  test("given SCIA e Estrutural (mesma RA no índice), then cada um mantém sua chave de migração", () => {
    const scia = lugarDaChaveMigracao("DF", "scia");
    const estrutural = lugarDaChaveMigracao("DF", "estrutural");
    expect(scia.ok && estrutural.ok && scia.localityId === estrutural.localityId).toBe(true);
    if (!scia.ok || !estrutural.ok) return;
    const v = (l: typeof scia) => ({ cityId: l.cityId, localityId: l.localityId, localityLabel: l.localityLabel, designFamily: "tipografia" as const, designVariant: "base" });
    expect(chaveMigracaoDoVinculo(v(scia))).toEqual({ ok: true, chave: "tipografia/DF/scia" });
    expect(chaveMigracaoDoVinculo(v(estrutural))).toEqual({ ok: true, chave: "tipografia/DF/estrutural" });
  });
});

describe("corte da migração", () => {
  test("given peça Sul sem coleção criada antes do migrador, then é Sul por 'anterior-migracao'; depois do corte, desconhecida", () => {
    const antiga = produto("Gaúcho de Pedra", { id: "100", createdAt: "2026-01-10T10:00:00-03:00" });
    const nova = produto("Paranaense | Pé Vermelho", { id: "9999999", createdAt: "2026-10-04T18:45:39-03:00" });
    const antigaDeOutraRegiao = produto("Cuiabá | Legado MT", { id: "101", createdAt: "2026-01-10T10:00:00-03:00" });
    const estado = lerEstadoMigracao(linhaEstado({ chave: "origem/MS/anastacio", fase: "criado", produtoId: 5000000, em: "2026-09-12T13:53:59.577Z" }));
    const r = classificarRegioesSul([antiga, nova, antigaDeOutraRegiao], colecoes(), estado, corteDaMigracao(estado, estado.primeiroRegistro));
    expect(r.get("100")).toMatchObject({ regiao: "sul", evidencias: ["anterior-migracao"] });
    expect(r.get("9999999")?.regiao).toBe("desconhecida");
    expect(r.get("101")?.regiao).toBe("conflito");
  });
});
