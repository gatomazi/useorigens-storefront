import { describe, expect, test } from "vitest";
import robots from "@/app/robots";

describe("robots.txt", () => {
  test("given the default site URL, when robots is built, then it announces the canonical sitemap", () => {
    expect(robots().sitemap).toBe("https://www.useorigens.com.br/sitemap.xml");
  });

  test("given the rules, when robots is built, then every crawler is allowed and nothing is disallowed", () => {
    const { rules } = robots();
    const list = Array.isArray(rules) ? rules : [rules];
    expect(list).toHaveLength(1);
    expect(list[0].userAgent).toBe("*");
    expect(list[0].allow).toBe("/");
    expect(list[0].disallow).toBeUndefined();
  });
});
