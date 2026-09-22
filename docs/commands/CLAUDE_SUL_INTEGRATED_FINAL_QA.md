# Próximo comando — QA integrado final do `/sul`

Aprovo a migração da navegação editorial para as 23 mesorregiões e a separação entre o dado histórico de mesorregião e a divisão vigente de 2017. Considere essa decisão encerrada. Não faça outra alteração geográfica nesta rodada.

Agora precisamos revisar a **experiência integrada do `/sul`**, não mais cada feature isoladamente. Já fizemos várias alterações de layout, banners e curadoria; quero confirmar o que realmente está implementado e como tudo se comporta junto.

## 1. Auditoria de implementação

Antes de modificar qualquer coisa, confira no código e na interface:

- Home na ordem: **Hero → Sua cidade, de 8 jeitos → Da Nossa Terra → Escolha seu estado → Redesenhos/Releituras → Feito Para Você → Fala daqui → O número de cada região → Campanha editorial → Footer**.
- Hero com busca prioritária, Ponto de Origem / Feito Em / Coordenadas como produtos protagonistas e paisagem apenas como background; headline e subtexto atualizados, sem menção indevida a DDD.
- Oito modelos organizados em grade coerente na home e nas páginas de cidade, sem produtos soltos ou espaços vazios exagerados.
- Estados em **accordion no mobile**, um aberto por vez; banner *dentro* do estado expandido, sem carrossel horizontal.
- `Da Nossa Terra` alimentado por produtos reais da categoria correspondente.
- `Redesenhos/Releituras` presente como seção própria, com curadoria real, sem misturar com as oito famílias-base.
- `Feito Para Você` exibindo **a linha Lenda**, e não os personalizáveis de mapa/cidade que apareceram por engano.
- `Fala daqui` aparecendo **antes** de DDD.
- `Ver todos` nas seções que têm uma categoria real e URL verificada na INK; não inventar destinos para agrupamentos editoriais sem uma categoria única.
- Banners sem nenhuma seção solta: hero como background, campanhas integradas, imagens estaduais dentro dos respectivos módulos. Nas páginas de estado/cidade, imagem como background do header somente se não atrasar o acesso à busca/estilos; na PDP, produto, preço e CTA têm prioridade absoluta.
- Mesorregiões com nomes naturais e `N cidades`, contagens corretas e sem apresentá-las como divisão oficial vigente.

Classifique cada item como **IMPLEMENTADO / PARCIAL / AUSENTE / REGRESSÃO**, indicando componente/rota.

## 2. QA visual mobile-first

Prioridade absoluta ao celular (~90% do tráfego). Inspecione em **375 e 430 px** e depois em **768 e 1440 px**:

- `/sul` — home completa, seção por seção;
- `/sul/sc` e `/sul/rs` — busca, header, agrupamentos/accordion e imagens;
- `/sul/sc/tijucas` — estilos, microcontexto, possíveis itens `Fala de`, vizinhas;
- uma página de família/PDP real com variante, preço e CTA;
- busca aberta e menu mobile aberto.

Verifique especialmente **imagens ausentes ou em branco**, overlays, cortes indevidos, camadas sobrepostas, header sticky cobrindo conteúdo, overflow horizontal, espaçamentos excessivos, cards despadronizados, contraste e áreas de toque. Não confunda falha de carregamento de imagem com decisão de design.

## 3. Correções permitidas

Corrija apenas **bugs ou regressões inequívocos** encontrados nessa auditoria, com testes apropriados. Não redesenhe seções inteiras por conta própria, não mude a estratégia editorial e não adicione recursos. Para decisões visuais subjetivas, documente a alternativa e pare para minha revisão.

## 4. Entrega

Crie `docs/design/sul-integrated-final-review.md`, incluindo a matriz de implementação, problemas encontrados, correções feitas e decisões visuais ainda pendentes.

Salve capturas legíveis em `docs/design/screenshots/sul-integrated-final/`, incluindo:

1. Home full-page 375 e 1440;
2. crops de cada seção da home em 375 (com indicação de ordem);
3. Estado 375, cidade 375 e PDP 375;
4. comparativos pontuais onde alguma regressão tiver sido corrigida.

Faça um board mobile que permita avaliar as seções sem reduzir tudo a uma miniatura ilegível. Rode unit, e2e, tsc, eslint e build se houver alterações de código; reporte resultados. Informe também o estado atual do LCP mobile, sem otimizações especulativas.

**Não gerar novos banners, não alterar os assets, não tocar na INK além de leitura, não iniciar `/norte`, `/centro-oeste` ou `/`, não fazer commit nem push.** Depois do relatório e das capturas, pare para revisão visual humana.
