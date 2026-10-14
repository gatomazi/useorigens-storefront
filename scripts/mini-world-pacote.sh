#!/usr/bin/env bash
# Monta o pacote do protótipo "Meu Pequeno Mundo" para avaliar fora do repositório: HTML, contexto/, dados/ (já exportados),
# relatórios e as evidências da rodada, com os caminhos relativos que a página usa. Roda com qualquer servidor estático.
# Uso: npm run mundo:pacote [-- <pasta-de-evidencias>]   (padrão: evidencias-v21)
# Saída: prototipos/meu-pequeno-mundo/pacote/meu-pequeno-mundo-v2.1.zip (fora do git)
set -euo pipefail
cd "$(dirname "$0")/.."
PROTO=prototipos/meu-pequeno-mundo
EVID="${1:-evidencias-v21}"
NOME=meu-pequeno-mundo-v2.1
SAIDA="$PROTO/pacote"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

test -f "$PROTO/dados/indice.json" || { echo "falta $PROTO/dados: rode npm run mundo:dados antes" >&2; exit 1; }
test -d "$PROTO/$EVID" || { echo "falta $PROTO/$EVID" >&2; exit 1; }

DEST="$TMP/$NOME"
mkdir -p "$DEST"
cp "$PROTO/meu-pequeno-mundo-use-origens.html" "$DEST/"
cp -R "$PROTO/contexto" "$PROTO/dados" "$DEST/"
cp "$PROTO"/relatorio-*.md "$DEST/"
cp -R "$PROTO/$EVID" "$DEST/evidencias"
GERADO=$(node -e 'const d=require(process.argv[1]); console.log(d.geradoEm.slice(0,10), JSON.stringify(d.catalogo))' "$PWD/$PROTO/dados/indice.json")
LUGARES=$(ls "$PROTO/dados/lugares" | wc -l | tr -d ' ')

cat > "$DEST/LEIA-ME.md" <<EOF
# Meu Pequeno Mundo — pacote para avaliar (v2.1)

Protótipo independente da Use Origens. Não é o site em produção.

## Abrir

1. Descompacte o arquivo.
2. Dentro da pasta \`$NOME\`, rode um servidor estático. Por exemplo:
   - \`python3 -m http.server 4321\`
   - ou \`npx serve -l 4321\`
3. Abra http://127.0.0.1:4321/meu-pequeno-mundo-use-origens.html

O mundo com as três cidades do piloto abre direto em:
http://127.0.0.1:4321/meu-pequeno-mundo-use-origens.html?mundo=1&origem=4211504&presente=4218004&coracao=4205704

Não precisa regenerar nada. Os dados de \`dados/\` (catálogo exportado em ${GERADO%% *}, $LUGARES lugares) e os de \`contexto/\` já estão no pacote.

## Precisa de internet para

- **Three.js 0.186.1**, servido por cdn.jsdelivr.net. Sem ele, a página mostra uma apresentação estática dos lugares, com as camisetas.
- **Fontes da loja** (Google Fonts). Sem elas, o navegador usa as fontes do sistema.
- **Fotos das camisetas**, que vêm de gcp-images.majestic.ink.rsvcloud.com.
- **Links da loja**, que levam a www.useorigens.com.br, e **links das fontes** (IBGE, prefeituras e outras).

**Não funciona offline.** Aberto direto do disco (\`file://\`), o navegador não deixa a página ler \`dados/\` e \`contexto/\`. Nesse caso ela entra em modo de demonstração, com 6 cidades de exemplo e sem perfis.

## O que tem aqui

| Caminho | O que é |
| --- | --- |
| \`meu-pequeno-mundo-use-origens.html\` | O protótipo inteiro (HTML, CSS e JS num arquivo só) |
| \`contexto/perfis-cidades.json\` | Perfis curados (Nova Trento, Tijucas, Garopaba), com a fonte de cada fato |
| \`contexto/sedes-municipais-ibge-2022.json\` | Sede municipal e regiões do IBGE das cidades dos estados da loja |
| \`dados/indice.json\`, \`dados/lugares/*.json\` | Índice de busca e um arquivo por lugar (camisetas, página da loja, ponto do IBGE) |
| \`relatorio-*.md\` | Relatórios das rodadas: v1, v2 (contexto das cidades) e v2.1 (acabamento de UX) |
| \`evidencias/\` | Capturas reais em 375 × 812 e 1440 × 900, PNGs exportados e resultados dos roteiros |
EOF

mkdir -p "$SAIDA"
rm -f "$SAIDA/$NOME.zip"
(cd "$TMP" && zip -qr -X "$OLDPWD/$SAIDA/$NOME.zip" "$NOME" -x '*.DS_Store')
echo "$SAIDA/$NOME.zip ($(du -h "$SAIDA/$NOME.zip" | cut -f1))"
