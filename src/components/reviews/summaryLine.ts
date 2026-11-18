import type { InkReviewsPage } from "@/lib/reviews/parse";

/** "Nota 4,9 de 5 em 1.151 avaliações." — the store's WHOLE summary from INK, whatever is featured below it. Absent when INK gave neither number. */
export function summaryLine({ score, count }: Pick<InkReviewsPage, "score" | "count">): string | undefined {
  const total = count === null ? null : `${count.toLocaleString("pt-BR")} ${count === 1 ? "avaliação" : "avaliações"}`;
  if (score !== null && total) return `Nota ${score.toFixed(1).replace(".", ",")} de 5 em ${total}.`;
  if (score !== null) return `Nota ${score.toFixed(1).replace(".", ",")} de 5.`;
  return total ? `${total}.` : undefined;
}
