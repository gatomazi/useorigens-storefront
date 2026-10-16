/**
 * "Faixa do topo": what is live, how a message reads once its placeholders are filled in, and the public payload. Pure (no I/O, no `server-only`): the
 * storefront strip (server and browser), the CMS editor, the public API and the tests run the very same rules. The Worker of the INK keeps its own check
 * of the payload (`use-origens-workers/src/top-bar-gateway.js`): the contract between the two is `v: 1` below.
 */
import { TOP_BAR_TOKENS, type TopBarColors, type TopBarConfig, type TopBarMessage, type TopBarStyle } from "./top-bar-schema";

export * from "./top-bar-schema";

/** One message as the public sees it: the text already filled in, the link and, when it has one, the end (a client drops it once it is over). */
export type PublicTopBarMessage = { id: string; text: string; href?: string; endsAt?: string };
export type PublicTopBar = { v: 1; region: string; style: TopBarStyle; colors?: TopBarColors; messages: PublicTopBarMessage[] };

const at = (iso: string | undefined): number | null => (iso === undefined ? null : Date.parse(iso));

/** Enabled messages inside their window at `now`, in the owner's order (ties keep the list order). A message with no window is always live. */
export function liveTopBarMessages(config: TopBarConfig | undefined, now: number): TopBarMessage[] {
  return (config?.messages ?? [])
    .map((message, index) => ({ message, index }))
    .filter(({ message }) => {
      const start = at(message.startsAt);
      const end = at(message.endsAt);
      return message.enabled && (start === null || now >= start) && (end === null || now < end);
    })
    .sort((a, b) => a.message.order - b.message.order || a.index - b.index)
    .map(({ message }) => message);
}

/** Ready-made colour pairs for the seasons in the editor (each one reads at AA, tested); `null` = the default black strip. */
export const TOP_BAR_COLOR_PRESETS: { name: string; colors: TopBarColors | null }[] = [
  { name: "Preta (padrão)", colors: null },
  { name: "Vermelho Natal", colors: { background: "#b3121f", text: "#ffffff" } },
  { name: "Verde Natal", colors: { background: "#14532d", text: "#ffffff" } },
  { name: "Dourado", colors: { background: "#e2b64a", text: "#111111" } },
  { name: "Black Friday", colors: { background: "#000000", text: "#f5d90a" } },
];

/** "1 dia útil", "7 dias úteis". */
export const productionText = (days: number): string => (days === 1 ? "1 dia útil" : `${days} dias úteis`);

// Brazil has had no daylight saving time since 2019: a calendar day in Brasília is a fixed UTC-3 day.
const brasiliaDay = (ms: number): number => Math.floor((ms - 3 * 60 * 60 * 1000) / 86_400_000);

/**
 * Days left until a message ends, counted in Brasília calendar days: the last day is the day of the last minute it is on (an end at 07/12 00:00 means
 * "até 06/12"). "último dia" on that day, "falta 1 dia" the day before, "faltam N dias" before that.
 */
export function daysLeftText(endsAt: string, now: number): string {
  const left = brasiliaDay(Date.parse(endsAt) - 1) - brasiliaDay(now);
  return left <= 0 ? "último dia" : left === 1 ? "falta 1 dia" : `faltam ${left} dias`;
}

/** The text as the visitor reads it at `now`. A placeholder that cannot be filled (no production time, no end) is left out, never shown as `{…}`. */
export function topBarText(message: Pick<TopBarMessage, "text" | "endsAt">, productionDays: number | undefined, now: number): string {
  const startsWithToken = TOP_BAR_TOKENS.some((t) => message.text.startsWith(`{${t}}`));
  const filled = message.text
    .replaceAll("{producao}", productionDays === undefined ? "" : productionText(productionDays))
    .replaceAll("{faltam}", message.endsAt === undefined ? "" : daysLeftText(message.endsAt, now))
    .replace(/\s+/g, " ")
    .trim();
  // "{faltam} para o Natal" → "Faltam 3 dias para o Natal".
  return startsWithToken ? filled.charAt(0).toLocaleUpperCase("pt-BR") + filled.slice(1) : filled;
}

/**
 * The public, read-only payload of a region: how the messages show (`style`) and only the live messages, filled in, with display fields only (never
 * `enabled`, `startsAt` or drafts).
 */
export function topBarPayload(region: string, config: TopBarConfig | undefined, now: number): PublicTopBar {
  const messages = liveTopBarMessages(config, now).map((m) => {
    const out: PublicTopBarMessage = { id: m.id, text: topBarText(m, config?.productionDays, now) };
    if (m.href) out.href = m.href;
    if (m.endsAt) out.endsAt = m.endsAt;
    return out;
  });
  const out: PublicTopBar = { v: 1, region, style: config?.style ?? "marquee", messages };
  if (config?.colors) out.colors = { background: config.colors.background.toLowerCase(), text: config.colors.text.toLowerCase() };
  return out;
}

/**
 * What the storefront page carries for its strip: the messages that are live now OR will be later (scheduled), never the ones already over. A page
 * stays cached for up to an hour, so the browser re-decides with its own clock (a Black Friday that starts at midnight starts at midnight).
 */
export function topBarSchedule(config: TopBarConfig | undefined, now: number): TopBarConfig | undefined {
  if (!config) return undefined;
  const messages = config.messages.filter((m) => m.enabled && (m.endsAt === undefined || Date.parse(m.endsAt) > now));
  if (messages.length === 0) return undefined;
  const out: TopBarConfig = { messages };
  if (config.productionDays !== undefined) out.productionDays = config.productionDays;
  if (config.style !== undefined) out.style = config.style;
  if (config.colors !== undefined) out.colors = config.colors;
  return out;
}
