import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { LIST_SESSION_MAX_ITEMS, LIST_SESSION_TTL_SECONDS, mintListSession, verifyListSession } from "@/lib/favorites/session";

const SECRET = "a".repeat(32);
const ORIGINAL = process.env.LIST_SESSION_SECRET;

describe("buy-session id (mint/verify)", () => {
  beforeEach(() => {
    process.env.LIST_SESSION_SECRET = SECRET;
  });
  afterEach(() => {
    process.env.LIST_SESSION_SECRET = ORIGINAL;
  });

  test("given a valid list, then mint produces an id that verify accepts with the same ids and store", () => {
    const id = mintListSession("use-sul", ["1", "2", "3"]);
    expect(id).toBeTruthy();
    const verified = verifyListSession(id!);
    expect(verified).toEqual({ storeKey: "use-sul", inkProductIds: ["1", "2", "3"], ageSeconds: 0 });
  });

  test("given no secret configured, then mint returns null", () => {
    delete process.env.LIST_SESSION_SECRET;
    expect(mintListSession("use-sul", ["1"])).toBeNull();
  });

  test("given a previously-minted id but the secret unset now, then verify returns null", () => {
    const id = mintListSession("use-sul", ["1"])!;
    delete process.env.LIST_SESSION_SECRET;
    expect(verifyListSession(id)).toBeNull();
  });

  test("given an empty id list, then mint returns null", () => {
    expect(mintListSession("use-sul", [])).toBeNull();
  });

  test("given more ids than the cap, then mint keeps only the first N", () => {
    const ids = Array.from({ length: LIST_SESSION_MAX_ITEMS + 10 }, (_, i) => String(i));
    const id = mintListSession("use-sul", ids);
    expect(verifyListSession(id!)?.inkProductIds).toHaveLength(LIST_SESSION_MAX_ITEMS);
  });

  test("given a tampered payload, then verify rejects it", () => {
    const id = mintListSession("use-sul", ["1", "2"])!;
    const [encoded, sig] = id.split(".");
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    payload.p.push("999"); // sneak in an extra product id
    const tampered = Buffer.from(JSON.stringify(payload)).toString("base64url") + "." + sig;
    expect(verifyListSession(tampered)).toBeNull();
  });

  test("given garbage input, then verify returns null instead of throwing", () => {
    expect(verifyListSession("")).toBeNull();
    expect(verifyListSession("not-a-valid-id")).toBeNull();
    expect(verifyListSession("a.b.c")).toBeNull();
    expect(verifyListSession(".")).toBeNull();
  });

  test("given a different signing secret, then a token minted under the old one no longer verifies", () => {
    const id = mintListSession("use-sul", ["1"])!;
    process.env.LIST_SESSION_SECRET = "b".repeat(32);
    expect(verifyListSession(id)).toBeNull();
  });

  test("given a session past its TTL, then verify rejects it as expired", () => {
    vi.useFakeTimers();
    try {
      const id = mintListSession("use-sul", ["1"])!;
      expect(verifyListSession(id)).not.toBeNull();
      vi.advanceTimersByTime((LIST_SESSION_TTL_SECONDS + 1) * 1000);
      expect(verifyListSession(id)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
