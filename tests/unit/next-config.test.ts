import { describe, expect, test } from "vitest";
import nextConfig from "../../next.config";
import { MAX_UPLOAD_BYTES } from "@/lib/admin/media/process";

const bytes = (v: number | string | undefined): number => (typeof v === "number" ? v : v ? Number.parseFloat(v) * ({ kb: 1024, mb: 1024 ** 2 } as Record<string, number>)[v.replace(/[\d.\s]/g, "").toLowerCase()] : 0);

describe("Server Actions body limit", () => {
  test("given the CMS accepts uploads up to MAX_UPLOAD_BYTES, when the config is read, then Server Actions accept that plus multipart overhead (the 1 MB default rejected real uploads)", () => {
    const limit = bytes(nextConfig.experimental?.serverActions?.bodySizeLimit as string | number | undefined);
    expect(limit).toBeGreaterThanOrEqual(MAX_UPLOAD_BYTES + 20 * 1024);
  });
});
