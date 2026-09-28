# Norte e Centro-Oeste: disponibilidade ao comprador (critério para o sitemap)

Data: 2026-09-27. Verificação somente leitura em produção (GET em páginas públicas, User-Agent comum). Sem compra, sem checkout, sem chamadas às APIs da INK; os links de produto foram apenas abertos como página pública.

Critério do dono: manter no sitemap só se as páginas estiverem de fato disponíveis ao comprador (região, cidade, família, catálogo com produtos reais, links comerciais e fluxo de compra existente); caso contrário, excluir do sitemap e manter `noindex`.

## Resultado

| Item | Sul (referência) | Norte | Centro-Oeste |
|------|------------------|-------|--------------|
| URLs no sitemap | 10.642 | 4.041 | 4.187 |
| Cidades / famílias | 1.191 / 9.446 | 450 / 3.582 | 468 / 3.713 |
| Página da região | 200, preços e links de compra | 200, 90 preços, 38 links de compra | 200, 82 preços, 33 links de compra |
| 3 cidades sorteadas | 200, 16 preços, 10–11 links | 200, 16 preços, 11 links | 200, 16 preços, 11 links |
| 3 famílias sorteadas | 200, 16 preços, 11 links | 200, 16 preços, 11 links | 200, 16 preços, 11 links |
| Destino comercial | `usesul.com.br/usesul/product/...` | `usenorte.com.br/usenorte/product/...` | `usecentro.com.br/usecentro/product/...` |
| Links de produto abertos (2 por região) | 200 | 200 | 200 |

Além disso: nas 3 regiões, 40 URLs aleatórias do sitemap responderam 200 (amostra global da auditoria).

## Conclusão

Norte e Centro-Oeste têm catálogo com produtos reais, preços visíveis e links comerciais que levam a páginas de produto existentes nas lojas correspondentes. **Recomendação: manter as duas no sitemap.** Nenhuma alteração de código necessária para isso; o sitemap já reflete as regiões lançadas.

## O que esta verificação não prova

- Não testei o fluxo de compra até o fim (carrinho, checkout, pagamento): fora do escopo, sem compras reais e sem mexer na INK. Se o dono quiser essa garantia, a checagem manual é: escolher um produto em cada região, abrir o link da INK, adicionar ao carrinho e parar antes do pagamento.
- Amostra pequena por região (3 cidades e 3 famílias, mais 2 links de produto). Uma cidade específica pode ter produto indisponível na INK sem que a amostra pegue. O catálogo é o mesmo mecanismo do Sul, sincronizado a partir da INK.
- Estar `noindex` ou indexável depende da correção em `docs/seo/correcao-noindex.md`.
