import { beforeEach, describe, expect, test } from "vitest";
import { authorizePasswordLogin, hashAdminPassword, passwordProblem, PASSWORD_HASH_RE, verifyAdminPassword } from "@/lib/admin/auth/password";
import type { UserRepository, UserRow } from "@/lib/admin/store/ports";

describe("fallback password hashing", () => {
  test("given a password, when hashed, then it is scrypt with a random salt and only the same password verifies", async () => {
    const a = await hashAdminPassword("cavalo-correto-bateria");
    const b = await hashAdminPassword("cavalo-correto-bateria");
    expect(a).toMatch(PASSWORD_HASH_RE);
    expect(a).not.toBe(b);
    expect(await verifyAdminPassword("cavalo-correto-bateria", a)).toBe(true);
    expect(await verifyAdminPassword("cavalo-correto-bateriA", a)).toBe(false);
    expect(await verifyAdminPassword(" cavalo-correto-bateria", a)).toBe(false); // never trimmed
  });

  test("given no hash, a malformed one or an oversized password, when verified, then the answer is false (and never a throw)", async () => {
    expect(await verifyAdminPassword("qualquer-coisa", null)).toBe(false);
    expect(await verifyAdminPassword("qualquer-coisa", "texto-puro")).toBe(false);
    expect(await verifyAdminPassword("", `scrypt:${"0".repeat(32)}:${"0".repeat(128)}`)).toBe(false);
    expect(await verifyAdminPassword("x".repeat(2000), await hashAdminPassword("x".repeat(20)))).toBe(false);
  });

  test("given a short, blank or oversized password, when checked, then it is refused with a reason", async () => {
    expect(passwordProblem("curta")).toMatch(/10 caracteres/);
    expect(passwordProblem(" ".repeat(12))).toMatch(/espaços/);
    expect(passwordProblem("é".repeat(600))).toMatch(/longa/);
    expect(passwordProblem("uma-senha-boa")).toBeNull();
    await expect(hashAdminPassword("curta")).rejects.toThrow();
  });
});

describe("who may enter with a password", () => {
  const rows = new Map<string, UserRow>();
  const hashes = new Map<string, string>();
  const users: UserRepository = {
    async findByEmail(email) { return [...rows.values()].find((u) => u.email === email) ?? null; },
    async findById(id) { return rows.get(id) ?? null; },
    async findByProviderSub(sub) { return [...rows.values()].find((u) => u.providerSub === sub) ?? null; },
    async list() { return [...rows.values()]; },
    async create(i) { const u: UserRow = { id: `u${rows.size + 1}`, email: i.email, name: i.name, role: i.role, scopes: i.scopes, active: true, providerSub: null, createdAt: "", lastLoginAt: null }; rows.set(u.id, u); return u; },
    async update(id, patch) { const u = rows.get(id); if (!u) return null; Object.assign(u, patch); return u; },
    async bindProviderSub() { return true; },
    async touchLogin(id) { rows.get(id)!.lastLoginAt = "agora"; },
    async getPasswordHash(id) { return hashes.get(id) ?? null; },
    async setPasswordHash(id, hash) { if (hash) hashes.set(id, hash); else hashes.delete(id); return true; },
    async withPassword() { return [...hashes.keys()]; },
  };
  const OWNER = { email: "Dono@Example.com", passwordHash: null };
  let editorHash = "";
  beforeEach(async () => {
    rows.clear();
    hashes.clear();
    editorHash ||= await hashAdminPassword("senha-do-editor");
  });

  test("given an allowlisted editor with a password, when the right one is typed (any e-mail case), then they enter with their scopes", async () => {
    const ed = await users.create({ email: "ed@example.com", name: null, role: "editor", scopes: ["sul"] });
    hashes.set(ed.id, editorHash);
    const r = await authorizePasswordLogin({ email: " ED@example.com ", password: "senha-do-editor" }, users, OWNER);
    expect(r.ok && r.user).toMatchObject({ id: ed.id, role: "editor", scopes: ["sul"], lastLoginAt: "agora" });
  });

  test("given a wrong password, an unknown e-mail or a person without a password, then the same refusal comes back and nothing is created", async () => {
    const ed = await users.create({ email: "ed@example.com", name: null, role: "editor", scopes: ["sul"] });
    hashes.set(ed.id, editorHash);
    await users.create({ email: "sem-senha@example.com", name: null, role: "editor", scopes: ["sul"] });
    expect(await authorizePasswordLogin({ email: "ed@example.com", password: "senha-errada-123" }, users, OWNER)).toEqual({ ok: false, reason: "invalid" });
    expect(await authorizePasswordLogin({ email: "ninguem@example.com", password: "senha-do-editor" }, users, OWNER)).toEqual({ ok: false, reason: "invalid" });
    expect(await authorizePasswordLogin({ email: "sem-senha@example.com", password: "" }, users, OWNER)).toEqual({ ok: false, reason: "invalid" });
    expect(rows.size).toBe(2);
  });

  test("given a deactivated editor with the right password, then they are refused", async () => {
    const ed = await users.create({ email: "ed@example.com", name: null, role: "editor", scopes: ["sul"] });
    hashes.set(ed.id, editorHash);
    await users.update(ed.id, { active: false });
    expect(await authorizePasswordLogin({ email: "ed@example.com", password: "senha-do-editor" }, users, OWNER)).toEqual({ ok: false, reason: "inactive" });
  });

  test("given ADMIN_OWNER_PASSWORD_HASH and an empty table, when the owner types it, then the owner is created (bootstrap without Railway)", async () => {
    const owner = { email: "dono@example.com", passwordHash: await hashAdminPassword("senha-do-ambiente") };
    const r = await authorizePasswordLogin({ email: "dono@example.com", password: "senha-do-ambiente" }, users, owner);
    expect(r.ok && r.user).toMatchObject({ role: "owner", email: "dono@example.com" });
  });

  test("given the env hash, when someone other than the owner types it, then it opens nothing", async () => {
    const owner = { email: "dono@example.com", passwordHash: editorHash };
    const ed = await users.create({ email: "ed@example.com", name: null, role: "editor", scopes: ["sul"] });
    expect(await authorizePasswordLogin({ email: ed.email, password: "senha-do-editor" }, users, owner)).toEqual({ ok: false, reason: "invalid" });
    expect(await authorizePasswordLogin({ email: "outro@example.com", password: "senha-do-editor" }, users, owner)).toEqual({ ok: false, reason: "invalid" });
    expect(rows.size).toBe(1);
  });

  test("given the owner row demoted or deactivated, when the owner enters with a password, then it is owner and active again (the environment rules)", async () => {
    const row = await users.create({ email: "dono@example.com", name: null, role: "editor", scopes: ["sul"] });
    await users.update(row.id, { active: false });
    hashes.set(row.id, editorHash);
    const r = await authorizePasswordLogin({ email: "dono@example.com", password: "senha-do-editor" }, users, OWNER);
    expect(r.ok && r.user).toMatchObject({ role: "owner", active: true });
  });

  test("given migration 0008 still pending (no hash can be read) and no env hash, then nobody enters by password", async () => {
    await users.create({ email: "dono@example.com", name: null, role: "owner", scopes: [] });
    expect(await authorizePasswordLogin({ email: "dono@example.com", password: "qualquer-senha" }, users, OWNER)).toEqual({ ok: false, reason: "invalid" });
  });
});
