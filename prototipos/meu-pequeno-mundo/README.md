# Meu Pequeno Mundo — protótipo

Maquete 3D (Three.js) em que a pessoa monta um pequeno mundo com até três lugares — origem, presente e lugar do coração — e chega às
camisetas reais de cada cidade. Protótipo isolado: não altera o storefront.

- `meu-pequeno-mundo-use-origens.html` — o protótipo inteiro (HTML, CSS e JS num arquivo; Three.js 0.186.1 por CDN com versão fixa).
- `relatorio-meu-pequeno-mundo-use-origens.md` — implementação, dados, validação, avaliação e próximos passos.
- `evidencias/` — capturas reais (Chromium, 1440×900 e 375×812) e PNGs exportados pela própria página.
- `dados/` — **gerado, fora do git**: índice das cidades e um arquivo por cidade, exportados do catálogo local.

## Rodar

```bash
npm run mundo:dados                      # lê data/generated (catalog:sync) e escreve prototipos/meu-pequeno-mundo/dados/
cd prototipos/meu-pequeno-mundo && python3 -m http.server 4321 --bind 127.0.0.1
# abrir http://127.0.0.1:4321/meu-pequeno-mundo-use-origens.html
```

Aberto direto do disco (`file://`), o navegador não deixa ler `dados/`: o protótipo entra em **demonstração** (6 cidades de exemplo,
sem camisetas, "Catálogo ainda não conectado") e o link do mundo fica desabilitado; o resto funciona.

## QA

```bash
node scripts/qa/mini-mundo.mjs <pasta-de-saida> [url-da-previa]   # com o servidor acima no ar
```

Percorre os critérios de aceite em desktop e celular, salva capturas, os PNGs exportados e `resultado.json`.
