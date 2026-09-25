import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { measurementRequiresConsent } from "@/lib/consent/policy";
import { PrivacyPreferencesLink } from "@/components/consent/PrivacyPreferencesLink";
import { REGIONS, isRegionSlug } from "@/lib/geo/regions";
import { isRegionLaunched } from "@/lib/regions/launched";

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
 * Public cookies/privacy notice. Deliberately states only what the site verifiably does today (which optional
 * tools load, only after acceptance, and what the storefront does and does not send). It carries NO controller
 * identity, contact channel, DPO or retention period: none of those are confirmed, so they are omitted rather
 * than shown as placeholders or invented. When they are confirmed, add "Responsável e contato" / "Prazo de
 * retenção" sections here (see docs/deploy/ for the open items).
 */
const LAST_UPDATED = "23 de setembro de 2026";

export default async function PrivacyPolicyPage({ params }: { params: Promise<{ region: string }> }) {
  const { region } = await params;
  if (!isRegionSlug(region) || !isRegionLaunched(region)) notFound();
  const r = REGIONS[region];
  const gated = measurementRequiresConsent(); // false by default: measurement does not wait for the banner (src/lib/consent/policy.ts)

  return (
    <div className="wrap py-14 lg:py-20">
      <h1 className="t-h1 max-w-2xl">Política de privacidade e cookies</h1>
      <p className="t-body mt-4 max-w-2xl text-ink-soft">Use Origens {r.name} — última atualização em {LAST_UPDATED}.</p>

      <div className="mt-10 max-w-2xl space-y-8">
        <section>
          <h2 className="t-h3">O que este site faz com cookies</h2>
          <p className="t-body mt-2 text-ink-soft">
            {gated
              ? "Usamos cookies essenciais para o funcionamento do site — por exemplo, para lembrar a sua escolha sobre cookies — e, apenas com a sua aceitação, cookies opcionais de análise e marketing, que nos ajudam a entender como as pessoas encontram a camiseta da própria cidade e a melhorar a experiência."
              : "Usamos cookies essenciais para o funcionamento do site — por exemplo, para lembrar a sua escolha no aviso de cookies — e cookies e ferramentas de análise e marketing de terceiros, que nos ajudam a entender como as pessoas encontram a camiseta da própria cidade, a medir anúncios e a melhorar a experiência. Essas ferramentas funcionam desde que você abre o site."}
          </p>
        </section>

        <section>
          <h2 className="t-h3">Categorias de cookies</h2>
          <ul className="t-body mt-2 list-disc space-y-1 pl-5 text-ink-soft">
            <li>
              <strong>Essenciais</strong>: guardam a sua escolha no aviso de cookies e preferências básicas de
              navegação. O site depende deles para funcionar, por isso não podem ser desativados.
            </li>
            <li>
              <strong>Análise e marketing</strong>:{" "}
              {gated
                ? "ferramentas de medição que só são ativadas depois que você aceita. Sem o seu aceite, elas não são carregadas e nenhuma informação é enviada a elas."
                : "ferramentas de medição de terceiros (Meta e Google) que ficam ativas ao navegar pelo site, independentemente da sua escolha no aviso de cookies."}
            </li>
          </ul>
        </section>

        <section>
          <h2 className="t-h3">Ferramentas de análise e marketing</h2>
          <p className="t-body mt-2 text-ink-soft">
            {gated ? "Hoje, quando você aceita, usamos" : "Hoje usamos"} o Meta Pixel (Meta Platforms, Inc.) e o Google Analytics (Google LLC).
            Eles registram, de forma agregada, ações como visitar páginas, concluir uma busca de cidade, escolher uma
            cidade ou um estado e seguir para a loja. Nunca enviamos nome, e-mail, telefone ou outro dado pessoal
            digitado por você. Podemos incluir outras ferramentas de medição no futuro; se isso acontecer, esta página
            será atualizada.
          </p>
          <p className="t-body mt-2 text-ink-soft">
            Saiba como cada empresa trata esses dados na{" "}
            <a href="https://www.facebook.com/privacy/policy/" className="link-line font-semibold" rel="noopener noreferrer" target="_blank">
              política de privacidade da Meta
            </a>{" "}
            e na{" "}
            <a href="https://policies.google.com/privacy" className="link-line font-semibold" rel="noopener noreferrer" target="_blank">
              política de privacidade do Google
            </a>
            .
          </p>
        </section>

        <section>
          <h2 className="t-h3">{gated ? "Como rejeitar ou mudar de ideia" : "Suas escolhas"}</h2>
          <p className="t-body mt-2 text-ink-soft">
            {gated
              ? "Você pode rejeitar os cookies opcionais no aviso que aparece na primeira visita e mudar a sua escolha a qualquer momento, aqui ou em \"Preferências de privacidade\", no rodapé do site. Se você retirar o aceite, deixamos de enviar novos eventos para essas ferramentas. Rejeitar não limita o uso da busca, a navegação pelas cidades ou a compra."
              : "O aviso de cookies registra a sua escolha, mas ela não desliga as ferramentas de medição acima. Para limitar esse rastreamento, use as configurações do seu navegador, extensões de bloqueio ou os controles de anúncios da Meta e do Google (links nas políticas acima). Nada disso limita o uso da busca, a navegação pelas cidades ou a compra."}
          </p>
          <div className="mt-3">
            <PrivacyPreferencesLink />
          </div>
        </section>

        <section>
          <h2 className="t-h3">Compra e dados na loja</h2>
          <p className="t-body mt-2 text-ink-soft">
            Você escolhe a cidade e o estilo aqui e conclui a compra na loja Use {r.name}, onde ficam tamanho, cor,
            frete, pagamento e endereço. A loja tem a sua própria política de privacidade e os seus próprios cookies, e
            é ela que vale para tudo o que acontece lá.
          </p>
        </section>
      </div>
    </div>
  );
}
