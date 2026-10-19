import { MAX_ASSET_BYTES, parseProject, type ImageAsset, type PrintProject } from "./model";
import { loadImage } from "./renderer";

const DB_NAME = "origens-print-studio";
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("projects");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("O navegador não permitiu o salvamento local."));
  });
}

export async function loadDraft(key = "draft"): Promise<PrintProject | null> {
  const db = await openDb();
  try {
    const value = await new Promise<unknown>((resolve, reject) => {
      const request = db.transaction("projects", "readonly").objectStore("projects").get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return value ? parseProject(value) : null;
  } finally { db.close(); }
}

export async function saveDraft(project: PrintProject, key = "draft"): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction("projects", "readwrite");
      transaction.objectStore("projects").put(project, key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(new Error("Não há espaço para salvar. Baixe o projeto para guardar uma cópia."));
      transaction.onabort = () => reject(new Error("O salvamento local foi interrompido. Baixe o projeto para guardar uma cópia."));
    });
  } finally { db.close(); }
}

export function readDataUrl(file: File, kind: "image" | "font"): Promise<string> {
  if (file.size > MAX_ASSET_BYTES) return Promise.reject(new Error("Cada arquivo deve ter no máximo 8 MB."));
  if (kind === "image" && !/\.(png|jpe?g|webp)$/i.test(file.name)) return Promise.reject(new Error("Escolha uma imagem PNG, JPG ou WebP."));
  if (kind === "font" && !/\.(ttf|otf|woff2?)$/i.test(file.name)) return Promise.reject(new Error("Escolha uma fonte TTF, OTF, WOFF ou WOFF2."));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      // Browser MIME tables differ for font files. Normalize to a portable supported type.
      resolve(kind === "font" ? result.replace(/^data:[^;]*;/, "data:application/octet-stream;") : result);
    };
    reader.onerror = () => reject(new Error("Não foi possível ler o arquivo. Tente selecioná-lo novamente."));
    reader.readAsDataURL(file);
  });
}

export async function readImageAsset(file: File): Promise<ImageAsset> {
  const dataUrl = await readDataUrl(file, "image");
  const image = await loadImage(dataUrl);
  if (image.naturalWidth > 16000 || image.naturalHeight > 16000 || image.naturalWidth * image.naturalHeight > 40_000_000) throw new Error("Use uma imagem com até 40 megapixels e 16000 pixels por lado.");
  return { dataUrl, name: file.name.slice(0, 200), width: image.naturalWidth, height: image.naturalHeight };
}
