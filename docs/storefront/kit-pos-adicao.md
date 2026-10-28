# Monte seu kit (depois de adicionar ao carrinho)

No modal **"Produto adicionado ao carrinho"** da INK, acima dos botões, as faixas de **uma promoção progressiva da INK** escolhida no painel, já com o
preço da peça que acabou de ser adicionada: de quanto sai por quanto, quanto fica cada peça e quanto economiza. O código vem com "Copiar cupom". Os
botões nativos passam a se chamar **"Escolher mais produtos"** e **"Finalizar compra"**, lado a lado; por baixo continuam sendo os da INK (fechar o
modal e abrir o carrinho, onde o cliente cola o cupom). A busca de estampas e "As mais vendidas" seguem abaixo.

```
INK (promoção progressiva: código, faixas, datas)
   │  GET /v1/stores/promotions?type=progressive   (painel: a lista para escolher)
   │  GET /v1/stores/promotions/{id}               (API pública: a escolhida, cache de 5 min)
   ▼
CMS /admin/kit (rascunho → Publicar)  →  published.json (postAddKit: ligado + id + textos)
   ▼
GET /api/post-add-kit/<região>  (v1)  →  Worker GET /__origens/kit  →  loader (post-add-kit) no modal
```

**A INK é a fonte das faixas.** O painel guarda só *se* e *qual* promoção, mais os textos. Mudou a promoção na INK (faixas, fim, apagada), o modal
muda em poucos minutos, sem salvar nada aqui. Para criar ou editar uma promoção progressiva, use o painel da INK
(`POST /v1/stores/promotions/progressive` existe, mas este painel não cria promoções).

**Exceção à regra "o CMS descreve, a INK executa"** (`cupons-e-promocoes.md`): aqui há contas. Elas usam as faixas da INK e o preço da peça adicionada:
`value` = R$ fora do total; `percentage` = % fora do total. Quem aplica o desconto continua sendo o carrinho da INK. Por isso há sempre o aviso
"Em peças com preços diferentes, o total do kit pode variar." e, sem preço legível, o modal mostra só o desconto de cada faixa ("R$ 25 OFF no total").

## O que pode ser o kit (v1)

Só o que vale para **qualquer** peça que a pessoa adicione:

| Na INK | Pode? | Por quê |
|---|---|---|
| `progress_kind = cart_items` (faixas por quantidade) | sim | |
| `progress_kind = cart_value` | não | "3 peças" não diria nada |
| `list_type = all` | sim | |
| `products` / `product_types` / `collections` | não | o modal não sabe se a peça adicionada participa (a leitura do produto não traz as categorias) |
| `first_purchase = true` | não | quem já comprou veria um desconto que não tem |
| `available = false` ou já terminada | não | |
| começa no futuro | sim | aparece quando começa |

O painel lista todas as progressivas da loja e mostra o motivo das que não podem. Mostramos até **6** faixas (`MAX_KIT_TIERS`). Promoção que a INK aplica
sozinha (`apply_automatically`) aparece como "Desconto aplicado no carrinho", sem código.

## Painel: `/admin/kit` ("Monte seu kit", em Marketing)

- **No ar**: liga/desliga. Desligar guarda a escolha. Ligar exige uma promoção que a INK confirma, no salvar, que pode ser o kit; com a INK fora do ar,
  ligar é recusado (nada é publicado sem conferir) e desligar funciona.
- **Promoção progressiva da INK**: lista lida da INK a cada abertura da tela (1 pedido). Mostra código, faixas, se o cliente digita o cupom, se a INK
  também mostra no carrinho, início/fim e limite de usos.
- **Textos** (opcionais): chamada (40), título (60) e texto de apoio (160). Vazio = o padrão.
- **Prévia** no celular, com um preço de referência só para a prévia.
- Salvar = **rascunho**. "Publicar" lista: "Monte seu kit: ligado, com a promoção LEVEMAIS…", "promoção A → B", "textos editados".

Leitura tolerante: um `postAddKit` inválido no `published.json` é descartado com diagnóstico (o modal fica como a INK desenha), nunca a região.

## API pública `GET /api/post-add-kit/[region]` (contrato v1)

Pública, só leitura, sem cookies, sem CORS (o Worker lê no servidor). `404` para região desconhecida ou não lançada.
`Cache-Control: public, max-age=60, s-maxage=60, stale-while-revalidate=60`.

```json
{
  "v": 1,
  "region": "sul",
  "kit": {
    "id": 73095, "code": "LEVEMAIS", "auto": false, "kind": "value",
    "tiers": [{ "items": 3, "discount": 25 }, { "items": 4, "discount": 40 }, { "items": 5, "discount": 60 }, { "items": 6, "discount": 85 }],
    "eyebrow": "Economize montando seu kit", "title": "Monte seu kit e pague menos",
    "lead": "Você pode combinar produtos participantes. Os valores abaixo usam o preço atual deste produto como referência."
  }
}
```

- `kit: null` = nada a mostrar: desligado, nada escolhido, a promoção não está valendo (não começou, terminou, mudou para algo que não pode) ou a INK não
  respondeu e não há resposta boa recente.
- Leitura da INK (`src/lib/ink/promotions-client.ts`): 4 s de timeout, sem nova tentativa; cache por processo de **5 min**; com a INK falhando, a última
  resposta boa vale por até **30 min** e depois some; o 404 da INK (promoção apagada) vale na hora. Desligado = nenhuma leitura da INK.
- `endsAt` (quando há): o cliente descarta o kit se acabar enquanto está em cache.

## Testes

`tests/unit/post-add-kit.test.ts` (13): formato da INK (faixas, recusa do que foge do contrato), o que pode ser o kit, contas em centavos (de/por, cada,
economia; valor e percentual), payload público, formulário (código sempre da INK, INK fora do ar, apagada), rascunho, diff da publicação, leitura tolerante
e o cache da leitura da INK.

## Rollout (nada publicado)

1. Storefront: merge + deploy (sem nada publicado no painel, a API responde `kit: null`).
2. Painel de produção: Marketing › Monte seu kit › escolher a promoção, ligar, salvar e **Publicar**.
3. Conferir `https://useorigens.com.br/api/post-add-kit/sul`.
4. Worker: `bash scripts/release-tema.sh --check --add=post-add-kit` e, com o dono, `--deploy --add=post-add-kit` (`docs/post-add-kit.md` no Worker).
5. Conferência real do modal (adicionar ao carrinho de verdade): passo do dono.
