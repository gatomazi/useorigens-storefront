# Claude — Infraestrutura do storefront Use Origens: cache, sincronização e Railway

## Contexto

O storefront `/sul` já está funcional, mas precisamos preparar a infraestrutura **antes de publicar no Railway**. O projeto Railway já foi criado; **não presuma** que serviços, banco de dados, Redis, domínio, cron ou variáveis já estejam configurados.

Tenho a impressão de que parte dos dados do IBGE e da Reserva INK ainda pode estar sendo consultada *a quente*. Porém, relatórios anteriores mencionam `scripts/build-geo.mts`, dados geográficos locais, snapshot de catálogo e geração de páginas. **Audite o código real antes de propor ou duplicar cache.** A API da INK é somente leitura neste storefront.

**Objetivo:** navegação rápida, previsível e resiliente, sobretudo no mobile; nenhuma visita deve depender desnecessariamente de duas APIs externas; configuração de produção inteiramente por variáveis de ambiente do Railway, sem credenciais no cliente ou no repositório.

## 1. Auditoria obrigatória: mapear o que acontece hoje

Inspecione o repositório, versões de Next/Node, `package.json`, `next.config`, Dockerfile/Railway/Nixpacks se houver, processos de build e start, `scripts/build-geo.mts`, carregamento do catálogo INK, rotas, componentes server/client, `fetch`, `revalidate`, cache existente, snapshots, build artifacts e qualquer chamada a IBGE/INK.

Produza uma matriz concreta:

| Fonte | Quem consome | Quando consulta hoje | Cache/snapshot atual | TTL/invalidação | Falha atual | Ajuste necessário |
|---|---|---|---|---|---|---|
| IBGE | … | build/start/request | … | … | … | … |
| INK: catálogo | … | build/start/request | … | … | … | … |
| INK: preço/disponibilidade/slug/imagem, se aplicável | … | … | … | … | … | … |

Faça **instrumentação mínima** em desenvolvimento/testes para distinguir chamadas externas de leitura local; não conclua que tudo é dinâmico apenas pela existência de `fetch` no código. Identifique quais rotas dependem de APIs externas na primeira visita, no cache hit e durante o build. Preserve os mecanismos existentes que já funcionam.

## 2. Geografia IBGE: snapshot versionado, não API no request

Os **1.191 municípios do Sul** e suas **23 mesorregiões editoriais** já foram verificados, mantendo a divisão atual de 2017 em campo separado. Não regredir a decisão de `docs/decisions/0004-editorial-mesoregion-navigation.md`.

- O IBGE deve ser consultado durante a **geração/atualização explícita do dataset**, não durante a visita à home, busca, estado, cidade ou PDP.
- Reaproveitar `scripts/build-geo.mts` e o artefato já existente. Se necessário, torná-lo reproduzível e versionado, com verificação de schema e cobertura.
- Gerar o dataset em build ou consumi-lo do artefato versionado existente, **sem exigir disponibilidade do IBGE a cada deploy**. Determinar a estratégia mais segura após auditar o build atual; se atualizar o dataset for uma etapa separada, documentar o comando.
- Validar total por UF (**PR 399, SC 295, RS 497**), mesorregiões, contagens, ordenação, busca e aliases sem lógica geográfica hardcoded.
- Não alterar grupos editoriais, slugs ou a classificação de 2017 que continua armazenada.

## 3. INK: cache resiliente e sincronização, sem consulta por componente

Identifique primeiro a fonte de verdade atual, o snapshot existente, a política real de atualização e quais campos têm maior volatilidade. Não criar uma segunda implementação concorrente do catálogo.

Direção desejada:

1. Uma **camada de acesso server-side** ao catálogo INK, compartilhada pelas rotas e módulos, com interfaces claras.
2. Cache de leitura para catálogo, categorias, produtos, variantes, imagens e links efetivamente usados; chave com identidade completa do recurso, paginação, parâmetros e versão do schema.
3. **Persistência entre deploys e instâncias**, caso a auditoria demonstre necessidade de conteúdo atualizado sem rebuild. Avaliar Redis ou banco do Railway (ou estrutura existente) com justificativa de complexidade/custo; não escolher Redis por padrão nem depender apenas de memória de processo. Se snapshot versionado + revalidação resolverem o caso, demonstrar por quê.
4. Estratégia explícita de **stale-while-revalidate / último snapshot válido**: na falha da INK, continuar servindo catálogo previamente validado quando seguro; registrar idade do dado e erro. Nunca substituir a vitrine por uma lista vazia por falha temporária.
5. TTLs **configuráveis**, com valores iniciais justificados após observar os recursos e a API; política distinta para dados pouco mutáveis e informações sensíveis à mudança (por exemplo preço/estoque, **se** a INK os oferecer). Não mostrar preço ou disponibilidade obsoletos sem definir a política adequada e, quando necessário, validar no destino real de compra.
6. Deduplicar requisições simultâneas, tratar paginação, rate limit (`429`/`Retry-After`), timeout, retries com backoff limitado e limite de concorrência. Não criar avalanche no cache miss.
7. Sincronização periódica **somente se necessária**: estudar cron do Railway, job protegido ou mecanismo da plataforma realmente disponível; nunca agendar com `setInterval` dentro de uma instância web assumindo execução única. Prever refresh manual autenticado e invalidação por evento/webhook **apenas se a INK oferecer e houver necessidade**.
8. Primeiro bootstrap sem cache: definir comportamento seguro, incluindo erro legível e health check honesto; não mascarar ausência total de catálogo.
9. Nenhuma operação de escrita na INK. Preservar slugs, URLs, imagens e lógica de redirecionamento corretos.

Documente fluxo de **primeira carga, cache hit, cache expirado, falha INK, rebuild/deploy e duas instâncias simultâneas**.

## 4. Railway: variáveis de ambiente e processo

O usuário **já criou o projeto no Railway**, mas você não tem autorização para supor que exista banco/Redis ou para efetuar deployment.

- Auditar todo o uso atual de `process.env`, `.env*`, valores hardcoded e variáveis `NEXT_PUBLIC_*`.
- Criar um módulo de **configuração tipada e validada no servidor**, com erros de inicialização claros apenas para variáveis obrigatórias do modo de execução em questão. Distinguir build-time de runtime e opcionais de obrigatórias.
- Em produção, consumir as variáveis **injetadas pelo Railway em `process.env`**. Não buscar segredos via API do Railway no request e não exigir `.env.local` em produção. Em desenvolvimento local, permitir `.env.local` sem versionar valores secretos.
- Produzir `.env.example` **sem credenciais** e `docs/deploy/railway.md` com: tabela `NOME | finalidade | obrigatória? | build/runtime | serviço | exemplo não sensível`, configurações do serviço, build/start, variáveis de referência entre serviços **se houver** banco/cache, health checks e rollback.
- Adaptar o app ao `PORT` fornecido pelo Railway e ao bind `0.0.0.0`, respeitando a forma correta para a versão de Next e o tipo de deploy (sem hardcode `3000` em produção).
- Verificar se o build depende de secrets de runtime; **não transformar chave INK em `NEXT_PUBLIC_*`** nem incorporá-la ao bundle/browser. Toda chamada autenticada à INK ocorre no backend.
- Diferenciar `APP_URL`/URL pública, endereço interno entre serviços e URL da loja INK, caso usados, evitando `localhost` em produção. Não inventar domínio já provisionado.
- Se necessário provisionar Redis/DB/volume/cron, devolver **passos precisos e variáveis a configurar**, mas **não provisionar, modificar o Railway nem fazer deploy sem autorização**. Não pedir que eu cole tokens em chat ou em arquivos versionados.

## 5. Observabilidade e operação

Adicionar somente o essencial:

- Logs estruturados de cache `hit/miss/stale/refresh/failure`, sem segredo, PII ou URL autenticada.
- Indicadores simples: idade do snapshot, último sync bem-sucedido, duração, quantidade de produtos/categorias, falhas e chamadas externas evitadas.
- Separar `liveness` da `readiness`; o health check não deve disparar chamadas à INK/IBGE a cada acesso.
- Evitar logs excessivos por request e endpoints operacionais públicos sem autenticação.
- Documentar como forçar atualização, recuperar de snapshot inválido, verificar inconsistência e reverter.

## 6. Critérios de aceitação — testes reais

Criar testes unitários/de integração e, se couber, uma verificação e2e que demonstre:

- `/sul`, estado, cidade, PDP e busca **não chamam IBGE durante requests**.
- Repetir visita à mesma página com cache quente **não repete consultas desnecessárias à INK**.
- Duas requisições simultâneas ao mesmo recurso não geram duplicação descontrolada.
- Após expiração do TTL, há refresh controlado; com INK indisponível, o último snapshot válido mantém a navegação, observadas as regras para preço/estoque.
- Bootstrap sem snapshot e INK indisponível falha de maneira explícita e observável.
- Redeploy/restart não destrói a única cópia necessária do catálogo se a arquitetura exigir persistência.
- Nenhum segredo entra no bundle client, logs, HTML, artefatos públicos ou repositório.
- Configuração via env funciona localmente e com o contrato esperado do Railway; ausência de variável obrigatória gera mensagem segura e útil.
- Testes geográficos anteriores (1.191 municípios / 23 mesorregiões) e golden tests de UI continuam passando.
- Medir, em condições reproduzíveis, **requisições externas e latência** antes/depois; não alegar ganhos inventados.

## 7. Limites desta rodada

**Pode:** auditar, implementar cache/snapshot e configuração, adicionar testes/docs, ajustar apenas o necessário para integrar à aplicação e executar build/testes locais.

**Não pode:** mudar o design, ordem das seções ou curadoria do `/sul`; alterar catálogo ou pedidos na INK; iniciar `/norte`, `/centro-oeste` ou `/`; criar serviços Railway sem autorização; executar deploy; versionar segredos; fazer commit/push/merge.

Não instalar infraestrutura supérflua. Se a auditoria mostrar que o snapshot atual já resolve a maior parte do problema, **simplifique em vez de reescrever**.

## 8. Retorno obrigatório ao finalizar

Entregue:

1. **Diagnóstico antes/depois** com a matriz de cada fonte e o ponto exato em que ocorria chamada a quente (ou evidência de que não ocorria).
2. **Arquitetura escolhida** e motivos para usar ou dispensar Redis/DB/cron; diagrama simples do caminho de leitura e atualização.
3. **Lista de variáveis** a criar no Railway, com serviço de destino e quais podem ser apenas runtime. Não inclua valores secretos.
4. `docs/deploy/railway.md` e `.env.example` atualizados.
5. Arquivos alterados e comandos de geração/sincronização/invalidação.
6. Testes realizados, resultados, comportamento em indisponibilidade da INK/IBGE e medições reproduzíveis de chamadas externas.
7. Pendências que dependem de minha ação no dashboard Railway, em ordem, **sem executar essas ações**.
8. Confirmação de que não houve deploy, commit, push ou alteração na INK.

**Pare para minha revisão.** Não comece outra fase automaticamente.
