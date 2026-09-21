import Link from "next/link";
import { CitySearch } from "@/components/search/CitySearch";

export default function RegionNotFound() {
  return (
    <section className="wrap py-20 lg:py-28">
      <h1 className="t-h1 max-w-3xl">Ainda não encontramos essa página.</h1>
      <p className="t-body mt-6 max-w-lg text-ink-soft">Busque a sua cidade pelo nome completo ou volte para a página do Sul.</p>
      <div className="mt-10 max-w-xl">
        <CitySearch region="sul" />
      </div>
      <Link href="/sul" className="btn mt-24 inline-flex">
        Voltar ao Sul
      </Link>
    </section>
  );
}
