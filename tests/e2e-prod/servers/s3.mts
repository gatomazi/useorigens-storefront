// A fake private S3 bucket (path-style, like a loopback endpoint) for the production-mode E2E: signed PUT/GET/HEAD/DELETE on
// /<bucket>/media/<sha>/<w>.webp. There is NO public read path: the bucket is private, exactly like a Railway Storage Bucket. In-memory. It rejects a request whose payload hash does
// not match the body, or that lacks a SigV4 Authorization header for the expected access key.
import { createHash } from "node:crypto";
import { createServer } from "node:http";

const port = Number(process.env.E2E_S3_PORT ?? 4600);
const bucket = "e2e-bucket";
const accessKey = "E2EACCESSKEY";
const objects = new Map<string, { body: Buffer; type: string; cache: string }>();
const hex = (b: Buffer) => createHash("sha256").update(b).digest("hex");

createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
  if (url.pathname === "/__stats") return res.end(JSON.stringify({ objects: objects.size, keys: [...objects.keys()] }));
  const chunks: Buffer[] = [];
  req.on("data", (c: Buffer) => chunks.push(c));
  req.on("end", () => {
    const body = Buffer.concat(chunks);
    const auth = String(req.headers.authorization ?? "");
    const m = new RegExp(`^/${bucket}/(media/[0-9a-f]{64}/\\d{3,4}\\.webp)$`).exec(url.pathname);
    if (!m) { res.statusCode = 404; return res.end(); }
    if (!auth.startsWith(`AWS4-HMAC-SHA256 Credential=${accessKey}/`) || !/Signature=[0-9a-f]{64}$/.test(auth)) { res.statusCode = 403; return res.end("bad auth"); }
    if (req.headers["x-amz-content-sha256"] !== hex(body)) { res.statusCode = 400; return res.end("payload hash mismatch"); }
    const key = m[1];
    if (req.method === "PUT") { objects.set(key, { body, type: String(req.headers["content-type"] ?? ""), cache: String(req.headers["cache-control"] ?? "") }); res.statusCode = 200; return res.end(); }
    if (req.method === "GET") { const o = objects.get(key); if (!o) { res.statusCode = 404; return res.end(); } res.setHeader("Content-Type", o.type); return res.end(o.body); }
    if (req.method === "HEAD") { res.statusCode = objects.has(key) ? 200 : 404; return res.end(); }
    if (req.method === "DELETE") { objects.delete(key); res.statusCode = 204; return res.end(); }
    res.statusCode = 405;
    res.end();
  });
}).listen(port, "127.0.0.1", () => console.log(`[e2e-s3] http://127.0.0.1:${port}`));
