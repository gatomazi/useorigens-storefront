// A fake OpenID Connect provider for the production-mode E2E (never Google, never the network): authorization-code + PKCE, RS256 ID tokens,
// a JWKS, and a control endpoint the test uses to choose who "signs in". Loopback only.
import { createHash, createSign, generateKeyPairSync } from "node:crypto";
import { createServer } from "node:http";

const port = Number(process.env.E2E_IDP_PORT ?? 4555);
const issuer = `http://127.0.0.1:${port}`;
const clientId = process.env.E2E_CLIENT_ID ?? "e2e-client";
const clientSecret = process.env.E2E_CLIENT_SECRET ?? "e2e-secret";
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...(publicKey.export({ format: "jwk" }) as object), kid: "e2e-key", alg: "RS256", use: "sig" };
const b64u = (b: Buffer | string) => Buffer.from(b).toString("base64url");

let identity = { email: "owner@e2e.test", sub: "sub-owner", verified: true };
const codes = new Map<string, { nonce: string; challenge: string; identity: typeof identity }>();

createServer((req, res) => {
  const url = new URL(req.url ?? "/", issuer);
  if (url.pathname === "/jwks") {
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ keys: [jwk] }));
  }
  if (url.pathname === "/__identity" && req.method === "POST") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      identity = { ...identity, ...JSON.parse(body) };
      res.end("ok");
    });
    return;
  }
  if (url.pathname === "/authorize") {
    const code = b64u(Buffer.from(`${Math.random()}${Date.now()}`));
    codes.set(code, { nonce: url.searchParams.get("nonce") ?? "", challenge: url.searchParams.get("code_challenge") ?? "", identity });
    const back = new URL(url.searchParams.get("redirect_uri") ?? "");
    back.searchParams.set("code", code);
    back.searchParams.set("state", url.searchParams.get("state") ?? "");
    res.statusCode = 302;
    res.setHeader("Location", back.toString());
    return res.end();
  }
  if (url.pathname === "/token" && req.method === "POST") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const p = new URLSearchParams(body);
      const entry = codes.get(p.get("code") ?? "");
      const fail = (status: number, error: string) => { res.statusCode = status; res.end(JSON.stringify({ error })); };
      if (!entry || p.get("client_secret") !== clientSecret || p.get("client_id") !== clientId) return fail(400, "invalid_grant");
      if (b64u(createHash("sha256").update(p.get("code_verifier") ?? "").digest()) !== entry.challenge) return fail(400, "bad_verifier");
      codes.delete(p.get("code")!);
      const now = Math.floor(Date.now() / 1000);
      const header = b64u(JSON.stringify({ alg: "RS256", kid: "e2e-key", typ: "JWT" }));
      const claims = b64u(JSON.stringify({ iss: issuer, aud: clientId, sub: entry.identity.sub, email: entry.identity.email, email_verified: entry.identity.verified, nonce: entry.nonce, iat: now, exp: now + 600 }));
      const sig = b64u(createSign("RSA-SHA256").update(`${header}.${claims}`).sign(privateKey));
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ id_token: `${header}.${claims}.${sig}`, access_token: "unused" }));
    });
    return;
  }
  res.statusCode = 404;
  res.end();
}).listen(port, "127.0.0.1", () => console.log(`[e2e-idp] ${issuer}`));
