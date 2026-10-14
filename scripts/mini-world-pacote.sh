#!/usr/bin/env bash
# Monta o pacote do protótipo "Meu Pequeno Mundo" para avaliar fora do repositório: HTML (gerado dos mesmos módulos da página da loja),
# contexto/ e dados/ (já exportados), relatórios, documentação da curadoria e da integração e as evidências da rodada, com os caminhos
# relativos que a página usa. Roda com qualquer servidor estático.
# Uso: npm run mundo:dados && npm run mundo:prototipo && npm run mundo:pacote [-- <pasta-de-evidencias>]   (padrão: evidencias-v3)
# Saída: prototipos/meu-pequeno-mundo/pacote/meu-pequeno-mundo-v3.zip (fora do git)
set -euo pipefail
cd "$(dirname "$0")/.."
PROTO=prototipos/meu-pequeno-mundo
EVID="${1:-evidencias-v3}"
NOME=meu-pequeno-mundo-v3
SAIDA="$PROTO/pacote"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

test -f "$PROTO/dados/indice.json" || { echo "falta $PROTO/dados: rode npm run mundo:dados antes" >&2; exit 1; }
test -f "$PROTO/contexto/perfis-cidades.json" || { echo "falta $PROTO/contexto: rode npm run mundo:dados antes" >&2; exit 1; }
test -d "$PROTO/$EVID" || { echo "falta $PROTO/$EVID" >&2; exit 1; }

DEST="$TMP/$NOME"
mkdir -p "$DEST"
cp "$PROTO/meu-pequeno-mundo-use-origens.html" "$DEST/"
cp -R "$PROTO/contexto" "$PROTO/dados" "$DEST/"
cp "$PROTO"/relatorio-*.md "$DEST/"
cp -R "$PROTO/$EVID" "$DEST/evidencias"
mkdir -p "$DEST/documentacao"
cp docs/mundo/*.md data/mundo/modelo-perfil.json "$DEST/documentacao/"
PERFIS=$(node -e 'const d=require(process.argv[1]); console.log(Object.values(d.cidades).map((c) => c.identidade.nome).join(", "))' "$PWD/$PROTO/contexto/perfis-cidades.json")
GERADO=$(node -e 'const d=require(process.argv[1]); console.log(d.geradoEm.slice(0,10), JSON.stringify(d.catalogo))' "$PWD/$PROTO/dados/indice.json")
LUGARES=$(ls "$PROTO/dados/lugares" | wc -l | tr -d ' ')

cat > "$DEST/LEIA-ME.md" <<EOF
# Meu Pequeno Mundo — pacote para avaliar (v3)

Protótipo independente da Use Origens. Não é o site em produção. Na v3, a experiência também roda dentro da loja
(\`/meu-pequeno-mundo\`, atrás da variável \`MEU_PEQUENO_MUNDO\`). Este HTML é gerado dos mesmos módulos da página da loja.

## Abrir

1. Descompacte o arquivo.
2. Dentro da pasta \`$NOME\`, rode um servidor estático. Por exemplo:
   - \`python3 -m http.server 4321\`
   - ou \`npx serve -l 4321\`
3. Abra http://127.0.0.1:4321/meu-pequeno-mundo-use-origens.html

Mundos prontos:
- Piloto (SC): http://127.0.0.1:4321/meu-pequeno-mundo-use-origens.html?mundo=1&origem=4211504&presente=4218004&coracao=4205704
- Sul, Centro-Oeste e Norte: http://127.0.0.1:4321/meu-pequeno-mundo-use-origens.html?mundo=1&origem=4106902&presente=5208707&coracao=1302603
- Perfis novos: http://127.0.0.1:4321/meu-pequeno-mundo-use-origens.html?mundo=1&origem=4314902&presente=5002704&coracao=1501402

Não precisa regenerar nada. Os dados de \`dados/\` (catálogo exportado em ${GERADO%% *}, $LUGARES lugares) e os de \`contexto/\`
(perfis de $PERFIS) já estão no pacote.

## Precisa de internet para

- **Three.js 0.186.1**, servido por cdn.jsdelivr.net (import map). Sem ele, a página mostra uma apresentação plana dos lugares, com as camisetas.
- **Fontes da loja** (Google Fonts). Sem elas, o navegador usa as fontes do sistema.
- **Fotos das camisetas**, que vêm de gcp-images.majestic.ink.rsvcloud.com.
- **Links da loja**, que levam a www.useorigens.com.br, e **links das fontes** (IBGE, prefeituras, Iphan e outras).

**Não funciona offline.** Aberto direto do disco (\`file://\`), o navegador não deixa a página ler \`dados/\` e \`contexto/\`. Nesse caso ela
entra em modo de demonstração, com 6 cidades de exemplo e sem perfis.

## Rodar a integração na loja (no repositório)

Com o catálogo local em \`data/generated\` (\`npm run catalog:sync\` ou cópia de outra pasta):

    MEU_PEQUENO_MUNDO=on npm run dev
    # http://localhost:3000/sul (bloco da home), /sul/pr/curitiba (convite), /meu-pequeno-mundo (a experiência)

Ativação e reversão: \`documentacao/ativacao.md\`.

## O que tem aqui

| Caminho | O que é |
| --- | --- |
| \`meu-pequeno-mundo-use-origens.html\` | O protótipo (HTML, CSS e JS num arquivo; Three.js pelo import map) |
| \`contexto/perfis-cidades.json\` | Os 9 perfis curados, com a fonte de cada fato |
| \`dados/indice.json\`, \`dados/lugares/*.json\` | Índice de busca e um arquivo por lugar (camisetas, página da loja, ponto do IBGE) |
| \`relatorio-*.md\` | Relatórios das rodadas: v1, v2, v2.1 e v3 (integração à loja e curadoria) |
| \`documentacao/\` | Guia de curadoria, modelo de perfil, cobertura dos perfis, ativação e reversão, eventos de analytics |
| \`evidencias/\` | Capturas reais em 375 × 812 e 1440 × 900, PNGs exportados, medições e resultados dos roteiros |
EOF

mkdir -p "$SAIDA"
rm -f "$SAIDA/$NOME.zip"
# arquivos .zip que estiverem nas pastas de evidências (pacotes anteriores, envios) não entram no pacote
(cd "$TMP" && zip -qr -X "$OLDPWD/$SAIDA/$NOME.zip" "$NOME" -x '*.DS_Store' -x '*.zip')
echo "$SAIDA/$NOME.zip ($(du -h "$SAIDA/$NOME.zip" | cut -f1))"
