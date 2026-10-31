import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { Campaign } from "@/components/home/Campaign";

const crops = [{ imageUrl: "https://example.test/a.png", family: "origem" }, { imageUrl: "https://example.test/b.png", family: "feito-em" }];
const render = (cta?: { label: string; href: string }) =>
  renderToStaticMarkup(createElement(Campaign, {
    region: "sul", crops, config: {} as never, copy: { title: "O Natal da família", body: "Com o seu sobrenome." }, anchor: "natal", headingId: "natal-title",
    ...(cta ? { cta } : {}), split: { figure: null, panel: null, panelTone: "light" },
  }));

describe("the split campaign's picture", () => {
  test("given a button, when drawn, then the picture leads to the same page, for the pointer only (the button stays the one named link)", () => {
    const html = render({ label: "Personalizar", href: "/sul/personalizar/natal-em-familia" });
    const figure = html.match(/<a [^>]*data-testid="campaign-figure-link"[^>]*>/)?.[0] ?? "";
    expect(figure).toContain('href="/sul/personalizar/natal-em-familia"');
    expect(figure).toContain('tabindex="-1"');
    expect(figure).toContain('aria-hidden="true"');
    expect(html.match(/href="\/sul\/personalizar\/natal-em-familia"/g)).toHaveLength(2);
  });

  test("given no button (the city search), when drawn, then the picture is not a link", () => {
    expect(render()).not.toContain("campaign-figure-link");
  });
});
