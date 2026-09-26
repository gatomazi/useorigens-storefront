"use client";

export default function SearchError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="wrap py-10 lg:py-16" role="alert">
      <h1 className="t-h2">Não foi possível buscar agora</h1>
      <p className="t-body mt-2 max-w-xl text-ink-soft">Tente novamente em instantes. Você ainda pode explorar a página inicial.</p>
      <button type="button" onClick={reset} className="btn mt-5 min-h-12 px-5">
        Tentar de novo
      </button>
    </div>
  );
}
