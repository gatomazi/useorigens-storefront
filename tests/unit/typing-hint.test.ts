import { describe, expect, test } from "vitest";
import { ERASE_MS, firstTyping, GAP_MS, HOLD_MS, nextTyping, TYPE_MS, typedText, TYPING_PREFIX, TYPING_STILL, TYPING_WORDS, type TypingState } from "@/lib/search/typing-hint";

/** Every frame until the cycle is back at the first word, whole, with the time each one stays. */
function cycle(words: readonly string[]) {
  const frames: { text: string; delay: number }[] = [];
  let state: TypingState = firstTyping(words);
  for (let i = 0; i < 500; i++) {
    const { state: next, delay } = nextTyping(state, words);
    frames.push({ text: typedText(next, words), delay });
    state = next;
    if (state.index === 0 && !state.erasing && state.length === Array.from(words[0]).length) break;
  }
  return frames;
}

describe("busca do topo no celular: o texto que se digita", () => {
  test("starts with the first word whole (the server's render), and the still text says every kind of search", () => {
    expect(TYPING_PREFIX + typedText(firstTyping(TYPING_WORDS), TYPING_WORDS)).toBe("Busque por lugar");
    expect(TYPING_STILL).toBe("Busque por lugar, tema ou coleção");
    expect(TYPING_WORDS).toEqual(["lugar", "tema", "coleção", "cidade", "estado"]);
  });

  test("erases the word, pauses, types the next one letter by letter, holds it whole; accents are letters, never half a character", () => {
    const frames = cycle(["lugar", "coleção"]);
    expect(frames.slice(0, 5).map((f) => f.text)).toEqual(["luga", "lug", "lu", "l", ""]);
    expect(frames[4].delay).toBe(GAP_MS);
    expect(frames.slice(0, 4).every((f) => f.delay === ERASE_MS)).toBe(true);
    expect(frames.slice(5, 12).map((f) => f.text)).toEqual(["c", "co", "col", "cole", "coleç", "coleçã", "coleção"]);
    expect(frames[10].delay).toBe(TYPE_MS);
    expect(frames[11].delay).toBe(HOLD_MS);
    // And back to the first word, after the last.
    expect(frames.at(-1)).toEqual({ text: "lugar", delay: HOLD_MS });
  });

  test("goes through every word in order, and a whole cycle takes a calm pace (no word shorter than its hold)", () => {
    const frames = cycle(TYPING_WORDS);
    const held = frames.filter((f) => f.delay === HOLD_MS).map((f) => f.text);
    expect(held).toEqual(["tema", "coleção", "cidade", "estado", "lugar"]);
    const total = frames.reduce((sum, f) => sum + f.delay, 0);
    expect(total).toBeGreaterThan(TYPING_WORDS.length * HOLD_MS);
    expect(total).toBeLessThan(TYPING_WORDS.length * (HOLD_MS + 1500));
  });
});
