import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { REGIONS, isRegionSlug } from "@/lib/geo/regions";
import { ENABLED_REGIONS } from "@/lib/site";

export const revalidate = 3600;

export function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: { params: Promise<{ region: string }> }): Promise<Metadata> {
  const { region } = await params;
  if (!isRegionSlug(region)) return {};
  return { title: "Política de privacidade", alternates: { canonical: `/${region}/privacidade` } };
}

/**
 * DRAFT for human/legal review (command CLAUDE_CONSENTIMENTO_META_PIXEL.md: "criar a página e um texto-base
 * para revisão humana... Não inventar responsável, e-mail, prazo de retenção nem afirmar que uma redação
 * provisória já garante conformidade jurídica"). Nothing below is a real registered controller identity,
 * contact address or retention period — those fields are explicitly marked as pending real information. This
 * page must not be treated as a finished, compliant policy until a person fills in and reviews it.
 */
export default async function PrivacyPolicyPage({ params }: { params: Promise<{ region: string }> }) {
  const { region } = await params;
  if (!isRegionSlug(region) || !ENABLED_REGIONS.includes(region)) notFound();
  const r = REGIONS[region];

  return (
    <div className="wrap py-14 lg:py-20">
      <div className="on-ink mb-10 max-w-3xl border-2 border-ink p-5">
        <p className="t-label mb-1">Rascunho — pendente de revisão jurídica</p>
        <p className="t-small text-white/85">
          Este texto foi gerado como ponto de partida e não deve ser tratado como uma política finalizada ou
          juridicamente validada. Campos como responsável pelo tratamento, e-mail de contato e prazos de retenção
          ainda precisam ser preenchidos e revisados por uma pessoa responsável antes da publicação.
        </p>
      </div>

      <h1 className="t-h1 max-w-2xl">Política de privacidade e cookies</h1>
      <p className="t-body mt-4 max-w-2xl text-ink-soft">Use Origens {r.name} — última atualização: [data a definir na revisão].</p>

      <div className="mt-10 max-w-2xl space-y-8">
        <section>
          <h2 className="t-h3">O que este site faz com cookies</h2>
          <p className="t-body mt-2 text-ink-soft">
            Usamos cookies essenciais para o funcionamento do site (por exemplo, para lembrar a sua escolha sobre este
            banner) e, apenas com a sua aceitação, cookies de marketing para entender como as pessoas encontram a
            camiseta da própria cidade.
          </p>
        </section>

        <section>
          <h2 className="t-h3">Cookies de marketing: Meta Pixel</h2>
          <p className="t-body mt-2 text-ink-soft">
            Quando você aceita, carregamos o Meta Pixel (Meta Platforms, Inc.), que registra visitas às páginas
            (evento &quot;PageView&quot;) e buscas de cidade concluídas (evento &quot;Search&quot;, apenas com o nome
            da cidade/estado buscado — nunca nome, e-mail, telefone ou outro dado pessoal digitado). Essa informação
            ajuda a entender quais cidades e regiões têm mais interesse. Saiba mais sobre como a Meta trata esses
            dados na{" "}
            <a href="https://www.facebook.com/privacy/policy/" className="link-line font-semibold" rel="noopener noreferrer" target="_blank">
              política de privacidade da Meta
            </a>
            .
          </p>
        </section>

        <section>
          <h2 className="t-h3">Categorias de cookies</h2>
          <ul className="t-body mt-2 list-disc space-y-1 pl-5 text-ink-soft">
            <li><strong>Essenciais</strong>: guardam sua escolha de cookies (aceitar/rejeitar) e preferências básicas de navegação. Não podem ser desativados porque o site depende deles para funcionar.</li>
            <li><strong>Marketing (Meta Pixel)</strong>: só ativados após aceitação explícita, conforme descrito acima.</li>
          </ul>
        </section>

        <section>
          <h2 className="t-h3">Como rejeitar ou mudar de ideia</h2>
          <p className="t-body mt-2 text-ink-soft">
            Você pode rejeitar os cookies de marketing no banner que aparece na primeira visita, ou mudar sua escolha
            a qualquer momento em &quot;Preferências de privacidade&quot;, no rodapé do site. Rejeitar não limita o
            uso da busca, a navegação pelas cidades ou a compra — que sempre acontece na loja Use {r.name}.
          </p>
        </section>

        <section>
          <h2 className="t-h3">Compra e dados na loja</h2>
          <p className="t-body mt-2 text-ink-soft">
            A compra em si (tamanho, cor, frete, pagamento, endereço) acontece na loja Use {r.name}, fora deste site
            — o tratamento de dados nesse momento segue a política de privacidade própria da loja, não esta página.
          </p>
        </section>

        <section>
          <h2 className="t-h3">Responsável e contato</h2>
          <p className="t-body mt-2 text-ink-soft">
            [Pendente — nome do responsável pelo tratamento, CNPJ e e-mail/canal de contato para dúvidas ou pedidos
            de dados devem ser preenchidos aqui antes da publicação.]
          </p>
        </section>

        <section>
          <h2 className="t-h3">Prazo de retenção</h2>
          <p className="t-body mt-2 text-ink-soft">
            [Pendente — por quanto tempo a escolha de cookies e os dados enviados à Meta ficam retidos ainda precisa
            ser definido e descrito aqui.]
          </p>
        </section>
      </div>
    </div>
  );
}
