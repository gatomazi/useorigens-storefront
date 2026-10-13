import { describe, expect, test } from "vitest";
import type { CarouselItem } from "@/components/catalog/ProductCarousel";
import type { MenuEntry } from "@/lib/catalog/collection-menu";
import type { CollectionRecord } from "@/lib/catalog/collections";
import { familyById } from "@/lib/catalog/families";
import type { CityFamilyEntry } from "@/lib/catalog/repository";
import type { CityDesignBinding } from "@/lib/catalog/types";
import { carouselGuideItem, cityFamilyItem, GUIDE_CITY_ITEMS, GUIDE_COLLECTIONS, pickCityItems, pickMenuCollections } from "@/lib/guide/pdp-guide";

const binding = (id: string, family: CityDesignBinding["designFamily"], over: Partial<CityDesignBinding> = {}): CityDesignBinding => ({
  cityId: "4205407", designFamily: family, designVariant: "base", isPrimary: true, priority: 0, commerceStoreKey: "use-sul", inkProductId: id, slug: `p-${id}`,
  storeProductUrl: `https://www.usesul.com.br/usesul/product/p-${id}`, imageUrl: `https://gcp-images.majestic.ink.rsvcloud.com/images/${id}.jpg`, price: 109.9, syncedAt: "2026-10-13T00:00:00.000Z", ...over,
});
const entry = (id: string, family: string, over: Partial<CityDesignBinding> = {}): CityFamilyEntry => ({ family: familyById(family)!, primary: binding(id, family as CityDesignBinding["designFamily"], over), variants: [] });
const place = { name: "Florianópolis", uf: "SC" };

describe("guide of the INK product page: city designs", () => {
  test("given a city's families, when picked, then at most three real products come out, in family order, never the one already open", () => {
    const entries = [entry("1", "ponto-de-origem"), entry("2", "feito-em"), entry("3", "coordenadas"), entry("4", "legado"), entry("5", "territorio")];
    const items = pickCityItems(entries, place, "2");
    expect(items.map((i) => i.productId)).toEqual(["1", "3", "4"]);
    expect(items).toHaveLength(GUIDE_CITY_ITEMS);
    expect(items[0]).toMatchObject({ title: "Ponto de Origem", context: "Florianópolis · SC", price: 109.9, href: "https://www.usesul.com.br/usesul/product/p-1", image: "https://gcp-images.majestic.ink.rsvcloud.com/images/1.jpg" });
    expect(items[0].listPrice).toBeUndefined();
  });

  test("given a design without a trustworthy purchase URL or price, when mapped, then it is skipped (never a card without a destination or a price)", () => {
    expect(cityFamilyItem(entry("1", "ponto-de-origem", { storeProductUrl: "http://evil.example/x" }), place)).toBeNull();
    expect(cityFamilyItem(entry("1", "ponto-de-origem", { price: null }), place)).toBeNull();
    expect(pickCityItems([entry("1", "ponto-de-origem", { price: 0 }), entry("2", "feito-em")], place, null).map((i) => i.productId)).toEqual(["2"]);
  });

  test("given a promotion, when mapped, then INK's current price is the price and the regular one travels as listPrice", () => {
    expect(cityFamilyItem(entry("1", "feito-em", { price: 89.9, listPrice: 109.9 }), place)).toMatchObject({ price: 89.9, listPrice: 109.9 });
  });
});

describe("guide of the INK product page: collections", () => {
  const record = (id: number, name: string, slug: string, over: Partial<CollectionRecord> = {}): CollectionRecord => ({ id, name, slug, position: id, isAvailable: true, reportedProductCount: 10, matchedCount: 10, merchCount: 10, cityDesignCount: 0, memberIds: ["1"], allMemberIds: ["1"], ...over });
  const menu = (id: number, name: string, slug: string, pagePath: string | null = `/sul/colecoes/${slug}`, over: Partial<CollectionRecord> = {}): MenuEntry => ({ ref: { store: "use-sul", collectionId: id }, record: record(id, name, slug, over), position: "more", pagePath, inkUrl: `https://www.usesul.com.br/usesul/collections/${slug}` });

  test("given the published menu, when the guide picks collections, then state collections, collections without a page of ours and empty ones are left out, in menu order, at most eight", () => {
    const entries = [
      menu(1, "Seu Lugar", "seu-lugar"), menu(2, "Santa Catarina", "santa-catarina"), menu(3, "PR", "pr"), menu(4, "Da Nossa Terra", "da-nossa-terra"),
      menu(5, "Só na INK", "so-na-ink", null), menu(6, "Vazia", "vazia", "/sul/colecoes/vazia", { matchedCount: 0 }), menu(1, "Seu Lugar", "seu-lugar"),
      ...[7, 8, 9, 10, 11, 12, 13, 14].map((n) => menu(n, `Coleção ${n}`, `c-${n}`)),
    ];
    const picked = pickMenuCollections(entries, ["PR", "SC", "RS"]);
    expect(picked.map((e) => e.record.slug)).toEqual(["seu-lugar", "da-nossa-terra", "c-7", "c-8", "c-9", "c-10", "c-11", "c-12"]);
    expect(picked).toHaveLength(GUIDE_COLLECTIONS);
  });

  test("given a collection card, when mapped, then only a real price makes an item; the struck-through list price is parsed back to a number", () => {
    const card: CarouselItem = { id: "9", name: "Catarinense | Essência", price: "R$ 89,90", listPrice: "R$ 109,90", rawPrice: 89.9, imageUrl: "https://gcp-images.majestic.ink.rsvcloud.com/images/9.jpg", href: "https://www.usesul.com.br/usesul/product/catarinense-essencia" };
    expect(carouselGuideItem(card)).toEqual({ productId: "9", title: "Catarinense | Essência", image: card.imageUrl, price: 89.9, listPrice: 109.9, href: card.href });
    expect(carouselGuideItem({ ...card, rawPrice: null, price: null, listPrice: undefined })).toBeNull();
  });
});
