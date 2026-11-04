# Popup da oferta (loja)

Um popup no site (`/[região]/…`) com **uma promoção progressiva da INK**: as faixas como cards (3 peças, 4 peças…), o cupom com "Copiar", um botão
principal e "Agora não". No computador abre no meio da tela, em duas colunas; no celular, como uma folha embaixo. Cores: o par do cabeçalho da região
(Aparência), o mesmo do botão de cupons. O botão de cupons continua onde está.

```
INK (promoção progressiva: código, faixas, datas)
   │  GET /v1/stores/promotions?type=progressive   (painel: a lista para escolher)
   │  GET /v1/stores/promotions/{id}               (API pública: a escolhida, mesmo cache do "Monte seu kit")
   ▼
CMS /admin/popup (rascunho → Publicar)  →  published.json (offerPopup: ligado + id + textos + link)
   ▼
GET /api/offer-popup/<região>  (v1)  →  OfferPopupLoader (layout da região)  →  OfferPopup
```

**A INK é a fonte das faixas e do código**, como no kit: mudou a promoção lá (faixas, código, fim, apagada), o popup muda em poucos minutos sem salvar
nada aqui. O storefront nunca aplica desconto: "Copiar" copia o código e o carrinho da INK aplica.

## O que pode ir no popup

As mesmas regras do kit (`kitUnsupportedReason`), porque o popup promete o desconto "no seu pedido": faixas por **quantidade**, **todos os produtos**,
sem **primeira compra**, disponível e não terminada. Uma que ainda não começou pode ser escolhida e só abre quando começa. Cabem **4** cards lado a lado;
com mais faixas, o popup mostra as 3 primeiras e a maior (o título fala da maior).

## Quando abre

- 8 s depois de entrar, ou antes, quando a pessoa rola metade da página (nunca antes de 2,5 s).
- **Uma vez a cada 7 dias** por navegador e por região (`localStorage` `origens:offer-popup:<região>`, guardado quando abre). Uma promoção diferente
  conta como nova e abre de novo.
- Nunca por cima de menu, busca, painel de cupons ou qualquer diálogo, nem com a pessoa digitando ou com a aba escondida: espera e tenta a cada 3 s.
- Não abre em `personalizar` (Estúdio), `minhas-estampas`, `seja-parceiro` nem `privacidade`.
- Navegador que não deixa guardar (modo privado com storage bloqueado): **não abre**, para não aparecer em toda visita.
- Qualquer falha (INK fora, resposta inválida, `offer: null`) = nada abre.

Acessibilidade: `role="dialog"` + `aria-modal`, foco no ×, Tab preso dentro, Esc e o fundo fecham, a página não rola atrás, o foco volta para onde
estava. Animação curta de entrada, desligada com `prefers-reduced-motion`.

## Painel: `/admin/popup` ("Popup da oferta", em Marketing)

- **No ar**: liga/desliga (desligar guarda a escolha).
- **Promoção progressiva da INK**: lista lida ao vivo; as que não podem mostram o motivo. Ligar exige uma promoção que a INK confirma no salvar.
- **Textos** (opcionais): chamada (40), título (60; vazio = "Até R$ X OFF no seu pedido", da maior faixa), texto de apoio (160), botão (30).
- **Link do botão** (opcional): um endereço deste site (`/sul/colecoes/…`; um endereço completo de useorigens.com.br vira o caminho). Vazio = o botão só
  fecha o popup.
- Prévia no celular e no computador (o mesmo componente da loja).
- "Publicar" lista: ligado/desligado, promoção A → B, textos editados, link do botão.

Leitura tolerante: um `offerPopup` inválido no `published.json` é descartado com diagnóstico (sem popup), nunca a região.

## API pública `GET /api/offer-popup/[region]` (v1)

Pública, só leitura, sem cookies. `404` para região desconhecida ou não lançada. `Cache-Control: public, max-age=60, s-maxage=60, stale-while-revalidate=60`.

```json
{
  "v": 1, "region": "sul",
  "offer": {
    "id": 73095, "code": "BLACKMONTH", "auto": false, "kind": "value",
    "tiers": [{ "items": 3, "discount": 25 }, { "items": 4, "discount": 50 }, { "items": 5, "discount": 75 }, { "items": 6, "discount": 100 }],
    "eyebrow": "Leve mais, pague menos", "title": "Até R$ 100 OFF no seu pedido", "lead": "Quanto mais peças você leva, maior o desconto.",
    "cta": "Escolher minhas peças"
  },
  "theme": { "primary": "#4d543d", "onPrimary": "#ffffff" }
}
```

## Eventos (GA4)

`offer_popup_view`, `offer_popup_copy`, `offer_popup_cta`, `offer_popup_close`, com `region`, `surface: "storefront"` e `promo_code`.

## Testes

`tests/unit/offer-popup.test.ts`: contrato, payload, leitura no navegador, regra dos 7 dias, páginas onde não abre, formulário do painel, lista do
Publicar e leitura tolerante.
