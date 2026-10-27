import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { PrintFont } from "./model";

/** Passed only after the page authenticates; each chosen original is embedded in saved projects. */
export async function availableStudioFonts(): Promise<PrintFont[]> {
  const fonts = [
    { id: "font-mont-extralight", name: "Mont ExtraLight", weight: 200, file: "Mont-ExtraLightDEMO.otf" },
    { id: "font-mont-heavy", name: "Mont Heavy", weight: 900, file: "Mont-HeavyDEMO.otf" },
    { id: "font-mont-pdf-regular", name: "Mont Regular (PDF)", weight: 400, file: "Mont-Regular-PDF.otf" },
    { id: "font-mont-pdf-italic", name: "Mont Regular Italic (PDF)", weight: 400, file: "Mont-RegularItalic-PDF.otf" },
    { id: "font-mont-bold-rebuilt", name: "Mont Bold (reconstruída)", weight: 700, file: "Mont-Bold-Reconstruida.otf" },
    { id: "font-graduate", name: "Graduate", weight: 400, file: "Graduate-Regular.ttf" },
    { id: "font-caveat", name: "Caveat", weight: 400, file: "Caveat-Regular.ttf" },
    { id: "font-caveat-brush", name: "Caveat Brush", weight: 400, file: "CaveatBrush-Regular.ttf" },
    { id: "font-montserrat-semibold", name: "Montserrat SemiBold", weight: 600, file: "Montserrat-SemiBold.ttf" },
  ];
  return Promise.all(fonts.map(async ({ file, ...font }) => ({ ...font, dataUrl: `data:application/octet-stream;base64,${(await readFile(path.join(process.cwd(), "assets", "print-studio", "fonts", file))).toString("base64")}` })));
}
