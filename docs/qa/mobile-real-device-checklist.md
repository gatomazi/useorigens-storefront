# Checklist de aparelho real: `/sul` V2

Status: **NÃO EXECUTADO**. Nenhum item abaixo foi testado em aparelho físico. Até agora só houve emulação no Chromium (Playwright) e Lighthouse em máquina local. Emulação não reproduz teclado virtual, safe areas reais, inércia de rolagem, zoom automático do iOS nem rede móvel.

Não marcar um item como passou sem ter feito no aparelho. Em caso de falha, anotar o aparelho, o navegador e o que se viu.

## Antes de começar

- Ambiente testado (produção ou preview): `__________`
- Aparelho 1 (ex.: iPhone, iOS + Safari): `__________`
- Aparelho 2 (ex.: Android, Chrome): `__________`
- Rede: Wi-Fi, 4G real (ver o último bloco)
- Modo: navegador normal, sem modo leitura e sem bloqueador de conteúdo

## Roteiro

Repetir em cada aparelho. Marcar com `[x]` só depois de executar.

### Home `/sul`

- [ ] Abrir `/sul`. Título, campo de busca e as três camisetas de DDD aparecem sem rolar.
- [ ] Nada escapa para o lado (sem rolagem horizontal).
- [ ] Abrir o menu (ícone de três linhas). Abre em tela cheia, e o botão "Fechar" é visível e fácil de tocar.
- [ ] Fechar o menu com o botão "Fechar".
- [ ] Reabrir o menu, tocar em um item (por exemplo "Estados"). O menu fecha e a página vai para a seção.

### Busca

- [ ] Tocar no campo "Busque sua cidade…". A folha abre em tela cheia.
- [ ] O teclado abre sozinho e **não cobre** o campo nem a primeira linha de resultado.
- [ ] Ao focar o campo, a página **não dá zoom** (iOS costuma ampliar campos com fonte pequena).
- [ ] Digitar uma cidade (`flo`). Os resultados aparecem, com estado e "Região de …" em cada linha.
- [ ] Rolar a lista de resultados com o teclado aberto. A lista rola e o campo continua visível.
- [ ] Tocar em um resultado. Abre a página da cidade.
- [ ] Voltar (gesto ou botão do navegador). Volta para `/sul` e a folha **não** reaparece aberta.
- [ ] Buscar algo que não existe (`zzzxq`). Aparece a mensagem e os três botões de estado.

### Rolagem horizontal

- [ ] Passar o dedo no carrossel de DDD. Desliza, para no fim e não trava a rolagem vertical da página.
- [ ] Passar o dedo no carrossel "Fala daqui".
- [ ] Passar o dedo nos atalhos de região dentro de um cartão de estado.

### Cidade, família, variante

- [ ] Abrir uma cidade (ex.: Torres). O nome aparece grande e sem quebrar de forma estranha.
- [ ] Abrir uma família ("Ponto de Origem"). O botão "Escolher tamanho na loja" aparece sem rolar ou logo ao rolar pouco.
- [ ] Em uma cidade com variantes (Pato Branco, "Ponto de Origem"): trocar de "Principal" para "Regional". Foto, preço e destino do botão mudam.
- [ ] Tocar em "Escolher tamanho na loja". Abre a loja da INK no produto certo e com o preço igual ao mostrado.
- [ ] Voltar do navegador a partir da INK. Volta para a variante, com a versão que estava escolhida ou a inicial (anotar qual).

### Estado

- [ ] Abrir um estado (ex.: Santa Catarina). A página é curta, com grupos "Região de …".
- [ ] Tocar em um grupo. Abre a lista de cidades. Tocar em uma cidade abre a página dela.
- [ ] Alternar "Por região" e "A–Z".

### Aparelho e navegador

- [ ] **Safe areas:** em aparelho com notch ou barra de gestos, o cabeçalho, o botão "Fechar" da busca e o rodapé da folha não ficam sob o notch nem sob a barra.
- [ ] **Zoom e foco:** nenhum campo dá zoom ao focar; ao dar pinça, a página não quebra.
- [ ] **Girar o aparelho** na busca aberta e na home. Nada fica cortado.
- [ ] **Barra de endereço** que aparece e some ao rolar: o topo da folha de busca continua alinhado.
- [ ] **Tamanho de fonte** do sistema aumentado: títulos e botões continuam legíveis.
- [ ] **Alvos de toque:** nada exige precisão (botões, links do rodapé, itens do menu).

### Rede 4G real (quando houver)

- [ ] Fora do Wi-Fi, abrir `/sul` do zero. Anotar a sensação: título e busca aparecem quando? Fotos aparecem quando?
- [ ] Abrir uma cidade e uma variante pela rede móvel. Anotar tempo até ver a foto principal.
- [ ] Dado conhecido: no Lighthouse simulado (Slow 4G + CPU 4×), cidade fica em 2,9 s e PDP em 3,5 s de LCP; com Fast 4G ficam em até 2,2 s. Comparar com o que se vê no aparelho.

## Resultado

| Aparelho | Navegador | Data | Quem testou | Falhas encontradas |
|---|---|---|---|---|
| | | | | |
| | | | | |
