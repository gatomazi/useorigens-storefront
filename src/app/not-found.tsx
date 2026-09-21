import Link from "next/link";

export default function NotFound() {
  return (
    <main id="conteudo" className="wrap py-28">
      <h1 className="t-h1">Página não encontrada.</h1>
      <p className="t-body mt-6 max-w-lg">Esse endereço não existe por aqui. Que tal começar pela sua cidade?</p>
      <Link href="/sul" className="btn mt-10 inline-flex">
        Encontrar minha cidade
      </Link>
    </main>
  );
}
