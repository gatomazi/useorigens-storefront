/** Text of INK's public pages, read from their markup (the FAQ in assistant/ink-faq.ts, the reviews in reviews/parse.ts). Pure: no `server-only`, so tests run on a saved copy. */

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };

export const decodeHtmlEntities = (s: string): string =>
  s.replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (all, name: string) => {
    const key = name.toLowerCase();
    if (ENTITIES[key] !== undefined) return ENTITIES[key];
    if (key.startsWith("#x")) return String.fromCodePoint(parseInt(key.slice(2), 16));
    if (key.startsWith("#")) return String.fromCodePoint(Number(key.slice(1)));
    return all;
  });
