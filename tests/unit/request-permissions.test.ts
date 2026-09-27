import { describe, expect, test } from "vitest";
import { canEdit, type Actor } from "@/lib/admin/store/ports";
import { fileRequestStore } from "@/lib/customization/file-store";
import { expiryFrom, hashToken } from "@/lib/customization/requests";
import { snapshotOf } from "@/lib/customization/validate";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const actor = (role: Actor["role"], scopes: Actor["scopes"]): Actor => ({ id: "u", email: "u@x", name: null, role, scopes });

describe("who may open a request (contact included): the check every request page and action runs on the STORED region", () => {
  test("given owners and editors, when asked about a request's region, then an editor only reaches the regions listed for them", () => {
    expect(canEdit(actor("owner", []), "sul")).toBe(true);
    expect(canEdit(actor("editor", ["norte"]), "norte")).toBe(true);
    expect(canEdit(actor("editor", ["norte"]), "sul")).toBe(false);
    expect(canEdit(actor("editor", ["norte"]), "centro-oeste")).toBe(false);
    expect(canEdit(actor("editor", []), "sul")).toBe(false);
  });

  test("given a request of Sul, when an editor of Norte is checked against the request's own region (never a form field), then access is denied", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "perm-"));
    try {
      const store = fileRequestStore(path.join(dir, "r.json"));
      const { record } = await store.create({
        region: "sul", idempotencyKey: "perm-key-0000000000001", tokenHash: hashToken("x".repeat(32)), expiresAt: expiryFrom(new Date(), 30),
        snapshot: snapshotOf({ id: "cz-1", slug: "pai", name: "Pai", source: { store: "use-sul", collectionId: 1 }, fields: [], previewMode: "mockupWithTextSummary", active: true, version: 1 }),
        values: { fields: {}, lines: [] }, contact: { name: "Ana", whatsapp: "+5551999998888", confirmedAt: new Date().toISOString(), noticeVersion: "v1" },
      });
      const loaded = (await store.get(record.id))!;
      expect(canEdit(actor("editor", ["norte"]), loaded.region)).toBe(false); // what `requestFor` and the detail page do
      expect(canEdit(actor("editor", ["sul"]), loaded.region)).toBe(true);
      expect(await store.countOpen(["norte"])).toBe(0); // and the badge of a Norte editor does not count it either
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
