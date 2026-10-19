import "server-only";
import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import sharp from "sharp";
import { parseProject, type PrintProject } from "./model";
import { PRINT_HEIGHT, PRINT_WIDTH, type SavedPrint } from "./types";

export const PRINT_ID = /^\d{13}-[a-f0-9-]{36}$/;
export const MAX_PNG_BYTES = 24 * 1024 * 1024;

/** Immutable saves, atomically published as a directory. No shared index to lose on concurrent saves. */
export function printStore(directory: string) {
  const entryDir = (id: string) => {
    if (!PRINT_ID.test(id)) throw new Error("Identificador de estampa inválido.");
    return path.join(directory, id);
  };
  return {
    async list(): Promise<SavedPrint[]> {
      let entries;
      try { entries = await readdir(directory, { withFileTypes: true }); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
      const names = entries.filter((e) => e.isDirectory() && PRINT_ID.test(e.name)).map((e) => e.name).sort().reverse().slice(0, 500);
      return Promise.all(names.map(async (id) => JSON.parse(await readFile(path.join(entryDir(id), "metadata.json"), "utf8")) as SavedPrint));
    },
    async read(id: string, file: "project.json" | "art.png" | "preview.webp" | "metadata.json"): Promise<Buffer | null> {
      if (!PRINT_ID.test(id)) return null;
      try { return await readFile(path.join(entryDir(id), file)); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
    },
    async save(input: { project: PrintProject; png: Uint8Array; kind: SavedPrint["kind"]; createdBy: string }): Promise<SavedPrint> {
      const project = parseProject(input.project);
      if (project.width !== PRINT_WIDTH || project.height !== PRINT_HEIGHT) throw new Error("As artes de camiseta devem ter 4270 × 4900 pixels.");
      if (project.background !== null) throw new Error("O fundo da arte deve ser transparente; a camiseta é simulada apenas na prévia.");
      if (!project.name.trim()) throw new Error("Dê um nome à estampa antes de salvar.");
      if (!project.layers.some((layer) => layer.visible && (layer.kind === "image" || layer.text.trim()))) throw new Error("Adicione um texto ou uma logo antes de salvar.");
      if (input.png.byteLength > MAX_PNG_BYTES) throw new Error("A imagem gerada deve ter no máximo 24 MB.");
      const image = sharp(input.png, { limitInputPixels: 24_000_000 });
      const meta = await image.metadata();
      if (meta.format !== "png" || meta.width !== PRINT_WIDTH || meta.height !== PRINT_HEIGHT || (meta.pages ?? 1) !== 1) throw new Error("A imagem precisa ser um PNG de 4270 × 4900 pixels.");
      const png = await image.clone().withMetadata({ density: project.dpi }).png().toBuffer();
      const preview = await image.clone().resize({ width: 640, withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
      const id = `${Date.now()}-${randomUUID()}`;
      const metadata: SavedPrint = { id, name: project.name.trim(), kind: input.kind, createdAt: new Date().toISOString(), createdBy: input.createdBy, width: PRINT_WIDTH, height: PRINT_HEIGHT };
      const temp = path.join(directory, `.saving-${id}`);
      await mkdir(directory, { recursive: true });
      await mkdir(temp);
      try {
        await writeFile(path.join(temp, "project.json"), JSON.stringify(project));
        await writeFile(path.join(temp, "metadata.json"), JSON.stringify(metadata));
        await writeFile(path.join(temp, "art.png"), png);
        await writeFile(path.join(temp, "preview.webp"), preview);
        await rename(temp, entryDir(id));
      } catch (error) { await rm(temp, { recursive: true, force: true }); throw error; }
      return metadata;
    },
  };
}
