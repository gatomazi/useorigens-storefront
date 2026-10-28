/**
 * Words that send a direct purchase to the team instead of creating the product: a product at INK is permanent and carries the store's name, so
 * profanity, slurs and hate terms get a person's look first. Whole words only (so "Cunha" or "Pinto" pass), after removing accents, case and the
 * usual letter swaps (0→o, 1→i, 3→e, 4→a, 5→s, 7→t, @→a, $→s). A false positive costs a manual check, never a refusal: the customer is offered
 * the request to the team. Links and e-mails are reviewed too.
 */
const WORDS = new Set([
  // palavrões e termos sexuais
  "porra", "caralho", "caralha", "cacete", "merda", "bosta", "puta", "puto", "putaria", "putinha", "foda", "fodase", "foder", "fodido", "fudido", "fuder",
  "buceta", "boceta", "xoxota", "xereca", "piroca", "pica", "rola", "pau", "cu", "cuzao", "cuzinho", "arrombado", "arrombada", "punheta", "siririca",
  "chupa", "chupador", "boquete", "pornô", "porno", "sexo", "anal", "gozo", "tesao", "safada", "safado", "vagabunda", "vagabundo", "vadia", "piranha",
  "corno", "cornudo", "babaca", "otario", "otaria", "imbecil", "idiota", "retardado", "retardada", "mongoloide", "escroto", "escrota", "lixo",
  // ofensas a grupos
  "viado", "bicha", "sapatao", "traveco", "macaco", "macaca", "crioulo", "neguinho", "favelado", "judeuzinho",
  // ódio e crimes
  "nazi", "nazista", "hitler", "kkk", "estupro", "estuprador", "pedofilo", "pedofilia", "terrorista",
  // inglês
  "fuck", "fucking", "shit", "bitch", "nigger", "nigga", "dick", "pussy", "cunt", "whore",
].map((w) => w.normalize("NFD").replace(/\p{M}/gu, "")));

const SWAPS: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", $: "s" };

const normalized = (text: string): string =>
  text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[01347@$5]/g, (c) => SWAPS[c] ?? c);

/** True when the typed text should be seen by the team before a product is created. */
export function needsReview(text: string): boolean {
  const raw = text.toLowerCase();
  if (/https?:|www\.|\.com|@\S/.test(raw)) return true;
  const words = normalized(text).split(/[^a-z]+/).filter(Boolean);
  // Also the letters glued together ("p o r r a" or "p.o.r.r.a" become one word).
  const glued = words.join("");
  return words.some((w) => WORDS.has(w) || WORDS.has(w.replace(/(.)\1+/g, "$1"))) || (words.length > 1 && WORDS.has(glued));
}
