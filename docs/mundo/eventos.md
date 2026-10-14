# Meu Pequeno Mundo — eventos de analytics

Mecanismo: o GA4 que a loja já usa, com o mesmo consentimento. Sem consentimento, nada é enviado. A rota não carrega Meta Pixel nem Clarity.
O contrato é **fechado** em `trackMundo` (`src/lib/analytics/track.ts`). O código só envia os eventos e campos listados abaixo, e todo
valor é um número, um booleano ou um código curto de `[a-z0-9_+:-]`, com até 40 caracteres. O que estiver fora disso é descartado
antes do envio.

**Nunca enviados:** lembranças (nem o tamanho delas), o texto da busca, o mundo completo (a combinação dos três lugares), URLs com
parâmetros do mundo e o PNG.
O `page_view` da rota leva só o caminho `/meu-pequeno-mundo` (`GoogleAnalytics` com `semConsulta`), e a barra de endereço é limpa antes
de o GA4 carregar.

| Evento | Quando | Campos |
|---|---|---|
| `mundo_entrada` | a página abre | `origem`: `home`, `cidade`, `rodape`, `link` (mundo compartilhado) ou `direto` |
| `mundo_inicio` | a pessoa começa a montar | — |
| `mundo_concluido` | vê o mundo pronto | `lugares` (quantos lugares distintos), `papeis` (ex.: `origem+presente+coracao`) |
| `mundo_ficha` | abre a ficha de um lugar | `lugar_id` (ID do catálogo), `perfil` (tem perfil curado?), `via`: `lugar` ou `marco` |
| `mundo_camisetas` | clica para ver camisetas | `lugar_id`, `destino`: `cidade` ou `produto`, `bloco`: `ficha` ou `resultado` |
| `mundo_png` | gera a imagem | `acao`: `baixar` ou `compartilhar`, `resultado`: `gerado` ou `falhou`, `lembrancas` (incluiu lembranças?) |
| `mundo_download_iniciado` | o navegador recebeu o arquivo para baixar | `lembrancas` |
| `mundo_compartilhar` | compartilhamento | `resultado`: `nativo_tentativa`, `nativo_concluido`, `nativo_cancelado`, `nativo_falhou`, `alternativa`, `link_copiado` ou `link_falhou`; `lembrancas` |

## Como ler

- `mundo_camisetas` é um **clique** para a loja, não uma venda. Para venda, use o funil de compra da loja.
- `mundo_download_iniciado` significa que o download foi **iniciado**, não que o arquivo foi salvo. O navegador não informa isso.
- `nativo_cancelado` é a pessoa fechando a folha de compartilhamento. Não é erro e não é sucesso.
- `lugar_id` é um lugar do catálogo, como `4106902` ou `df-ra:ceilandia`. Sozinho ele não identifica ninguém, e nenhum evento junta
  os três lugares de um mundo.
