/**
 * A copy of the questions the store published on INK ("Perguntas frequentes" and "Trocas e devoluções"), read and checked on 24/10/2026. INK refuses
 * the server when it reads its public pages from a datacenter (403, its bot protection), so "Trazer perguntas da INK" offers this copy when the live
 * read fails, saying from when it is: the owner reviews before saving, as always. Kept equal to `tests/fixtures/ink-faq` (the test checks it).
 */
import type { InkFaqEntry } from "./ink-faq";

export const INK_FAQ_COPY_DATE = "24/10/2026";
export const INK_FAQ_COPY: readonly InkFaqEntry[] = [
  {
    question: "Qual é o tecido das camisetas?",
    answer: "O tecido das camisetas é Algodão 30.1 Penteado. Nossas camisetas são feitas de 100% algodão, com exceção da cinza -mescla, que possui 12% de poliéster em sua composição.",
    page: "faq"
  },
  {
    question: "Como é calculado o frete?",
    answer: "O valor e prazo dos fretes é calculado com base nas diversas formas de entrega disponíveis, localidade do CEP, quantidade de peças e valor dos produtos. O valor de todos os fretes fica disponível para os clientes tanto no carrinho de compras quanto na página de produtos.",
    page: "faq"
  },
  {
    question: "Qual o tempo de envio e entrega do meu pedido?",
    answer: "O tempo de produção demora de 2 a 5 dias úteis, dependendo da demanda. O tempo da entrega em si depende da transportadora escolhida e do CEP. Os prazos de entrega disponíveis no site já abrangem o prazo de produção e entrega para o cliente final.",
    page: "faq"
  },
  {
    question: "Como funciona o processo de devolução e reembolso?",
    answer: "O cliente tem até 7 dias corridos a partir do recebimento do produto para solicitar a devolução. Para isso, basta acessar a área de pedidos na página da loja, selecionar o pedido em questão e iniciar a solicitação de devolução. Durante a solicitação, o cliente deverá fornecer o motivo da devolução.",
    page: "faq"
  },
  {
    question: "Como é o processo de troca?",
    answer: "O prazo para troca ser solicitada é de até 30 dias corridos após o recebimento do produto. Nos casos de defeito o prazo de trocas é de 90 dias após o recebimento do produto. Para iniciar uma solicitação de troca, o cliente deve fazer cadastro/login com o mesmo e-mail de compra e acessar a área de pedidos. Lá, ele encontrará a opção de solicitar uma troca. Após selecionar o pedido e o item que deseja trocar, o cliente poderá indicar o motivo da troca e seguir as instruções fornecidas pelo sistema.",
    page: "faq"
  },
  {
    question: "Como eu acompanho minha entrega?",
    answer: "Você pode acompanhar sua entrega através do seu e-mail de confirmação da compra, ou logando no nosso site e selecionando a aba ‘’Meus Pedidos’’. Lá você terá acesso ao rastreamento do seu pedido e informações sobre a compra.",
    page: "faq"
  },
  {
    question: "Quais formas de pagamento são aceitas?",
    answer: "No momento aceitamos pix, cartões de crédito (parcelamento em até 5x) .",
    page: "faq"
  },
  {
    question: "Quanto tempo para aprovação do meu pagamento?",
    answer: "O prazo do cartão de crédito normalmente costuma ser na hora.",
    page: "faq"
  },
  {
    question: "Em quais canais eu posso receber suporte?",
    answer: "Para questões sobre pedidos, você pode falar conosco através do e-mail reportado no nosso rodapé, whatsapp ou nossas redes sociais.",
    page: "faq"
  },
  {
    question: "Qual a relação da nossa marca com a Reserva?",
    answer: "Nossa loja utiliza o serviço da Reserva INK, uma marca do grupo AR&Co (grupo da qual a Reserva também faz parte), como parceiro de produção e logística de nossos produtos. Todos os produtos comprados na loja serão produzidos e enviados pela Reserva INK com qualidade e entrega garantidas pela empresa. A Reserva INK utiliza a mesma fábrica, cadeia de suprimentos e logística do grupo AR&Co na produção de nossas peças.",
    page: "faq"
  }
];
