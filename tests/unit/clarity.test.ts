import { afterEach, describe, expect, it } from "vitest";
import { clarityProjectId } from "@/lib/config/public-env";

const saved = process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID;
afterEach(() => {
  if (saved === undefined) delete process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID;
  else process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID = saved;
});

describe("clarityProjectId", () => {
  it("returns the configured project ID", () => {
    process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID = "yv1dnesj58";
    expect(clarityProjectId()).toBe("yv1dnesj58");
  });

  it("is null when unset or empty", () => {
    delete process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID;
    expect(clarityProjectId()).toBeNull();
    process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID = "";
    expect(clarityProjectId()).toBeNull();
  });

  it("treats anything that could break out of the inline bootstrap as unset", () => {
    for (const bad of ['abc");alert(1);("', "yv1dnesj58 ", "YV1DNESJ58", "abc"]) {
      process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID = bad;
      expect(clarityProjectId()).toBeNull();
    }
  });
});
