import { describe, expect, test } from "vitest";
import { HERO_PANEL, sectionImageSizes, sizeHintText } from "@/lib/admin/image-sizes";

describe("recommended picture sizes in the panel", () => {
  test("given the section a picture belongs to, when recommended, then the size follows where the store draws it", () => {
    expect(sectionImageSizes("hero", "feature").desktop).toBe(HERO_PANEL);
    expect(sectionImageSizes("campaign", "split")).toEqual({ mobile: { size: "1200×750 px (16:10)" }, desktop: { size: "1200×1600 px (3:4)" } });
    expect(sectionImageSizes("product-carousel").desktop.size).toBe("2400×1200 px (2:1)");
  });

  test("given a recommendation, when written, then it reads as one sentence with its note", () => {
    expect(sizeHintText({ size: "1200×630 px" })).toBe("Tamanho recomendado: 1200×630 px.");
    expect(sizeHintText(HERO_PANEL)).toBe("Tamanho recomendado: 1920×1440 px (4:3); o corte muda entre celular e desktop: deixe o assunto no centro.");
  });
});
