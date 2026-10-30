<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## graphify (grafo do código)

- Todo agente que fizer uma implementação nova roda `graphify update .` na pasta onde trabalhou, ao terminar as mudanças de código e antes de entregar ou abrir o PR, para o código novo entrar no grafo (`graphify-out/`). O comando só lê a estrutura do código (sem IA, sem custo). Numa worktree sem `graphify-out/`, ele gera o grafo do zero.
- Ao delegar uma implementação a um subagente, repassar esta regra no prompt dele.
- Instalação, se faltar o comando: `pipx install graphifyy` (ou `pip install graphifyy`, Python 3.10+).
