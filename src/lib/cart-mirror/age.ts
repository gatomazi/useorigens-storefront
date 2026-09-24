import { FRESH_SECONDS } from "./constants";

/** Never "tempo real": a snapshot is always labelled with how old it is. */
export function ageLabel(seconds: number): string {
  if (seconds <= FRESH_SECONDS) return "Atualizado há poucos segundos";
  const minutes = Math.max(1, Math.floor(seconds / 60));
  return `Última atualização há ${minutes} min`;
}
