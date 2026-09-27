import { describe, expect, test } from "vitest";
import { withListSession } from "@/lib/favorites/buy-session-url";

describe("withListSession", () => {
  test("given a plain product URL, then ?ls=<sessionId> is appended", () => {
    expect(withListSession("https://www.usesul.com.br/usesul/product/porto-alegre-origem-rs", "abc.def")).toBe(
      "https://www.usesul.com.br/usesul/product/porto-alegre-origem-rs?ls=abc.def",
    );
  });

  test("given a URL that already has a query string, then ls is added alongside it, not overwritten", () => {
    const url = withListSession("https://www.usesul.com.br/usesul/product/x?utm_source=meus-lugares", "tok");
    const parsed = new URL(url);
    expect(parsed.searchParams.get("utm_source")).toBe("meus-lugares");
    expect(parsed.searchParams.get("ls")).toBe("tok");
  });

  test("given a session id containing characters that need encoding (the '.' separator survives, others are escaped), then round-tripping through URL keeps it intact", () => {
    const sessionId = "eyJ2IjoxfQ.abcdef0123456789_-";
    const url = withListSession("https://www.usesul.com.br/usesul/product/x", sessionId);
    expect(new URL(url).searchParams.get("ls")).toBe(sessionId);
  });
});
