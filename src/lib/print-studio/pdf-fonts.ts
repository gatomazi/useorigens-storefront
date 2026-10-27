// Default Unicode glyphs actually present in the embedded Mont Bold subset.
const boldCharacters = new Set(Array.from(" !&,-.ABCDFILMOSTVabcdefghiklmnoprstuwyАВДЕИКЛНОСФЧабвгдезийлмнопрстуфхчыьэя—"));

export function pdfFontCharacterError(fontId: string, text: string): string | null {
  if (fontId !== "font-mont-pdf-bold") return null;
  const missing = [...new Set(Array.from(text).filter((character) => !/[\n\r\t]/.test(character) && !boldCharacters.has(character)))];
  return missing.length ? `A Mont Bold recuperada do PDF não contém estes caracteres: ${missing.join(" ")}. Para comparar o peso, experimente “amigo secreto.” ou “cuca&”.` : null;
}
