# Central de Cupons e Promoções (storefront + INK)

Um botão de cupons (FAB) no canto inferior **esquerdo**, com selo numérico, que abre o painel **"Cupons e ofertas"**. Configurado no CMS por região,
exibido em duas superfícies a partir de **uma única fonte**:

```
CMS (rascunho → Publicar)  →  published.json  →  GET /api/promotions/<região>  ─┬→ storefront (PromoFab, client, após idle)
                                                                                └→ Worker da INK  GET /__origens/promotions  →  loader (promo-fab)
```

**O CMS descreve, a INK executa.** Nenhum valor, regra ou cálculo de desconto existe no storefront nem no Worker. "Copiar" só copia o código; a
validação e a aplicação continuam no carrinho/checkout da INK. Nada intercepta o campo de cupom da INK, nada envia POST, nada aplica cupom.

## CMS: `/admin/promocoes` ("Cupons e promoções")

Por região (Sul, Norte, Centro-Oeste: o documento da região; o escopo global recusa promoções). Cada item:

| Campo | Cupom | Promoção sem código | Regra |
|---|---|---|---|
| `id` | ✓ | ✓ | gerado do título na criação e mantido (estável para analytics e diff) |
| `type` | `coupon` | `promotion` | |
| `enabled` | ✓ | ✓ | |
| `title` | ✓ | ✓ | 1–60, uma linha |
| `code` | ✓ | — | 2–40 `A-Z a-z 0-9 - _`, **exatamente** como digitado (é o que o Copiar copia) |
| `description` | ✓ | ✓ | 1–200, uma linha |
| `callout` | opcional | opcional | ≤160; vazio = **omitido** (nenhuma linha, nenhum espaço) |
| `badgeLabel` | opcional | — | ≤24 ("Novo") |
| `order` | ✓ | ✓ | a ordem da lista (↑/↓ no editor grava 1..n) |
| `startsAt` / `endsAt` | opcional | opcional | digitados em horário de Brasília, gravados com `-03:00` explícito; fim > início |

A região de um item é o documento onde ele mora: um cupom do Sul nunca é lido pelo Norte. Máximo 20 itens por região; lista vazia é válida.

O editor mostra o status de cada item (No ar ao publicar / Agendado / Encerrado / Desativado / Incompleto) e uma **prévia** com o próprio componente
do storefront (selo, cards, callout só quando existe, "Ver a animação"). Salvar = **rascunho** (não aparece em lugar nenhum). "Publicar" (tela
existente) leva os itens junto com a região e lista as mudanças ("cupom X adicionado / editado / desativado", "nova ordem").

Leitura tolerante: um `promotions` inválido no `published.json` é descartado com diagnóstico (sem botão), nunca a região.

## API pública `GET /api/promotions/[region]` (contrato v1)

Pública, só leitura, sem cookies, sem CORS (o Worker lê no servidor). `404` para região desconhecida ou não lançada.
`Cache-Control: public, max-age=30, s-maxage=30, stale-while-revalidate=30` (um item agendado entra/sai em ~1 min).
Só itens **publicados**, **habilitados** e **dentro da janela**, na ordem do proprietário; nunca `enabled`, `startsAt`, rascunho ou dados administrativos.

```json
{
  "v": 1,
  "region": "sul",
  "theme": { "primary": "#4d543d", "onPrimary": "#ffffff" },
  "items": [
    { "id": "leve-mais", "type": "coupon", "title": "LEVE MAIS", "code": "LEVEMAIS",
      "description": "3 peças: R$ 30 OFF · 4 peças: R$ 50 OFF · 5 ou mais: R$ 75 OFF", "callout": "Um cupom por pedido.", "order": 1 },
    { "id": "frete-gratis", "type": "promotion", "title": "Semana do Frete Grátis",
      "description": "1 peça RJ ou 2 peças demais estados", "callout": "Com limite de R$ 29,90 por frete", "order": 2 }
  ]
}
```

- `callout`: string, `null` ou omitido; os dois últimos (e `""`) = sem a linha. O storefront omite quando vazio.
- `badgeLabel` (só cupom) e `endsAt` (quando houver; o cliente descarta item já encerrado enquanto em cache) são opcionais.
- `theme`: o par do cabeçalho da paleta publicada da região (o mesmo que a tela Aparência já checa por contraste): o botão tem a cor da região nas duas superfícies.

## Storefront

`src/app/[region]/layout.tsx` monta `<PromoFab key={region} region={region} />`: busca a API **depois do carregamento** (requestIdleCallback), só então
carrega o código do botão (`next/dynamic`). Erro, timeout (4 s), JSON inválido, outra região ou lista vazia ⇒ **nada** (sem botão, sem espaço reservado,
sem nova tentativa). Busca, `cart_ref` e links não dependem dele. Não aparece no admin (layout próprio), só na prévia do editor.

- **Botão**: 56 px, levemente arredondado, ícone de ticket, cor da região, sombra discreta; selo = cupons **copiáveis** (`9+` acima de nove; só avisos = sem selo).
- **Painel**: ≥640 px cartão ancorado ao botão (360 px, altura máx. `min(70vh, 34rem)`, rolagem interna); <640 px **folha inferior** (modal, fundo escurecido,
  foco preso, rolagem da página travada, safe areas). Escape/× /clique fora fecham e devolvem o foco.
- **Copiar**: `navigator.clipboard` → `execCommand` → código selecionado + aviso para copiar à mão. "Copiado" por 2 s; anúncio em `aria-live`.
- **Espaço**: sobe acima da barra de cookies (medida); some com o menu mobile, diálogos modais e o teclado virtual (campo de texto focado em toque) e
  enquanto o seu canto ficaria sobre as versões ou o CTA "Escolher tamanho na loja" da página de produto (`data-purchase-controls`); volta ao rolar.
- **Microanimação** (`components/promotions/attention.ts`, testado): rotação de poucos graus, 2 oscilações, 560 ms, **a cada 6–8 s** (decisão do
  proprietário), sem limite por página e sem ser adiada por rolagem, clique ou digitação; pulada enquanto painel/menu/diálogo/popover está aberto, digitando,
  aba oculta ou botão escondido; nunca com `prefers-reduced-motion: reduce` (o script não anima e o CSS anula). **Abrir o painel** ⇒ parada pelo resto da
  sessão (`sessionStorage`).
- **Analytics** (GA4, só com consentimento; nenhum evento Meta): `promo_fab_open`, `promo_coupon_copy`, `promo_panel_close` com `region`, `promo_id`,
  `surface=storefront`. Nunca o código nem textos.

## INK (Worker `worker-lojas`, feature `promo-fab`)

Ver `docs/promo-fab.md` no repositório do Worker. Mesmo contrato, mesmo visual, mesmas regras de animação; colisões da INK (CTA fixo, aviso de
cookies, carrinho, modal, menu, Ajuda, teclado, controles do formulário de compra); `surface=ink` nos eventos.

## Testes

- `tests/unit/promotions.test.ts` (47): contrato, janela, payload, leitura do cliente (callout string/null/omitido), selo, datas de Brasília, formulário do CMS,
  operação de rascunho, diff de publicação, leitura tolerante, isolamento regional, rascunho nunca público, ritmo da animação.
- `tests/e2e-admin/promotions.spec.ts` (13, sandbox local): CMS → rascunho não público → publicar → API → botão (selo, painel, Copiar com clipboard real, Escape),
  barra de cookies, 1280/1024/768/500/390/360/320 sem overflow, folha no celular, menu mobile, CTA da página de produto, uma instância após navegação,
  reduced motion, tudo desativado ⇒ sem botão.
  Rodar: `npm run test:admin -- --project promotions.spec.ts --no-deps` (`CAPTURE=1` grava `docs/screenshots/promotions/`).

## Rollout (nada foi publicado)

1. Storefront: merge + deploy desta branch (o botão não aparece até haver itens publicados).
2. CMS de produção: cadastrar e **publicar** os cupons por região.
3. Validar `https://useorigens.com.br/api/promotions/{sul,norte,centro-oeste}`.
4. Worker: ligar `promo-fab` por loja (comandos em `docs/promo-fab.md` do Worker).
5. QA real (`scripts/qa-promo-live.mjs` do Worker, depois ao vivo).
6. Release controlado: uma loja por vez; rollback = `wrangler rollback` da loja (o storefront não precisa mudar) ou despublicar/desativar os itens no CMS.
