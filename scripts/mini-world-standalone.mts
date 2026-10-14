// Builds the standalone "Meu Pequeno Mundo" prototype (prototipos/meu-pequeno-mundo/meu-pequeno-mundo-use-origens.html) from the SAME
// sources the storefront page uses — one experience, two hosts:
//   src/components/mundo/MundoMarkup.tsx → static HTML (react-dom/server)
//   src/components/mundo/mundo.css       → inlined
//   src/components/mundo/experiencia/*   → one ES module (esbuild); Three.js stays external, resolved by the import map (jsDelivr, pinned)
// The standalone page reads ./dados/ (npm run mundo:dados) and ./contexto/perfis-cidades.json (copied by the same command), keeps the world
// in the address bar like v1/v2 and has no analytics. Opened from disk (file://) it falls back to the demonstration data.
// Usage: npm run mundo:prototipo
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { build } from "esbuild";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MundoMarkup } from "../src/components/mundo/MundoMarkup";

const raiz = path.resolve(import.meta.dirname, "..");
const destino = path.join(raiz, "prototipos/meu-pequeno-mundo/meu-pequeno-mundo-use-origens.html");
const THREE_VERSAO = JSON.parse(readFileSync(path.join(raiz, "node_modules/three/package.json"), "utf8")).version as string;

const markup = renderToStaticMarkup(createElement(MundoMarkup));
const css = readFileSync(path.join(raiz, "src/components/mundo/mundo.css"), "utf8");
const js = await build({
  stdin: {
    contents: "import { iniciarMundo } from './app.js';\niniciarMundo({ urlNaBarra: true });\n",
    resolveDir: path.join(raiz, "src/components/mundo/experiencia"),
    sourcefile: "protótipo.js",
    loader: "js",
  },
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  external: ["three", "three/addons/*"],
  legalComments: "none",
  write: false,
});
const modulo = js.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");

const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content">
<title>Meu Pequeno Mundo | Use Origens</title>
<meta name="description" content="Monte um pequeno mundo com sua origem, seu presente e seu lugar do coração.">
<meta name="theme-color" content="#ece6db">
<meta name="robots" content="noindex">
<!-- Gerado por scripts/mini-world-standalone.mts a partir de src/components/mundo/ (npm run mundo:prototipo). Não edite à mão. -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<!-- As mesmas fontes do storefront: Big Shoulders (títulos), Hanken Grotesk (texto), Bodoni Moda 500 (editorial; o itálico é das lembranças). -->
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Big+Shoulders:wght@700;800;900&family=Bodoni+Moda:ital,wght@0,500;1,500&family=Hanken+Grotesk:wght@400;500;600;700;800&display=swap">
<style>
html, body { margin: 0; height: 100%; overflow: hidden; background: #ece6db; }
${css}
</style>
<script type="importmap">
{
  "imports": {
    "three": "https://cdn.jsdelivr.net/npm/three@${THREE_VERSAO}/build/three.module.js",
    "three/addons/": "https://cdn.jsdelivr.net/npm/three@${THREE_VERSAO}/examples/jsm/"
  }
}
</script>
</head>
<body>
${markup}
<noscript>
  <p style="position:fixed;inset:auto 16px 16px;padding:16px;background:#fff;border:2px solid #000">
    O Meu Pequeno Mundo precisa de JavaScript. As camisetas estão em <a href="https://www.useorigens.com.br">useorigens.com.br</a>.
  </p>
</noscript>
<script type="module">
${modulo}</script>
</body>
</html>
`;
writeFileSync(destino, html);
console.log(`${path.relative(raiz, destino)} (${Math.round(html.length / 1024)} KB, Three.js ${THREE_VERSAO} pelo import map)`);
