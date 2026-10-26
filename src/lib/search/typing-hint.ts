/**
 * The phone header's search field "types" what it finds: "Busque por lugar", erased, "Busque por tema", "Busque por coleção"… One word is typed,
 * held, erased, and the next one typed. Pure: the component (TypingHint.tsx) only runs the clock, so the rhythm is unit-tested here.
 * The first frame is the first word, whole: that is what the server renders and what a visitor with reduced motion keeps (the whole list).
 */
export const TYPING_PREFIX = "Busque por ";
export const TYPING_WORDS: readonly string[] = ["lugar", "tema", "coleção", "cidade", "estado"];
/** The field without motion (reduced motion, and its accessible name): every word at once. */
export const TYPING_STILL = "Busque por lugar, tema ou coleção";

export const TYPE_MS = 85;
export const ERASE_MS = 45;
export const HOLD_MS = 1800;
export const GAP_MS = 300;

/** `length` letters of `words[index]` are shown; `erasing` once the word was held. */
export type TypingState = { index: number; length: number; erasing: boolean };

const letters = (word: string): string[] => Array.from(word);
export const firstTyping = (words: readonly string[]): TypingState => ({ index: 0, length: letters(words[0] ?? "").length, erasing: false });
export const typedText = (state: TypingState, words: readonly string[]): string => letters(words[state.index] ?? "").slice(0, state.length).join("");

/** The next frame, and how long it stays before the one after it. */
export function nextTyping(state: TypingState, words: readonly string[]): { state: TypingState; delay: number } {
  const size = letters(words[state.index] ?? "").length;
  if (!state.erasing && state.length < size) {
    const length = state.length + 1;
    return { state: { ...state, length }, delay: length === size ? HOLD_MS : TYPE_MS };
  }
  if (!state.erasing) return { state: { ...state, erasing: true, length: Math.max(0, size - 1) }, delay: size <= 1 ? GAP_MS : ERASE_MS };
  if (state.length > 1) return { state: { ...state, length: state.length - 1 }, delay: ERASE_MS };
  if (state.length === 1) return { state: { ...state, length: 0 }, delay: GAP_MS };
  const index = (state.index + 1) % Math.max(1, words.length);
  return { state: { index, length: 1, erasing: false }, delay: letters(words[index] ?? "").length <= 1 ? HOLD_MS : TYPE_MS };
}
