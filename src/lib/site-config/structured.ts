/**
 * The structured home components (city styles, state chooser, regional campaign, image grid) as CMS section MODELS: pure defaults per region,
 * shared by the admin (add / describe) and the tests. No I/O, no `server-only`. Nothing here reads another region's data: the copy is neutral
 * and built from the region's own name, and the visual defaults use only theme tokens, so a new section never carries Sul's texts, numbers or
 * offers into Norte or Centro-Oeste.
 */
import { REGIONS, type RegionSlug } from "../geo/regions";
import { MAX_CITY_STYLES, type Appearance, type Section } from "./schema";

export const STRUCTURED_TEMPLATES = ["city-styles", "states", "campaign", "image-grid"] as const;
/** Components of a page only (the region's "Personalize a sua"): never offered on the home, whose schema refuses them. */
export const PAGE_ONLY_STRUCTURED = ["personalization-live", "personalization-models"] as const;
export type StructuredTemplate = (typeof STRUCTURED_TEMPLATES)[number] | (typeof PAGE_ONLY_STRUCTURED)[number];

/** City styles and the state chooser exist once per region (an existing one is edited, never duplicated); campaigns and grids may repeat. */
export const SINGLETON_TEMPLATES: readonly StructuredTemplate[] = ["city-styles", "states"];

export type StructuredModel = { template: StructuredTemplate; name: string; purpose: string };

export const STRUCTURED_MODELS: readonly StructuredModel[] = [
  { template: "city-styles", name: "Estilos da cidade", purpose: "Mostra, para uma cidade de exemplo da região, os estilos de camiseta que existem de verdade no catálogo da loja. Cada card abre o produto da própria região." },
  { template: "states", name: "Escolha seu estado", purpose: "Navegador dos estados da região, com o número de cidades, as regiões de cada estado e a linha do estado quando existe. Só aparecem estados com cidades e produtos reais." },
  { template: "campaign", name: "Campanha regional", purpose: "Um bloco editorial de fechamento: título, descrição e um botão. Sem imagem, usa a cor ou o degradê escolhido." },
  { template: "image-grid", name: "Grade de imagens", purpose: "Blocos com imagem e nome, cada um levando a uma coleção, página ou categoria — por exemplo “Compre por peça” ou “Coleções”. De 2 a 12 blocos." },
];

export const PAGE_ONLY_MODELS: readonly StructuredModel[] = [
  { template: "personalization-live", name: "Banner ao vivo", purpose: "Texto de um lado e a camiseta do outro: a arte de um modelo de personalização muda enquanto o cliente digita e, sozinha, vai mostrando exemplos. O botão leva à página do modelo já preenchida." },
  { template: "personalization-models", name: "Estampas personalizáveis", purpose: "Os cards de todos os modelos de personalização publicados da região (com editor de arte), na ordem do painel, com o preço quando a compra é na hora." },
];

const noImage = (): Appearance => ({ fill: { kind: "none" }, focal: { mobile: { x: 50, y: 50 }, desktop: { x: 50, y: 50 } }, overlay: { preset: "none" } });

/** A DOM id no other section uses: `base`, then `base-2`, `base-3`… (kept to 34 characters, the anchor limit is 40). */
export function uniqueAnchor(base: string, taken: ReadonlySet<string>): string {
  let anchor = base.slice(0, 34);
  for (let n = 2; taken.has(anchor); n++) anchor = `${base.slice(0, 34 - String(n).length - 1)}-${n}`;
  return anchor;
}

/**
 * A new section of the given model with editorial defaults for `region`. It is only ever stored in the DRAFT: nothing reaches the public home until it
 * is published. A live banner needs the model it shows (`customizerId`, one with the art editor).
 */
export function structuredDefaults(template: StructuredTemplate, region: RegionSlug, id: string, takenAnchors: ReadonlySet<string>, customizerId?: string): Section {
  const name = REGIONS[region].name;
  if (template === "personalization-live") {
    const anchor = uniqueAnchor("experimente", takenAnchors);
    return {
      id, anchor, headingId: `${anchor}-title`, template, active: true,
      title: "Digite. Veja na camiseta.",
      subtitle: "Escreva aqui e a estampa muda na hora. Quando ficar do seu jeito, é só seguir para a página da estampa e comprar.",
      live: { customizerId: customizerId ?? "", button: "Personalizar a minha", examples: [] },
      appearance: { ...noImage(), fill: { kind: "solid", color: "token:near-black" } },
    };
  }
  if (template === "personalization-models") {
    const anchor = uniqueAnchor("estampas", takenAnchors);
    return { id, anchor, headingId: `${anchor}-title`, template, active: true, title: "Escolha a sua estampa", appearance: noImage() };
  }
  if (template === "city-styles") {
    const anchor = uniqueAnchor("estilos", takenAnchors);
    return {
      id, anchor, headingId: `${anchor}-title`, template, active: true,
      // "8 jeitos" is promised only where it is real today (Sul); the other regions start neutral until the catalog justifies a number.
      title: region === "sul" ? "Sua cidade, de 8 jeitos." : "Sua cidade, do seu jeito.",
      subtitle: "Do mapa às coordenadas: escolha a estampa que mais combina com o seu lugar. O exemplo aqui é {city} — ao abrir a sua, você vê só os estilos que existem para ela.",
      count: MAX_CITY_STYLES, appearance: noImage(),
    };
  }
  if (template === "states") {
    const anchor = uniqueAnchor("estados", takenAnchors);
    return { id, anchor, headingId: `${anchor}-title`, template, active: true, title: "Escolha o seu estado", appearance: noImage() };
  }
  if (template === "image-grid") {
    const anchor = uniqueAnchor("grade", takenAnchors);
    // Two real destinations every region has (the shirt search and the Uma Penca articles), as a starting point: the owner swaps in photos and links.
    return {
      id, anchor, headingId: `${anchor}-title`, template, active: true, title: "Compre por peça",
      grid: { columns: 4, aspect: "portrait", labels: "below" },
      tiles: [
        { label: "Camisetas", dest: { kind: "route", path: `/${region}/busca` } },
        { label: "Canecas e ecobags", dest: { kind: "route", path: `/${region}/outros-artigos` } },
      ],
      appearance: noImage(),
    };
  }
  const anchor = uniqueAnchor("campanha", takenAnchors);
  return {
    id, anchor, headingId: `${anchor}-title`, template, active: true, fallback: "fill",
    title: `Encontre a camiseta da sua cidade no ${name}.`,
    subtitle: "O nome da cidade, o mapa e as coordenadas, numa camiseta. Busque a sua.",
    appearance: { ...noImage(), fill: { kind: "solid", color: "token:near-black" } },
  };
}
