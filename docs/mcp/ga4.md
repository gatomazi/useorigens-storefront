# Google Analytics no conector Use Origens

O conector `https://www.useorigens.com.br/api/mcp` ganha duas ferramentas de **leitura** do GA4 **quando o servidor tem as credenciais** (sem elas, nada muda e as ferramentas nem aparecem). A propriedade é uma só, fixada no servidor: nenhuma ferramenta deixa escolher outra. A autenticação é a de sempre (chave `X-Api-Secret` ou OAuth do dono).

| Ferramenta | O que faz |
| --- | --- |
| `analytics_capabilities` | Lista as dimensões e métricas que a propriedade aceita (as personalizadas primeiro), com filtro por texto, e as ressalvas de leitura. Usar antes do relatório. |
| `analytics_run_report` | Métricas por dimensões num período (`start_date`/`end_date` ou `last_days`), com até 5 filtros de dimensão (E), ordenação e até 250 linhas. Limites: 9 dimensões, 10 métricas, 366 dias. |

Exemplos de pergunta: "quantas aberturas da jornada Sua cidade vieram do link dos anúncios nos últimos 7 dias" (`eventName = origens_sua_cidade_open`, dimensão `customEvent:entry_point`), "de onde vem o tráfego" (`sessionSource`, `sessionMedium`, `sessionCampaignName`), "cidades mais escolhidas" (`customEvent:city_slug`).

## Como ler os números (o conector avisa o Claude disso)

- **O GA4 conta menos do que acontece.** O storefront só envia eventos depois que a pessoa aceita os cookies de métrica (`hasAnalyticsConsent()` em `src/lib/analytics/track.ts`). Os números são um piso. Não dividir por vendas da INK para obter "taxa de conversão".
- **Eventos não são funil.** `origens_sua_cidade_open`, `select_city`, `origens_sua_cidade_model` e `go_to_ink` são contagens separadas, não etapas de uma mesma sessão.
- **Dimensões personalizadas** (`entry_point`, `family`, `garment_type`, `model_count`, `piece_count`, `city_slug`, `uf`, `position`) só podem ser consultadas depois de cadastradas no GA4 (Administrador → Definições personalizadas → Dimensões personalizadas, escopo **evento**) e só coletam **a partir do dia do cadastro**. Sem isso, `customEvent:entry_point` não existe.
- **Hoje e ontem** podem estar incompletos. A resposta marca `coverage: partial` quando o GA4 amostrou, aplicou limite mínimo de agregação (thresholding), agrupou linhas em `(other)` ou a lista foi cortada pelo `limit`.

## Configuração (uma vez; é feita por uma pessoa, não pelo código)

1. **Projeto no Google Cloud.** Em console.cloud.google.com, usar ou criar um projeto e ativar a **Google Analytics Data API** (APIs e serviços → Biblioteca).
2. **Conta de serviço.** IAM e administrador → Contas de serviço → Criar. Não precisa de papel no projeto. Em *Chaves* → Adicionar chave → **JSON**. O arquivo baixado é a chave: guardar fora do repositório.
   - Algumas organizações bloqueiam a criação de chaves (política `iam.disableServiceAccountKeyCreation`); numa conta pessoal normalmente não.
3. **Dar acesso no GA4.** analytics.google.com → Administrador → Gerenciamento de acesso à propriedade → **+** → colar o e-mail da conta de serviço (`...@...iam.gserviceaccount.com`) → papel **Leitor**.
4. **ID da propriedade.** Administrador → Detalhes da propriedade → **ID da propriedade** (só números; não é o `G-XXXX` do código de medição).
5. **Railway**, no serviço `useorigens-storefront`:
   - `GA4_PROPERTY_ID` = o ID numérico.
   - `GA4_SERVICE_ACCOUNT_JSON_B64` = o arquivo JSON inteiro em base64: `base64 -i chave.json | tr -d '\n' | pbcopy` (macOS). Em base64 as quebras de linha da chave privada não se perdem na variável.
6. Deploy. No Claude, as ferramentas `analytics_*` aparecem sozinhas no conector que já existe (pode ser preciso reconectar para recarregar a lista).

**Revogar:** apagar a chave da conta de serviço no Google Cloud ou remover o e-mail dela do GA4; ou apagar as duas variáveis no Railway (as ferramentas somem no próximo deploy).

**Local (QA):** as mesmas duas variáveis em `.env.local`; sem elas as ferramentas não existem.

## O que o código faz

- `src/lib/mcp/analytics/client.ts`: troca um JWT assinado (RS256, escopo `analytics.readonly`) por um token em `oauth2.googleapis.com/token`, guardado em memória até perto de vencer, e chama `runReport` e `metadata` da Data API v1beta (`analyticsdata.googleapis.com`). Sem biblioteca do Google; a chave nunca é registrada em log nem aparece em mensagem de erro.
- `src/lib/mcp/analytics/tools.ts`: validação (nomes `[A-Za-z][A-Za-z0-9_:]*`, limites), filtros sempre com `matchType` explícito, e a `meta` comum do conector (`source: ga4_api`, período, cobertura).
- Testes: `tests/unit/mcp-analytics.test.ts` (cliente falso; o Google nunca é chamado).
- **Não verificado contra o GA4 real** até a primeira consulta com a chave verdadeira (seção abaixo).

## Primeira consulta real

Com as variáveis em `.env.local`: `npm run dev`, e chamar `analytics_capabilities` e depois `analytics_run_report` com `metrics: ["eventCount"]`, `dimensions: ["eventName"]`, `last_days: 7`. Conferir os totais com a tela de Relatórios → Eventos do GA4 do mesmo período.
