import path from "node:path";
import { catalogSnapshotDir } from "../../config/env";

/** Diretório padrão da leitura em sombra. Fica em `data/unificado/` (gitignored), NUNCA no diretório de snapshots servido em produção. */
export function diretorioSombraPadrao(): string {
  return path.join(process.cwd(), "data", "unificado");
}

/**
 * Trava do modo sombra: recusa gravar dentro do diretório de snapshots servido (`catalogSnapshotDir`, onde moram o catálogo, o índice de
 * peças, as coleções e o last-known-good). Uma leitura da loja unificada gravada lá substituiria o catálogo de produção.
 */
export function assertForaDaProducao(dir: string, producao: string = catalogSnapshotDir()): void {
  const alvo = path.resolve(dir);
  const prod = path.resolve(producao);
  if (alvo === prod || alvo.startsWith(prod + path.sep) || prod.startsWith(alvo + path.sep)) {
    throw new Error(`modo sombra recusou ${alvo}: é (ou contém) o diretório de snapshots de produção ${prod}`);
  }
}
