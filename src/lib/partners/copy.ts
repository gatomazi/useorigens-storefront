import type { PartnerProfile } from "./application";

/**
 * Everything the "Seja parceiro" page says, in one place so the wording can be reviewed and changed without touching the layout.
 *
 * No commission rate, payment day or minimum is stated anywhere on purpose (owner's decision, 27/10/2026): the terms are agreed in the
 * conversation and written down. The social numbers are the owner's own (27/10/2026); update `SOCIAL_PROOF` when they change. The cities
 * and states counted on the page come from the catalog itself, so they never go stale.
 */

export const HERO = {
  eyebrow: "Programa de parceiros",
  title: "A sua cidade\ncom o seu nome.",
  body: "Para quem divulga, desenha ou quer assinar uma coleção com a gente. Você ganha comissão sobre as vendas e um cupom com o seu nome, que dá desconto para quem compra.",
  cta: "Quero me inscrever",
  secondary: "Como funciona",
};

export const PROFILES_INTRO = { title: "Três jeitos de ser parceiro.", body: "Escolha o que tem mais a ver com você. Se ficar na dúvida, marque o mais perto: a gente ajusta na conversa." };

export type ProfileCopy = { label: string; teaser: string; title: string; body: string[]; cta: string };
export const PROFILES: Record<PartnerProfile, ProfileCopy> = {
  ambassador: {
    label: "Embaixador",
    teaser: "Veste, mostra e indica.",
    title: "A sua cidade segue você?",
    body: [
      "Se você fala da sua cidade nas redes (o rolê, a comida, o sotaque, o time), a gente quer conversar.",
      "Você recebe peças para usar e mostrar, ganha um cupom com o seu nome e uma comissão por venda feita com ele. Mais do que o tamanho do perfil, conta a conexão com quem acompanha você.",
    ],
    cta: "Quero ser embaixador",
  },
  artist: {
    label: "Artista",
    teaser: "Desenha a estampa.",
    title: "Tem um desenho da sua cidade que merecia virar camiseta?",
    body: [
      "Você cria a arte; a gente transforma em produto, vende e entrega. Você não paga produção, estoque nem envio, a autoria continua sua e você ganha comissão por peça vendida.",
      "Vale ilustração, lettering, mapa, um canto da cidade ou aquele bordão que só quem é de lá entende.",
    ],
    cta: "Quero mostrar minha arte",
  },
  collab: {
    label: "Collab",
    teaser: "Assina uma coleção.",
    title: "@você + Use Origens",
    body: [
      "Uma coleção criada junto, com o nome dos dois. Você entra com a sua cara, a sua voz e o seu público; a gente cuida da estampa final, da produção, da loja, da entrega e do atendimento.",
      "A coleção ganha página própria no site, e você ganha comissão sobre as vendas dela.",
    ],
    cta: "Quero fazer uma collab",
  },
};

/** Shown in the numbers band, after the catalog's own counts. */
export const SOCIAL_PROOF = [
  { value: "41 mil", label: "seguidores somando @usesul.oficial, @usenorte.oficial e @usecentro.oficial" },
  { value: "4,9", label: "de nota média em 200 avaliações de clientes" },
];

export const BENEFITS = {
  title: "Como funciona na prática.",
  items: [
    { title: "Cupom com o seu nome", body: "Quem compra com ele ganha desconto, e cada venda feita com o cupom conta para você." },
    { title: "Comissão sobre as vendas", body: "O percentual e a forma de pagamento são combinados na conversa e ficam registrados por escrito." },
    { title: "Sem custo para você", body: "Produção, estoque, envio e atendimento ficam com a gente. Você não compra nada para participar." },
    { title: "Vitrine nas nossas redes", body: "O seu conteúdo ou a sua estampa podem aparecer nos perfis da Use Origens, nos anúncios e no site." },
    { title: "Gente de verdade", body: "Você fala direto com a equipe pelo WhatsApp, sem robô no meio." },
    { title: "Tudo por escrito", body: "Antes de começar, o combinado vira um acordo simples: o que cada um faz, a comissão e o prazo." },
  ],
};

export const STEPS = {
  title: "Do formulário à parceria.",
  items: [
    { title: "Inscrição", body: "Você preenche o formulário desta página. Leva dois minutos." },
    { title: "Análise", body: "A equipe olha o seu perfil, a sua arte ou o seu público." },
    { title: "Conversa", body: "Se fizer sentido, a gente chama você no WhatsApp para alinhar a ideia." },
    { title: "Parceria", body: "Combinado por escrito, é só começar." },
  ],
};

export const FAQ = {
  title: "Perguntas frequentes.",
  items: [
    { q: "Não sei qual perfil é o meu.", a: "Marque o que chegar mais perto. Se outro fizer mais sentido, a gente sugere na conversa." },
    { q: "Preciso ter muitos seguidores?", a: "Não pedimos um número mínimo na inscrição. Olhamos a conexão com a cidade e com quem acompanha você, não só o tamanho do perfil." },
    { q: "Quanto eu ganho?", a: "Você ganha comissão sobre as vendas feitas com o seu cupom (embaixador) ou sobre as peças com a sua arte ou da sua coleção (artista e collab). O percentual e a forma de pagamento são combinados na conversa e ficam no acordo por escrito." },
    { q: "Tem algum custo para participar?", a: "Não. Produção, estoque, envio e atendimento ficam com a Use Origens." },
    { q: "A minha cidade ainda não tem estampa. Posso participar?", a: "Pode, e é um ótimo motivo para se inscrever como artista. Conte de onde você é no formulário." },
    { q: "Preciso postar todo dia?", a: "Não. O que entra no combinado depende do tipo de parceria e é definido na conversa." },
    { q: "Tem contrato?", a: "Sim. Antes de começar, tudo fica registrado por escrito: o que cada um faz, a comissão e o prazo." },
  ],
};

export const APPLY = {
  title: "Faça a sua inscrição.",
  body: "Conte quem você é e de onde fala. Os campos com * são obrigatórios.",
  after: ["A equipe lê cada inscrição.", "Se fizer sentido, a gente chama você no WhatsApp.", "Tudo combinado por escrito antes de começar."],
};
