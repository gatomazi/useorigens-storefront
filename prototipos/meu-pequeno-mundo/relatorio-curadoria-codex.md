# Relatório de curadoria — Meu Pequeno Mundo

Pesquisa em 15/10/2026; entrega em 16/10/2026. **14 cidades novas**, de 113 para **127 perfis**, no catálogo de 2.144 lugares. Foram triadas as 15 primeiras cidades da fila; Tangará da Serra ficou parcial. As demais entradas da fila ainda não foram pesquisadas nesta rodada. Todos os perfis novos permanecem em **curadoria inicial**, pendentes de revisão editorial da Use Origens.

## Escopo e entrega

- Worktree exclusiva: `/Users/izamoti/projects/useorigens-curadoria`.
- Branch: `feature/mundo-curadoria-lote-codex`, iniciada na branch de ferramentas do PR #82, que ainda estava aberto na preparação e foi integrado à `main` durante a rodada.
- Apenas `data/mundo/perfis-cidades.json`, `docs/mundo/cobertura-perfis.md` e este relatório compõem a entrega. Nenhuma alteração na loja, na cena ou nos scripts versionados.
- Os 113 perfis anteriores foram comparados como objetos JSON e permanecem idênticos. Os rascunhos da rodada anterior foram preservados em `.mundo-curadoria/lote-anterior/`, para que `juntar.py` não os reescrevesse.
- Primeiro lote de dez cidades salvo no commit `f30fdda` e enviado por SSH. Identidades SSH e GitHub confirmadas como `gatomazi`. Sem merge nem deploy nesta tarefa.

## Cidades incluídas e conferência

**122 evidências**: 120 encontradas literalmente pelo script e 2 manuais, em duas cidades. Cada perfil passou individualmente com `VALIDADOR: OK`; os novos perfis não introduziram avisos estruturais.

| Cidade | IBGE | Evidências automáticas | Manuais | Marco |
|---|---|---:|---:|---|
| Catalão (GO) | 5205109 | 10 | 0 | estacao |
| Marituba (PA) | 1504422 | 7 | 0 | Sem marco |
| Sorriso (MT) | 5107925 | 7 | 1 | Sem marco |
| Torres (RS) | 4321501 | 7 | 0 | igreja |
| Tubarão (SC) | 4218707 | 9 | 0 | Sem marco |
| Itumbiara (GO) | 5211503 | 12 | 1 | ponte-pensil |
| Santana (AP) | 1600600 | 9 | 0 | Sem marco |
| Soure (PA) | 1507904 | 6 | 0 | dunas |
| Cambé (PR) | 4103701 | 8 | 0 | Sem marco |
| Breves (PA) | 1501808 | 11 | 0 | Sem marco |
| Mateiros (TO) | 1712702 | 7 | 0 | dunas |
| Jataí (GO) | 5211909 | 10 | 0 | Sem marco |
| Erechim (RS) | 4307005 | 9 | 0 | estacao |
| Paragominas (PA) | 1505502 | 8 | 0 | Sem marco |

## Cinco prioridades para a revisão humana

1. **Evidências manuais.** Conferir o laudo digitalizado de Sorriso e a nota em imagem da ponte de Itumbiara, discriminados abaixo. Não há cidade com mais de uma evidência manual nesta rodada.
2. **Formas e conservação dos marcos.** A igreja de Torres tem torre lateral; o módulo tem torre central. As estações e a ponte são genéricas. A ponte teve interrupção de tráfego registrada em abril de 2026. O Castelinho de Erechim ficou só em texto e sua página municipal informa restauração.
3. **Saberes e temas sensíveis.** Revisar as congadas de Catalão, a tradição quilombola do Igarapé do Lago em Santana, os saberes de Mumbuca em Mateiros, o artesanato e as comunidades de Breves, os povos originários no museu de Cambé e o contexto da colonização de Sorriso. Não generalizar crenças ou identidades para todos os moradores.
4. **Fontes datadas e divergências.** O museu Willy Zumblick está descrito com atribuição a uma notícia de 2013; a publicação sobre Mapuá é de 2014; o relevo do parque de Erechim vem de plano de 2011. Datas administrativas contraditórias ficaram de fora, conforme as notas por cidade. Nenhum perfil depende exclusivamente da Enciclopédia de 1957–1959.
5. **Síntese dos cenários e cidade parcial.** Revisar a combinação de ambientes diferentes em uma ilha: dunas de interior de Mateiros, transição das águas em Soure, várzea do refúgio em Marituba e áreas baixas de Santana. Tangará da Serra não entrou: faltou fonte suficiente para parametrizar o cenário.

## Evidências manuais

### Sorriso — relevo de áreas urbanas avaliadas

- Fonte: [Laudo de avaliação de imóveis urbanos](https://site.sorriso.mt.gov.br/dl/330415), Prefeitura de Sorriso, 17/02/2023.
- As três páginas foram renderizadas e lidas visualmente. A extração de texto retorna páginas vazias.
- Trecho da página 1: “Trata-se de regiões com relevo plano.” A página 2 identifica loteamentos específicos; o documento não descreve o relevo de todo o município.
- A maquete usa essa leitura limitada como inspiração para uma síntese urbana horizontal. O escopo e a necessidade de revisão constam da observação do perfil.

### Itumbiara — condição de tráfego da ponte

- Fonte: [Nota oficial — Ponte Affonso Penna](https://itumbiara.go.gov.br/nota-oficial-ponte-affonso-penna/), Prefeitura de Itumbiara, 07/04/2026. O conteúdo principal é uma imagem, lida integralmente.
- Trecho: “a interrupção do tráfego de veículos na Ponte Affonso Penna”. A nota data a interrupção em 01/04/2026.
- O perfil registra o fato no passado e não declara condições atuais de visitação, segurança, tráfego ou conclusão de restauração. O marco serve como referência histórica.

## Cidade parcial

**Tangará da Serra (MT), 5107958 — não incluída.** Há oito evidências literais no rascunho sobre o divisor de bacias, as etapas administrativas, o Salto das Nuvens, o Bosque Municipal e a Praça dos Pioneiros. Falta fonte suficiente para o relevo parametrizado e a composição vegetal do cenário proposto; a informação sobre um parque natural no centro não resolve essas lacunas. O rascunho continua em `status: parcial`. O anúncio de reforma do bosque não foi usado como prova de entrega ou funcionamento atual. Estátuas e o desenho do piso da praça não foram reproduzidos.

Penha, Cachoeirinha e Treze Tílias permaneceram excluídas pelos impedimentos da rodada anterior. Não foram refeitas nem incluídas.

## Notas de fonte e cenário por cidade

### Catalão (GO) — 5205109

Origem do povoado diverge entre narrativas da Prefeitura e do IBGE; não foi fixada uma fundação nem repetida a lenda do nome. A cronologia ferroviária da página geral não foi utilizada. Revisar a apresentação das congadas, tradição afro-brasileira. Morrinho mantido só em texto; não se presume entrega da obra anunciada em 2024.

**Origem do cenário:** Morros e Cerrado: catalao-prefeitura-geografia. O núcleo urbano e o marco ferroviário vêm de catalao-cultura-museu; quantidades e proporções são ilustrativas.

**Fontes específicas:**

- [Sobre a Cidade](https://www.catalao.go.gov.br/sobre-a-cidade) — Prefeitura de Catalão; Página institucional (sem data).
- [Cultura Catalão — Museu Cornélio Ramos e patrimônio cultural](https://cultura.catalao.go.gov.br/) — Secretaria Municipal de Cultura de Catalão; Página institucional (sem data).
- [Revitalização do Morrinho de São João será entregue nesta quinta-feira(7)](https://catalao.go.gov.br/producao/public/index.php/noticias/obras/revitalizacao-do-morrinho-de-sao-joao-sera-entregue-nesta-quinta-feira7) — Prefeitura de Catalão; Notícia de 06/11/2024.

### Marituba (PA) — 1504422

Sem marcos: a Vila Operária é uma referência histórica, sem confirmação da conservação atual de seus edifícios. O refúgio abrange mais de um município; os ecossistemas citados descrevem a unidade, não todo o território de Marituba. Sem reproduzir a linguagem colonial e os juízos sobre ocupação do histórico do IBGE.

**Origem do cenário:** Núcleo urbano inspirado nas casas operárias do IBGE; água, mata e relevo baixo representam a várzea descrita em marituba-ideflorbio-revis, acessível por Marituba em marituba-prefeitura-refugio. A ilha é uma síntese, não um mapa; não transforma toda a cidade em floresta.

**Fontes específicas:**

- [Refúgio de Vida Silvestre (REVIS) Metrópole da Amazônia](https://ideflorbio.pa.gov.br/refugio-de-vida-silvestre-metropol-da-amazonia/) — Ideflor-Bio; Página institucional (sem data).
- [Visite o Refúgio de Vida Silvestre Metrópole da Amazônia](https://marituba.pa.gov.br/site/visite-o-refugio-de-vida-silvestre-metropole-da-amazonia/) — Prefeitura de Marituba; Notícia de 11/07/2019.

### Sorriso (MT) — 5107925

Uma evidência MANUAL: relevo no laudo municipal digitalizado de 17/02/2023, p. 1; áreas nomeadas na p. 2. Leitura visual das três páginas, sem texto extraível. O documento descreve alguns loteamentos urbanos, não o município inteiro. O histórico do IBGE informa emancipação em 1986, mas a formação administrativa traz instalação em 1997; esta última data foi omitida. Revisar o contexto da colonização no resumo. Parque mantido sem marco: lago-ilha e lago-mureta acrescentariam ilha ou trampolim sem fonte. Não se reproduzem as esculturas da cidade nem superlativos econômicos.

**Origem do cenário:** Arborização e lago: sorriso-turismo-parque. Relevo plano simplificado inspirado nas regiões urbanas avaliadas no laudo (p. 1–2), não em uma generalização para todo o município: sorriso-prefeitura-relevo. Cenário urbano em vez de fazenda, sem lavoura ou silo; contagens e distribuição ilustrativas.

**Fontes específicas:**

- [Parque Ecológico Municipal de Sorriso](https://turismo.sorriso.mt.gov.br/atrativos-turisticos/atrativos-tursticos/parque-ecologico-municipal-de-sorriso) — Secretaria Municipal de Desenvolvimento Econômico e Turismo de Sorriso; Página institucional (sem data).
- [Centro Histórico-Cultural Benjamim Raiser de Sorriso](https://turismo.sorriso.mt.gov.br/atrativos-turisticos/atrativos-tursticos/centro-historico-cultural-benjamim-raiser-de-sorriso) — Secretaria Municipal de Desenvolvimento Econômico e Turismo de Sorriso; Página institucional (sem data).
- [Laudo de avaliação de imóveis urbanos — Sorriso](https://site.sorriso.mt.gov.br/dl/330415) — Prefeitura de Sorriso; Laudo de 17/02/2023, p. 1–2.

### Torres (RS) — 4321501

A torre real da igreja fica à esquerda; o módulo tem torre central, diferença explicitada na nota. O parque não recebe marco nem reprodução do projeto paisagístico. O IBGE menciona primeira missa em 1820, enquanto a Prefeitura/IPHAE distingue inauguração em 1824: o texto usa apenas inauguração. Sem cronologia indígena simplificada nem número de torres, divergente entre páginas municipais.

**Origem do cenário:** Morros costeiros e mar vêm de torres-prefeitura-guarita. O casario é genérico; não há vegetação específica adicionada sem fonte. O relevo não reproduz geometrias exatas das falésias.

**Fontes específicas:**

- [Parque da Guarita](https://torres.rs.gov.br/viva/parque-estadual-da-guarita/) — Prefeitura de Torres; Página institucional (sem data).
- [Igreja Matriz São Domingos](https://torres.rs.gov.br/viva/igreja-sao-domingos/) — Prefeitura de Torres (texto do IPHAE); Página institucional (sem data).

### Tubarão (SC) — 4218707

Páginas HTML da Prefeitura responderam 403; o plano de contingência em PDF foi acessível. Museu ferroviário: o site próprio só devolveu título, substituído pela Fundação Cultural de Criciúma. Museu de arte: fonte de 2013, com atribuição e no passado; não se afirma configuração atual da exposição. Sem marcos, para não inventar estação nem imitar edifício ou obras de Zumblick.

**Origem do cenário:** Planície e rio: tubarao-defesa-civil-plancon, áreas urbanas identificadas pelo plano; não se generaliza o diagnóstico de inundação para todo o município. Edifícios genéricos representam o núcleo urbano. Sem vegetação regional presumida.

**Fontes específicas:**

- [Plano de Contingência de Proteção e Defesa Civil — Tubarão](https://tubarao.sc.gov.br/uploads/sites/265/2023/10/904811_393566_PLANO_DE_CONTINGENCIA-2.pdf) — Prefeitura de Tubarão — Defesa Civil; Plano disponibilizado em 2023; diagnóstico com avaliação de abril de 2013.
- [Exposição de telas de Zumblick é reaberta ao público com obras inéditas](https://www.alesc.sc.gov.br/agencia/noticia/exposicaeo-de-telas-de-zumblick-e-reaberta-ao-publico-com-obras-ineditas/) — Assembleia Legislativa de Santa Catarina; Notícia de 26/09/2013.
- [Uma volta ao passado: Criciúma terá passeio de Maria Fumaça em celebração ao Dia das Mães](https://fcc.criciuma.sc.gov.br/noticia/Uma-volta-ao-passado-Criciuma-tera-passeio-de-Maria-Fumaca-em-celebracao-ao-Dia-das-Maes/18476) — Fundação Cultural de Criciúma; Notícia de 2024.

### Itumbiara (GO) — 5211503

Uma evidência MANUAL: nota oficial de 07/04/2026 publicada apenas em imagem, lida integralmente. Registra interrupção do tráfego em 01/04/2026, sem se presumir situação atual ou conclusão da restauração. Revisar permanência do marco e condições de conservação. Data de distrito diverge: 1842 na apresentação municipal de 2021, 1852 no IBGE; ficou de fora. Relevo baixo é síntese do vale, não medição topográfica.

**Origem do cenário:** Água e vale: itumbiara-prefeitura-rio-praca. Savanas: itumbiara-imb-painel. Cenário urbano junto ao rio, com poucas árvores e capins ilustrativos; não se converte o município em fazenda. A ponte está documentada em itumbiara-prefeitura-ponte e sua condição de tráfego exige revisão à luz de itumbiara-prefeitura-nota-ponte.

**Fontes específicas:**

- [A cidade de Itumbiara é o destaque desta semana da campanha Isso é Goiás](https://itumbiara.go.gov.br/a-cidade-de-itumbiara-e-o-destaque-desta-semana-da-campanha-isso-e-goias-nas-redes-sociais-da-assembleia/) — Prefeitura de Itumbiara / Assembleia Legislativa de Goiás; Notícia de 01/07/2021.
- [Prefeituras de Itumbiara e Araporã irão recuperar Ponte Affonso Pena](https://itumbiara.go.gov.br/prefeituras-de-itumbiara-e-arapora-irao-recuperar-ponto-affonso-pena/) — Prefeitura de Itumbiara; Notícia de 2021.
- [Painéis Municipais — Itumbiara](https://goias.gov.br/imb/wp-content/uploads/sites/29/2018/07/itumbiara-201612-4dd.pdf) — Instituto Mauro Borges / Governo de Goiás; Painel de dezembro de 2016, p. 1.
- [Nota oficial — Ponte Affonso Penna](https://itumbiara.go.gov.br/nota-oficial-ponte-affonso-penna/) — Prefeitura de Itumbiara; Nota de 07/04/2026; conteúdo em imagem.

### Santana (AP) — 1600600

Revisar a apresentação da tradição quilombola, sem generalizar crenças para toda a comunidade. O relevo da maquete foca as áreas baixas descritas no Plano Diretor; há colinas ao norte, não representadas. Sem marco de forte: a notícia de 2022 cita o antigo Cumaú, sem comprovar estrutura preservada. Não se afirma funcionamento atual da RPPN. O gentílico foi mantido como fornecido pelo IBGE (santanenses), no plural, para conferência editorial.

**Origem do cenário:** Planície baixa e áreas alagáveis, com presença urbana: santana-plano-diretor. Rio largo sintetiza o Amazonas. Sem mata densa ou palmeiras presumidas; a reserva é referência textual, não cenário de toda a cidade.

**Fontes específicas:**

- [Atualização do Plano Diretor Municipal — Volume 2B: Resumo Executivo da Leitura Técnica](https://planodiretor.santana.ap.gov.br/wp-content/uploads/2024/03/P2B_ResumoExecutivo-PDM-Santana.pdf) — Prefeitura de Santana / equipe do Plano Diretor; Documento disponibilizado em 2024, p. 12.
- [Circuito Igarapé Forte: Prefeitura de Santana realiza competição aquática em comemoração aos 35 anos da cidade](https://santana.ap.gov.br/circuito-igarape-forte-prefeitura-de-santana-realiza-competicao-aquatica-em-comemoracao-aos-35-anos-da-cidade/) — Prefeitura de Santana; Notícia de 12/12/2022.
- [Prefeito prestigia festividade de Nossa Senhora da Piedade no Igarapé do Lago](https://santana.ap.gov.br/prefeito-bala-rocha-prestigia-festidade-de-nossa-senhora-da-piedade-no-igarape-do-lago/) — Prefeitura de Santana; Notícia de 06/07/2025.

### Soure (PA) — 1507904

O módulo costa resume a transição de águas, sem representar Soure como praia oceânica de mar aberto. Manguezal da Barra Velha fica só em texto, pois não há módulo específico. A página turística é sem data: não foram repetidos horários, serviços ou recomendações de saúde da descrição da Vila do Pesqueiro. Dunas não reproduzem um ponto exato da praia.

**Origem do cenário:** Dunas e coqueiros são da Praia do Pesqueiro em soure-prefeitura-turismo; a água usa costa pela influência atlântica descrita. O casario é ilustrativo do núcleo urbano, sem estilo histórico atribuído. Não há floresta fechada nem búfalos acrescentados por associação regional.

**Fontes específicas:**

- [Turismo e Lazer](https://soure.pa.gov.br/o-municipio/turismo-e-lazer/) — Prefeitura de Soure; Página institucional (sem data).

### Cambé (PR) — 4103701

A página geral Sobre a Cidade foi descartada por indícios de conteúdo enciclopédico reaproveitado. Foram usadas notícias próprias da Prefeitura e o Plano de Educação. Museu e biblioteca permanecem em texto, sem imitar edifícios modernos. Revisar a apresentação dos povos originários no texto sobre o museu. O anúncio de reinauguração do museu não foi convertido em afirmação de obra entregue.

**Origem do cenário:** Fundo de vale: cambe-plano-educacao (p. 30); mata, córrego e parque urbano: cambe-prefeitura-parque-zezao. Montículos baixos apenas sugerem as bordas do vale; não representam serras nem todo o relevo municipal.

**Fontes específicas:**

- [Lazer e turismo: Parque Zezão é um tesouro verde no coração de Cambé](https://www.cambe.pr.gov.br/index.php/lazer-e-turismo-parque-zezao-e-um-tesouro-verde-no-coracao-de-cambe/) — Prefeitura de Cambé; Notícia de 20/01/2022.
- [Completando 40 anos, Museu Histórico de Cambé será reinaugurado nesta sexta-feira (31)](https://www.cambe.pr.gov.br/index.php/completando-40-anos-museu-historico-de-cambe-sera-reinaugurado-nesta-sexta-feira-31/) — Prefeitura de Cambé; Notícia de 30/10/2025.
- [Biblioteca Pública Municipal é reinaugurada após reforma e melhoria do espaço](https://www.cambe.pr.gov.br/index.php/biblioteca-publica-municipal-e-reinaugurada-apos-reforma-e-melhoria-do-espaco/) — Prefeitura de Cambé; Notícia de 19/08/2025.
- [Plano Municipal de Educação — Lei nº 2.610](https://educacao.cambe.pr.gov.br/wp-content/uploads/2025/05/LEI-2610_-PLANO-MUNICIPAL-DE-EDUCACAO-CAMBE.pdf) — Prefeitura de Cambé — Secretaria Municipal de Educação; Plano de 2015, p. 30.

### Breves (PA) — 1501808

O cenário de planície e floresta tem apoio em pesquisa da UFRA de 2025, não apenas em associação regional. Revisar o uso de TCC como fonte geográfica e a apresentação dos saberes comunitários. O histórico do IBGE tem datas incoerentes (1970 e 1981 em contexto colonial), omitidas. A área da Resex diverge entre ficha atual e publicação de 2014; não foi publicada. Guia turístico sem data interna: serviços, agenda de festas e obras anunciadas ficaram de fora. Sem marcos por falta de formas e comprovação de edifícios específicos.

**Origem do cenário:** Relevo plano e floresta aluvial: breves-ufra-planejamento (p. 37 e 41). Cursos de água remetem à região dos furos em breves-prefeitura-guia. A área construída representa a cidade, sem generalizar a floresta para todo o núcleo urbano; contagens e distribuição são ilustrativas.

**Fontes específicas:**

- [Uso do Sistema de Informações Geográficas como subsídio para o planejamento ambiental do município de Breves/PA](https://bdta.ufra.edu.br/jspui/bitstream/123456789/4294/1/USO_DO_SIG_%20COMO_SUBSIDIO_PARA_O_PLANEJAMENTO_AMBIENTAL_DO_MUNICIPIO_DE_BREVES_PA.pdf) — Raíssa Vitória Moreira da Silva / Universidade Federal Rural da Amazônia; Trabalho de conclusão de curso aprovado em 28/03/2025, p. 37 e 41.
- [Guia Turístico Breves-Pará](https://breves.pa.gov.br/wp-content/uploads/2023/01/GUIAR-TURISTICO-BREVES-PA.pdf) — Prefeitura de Breves — Cultura, Turismo, Eventos e Esportes; Guia disponibilizado em janeiro de 2023 (sem data interna).
- [Resex Mapuá](https://www.gov.br/icmbio/pt-br/assuntos/unidade-de-conservacao/unidades-de-biomas/amazonia/lista-de-ucs/resex-mapua/resex-mapua/) — ICMBio; Página institucional (sem data).
- [Práticas inovadoras na gestão de áreas protegidas — Reserva Extrativista Mapuá](https://www.gov.br/icmbio/pt-br/centrais-de-conteudo/publicacoes/publicacoes-diversas/revista_praticas_inovadoras_2014.pdf) — ICMBio; Publicação de 2014, p. 78–79.

### Mateiros (TO) — 1712702

Revisar a apresentação dos saberes da comunidade quilombola Mumbuca; fonte do IBGE com registro de 2008. As dunas são de interior: costa-dunas é apenas o nome técnico do módulo, sem mar. A vegetação genérica remete ao entorno da Cachoeira do Formiga; não implica árvores sobre todo o campo de dunas. O portal municipal de turismo foi descartado por conteúdos promocionais e páginas sem conteúdo específico; foram preferidas fontes estaduais e IBGE. Fervedouros ficaram sem marco por ausência de módulo adequado.

**Origem do cenário:** Dunas, Serra do Espírito Santo e vegetação no entorno da Cachoeira do Formiga: mateiros-estado-jalapao. A ilha combina referências separadas, não indica proximidade exata. Sem mar, sem casas coloniais atribuídas nem reprodução de obra autoral.

**Fontes específicas:**

- [Jalapão — atrativos](https://jalapaotocantins.to.gov.br/) — Governo do Tocantins — portal de turismo; Página institucional (sem data).
- [Instrução Normativa nº 002/2022/GABSEC/SECTUR](https://doe.to.gov.br/diario/4640/download) — Governo do Tocantins — Secretaria da Cultura e Turismo; Diário Oficial nº 6091, 19/05/2022, p. 19.

### Jataí (GO) — 5211909

Sem marco: o lago não ganhou ilha ou trampolim sem fonte; o memorial e o museu permanecem em texto, sem reproduzir arquitetura ou esculturas. A fonte do museu registra um anúncio de exposição em 2025, não programação vigente. O painel IMB de 2016 foi descartado para geografia por dados suspeitos de altitude e hidrografia; usou-se levantamento da Goiás Turismo. Referência histórica a JK, sem política atual.

**Origem do cenário:** Relevo e Cerrado: jatai-goias-turismo. Lago: jatai-prefeitura-cidade. A ilha combina núcleo urbano e lago fora do centro, sem indicar distância ou posição relativa exatas; contagens e vegetação esquemáticas.

**Fontes específicas:**

- [Município de Jataí — levantamento dos subsistemas naturais](https://goias.gov.br/turismo/wp-content/uploads/sites/4/2023/12/20-%E2%80%93-Municipio-de-Jatai.pdf) — Goiás Turismo / Governo de Goiás; Documento disponibilizado em dezembro de 2023, p. 4.
- [A cidade de Jataí](https://www.jatai.go.gov.br/cidade-jatai/) — Prefeitura de Jataí; Página institucional (sem data).
- [Exposição no Museu Histórico de Jataí valoriza a deficiência](https://www.jatai.go.gov.br/exposicao-no-museu-historico-de-jatai-valoriza-a-deficiencia/) — Prefeitura de Jataí; Notícia de 11/09/2025.

### Erechim (RS) — 4307005

Castelinho apenas em texto: não há módulo apropriado para o prédio de madeira e a página municipal o informa em restauração, sem se presumir reabertura. A forma da estação é genérica e não comprova operação de trens ou visitação. A geomorfologia citada é a do parque no plano de 2011, não de todo o município. A data de transferência do parque diverge entre fontes (1939/1948), omitida.

**Origem do cenário:** Araucárias e localização urbana do parque: erechim-estado-parque. Montículos baixos sugerem o relevo irregular descrito em erechim-plano-manejo; não reproduzem topografia municipal. A estação é sustentada por erechim-prefeitura-estacao. Sem rio acrescentado só pela associação regional ao Alto Uruguai.

**Fontes específicas:**

- [Castelinho](https://www.pmerechim.rs.gov.br//pagina/352/castelinho) — Prefeitura de Erechim; Página institucional (sem data).
- [Estação Ferroviária](https://www.pmerechim.rs.gov.br/pagina/362/estacao-ferroviaria) — Prefeitura de Erechim; Página institucional (sem data).
- [Parque Municipal Longines Malinowski](https://www.turismo.rs.gov.br/turismo/atrativo/visualizar/698) — Secretaria de Turismo do Rio Grande do Sul; Página institucional (sem data).
- [Plano de Manejo — Parque Natural Municipal Longines Malinowski](https://www.pmerechim.rs.gov.br/uploads/paginas/515b35ff2c97e4536c58f83c593d6cb7.pdf) — Prefeitura de Erechim / equipe do Plano de Manejo; Plano de dezembro de 2011, p. 112.

### Paragominas (PA) — 1505502

Não foram criados marcos para o lago ou para as pontes do parque: as formas disponíveis acrescentariam detalhes sem fonte ou não confirmados hoje. A notícia de 2018 documenta o parque, mas não fundamenta afirmação sobre funcionamento atual. O PCA de 2026 prevê compras e manutenção: não se afirma execução nem existência de equipamentos previstos. A paisagem não generaliza floresta primária para todo o município.

**Origem do cenário:** Relevo e água: paragominas-plano-residuos. Vegetação reduzida e secundária no mesmo plano sustenta poucas árvores genéricas; núcleo urbano e parque são de paragominas-prefeitura-parque. A ilha foca o Uraim; Lago Verde fica como referência em texto, sem ilha ou trampolim inventados.

**Fontes específicas:**

- [Plano Municipal de Gestão Integrada de Resíduos Sólidos de Paragominas](https://paragominas.pa.gov.br/wp-content/uploads/2020/04/PLANO_MUNICIPAL_GIRSP.pdf) — Prefeitura de Paragominas — Secretaria Municipal de Urbanismo; Plano disponibilizado em abril de 2020, p. 26.
- [Parque Ambiental Ademar Monteiro reabre as portas para receber a população](https://paragominas.pa.gov.br/parque-ambiental-ademar-monteiro-reabre-as-portas-para-receber-a-populacao/) — Prefeitura de Paragominas; Notícia de 10/05/2018.
- [Plano de Contratação Anual 2026 — Secretaria Municipal de Urbanismo](https://paragominas.pa.gov.br/wp-content/uploads/2026/01/14-SEMUR.pdf) — Prefeitura de Paragominas — SEMUR; Plano de 2026, itens 20 e 27.

## Fontes antigas ou que exigem atenção adicional

- **Catalão:** o histórico bibliográfico do IBGE remete à Enciclopédia de 1958; o texto histórico novo usa as etapas administrativas, com paisagem e referências apoiadas em fontes municipais adicionais. A lenda da origem do nome e a cronologia ferroviária inconsistente da página geral ficaram de fora.
- **Tubarão:** o histórico bibliográfico do IBGE remete à Enciclopédia de 1959; o cenário usa o plano de contingência disponibilizado em 2023, e as referências culturais têm fontes próprias. O museu de arte foi descrito com data e atribuição.
- **Soure e Breves:** guias sem data interna; omitidos horários, calendários, serviços e promessas de obras. Em Breves, o relevo e a floresta têm apoio adicional em TCC da UFRA de 2025, que merece avaliação editorial por seu tipo de publicação.
- **Mateiros:** a referência de Mumbuca no IBGE tem registro de 2008. A localização das dunas foi conferida também no Diário Oficial de 2022. O portal estadual sustenta a paisagem; o portal municipal de turismo foi descartado.
- **Jataí:** o painel do IMB de 2016 não foi usado para geografia, por dados suspeitos de altitude e hidrografia. O cenário usa o levantamento publicado pela Goiás Turismo.
- **Paragominas:** o plano de resíduos descreve o território e a vegetação modificada. O plano de contratações de 2026 é evidência da identificação dos lagos, não da execução das compras ou da existência de equipamentos previstos.

## Sugestões de módulos — sem criação de código

- **Lago urbano simples**, sem ilha, trampolim ou esculturas: Sorriso, Jataí e Paragominas.
- **Manguezal e costa estuarina**, com distinção visual do mar aberto: Soure.
- **Falésia ou paredão costeiro de basalto:** Torres.
- **Fervedouro ou nascente de areia**, sem promessa de flutuação ou banho: Mateiros.
- **Campo de dunas de interior**, independente do nome `costa-dunas`: Mateiros.
- **Igreja com torre lateral** e **edifício histórico de madeira**: Torres e Erechim. Não reproduzir obras autorais.
- **Cânion, gruta e basílica genéricos** continuam como sugestões para rodadas futuras; não foram necessários para os perfis incluídos nesta rodada.

## Validação e rastreabilidade

- `montar.py --checar`: 14 perfis prontos com validação estrutural aprovada e evidências `OK`, com as duas exceções `MANUAL` explicitadas.
- `juntar.py`, `npm run mundo:validar` e `npm run mundo:cobertura`: concluídos; 127 perfis, 834 fontes, nenhuma falha.
- O único aviso global reúne quatro fontes já não citadas na base anterior: `nt-prefeitura-santuario-20-anos`, `nt-turismo-sobre`, `tj-prefeitura-livro-do-tombo` e `ibge-biblioteca-cachoeirinha-rs`. Não foram removidas nesta rodada.
- `npx vitest run`: aprovado, 116 arquivos e 1.470 testes, 15,05 s.
- `git diff --check`: aprovado.

Os rascunhos, trechos literais, justificativas de ambiente, cache das fontes e logs ficam em `.mundo-curadoria/`, fora do Git, conforme o método do projeto. Os arquivos de rascunho abaixo podem ser conferidos com `python3 scripts/mundo-curadoria/montar.py --checar <id>` nesta worktree. A presença literal da evidência é uma checagem automática; a adequação editorial e a relação semântica com cada fato continuam sob revisão humana.

| Rascunho local (`.mundo-curadoria/lote/`) | SHA-256 |
|---|---|
| `5205109.json` | `29b15aa2ce0216bae126afb1c86eed97beb4de8458f67f027e54f7b0d74e9093` |
| `1504422.json` | `74ce5fdf6ca8df1c158cc0d68b594ba120f38f563924108bc051d4aa7abcca2d` |
| `5107925.json` | `57875b06d5fcd9dcdb7044a48b934410f0e07ec0b8aaf6931971f62d88e5fa8c` |
| `4321501.json` | `e08bc3c93ae64487f8e8e7bd3b30b7dccb0b559e1da5c8ca648424a5605459ed` |
| `4218707.json` | `bf34868f4ef298422b8eb07400d51baeb6867a88481f16d93203b6da18098747` |
| `5211503.json` | `5579620853dabb006e26a7a8cfc8c37b599eb8d251d543a9c0f5f9d2ed63030f` |
| `1600600.json` | `33c230549272c2925a3f77eb42af97d9a85170b03c07266ec8061b57374677d7` |
| `1507904.json` | `d2c3f7eaa571283fb9c3c2aae74b12dd85ced89b00d54c977e7668be20b4e82c` |
| `4103701.json` | `c023d4efbb268d29f46d3c40914ef001d4bf170bd39e3dd48e54ba061f00d266` |
| `1501808.json` | `ad38f2347c231b475791d94d2c5bd20a691fbc17ed55eb315e4f91a7a6113383` |
| `1712702.json` | `3207c599464d8d5968874e20e4b855bda4c1067fa38cca7dbf76f8c23e942f0a` |
| `5211909.json` | `829688f4c7cc4b48814167ede531c6e10b770f21bd0842b3d87738d0d404c62e` |
| `4307005.json` | `8e5cf6ad5c136baa02866b93c803fb3834ad1db542299e444fb987455b8eacf8` |
| `1505502.json` | `2cea1fa80c415f6ec7dda27e50118d186312263f2abde828d041d67d15b07e6f` |

A fila preparada tem 122 entradas. Após esta triagem de 15 cidades, **107 continuam sem pesquisa desta rodada**; a próxima é Porto Nacional (TO), `1718204`. Tangará da Serra pode ser retomada quando houver fonte nova que resolva o cenário.
