import { spawnSync } from "node:child_process";
import { apiKeyHash, newApiKey } from "../src/lib/mcp/auth/api-key";

// A new owner API key for the MCP connector (docs/mcp/README.md §1). The key goes straight to the clipboard (macOS pbcopy) and is never
// printed; only its SHA-256, the value of MCP_API_KEY_SHA256 in Railway, is shown.
//   npm run -s mcp:api-key
const key = newApiKey();
const copied = spawnSync("pbcopy", { input: key }).status === 0;
if (!copied) {
  console.error("pbcopy indisponível: a chave não foi copiada e nada foi gerado. Rode no macOS.");
  process.exit(1);
}
console.log("Chave copiada para a área de transferência. Cole no Claude, no cabeçalho X-Api-Secret do conector.");
console.log(`No Railway (serviço useorigens-storefront): MCP_API_KEY_SHA256=${apiKeyHash(key)}`);
