# Meu Pequeno Mundo — cobertura dos perfis curados

Gerado a partir de `data/mundo/perfis-cidades.json` em 14/10/2026. Estrutura validada por `npm run mundo:validar`. Nenhum perfil tem
aprovação editorial (`aprovado`) ainda.

Todos os nove têm frase, resumo de 3 a 5 frases, 3 referências com fonte, gentílico do IBGE, sede (IBGE Localidades 2022), população e
área do Censo 2022 e regiões do IBGE. A coluna *Fontes* conta as fontes distintas citadas por cada perfil.

| Cidade | Loja | Referências (as que têm marco estão na coluna seguinte) | Marcos na maquete | Ambiente | Fontes | Consulta | Revisão |
|---|---|---|---|---|---|---|---|
| Nova Trento (SC) | sul | Santuário Santa Paulina, Montes em volta do vale, Imigração trentina | `santuario`, `pico-cruz` | vale · base `vale` | 8 | 2026-10-14 | curadoria inicial |
| Tijucas (SC) | sul | Casarão Gallotti, Rio Tijucas, Museu Tijucas | `casarao`, `ponte-urbana` | rio, urbano · base `vale` | 6 | 2026-10-14 | curadoria inicial |
| Garopaba (SC) | sul | Dunas do Siriú, Baleia-franca, Pesca da tainha e engenhos de farinha | `dunas`, `baleia` | litoral · base `litoral` | 6 | 2026-10-14 | revisão externa |
| Curitiba (PR) | sul | Jardim Botânico e a estufa, Ópera de Arame, Araucária | `estufa` | urbano · base `serra` | 11 | 2026-10-14 | curadoria inicial |
| Porto Alegre (RS) | sul | Usina do Gasômetro, Mercado Público, Chimarrão | `usina`, `mercado` | urbano · base `vale` | 13 | 2026-10-14 | curadoria inicial |
| Goiânia (GO) | centro-oeste | Torre do Relógio, Parque Lago das Rosas, Praça Cívica e o traçado em leque | `torre-relogio`, `lago-mureta` | urbano, cerrado · base `cerrado` | 12 | 2026-10-14 | curadoria inicial |
| Campo Grande (MS) | centro-oeste | Parque das Nações Indígenas, Morada dos Baís, Sobá | `lago-ilha`, `sobrado` | urbano, cerrado · base `cerrado` | 13 | 2026-10-14 | curadoria inicial |
| Belém (PA) | norte | Ver-o-Peso e o Mercado de Ferro, Theatro da Paz, Círio de Nazaré | `mercado-ferro`, `teatro-frontao` | urbano, rio · base `amazonia` | 12 | 2026-10-14 | curadoria inicial |
| Manaus (AM) | norte | Teatro Amazonas, Encontro das Águas, Mercado Adolpho Lisboa | `teatro-cupula`, `encontro-aguas` | urbano, rio · base `amazonia` | 12 | 2026-10-14 | curadoria inicial |

Os demais 2.135 lugares do catálogo não têm perfil. Eles aparecem com o cenário da curadoria regional (`CURADORIA` em
`src/components/mundo/experiencia/config.js`), o ponto do IBGE quando existe e um aviso de cenário ilustrativo.

## Pendências por perfil (de `revisao.observacao`)

- **Nova Trento**: Texto escrito a partir das fontes listadas; falta revisão editorial da Use Origens.
- **Tijucas**: Texto escrito a partir das fontes listadas; falta revisão editorial da Use Origens.
- **Garopaba**: Revisão de 14/10/2026: curiosidade de 1846 reescrita para não confundir com a emancipação; avistamento de baleias descrito como possibilidade.
- **Curitiba**: Texto escrito a partir das fontes listadas; falta revisão editorial da Use Origens. Fontes do portal www.curitiba.pr.gov.br podem recusar acesso automático; a altitude aparece como 934 m (Turismo) e 945 m (Dados Gerais), por isso o texto atribui o número.
- **Porto Alegre**: Texto escrito a partir das fontes listadas; falta revisão editorial da Use Origens. O IBGE dá duas datas para a elevação a cidade (1812 e 1822); o texto não escolhe. A situação atual de funcionamento da usina não é afirmada.
- **Goiânia**: Texto escrito a partir das fontes listadas; falta revisão editorial da Use Origens. Páginas /agora/ da Prefeitura de Goiânia respondem com código 404, mas exibem o texto. A revitalização do Lago das Rosas está em obras e não é citada como concluída.
- **Campo Grande**: Texto escrito a partir das fontes listadas; falta revisão editorial da Use Origens. Área do parque diverge (116 ha no Imasul em 2024; 119 ha na Semadesc em 2020) e o instrumento de registro do sobá diverge (decreto de 18/07/2006 e deliberação de 08/08/2006); o texto usa o ano.
- **Belém**: Texto escrito a partir das fontes listadas; falta revisão editorial da Use Origens. Sites da Prefeitura de Belém estavam fora do ar na consulta; número de ilhas diverge (42 na UFPA; 39 em resumo de busca da Prefeitura), por isso o texto não dá o número.
- **Manaus**: Texto escrito a partir das fontes listadas; falta revisão editorial da Use Origens. O tombamento do Encontro das Águas está judicializado (ata do Iphan de 2017); o texto não diz “tombado”. Capacidade do teatro diverge entre fontes (684 e 700) e não é usada.

## O que a revisão editorial precisa olhar

- Tom e escolha das referências: são três por cidade, das quais no máximo duas viram marco na maquete.
- As formas dos marcos novos (estufa, torre, usina, mercado, sobrado, lagos, mercado de ferro, teatros, duas águas) são simplificações.
  Todas avisam na nota que cores e proporções são ilustrativas.
- Belém e Manaus citam a inscrição dos "Teatros da Amazônia" na Lista do Patrimônio Mundial, de 27/07/2026, pela nota do Iphan. Vale
  conferir se a Use Origens quer destacar esse fato recente.
